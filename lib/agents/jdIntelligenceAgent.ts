import type { JDIntelligenceResult, JDChange, RoleType, StructuredJD } from "@/types";
import { groqGenerate } from "../groq";

export async function jdIntelligenceAgent(
  jdText: string,
  structured: Partial<StructuredJD> | null,
  apiKey: string
): Promise<JDIntelligenceResult> {
  const hasStructured = structured && (structured.mustHaveSkills?.length ?? 0) > 0;

  const structuredContext = hasStructured
    ? `
STRUCTURED JD FIELDS (recruiter-entered — may contain errors):
- Job title: ${structured!.title ?? "not set"}
- Role type: ${structured!.roleType ?? "not set"}
- Must-have skills: ${(structured!.mustHaveSkills ?? []).join(", ") || "none"}
- Nice-to-have skills: ${(structured!.niceToHaveSkills ?? []).join(", ") || "none"}
- Experience range: ${structured!.experienceRange?.min ?? "?"} – ${structured!.experienceRange?.max ?? "?"} years
- Education required: ${structured!.educationRequired ?? "not set"}
`
    : "No structured fields provided — extract from free-text JD only.";

  const prompt = `You are a senior talent intelligence system. Analyze the job description and identify any issues with the recruiter's input.

${structuredContext}

JOB DESCRIPTION TEXT:
${jdText.slice(0, 3000)}

Your task:
1. Extract ALL technical and domain skills genuinely required for this role
2. Classify each as must-have (critical for the job) or nice-to-have (beneficial)
3. Detect if recruiter made errors: missing critical skills, wrong classification, synonyms/variations
4. Infer the correct role type (technical vs non-technical)
5. Validate experience range against industry norms for the role title

Rules:
- Normalize skill names to canonical forms (e.g. "reactjs" → "react", "hr management" → "employee relations")
- Flag skills that appear in must-have but are actually nice-to-have for the role level
- Add missing critical skills that the JD clearly implies but recruiter forgot to list
- Remove skills that don't belong to this role type
- For non-technical roles, include domain vocabulary (HR, Finance, Ops keywords) as skills

Return ONLY a raw JSON object — no markdown, no code fences:
{
  "mustHaveSkills": ["skill1", "skill2"],
  "niceToHaveSkills": ["skill3", "skill4"],
  "correctedExperienceRange": { "min": 0, "max": 0 },
  "roleType": "technical or non-technical",
  "confidence": 0.0,
  "warnings": ["warning string"],
  "changes": [
    {
      "type": "added|removed|reclassified|normalized|experience_adjusted",
      "skill": "skill name (optional)",
      "from": "original value (optional)",
      "to": "new value (optional)",
      "reason": "explanation"
    }
  ]
}`;

  try {
    const raw = await groqGenerate(prompt, { apiKey, maxTokens: 1500, temperature: 0.1 });
    const cleaned = raw.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON in JD intelligence response");

    const parsed = JSON.parse(match[0]);

    const mustHave: string[] = Array.isArray(parsed.mustHaveSkills)
      ? parsed.mustHaveSkills.map((s: unknown) => String(s).toLowerCase().trim()).filter(Boolean)
      : [];
    const niceToHave: string[] = Array.isArray(parsed.niceToHaveSkills)
      ? parsed.niceToHaveSkills.map((s: unknown) => String(s).toLowerCase().trim()).filter(Boolean)
      : [];
    const changes: JDChange[] = Array.isArray(parsed.changes) ? parsed.changes : [];
    const warnings: string[] = Array.isArray(parsed.warnings) ? parsed.warnings : [];

    return {
      finalSkills: [...mustHave, ...niceToHave],
      mustHaveSkills: mustHave,
      niceToHaveSkills: niceToHave,
      correctedExperienceRange: {
        min: Number(parsed.correctedExperienceRange?.min) || structured?.experienceRange?.min || 3,
        max: Number(parsed.correctedExperienceRange?.max) || structured?.experienceRange?.max || 6,
      },
      roleType: (["technical", "non-technical"].includes(parsed.roleType)
        ? parsed.roleType
        : structured?.roleType ?? "technical") as RoleType,
      confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0.7)),
      warnings,
      changes,
      originalMustHave: structured?.mustHaveSkills ?? [],
      originalNiceToHave: structured?.niceToHaveSkills ?? [],
    };
  } catch (err) {
    console.error("JD Intelligence Agent failed:", err);
    // Graceful fallback — use recruiter input as-is
    return {
      finalSkills: [...(structured?.mustHaveSkills ?? []), ...(structured?.niceToHaveSkills ?? [])],
      mustHaveSkills: structured?.mustHaveSkills ?? [],
      niceToHaveSkills: structured?.niceToHaveSkills ?? [],
      correctedExperienceRange: structured?.experienceRange ?? { min: 3, max: 6 },
      roleType: structured?.roleType ?? "technical",
      confidence: 0.3,
      warnings: ["JD Intelligence Agent failed — using recruiter input as fallback"],
      changes: [],
      originalMustHave: structured?.mustHaveSkills ?? [],
      originalNiceToHave: structured?.niceToHaveSkills ?? [],
    };
  }
}