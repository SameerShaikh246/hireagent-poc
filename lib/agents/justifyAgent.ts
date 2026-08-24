import type {
  ParsedResume,
  RuleBasedScore,
  AIAssessment,
  RoleType,
} from "@/types";
import { groqGenerate } from "../groq";

export async function justifyAgent(
  resume: ParsedResume,
  ruleScore: RuleBasedScore,
  jd: string,
  mustSkills: string[],
  niceSkills: string[],
  roleType: RoleType,
  apiKey: string
): Promise<AIAssessment> {

  const roleContext =
    roleType === "non-technical"
      ? `This is a NON-TECHNICAL role. Focus on business impact, domain experience, and stakeholder management.`
      : `This is a TECHNICAL role. Focus on hands-on skills, relevant technologies, and experience.`;

  const prompt = `You are a senior recruiter doing a structured candidate evaluation.

${roleContext}

JOB DESCRIPTION:
${jd.slice(0, 1500)}

RESUME (${resume.fileName}):
${resume.rawText.slice(0, 2500)}

RULE-BASED PRE-SCREENING:
- Matched skills: ${ruleScore.matchedSkills.join(", ") || "none"}
- Missing skills: ${ruleScore.missingSkills.join(", ") || "none"}
- Experience: ${ruleScore.experienceYears} years
- Rule score: ${ruleScore.total}/100

Return ONLY raw JSON — no markdown, no code fences:
{
  "roleFitScore": <0-100>,
  "strengths": ["<evidence-based strength>", "<strength>", "<strength>"],
  "gaps": ["<gap referencing JD requirement>", "<gap>"],
  "explanation": "<2-3 sentences: overall fit>",
  "whySelect": "<strongest concrete reason to shortlist>",
  "whyNotSelect": "<strongest reason not to select>",
  "recommendation": "<Strong Yes|Yes|Maybe|No>",
  "alternateRoles": ["<role if applicable>"]
}`;

  try {
    const rawText = await groqGenerate(prompt, {
      apiKey,
      model: "openai/gpt-oss-120b",
      maxTokens: 1000,
      responseFormat: { type: "json_object" },
    });


    const jsonStr = rawText
      .replace(/```(?:json)?\s*/gi, "")
      .replace(/```/g, "")
      .trim();

    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in justify response");

    const parsed = JSON.parse(jsonMatch[0]);

    const roleFitScore = Math.min(
      100,
      Math.max(0, Number(parsed.roleFitScore) || 50)
    );

    return {
      roleFitScore,
      overallScore: 0, 
      strengths: Array.isArray(parsed.strengths)
        ? parsed.strengths.slice(0, 3)
        : [],
      gaps: Array.isArray(parsed.gaps)
        ? parsed.gaps.slice(0, 3)
        : [],
      explanation: String(parsed.explanation || ""),
      whySelect: String(parsed.whySelect || ""),
      whyNotSelect: String(parsed.whyNotSelect || ""),
      recommendation: ["Strong Yes", "Yes", "Maybe", "No"].includes(
        parsed.recommendation
      )
        ? parsed.recommendation
        : "Maybe",
      alternateRoles: Array.isArray(parsed.alternateRoles)
        ? parsed.alternateRoles.slice(0, 3)
        : [],
    };
  } catch (err) {
    console.error("Justify agent error for", resume.fileName, err);

    const roleFitScore = Math.min(
      100,
      Math.round(ruleScore.total * 0.85)
    );

    return {
      roleFitScore,
      overallScore: 0,
      strengths:
        ruleScore.matchedSkills.length > 0
          ? ruleScore.matchedSkills
              .slice(0, 3)
              .map((s) => `Has experience with ${s}`)
          : ["Resume submitted for review"],
      gaps:
        ruleScore.missingSkills.length > 0
          ? ruleScore.missingSkills
              .slice(0, 3)
              .map((s) => `Missing: ${s}`)
          : ["No major gaps detected"],
      explanation: `Rule-based score: ${ruleScore.total}/100 with ${ruleScore.experienceYears} years experience.`,
      whySelect:
        ruleScore.matchedSkills.length >= 3
          ? `Matches key skills: ${ruleScore.matchedSkills.slice(0, 3).join(", ")}`
          : "Some relevant skills present.",
      whyNotSelect:
        ruleScore.missingSkills.length > 0
          ? `Missing key skills: ${ruleScore.missingSkills.slice(0, 3).join(", ")}`
          : "Limited information available.",
      recommendation:
        ruleScore.total >= 70
          ? "Yes"
          : ruleScore.total >= 50
          ? "Maybe"
          : "No",
      alternateRoles: [],
    };
  }
}