import { NextRequest, NextResponse } from "next/server";
import { groqGenerate } from "@/lib/groq";
import { getCentralGroqKeys, getProviderKeys } from "@/lib/providerKeys";

export type SkillSuggestion = {
  skill: string;
  confidence: "high" | "medium";
  reason: string;
};

export type SuggestSkillsResponse = {
  mandatory: SkillSuggestion[];
  mustHave: SkillSuggestion[];
  niceToHave: SkillSuggestion[];
  source: "groq" | "esco" | "fallback";
  occupation?: string;
};

// Groq
async function fetchFromGroq(
  title: string,
  department: string,
  roleType: string,
  // Fallback only: used when the server has no GROQ_API_KEYS configured.
  // With a server key pool set, this is ignored (and failover applies).
  fallbackApiKey?: string,
): Promise<SuggestSkillsResponse | null> {
  const prompt = `You are a senior recruiter. Suggest skills for this role, split into three tiers.

Job title: "${title}"
Department / industry: "${department || "not specified"}"
Role type: "${roleType}"

Department MUST influence suggestions. Examples:
- "QA Engineer" in Fintech → add regulatory testing, risk-based testing
- "QA Engineer" in Gaming → add performance testing, game engine QA
- "Marketing Manager" in B2B SaaS → demand gen, HubSpot, ABM
- "Marketing Manager" in FMCG → trade marketing, shopper insights, ATL/BTL
- "Data Analyst" in Healthcare → HL7, clinical data, HIPAA
- "Data Analyst" in Retail → demand forecasting, POS data

Return ONLY raw JSON (no markdown, no code fences):
{
  "occupation": "<canonical job title>",
  "mandatory": [{ "skill": "<lowercase>", "confidence": "high|medium", "reason": "<short phrase>" }],
  "mustHave":  [{ "skill": "<lowercase>", "confidence": "high|medium", "reason": "<short phrase>" }],
  "niceToHave":[{ "skill": "<lowercase>", "confidence": "high|medium", "reason": "<short phrase>" }]
}

Rules:
- mandatory: 2–4 skills MAX. Truly non-negotiable only.
- mustHave: 3–5 skills. Strong preference.
- niceToHave: 3–5 skills. Bonus if present.
- Canonical lowercase skill names (react not ReactJS, postgresql not "postgres db")
- Never suggest generic office skills (email, ms word, etc.)`;

  try {
    // groqGenerate walks the whole key pool: an invalid, exhausted or
    // rate-limited key falls through to the next one. If every key fails it
    // throws, and we return null so the ESCO / local fallbacks take over —
    // suggestions must never be the thing that breaks the form.
    const raw = await groqGenerate(prompt, {
      ...getCentralGroqKeys(fallbackApiKey),
      model: "openai/gpt-oss-120b",
      maxTokens: 1200,
      temperature: 0.2,
    });

    const match = raw
      .replace(/```(?:json)?\s*/gi, "")
      .replace(/```/g, "")
      .trim()
      .match(/\{[\s\S]*\}/);
    if (!match) return null;

    const parsed = JSON.parse(match[0]);

    const norm = (arr: unknown[]): SkillSuggestion[] =>
      Array.isArray(arr)
        ? arr
          .filter(
            (s): s is Record<string, string> => !!s && typeof s === "object",
          )
          .map((s) => ({
            skill: String(s.skill ?? "")
              .toLowerCase()
              .trim(),
            confidence: (["high", "medium"].includes(s.confidence)
              ? s.confidence
              : "medium") as "high" | "medium",
            reason: String(s.reason ?? ""),
          }))
          .filter((s) => s.skill.length > 0)
        : [];

    return {
      mandatory: norm(parsed.mandatory).slice(0, 4),
      mustHave: norm(parsed.mustHave).slice(0, 5),
      niceToHave: norm(parsed.niceToHave).slice(0, 5),
      source: "groq",
      occupation: String(parsed.occupation ?? title),
    };
  } catch (error) {
    console.error("[Groq] suggestions failed, falling back:", error instanceof Error ? error.message : error);
    return null;
  }
}

