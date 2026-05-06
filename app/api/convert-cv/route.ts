import { NextRequest, NextResponse } from "next/server";
import { generateSPPdf, setLogoPng } from "@/lib/convert-cv/generateSPPdf";
import type { ParsedCV, ConvertCVResponse, CandidateOptions } from "@/types";
import path from "path";
import fs from "fs";

// Load logo once at module init
(function loadLogo() {
  const logoPath = path.join(process.cwd(), "public", "sp_logo.png");

  if (fs.existsSync(logoPath)) {
    setLogoPng(new Uint8Array(fs.readFileSync(logoPath)));
  }
})();

// Step 1: Extract raw text from uploaded file
async function extractText(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) {
    try {
      const { extractText } = await import("unpdf");
      const { text } = await extractText(new Uint8Array(buffer), {
        mergePages: true,
      });
      return text;
      // const pdfParse = (await import("pdf-parse")).default;
      // const result = await pdfParse(buffer);
      // return result.text;
    } catch (err) {
      console.error("PDF parse error:", err);
      throw new Error("Could not read PDF file.");
    }
  }

  if (name.endsWith(".docx") || name.endsWith(".doc")) {
    try {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    } catch {
      throw new Error("Could not read DOCX file.");
    }
  }

  return buffer.toString("utf8");
}

// Step 2: Parse CV structure using Groq
async function parseWithGroq(
  rawText: string,
  apiKey: string,
): Promise<ParsedCV> {
  const prompt = `You are an expert CV parser. Extract structured data from this CV.

CV TEXT:
${rawText.length > 15000 ? rawText.slice(0, 15000) : rawText}

Return ONLY raw JSON — no markdown, no code fences, no explanation.
Schema:
{
  "name": "<full name or empty string>",
  "phone": "<phone number or empty string>",
  "email": "<email address or empty string>",
  "summary": ["<bullet 1>", "<bullet 2>", ...],
  "education": "<degree and institution as one string, or empty string>",
  "projects": [
    {
      "name": "<project name>",
      "responsibilities": ["<point 1>", "<point 2>", ...]
    }
  ],
  "certifications": ["<cert 1>", "<cert 2>", ...]
}

CRITICAL Rules — read carefully:
- summary: Extract the professional summary paragraph as individual bullet-style sentences (split on '. ' boundaries). Each sentence = one string.
- projects: Extract EVERY project found anywhere in the CV — do NOT skip any, even if there are 5, 6, or more.
  - "name": 
      * If the project is labeled like "Project 1: HRSD" or "Project 2: ServiceNow ITSM", use the part AFTER the colon as the name (e.g. "HRSD", "ServiceNow ITSM Customization").
      * If the name is generic like "Project 1" or "Project A" with NO subtitle, INFER a descriptive name from the responsibilities content.
      * Otherwise use the exact project name as written.
  - "responsibilities": Split the Responsibility/Description field into individual bullet points. Each sentence or original bullet = one string in the array. Preserve original wording exactly.
- certifications: each cert = one string. Empty array [] if none.
- education: degree only (e.g. "Bachelor of Engineering"). Empty string if not found.
- Strip all bullet symbols (•, -, *, ▪, and Unicode bullets like \\uf0b7) from all text — clean text only.
- DO NOT paraphrase or summarize any text — copy verbatim.
- DO NOT omit projects — include ALL of them in the array.`;

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 4000,
      temperature: 0.1,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Groq API error ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content ?? "";
  const cleaned = raw
    .replace(/```(?:json)?\s*/gi, "")
    .replace(/```/g, "")
    .trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Groq returned no valid JSON");

  const p = JSON.parse(match[0]);

  return {
    name: String(p.name ?? ""),
    phone: String(p.phone ?? ""),
    email: String(p.email ?? ""),
    summary: Array.isArray(p.summary)
      ? p.summary.map(String).filter(Boolean)
      : [],
    education: String(p.education ?? ""),
    projects: Array.isArray(p.projects)
      ? p.projects.map((proj: Record<string, unknown>) => ({
          name: String(proj.name ?? "Untitled Project"),
          role: String(proj.role ?? "Role"),
          responsibilities: Array.isArray(proj.responsibilities)
            ? proj.responsibilities.map(String).filter(Boolean)
            : [],
        }))
      : [],
    certifications: Array.isArray(p.certifications)
      ? p.certifications.map(String).filter(Boolean)
      : [],
  };
}

// Route handler
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const apiKey = ((formData.get("apiKey") as string) ?? "").trim();
    const file = formData.get("cv") as File | null;

    const options: CandidateOptions = {
      includeName: formData.get("includeName") === "true",
      includePhone: formData.get("includePhone") === "true",
      includeEmail: formData.get("includeEmail") === "true",
      maxProjects: Math.min(
        10,
        Math.max(
          1,
          parseInt((formData.get("maxProjects") as string) ?? "5", 10),
        ),
      ),
    };

    if (!file)
      return NextResponse.json(
        { error: "No CV file uploaded" },
        { status: 400 },
      );
    if (!apiKey || apiKey.length < 10)
      return NextResponse.json(
        { error: "Groq API key is required" },
        { status: 400 },
      );

    const ext = "." + file.name.split(".").pop()!.toLowerCase();
    if (![".pdf", ".docx", ".doc", ".txt"].includes(ext))
      return NextResponse.json(
        { error: `Unsupported file type: ${ext}` },
        { status: 400 },
      );

    if (file.size > 10 * 1024 * 1024)
      return NextResponse.json(
        { error: "File too large (max 10 MB)" },
        { status: 400 },
      );

    const rawText = await extractText(file);
    if (rawText.trim().length < 50)
      return NextResponse.json(
        { error: "Could not extract readable text from file" },
        { status: 422 },
      );

    const parsed = await parseWithGroq(rawText, apiKey);

    const pdfBytes = await generateSPPdf(parsed, options);
    const pdfBase64 = Buffer.from(pdfBytes).toString("base64");

    return NextResponse.json({ parsed, pdfBase64 } satisfies ConvertCVResponse);
  } catch (err) {
    console.error("CV conversion error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Conversion failed: ${msg}` },
      { status: 500 },
    );
  }
}

export type { ConvertCVResponse, ParsedCV, CandidateOptions };
