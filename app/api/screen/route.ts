import type {
  ParsedResume,
  RuleBasedScore,
  AIAssessment,
  CandidateResult,
} from "@/types";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { groqGenerate } from "@/lib/groq";

function createGroqClient(apiKey: string) {
  return new OpenAI({
    baseURL: "https://api.groq.com/openai/v1",
    apiKey: apiKey.trim(),
  });
}

// ─── TEXT NORMALIZER (fixes PDF extraction artifacts) ────────────────────────
function normalizeResumeText(raw: string): string {
  return (
    raw
      // Fix ligatures (common in PDFs)
      .replace(/\uFB01/g, "fi")
      .replace(/\uFB02/g, "fl")
      .replace(/\uFB00/g, "ff")
      .replace(/\uFB03/g, "ffi")
      .replace(/\uFB04/g, "ffl")

      // Fix camelCase merged words e.g. "ReactJS" -> "React JS"
      .replace(/([a-z])([A-Z])/g, "$1 $2")

      // Collapse multiple spaces/tabs to single space
      .replace(/[ \t]{2,}/g, " ")

      // Fix single-letter lines caused by PDF column breaks
      .replace(/\n([A-Za-z])\n/g, " $1 ")

      // Normalize line endings
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")

      // Remove lines that are just punctuation/numbers (page numbers, dividers)
      .replace(/^\s*[\d\-\u2013\u2014|•·]+\s*$/gm, "")

      // Collapse 3+ newlines to 2
      .replace(/\n{3,}/g, "\n\n")

      .trim()
  );
}

// ─── PARSE AGENT ─────────────────────────────────────────────────────────────
async function parseAgent(file: File): Promise<ParsedResume> {
  const name = file.name.toLocaleLowerCase();

  if (name.endsWith(".txt")) {
    const text = await file.text(); 

    return {
      fileName: file.name,
      rawText: normalizeResumeText(text),
      parseMethod: "plain-text",
    };
  }

  if (name.endsWith(".pdf")) {
    // Primary: unpdf (handles multi-column layouts and ligatures better than pdf-parse)
    try {
      const arrayBuffer = await file.arrayBuffer();
      const { extractText } = await import("unpdf");
      const { text } = await extractText(new Uint8Array(arrayBuffer), {
        mergePages: true,
      });
      return {
        fileName: file.name,
        rawText: normalizeResumeText(text),
        parseMethod: "unpdf",
      };
    } catch (unpdfErr) {
      console.warn("unpdf failed, falling back to pdf-parse:", unpdfErr);
    }

    // Fallback: pdf-parse
    try {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const pdfParse = (await import("pdf-parse")).default;
      const result = await pdfParse(buffer);
      return {
        fileName: file.name,
        rawText: normalizeResumeText(result.text),
        parseMethod: "pdf-parse-fallback",
      };
    } catch {
      return {
        fileName: file.name,
        rawText: "[PDF parse failed - scanned or encrypted]",
        parseMethod: "ai-fallback",
      };
    }
  }

  if (name.endsWith(".docx")) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      return {
        fileName: file.name,
        rawText: normalizeResumeText(result.value),
        parseMethod: "mammoth",
      };
    } catch {
      return {
        fileName: file.name,
        rawText: "[DOCX parse failed]",
        parseMethod: "ai-fallback",
      };
    }
  }

  return { fileName: file.name, rawText: "", parseMethod: "ai-fallback" };
}

// SKILL EXTRACTION
async function extractSkillsFromJD(jd: string, apiKey: string): Promise<string[]> {
  const prompt = `You are a technical recruiter assistant. Extract ONLY the technical skills, tools, frameworks, and technologies that are explicitly mentioned in the job description below.

Rules:
- Return a JSON array of lowercase strings only.
- Each item must be a specific skill/technology (e.g. "react", "typescript", "rest api", "git").
- Do NOT infer skills that are not written in the JD.
- Do NOT add generic terms like "communication" or "teamwork".
- Do NOT add broad categories like "frontend" or "backend" unless explicitly listed as a skill.
- Treat "javascript" and "typescript" as separate items if both appear.
- Output ONLY the raw JSON array — no markdown, no explanation, no code fences.

JOB DESCRIPTION:
${jd.slice(0, 2000)}`;

  try {
    const raw = await groqGenerate( prompt, {
    apiKey,
    maxTokens: 512,
  });
    const cleaned = raw.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();

    const match = cleaned.match(/\[[\s\S]*\]/);
    if (!match) throw new Error("No JSON array in skill extraction response");

    const parsed: unknown = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) throw new Error("Parsed value is not an array");

    return parsed
      .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
      .map((s) => s.toLowerCase().trim());
  } catch (err) {
    console.error("AI skill extraction failed:", err);
    return [];
  }
}

