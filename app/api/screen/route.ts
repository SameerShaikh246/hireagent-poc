import type {
  ParsedResume,
  RuleBasedScore,
  AIAssessment,
  CandidateResult,
  RoleType,
  EducationLevel,
} from "@/types";
import { NextRequest, NextResponse } from "next/server";
import { groqGenerate } from "@/lib/groq";
import parseAgent from "@/lib/parsers/parseResume";
import { skillPresentInText } from "@/lib/scoring/skillMatcher";
import { jdIntelligenceAgent } from "@/lib/agents/jdIntelligenceAgent";

// SKILL EXTRACTION
async function extractSkillsFromJD(
  jd: string,
  apiKey: string,
): Promise<string[]> {
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
    const raw = await groqGenerate(prompt, { apiKey, maxTokens: 512 });

    const cleaned = raw
      .replace(/```(?:json)?\s*/gi, "")
      .replace(/```/g, "")
      .trim();
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (!match) throw new Error("No JSON array");

    const parsed: unknown = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) throw new Error("Not array");

    return parsed
      .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
      .map((s) => s.toLowerCase().trim());
  } catch (err) {
    console.error("AI skill extraction failed:", err);
    return [];
  }
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
  if (t.includes("phd")) return 30;
  if (t.includes("master") || t.includes("mba") || t.includes("m.tech"))
    return 25;
  if (t.includes("bachelor") || t.includes("b.tech") || t.includes("degree"))
    return 20;
  if (t.includes("diploma")) return 12;
  return 5;
}

function scoreAgent(
  resume: ParsedResume,
  jdSkills: string[],
  jdText: string,
  requiredYearsOverride?: number,
): RuleBasedScore {
  const text = resume.rawText.toLowerCase();

  const matchedSkills = jdSkills.filter((skill) =>
    skillPresentInText(skill, text),
  );
  const missingSkills = jdSkills.filter(
    (skill) => !matchedSkills.includes(skill),
  );

  const skillScore =
    jdSkills.length > 0
      ? Math.min(40, Math.round((matchedSkills.length / jdSkills.length) * 40))
      : 20;

  const requiredYearsMatch = jdText.match(/(\d+)\+?\s*years?/i);
  const requiredYears =
    requiredYearsOverride ??
    (requiredYearsMatch ? parseInt(requiredYearsMatch[1]) : 3);

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

async function justifyAgent(
  resume: ParsedResume,
  ruleScore: RuleBasedScore,
  jd: string,
  apiKey: string,
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
    const rawText = await groqGenerate(prompt, { apiKey, maxTokens: 1000 });

    if (!rawText) throw new Error("Empty response from AI");
  
    const jsonStr = rawText
      .replace(/```(?:json)?\s*/gi, "")
      .replace(/```/g, "")
      .trim();

    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!jsonMatch)
      throw new Error(
        `No JSON object found in response: ${rawText.slice(0, 200)}`,
      );

    const parsed = JSON.parse(jsonMatch[0]);
    const roleFitScore = Math.min(
      100,
      Math.max(0, Number(parsed.roleFitScore) || 50),
    );
    const overallScore = Math.round(ruleScore.total * 0.4 + roleFitScore * 0.6);
    return {
      roleFitScore,
      overallScore,
      strengths: Array.isArray(parsed.strengths)
        ? parsed.strengths.slice(0, 3)
        : [],
      gaps: Array.isArray(parsed.gaps) ? parsed.gaps.slice(0, 3) : [],
      explanation: String(parsed.explanation || ""),
      whySelect: String(parsed.whySelect || ""),
      whyNotSelect: String(parsed.whyNotSelect || ""),
      recommendation: ["Strong Yes", "Yes", "Maybe", "No"].includes(
        parsed.recommendation,
      )
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
      recommendation:
        ruleScore.total >= 70 ? "Yes" : ruleScore.total >= 50 ? "Maybe" : "No",
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
      return NextResponse.json(
        { error: "Job description is too short." },
        { status: 400 },
      );
    if (!apiKey || apiKey.trim().length < 10)
      return NextResponse.json(
        { error: "Groq API key is required." },
        { status: 400 },
      );
    if (!files || files.length === 0)
      return NextResponse.json(
        { error: "No resume files uploaded." },
        { status: 400 },
      );
    const jdMode = (formData.get("jdMode") as string) ?? "freetext";

    let structuredInput = null;

    if (jdMode === "structured") {
      try {
        structuredInput = {
          title: (formData.get("title") as string) ?? "",
          roleType: (formData.get("roleType") as RoleType) ?? "technical",
          mustHaveSkills: JSON.parse(
            (formData.get("mustHaveSkills") as string) ?? "[]",
          ),
          niceToHaveSkills: JSON.parse(
            (formData.get("niceToHaveSkills") as string) ?? "[]",
          ),
          experienceRange: {
            min: parseInt((formData.get("experienceMin") as string) ?? "3", 10),
            max: parseInt((formData.get("experienceMax") as string) ?? "6", 10),
          },
          educationRequired:
            ((
              formData.get("educationRequired") as string
            )?.toLowerCase() as EducationLevel) ?? "bachelor",
          responsibilities: (formData.get("responsibilities") as string) ?? "",
        };
      } catch {
        structuredInput = null;
      }
    }
    const jdIntel = await jdIntelligenceAgent(jd, structuredInput, apiKey);
    console.log("JD Intelligence:", jdIntel);

    let jdSkills = await extractSkillsFromJD(jd, apiKey);

    if (jdIntel.mustHaveSkills.length > 0) {
      jdSkills = jdIntel.mustHaveSkills;
    }

    console.log("Final JD skills:", jdSkills);

    const candidates: CandidateResult[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const parsed = await parseAgent(file);

      const ruleScore = scoreAgent(
        parsed,
        jdSkills,
        jd,
        jdIntel.correctedExperienceRange?.min,
      );

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
      jdIntelligence: jdIntel,
      processedAt: new Date().toISOString(),
      totalResumes: files.length,
    });
  } catch (err: unknown) {
    console.error("Screening error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Screening failed: ${message}` },
      { status: 500 },
    );
  }
}