// ESCO fallback
async function fetchFromEsco(
  title: string,
): Promise<SuggestSkillsResponse | null> {
  try {
    const searchRes = await fetch(
      `https://ec.europa.eu/esco/api/resource/occupation?language=en&text=${encodeURIComponent(title)}&limit=3`,
      { headers: { Accept: "application/json" } },
    );
    if (!searchRes.ok) return null;

    const searchData = await searchRes.json();
    const occupations = searchData?._embedded?.results ?? [];
    if (!occupations.length) return null;

    const occ = occupations[0];
    const skillsRes = await fetch(
      `https://ec.europa.eu/esco/api/resource/occupation?uri=${encodeURIComponent(occ.uri)}&language=en`,
      { headers: { Accept: "application/json" } },
    );
    if (!skillsRes.ok) return null;

    const skillsData = await skillsRes.json();
    const essential: { title: string }[] =
      skillsData?._links?.hasEssentialSkill ?? [];
    const optional: { title: string }[] =
      skillsData?._links?.hasOptionalSkill ?? [];

    const toSug = (
      s: { title: string },
      conf: "high" | "medium",
      reason: string,
    ): SkillSuggestion => ({
      skill: s.title.toLowerCase().trim(),
      confidence: conf,
      reason,
    });

    return {
      mandatory: essential
        .slice(0, 3)
        .map((s) => toSug(s, "high", `Essential for ${occ.title}`)),
      mustHave: essential
        .slice(3, 10)
        .map((s) => toSug(s, "high", `Required for ${occ.title}`)),
      niceToHave: optional
        .slice(0, 5)
        .map((s) => toSug(s, "medium", `Beneficial for ${occ.title}`)),
      source: "esco",
      occupation: occ.title ?? title,
    };
  } catch {
    return null;
  }
}

// Local fallback
function localFallback(title: string): SuggestSkillsResponse {
  const t = title.toLowerCase();
  if (t.includes("qa") || t.includes("quality") || t.includes("test")) {
    return {
      mandatory: [
        {
          skill: "manual testing",
          confidence: "high",
          reason: "Core QA function",
        },
        {
          skill: "test case design",
          confidence: "high",
          reason: "Fundamental QA skill",
        },
      ],
      mustHave: [
        { skill: "selenium", confidence: "high", reason: "Test automation" },
        { skill: "jira", confidence: "high", reason: "Bug tracking" },
        {
          skill: "api testing",
          confidence: "high",
          reason: "Backend validation",
        },
      ],
      niceToHave: [
        {
          skill: "cypress",
          confidence: "medium",
          reason: "Modern E2E testing",
        },
        { skill: "postman", confidence: "medium", reason: "API tool" },
        {
          skill: "ci/cd",
          confidence: "medium",
          reason: "Pipeline integration",
        },
      ],
      source: "fallback",
      occupation: "QA Engineer",
    };
  }
  return {
    mandatory: [],
    mustHave: [],
    niceToHave: [],
    source: "fallback",
    occupation: title,
  };
}

// Handler
export async function POST(req: NextRequest) {
  try {
    // `apiKey` is still read from the body so older clients keep working, but
    // it is only a FALLBACK now: the server's GROQ_API_KEYS pool is preferred,
    // and a typed key is used only when no server key is configured.
    const { title, department, roleType, apiKey } = await req.json();

    if (!title || title.trim().length < 2)
      return NextResponse.json(
        { error: "Job title required" },
        { status: 400 },
      );

    const typedKey = typeof apiKey === "string" ? apiKey.trim() : "";
    const groqAvailable = getProviderKeys("groq").length > 0 || typedKey.length >= 10;

    if (groqAvailable) {
      const groq = await fetchFromGroq(
        title.trim(),
        department ?? "",
        roleType ?? "technical",
        typedKey,
      );
      if (groq) return NextResponse.json(groq);
    }

    const esco = await fetchFromEsco(title.trim());
    if (esco && esco.mandatory.length + esco.mustHave.length > 0)
      return NextResponse.json(esco);

    return NextResponse.json(localFallback(title.trim()));
  } catch (err) {
    console.error("suggest-skills error:", err);
    return NextResponse.json(
      { error: "Failed to fetch suggestions" },
      { status: 500 },
    );
  }
}