// SKILL ALIAS MAP
// Maps canonical skill name -> known PDF/resume variants
const SKILL_ALIASES: Record<string, string[]> = {
  "react":          ["reactjs", "react.js", "react js"],
  "node":           ["nodejs", "node.js", "node js"],
  "next.js":        ["nextjs", "next js", "next"],
  "vue":            ["vuejs", "vue.js", "vue js"],
  "typescript":     ["ts", "type script"],
  "javascript":     ["js", "java script"],
  "postgresql":     ["postgres", "psql", "pg"],
  "mongodb":        ["mongo", "mongo db"],
  "graphql":        ["graph ql", "graph-ql"],
  "rest api":       ["restapi", "rest apis", "restful api", "restful", "rest"],
  "css":            ["css3", "cascading style sheets"],
  "html":           ["html5", "hypertext markup"],
  "aws":            ["amazon web services", "amazon aws"],
  "gcp":            ["google cloud platform", "google cloud"],
  "azure":          ["microsoft azure"],
  "ci/cd":          ["cicd", "ci cd", "continuous integration", "continuous deployment"],
  "docker":         ["dockerfile", "docker container"],
  "kubernetes":     ["k8s", "kube"],
  "tailwind":       ["tailwindcss", "tailwind css"],
  "express":        ["expressjs", "express.js"],
  "django":         ["django rest", "django framework"],
  "fastapi":        ["fast api"],
  "redis":          ["redis cache"],
  "elasticsearch":  ["elastic search", "elastic"],
  "tensorflow":     ["tensor flow"],
  "pytorch":        ["torch", "py torch"],
  "sql":            ["mysql", "mssql", "sql server"],
  "git":            ["github", "gitlab", "version control"],
  "linux":          ["unix", "ubuntu", "bash", "shell scripting"],
  "flutter":        ["dart flutter"],
  "react native":   ["reactnative"],
  "spring boot":    ["springboot", "spring framework"],
};

// SKILL PRESENCE CHECK (alias-aware) 
function skillPresentInText(skill: string, text: string): boolean {
  const skillLower = skill.toLowerCase();

  // Direct match — phrase or word boundary
  const escaped = skillLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = skillLower.includes(" ")
    ? new RegExp(escaped, "i")
    : new RegExp(`\\b${escaped}\\b`, "i");
  if (pattern.test(text)) return true;

  // Check if any alias for this skill appears in text
  const aliases = SKILL_ALIASES[skillLower] ?? [];
  for (const alias of aliases) {
    const ae = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const ap = alias.includes(" ")
      ? new RegExp(ae, "i")
      : new RegExp(`\\b${ae}\\b`, "i");
    if (ap.test(text)) return true;
  }

  // Reverse check: is this skill listed as an alias for a canonical that appears in text?
  for (const [canonical, aliasList] of Object.entries(SKILL_ALIASES)) {
    if (aliasList.includes(skillLower)) {
      const ce = canonical.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const cp = canonical.includes(" ")
        ? new RegExp(ce, "i")
        : new RegExp(`\\b${ce}\\b`, "i");
      if (cp.test(text)) return true;
    }
  }

  return false;
}

// SCORE AGENT 
function extractExperienceYearsFromText(text: string): number {
  const patterns = [
    /(\d+)\+?\s*years?\s+(?:of\s+)?(?:experience|exp)/gi,
    /experience\s*[:\-]?\s*(\d+)\+?\s*years?/gi,
  ];
  const years: number[] = [];
  for (const p of patterns) {
    let m: RegExpExecArray | null;
    while ((m = p.exec(text)) !== null) {
      years.push(parseInt(m[1]));
    }
  }
  return years.length ? Math.max(...years) : 0;
}

