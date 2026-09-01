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

 const prompt = `You are a JD intelligence system. Analyze this job description and recruiter-entered structured JD data.

${structuredContext}

JOB DESCRIPTION:
${jdText.slice(0, 3000)}

TASK:
1. Extract skills relevant to THIS JD.
2. Classify them as must-have or nice-to-have.
3. Compare against recruiter fields and identify missing, incorrect, unnecessary, or normalized skills.
4. Determine role type: technical or non-technical.
5. Correct experience range only when supported by the JD.

SKILL INFERENCE:
Limited shallow inference is allowed.

You MAY add direct foundational dependencies:
- React -> JavaScript
- TypeScript -> JavaScript
- React -> HTML/CSS
- Next.js -> React
- Node.js -> JavaScript
- Django -> Python
- Spring Boot -> Java
- .NET -> C#

Do NOT make broad industry assumptions.

Do NOT infer:
- React -> state management
- React -> testing/Jest/Cypress
- React -> responsive design
- React -> CI/CD
- React -> Agile
- React -> AWS/Docker
- Senior -> architecture/system design/mentoring
- Product team -> Agile

Do not chain inference. For example:
React -> JavaScript -> testing -> CI/CD is NOT allowed.

Add at most 1-3 directly implied foundational skills.

EXPERIENCE:
If the JD does not explicitly specify experience, return:
min: 0, max: 0
Do not infer experience from "Senior" or "Lead".

NORMALIZATION:
Use canonical names:
ReactJS/React.js -> react
Next.js/NextJS -> next.js
Node.js/NodeJS/Node -> node.js
REST APIs/REST API -> rest api
Git -> git

For changes, report meaningful corrections only.

The final skills must represent explicit JD requirements plus a small number of direct foundational implications, NOT an ideal candidate profile.

Return ONLY raw JSON:

{
  "mustHaveSkills": [],
  "niceToHaveSkills": [],
  "correctedExperienceRange": {"min": 0, "max": 0},
  "roleType": "technical",
  "confidence": 0.0,
  "warnings": [],
  "changes": [
    {
      "type": "added|removed|reclassified|normalized|experience_adjusted",
      "skill": "",
      "from": "",
      "to": "",
      "reason": ""
    }
  ]
}`;

  try {
    const raw = await groqGenerate(prompt, { apiKey, model: "openai/gpt-oss-120b", maxTokens: 1500, temperature: 0.1 });
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