function detectEducation(text: string): number {
  const t = text.toLowerCase();
  if (t.includes("phd") || t.includes("doctorate") || t.includes("ph.d")) return 30;
  if (
    t.includes("master") ||
    t.includes("m.s") ||
    t.includes("mba") ||
    t.includes("m.tech")
  )
    return 25;
  if (
    t.includes("bachelor") ||
    t.includes("b.s") ||
    t.includes("b.e") ||
    t.includes("b.tech") ||
    t.includes("degree")
  )
    return 20;
  if (t.includes("diploma") || t.includes("associate")) return 12;
  return 5;
}

function scoreAgent(
  resume: ParsedResume,
  jdSkills: string[],
  jdText: string,
): RuleBasedScore {
  const text = resume.rawText.toLowerCase();

  const matchedSkills = jdSkills.filter((skill) => skillPresentInText(skill, text));
  const missingSkills = jdSkills.filter((skill) => !matchedSkills.includes(skill));

  const skillScore =
    jdSkills.length > 0
      ? Math.min(40, Math.round((matchedSkills.length / jdSkills.length) * 40))
      : 20;

  const requiredYearsMatch = jdText.match(/(\d+)\+?\s*years?/i);
  const requiredYears = requiredYearsMatch ? parseInt(requiredYearsMatch[1]) : 3;
  const candidateYears = extractExperienceYearsFromText(resume.rawText);
  let experienceScore = 0;
  if (candidateYears >= requiredYears) experienceScore = 30;
  else if (candidateYears >= requiredYears - 1) experienceScore = 22;
  else if (candidateYears >= requiredYears - 2) experienceScore = 15;
  else if (candidateYears > 0) experienceScore = 8;

  const educationScore = detectEducation(resume.rawText);
  const total = skillScore + experienceScore + educationScore;

  return {
    skillScore,
    experienceScore,
    educationScore,
    total,
    matchedSkills,
    missingSkills,
    experienceYears: candidateYears,
  };
}

// JUSTIFY AGENT
async function justifyAgent(
  resume: ParsedResume,
  ruleScore: RuleBasedScore,
  jd: string,
  apiKey?: string,
): Promise<AIAssessment> {
  const prompt = `You are a senior technical recruiter. Evaluate this candidate's resume strictly against the job description below.

JOB DESCRIPTION:
${jd.slice(0, 1500)}

RESUME (${resume.fileName}):
${resume.rawText.slice(0, 2500)}

RULE-BASED PRE-SCREENING:
- Skills matched from JD: ${ruleScore.matchedSkills.join(", ") || "none detected"}
- Experience years detected: ${ruleScore.experienceYears}
- Rule score: ${ruleScore.total}/100

Your task: Return a JSON object. Output ONLY the raw JSON — no markdown, no code fences, no explanation outside the JSON.

Required JSON shape:
{
  "roleFitScore": <integer 0-100 reflecting how well this candidate fits the specific JD>,
  "strengths": [
    "<specific strength tied to a JD requirement>",
    "<specific strength tied to a JD requirement>",
    "<specific strength tied to a JD requirement>"
  ],
  "gaps": [
    "<specific gap or missing JD requirement>",
    "<specific gap or missing JD requirement>"
  ],
  "explanation": "<2-3 sentences: how well the candidate matches this specific role and why>",
  "whySelect": "<1-2 sentences: the strongest concrete reason to shortlist this candidate for THIS job, referencing specific JD criteria they meet>",
  "whyNotSelect": "<1-2 sentences: the strongest concrete reason NOT to select, referencing specific JD criteria they are missing or weak on>",
  "recommendation": "<exactly one of: Strong Yes, Yes, Maybe, No>"
}`;

  try {
    const rawText = await groqGenerate(prompt, {apiKey,maxTokens:1000});

    const jsonStr = rawText
      .replace(/```(?:json)?\s*/gi, "")
      .replace(/```/g, "")
      .trim();

    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!jsonMatch)
      throw new Error(`No JSON object found in response: ${rawText.slice(0, 200)}`);

    const parsed = JSON.parse(jsonMatch[0]);
    const roleFitScore = Math.min(100, Math.max(0, Number(parsed.roleFitScore) || 50));
    const overallScore = Math.round(ruleScore.total * 0.4 + roleFitScore * 0.6);
0
    return {
      roleFitScore,
      overallScore,
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths.slice(0, 3) : [],
      gaps: Array.isArray(parsed.gaps) ? parsed.gaps.slice(0, 3) : [],
      explanation: String(parsed.explanation || ""),
      whySelect: String(parsed.whySelect || ""),
      whyNotSelect: String(parsed.whyNotSelect || ""),
      recommendation: ["Strong Yes", "Yes", "Maybe", "No"].includes(parsed.recommendation)
        ? parsed.recommendation
        : "Maybe",
    };
  } catch (err) {
    console.error("Justify agent error for", resume.fileName, err);
    const roleFitScore = Math.min(100, Math.round(ruleScore.total * 0.85));
    const matched = ruleScore.matchedSkills;
    return {
      roleFitScore,
      overallScore: Math.round(ruleScore.total * 0.4 + roleFitScore * 0.6),
      strengths:
        matched.length > 0
          ? matched.slice(0, 3).map((s) => `Demonstrated experience with ${s}`)
          : ["Resume submitted for review"],
      gaps: ["Full AI assessment unavailable — review resume manually"],
      explanation: `Rule-based screening gave a score of ${ruleScore.total}/100. ${matched.length} JD skills matched: ${matched.slice(0, 5).join(", ") || "none"}.`,
      whySelect:
        matched.length >= 3
          ? `Candidate matches ${matched.length} key skills from the JD including ${matched.slice(0, 3).join(", ")}.`
          : "Insufficient skill overlap detected for a confident recommendation.",
      whyNotSelect:
        ruleScore.experienceYears === 0
          ? "Years of experience could not be verified from the resume."
          : "AI assessment failed; manual review required to verify JD fit.",
      recommendation: ruleScore.total >= 70 ? "Yes" : ruleScore.total >= 50 ? "Maybe" : "No",
    };
  }
}

// MAIN ROUTE
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const jd = formData.get("jobDescription") as string;
    const apiKey = formData.get("apiKey") as string;
    const files = formData.getAll("resumes") as File[];

    if (!jd || jd.trim().length < 20)
      return NextResponse.json({ error: "Job description is too short." }, { status: 400 });
    if (!apiKey || apiKey.trim().length < 10)
      return NextResponse.json({ error: "Groq API key is required." }, { status: 400 });
    if (!files || files.length === 0)
      return NextResponse.json({ error: "No resume files uploaded." }, { status: 400 });

    // Extract skills from JD ONCE (single API call before the loop)
    const jdSkills = await extractSkillsFromJD(jd, apiKey);
    console.log("AI-extracted JD skills:", jdSkills);

    const candidates: CandidateResult[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const parsed = await parseAgent(file);
      const ruleScore = scoreAgent(parsed, jdSkills, jd);
      const aiAssessment = await justifyAgent(parsed, ruleScore, jd, apiKey);

      candidates.push({
        id: `candidate-${i + 1}`,
        fileName: file.name,
        ruleScore,
        aiAssessment,
        finalScore: aiAssessment.overallScore,
        rank: 0,
      });

      // Small delay between resumes to stay within Groq's 30 RPM limit
      // if (i < files.length - 1) {
      //   await new Promise((resolve) => setTimeout(resolve, 500));
      // }
    }

    candidates.sort((a, b) => b.finalScore - a.finalScore);
    candidates.forEach((c, i) => {
      c.rank = i + 1;
    });

    return NextResponse.json({
      candidates,
      processedAt: new Date().toISOString(),
      totalResumes: files.length,
    });
  } catch (err: unknown) {
    console.error("Screening error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Screening failed: ${message}` }, { status: 500 });
  }
}