import type {
  ParsedResume,
  RuleBasedScore,
  EducationLevel,
} from "@/types";
import { skillPresentInText } from "../scoring/skillMatcher";

// EXPERIENCE
function extractExperienceYears(text: string): number {
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

// EDUCATION
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

// MAIN SCORE AGENT
export function scoreAgent(
  resume: ParsedResume,
  mandatorySkills: string[],   // ✅ keep this
  jdSkills: string[],
  jdText: string,
  requiredYears: number,
): RuleBasedScore {
  const text = resume.rawText.toLowerCase();

  // ✅ MANDATORY SKILL FILTER
  if (mandatorySkills.length > 0) {
    const missingMandatory = mandatorySkills.filter(
      (skill) => !skillPresentInText(skill, text)
    );

    if (missingMandatory.length > 0) {
      return {
        skillScore: 0,
        experienceScore: 0,
        educationScore: 0,
        total: 0,
        matchedSkills: [],
        missingSkills: jdSkills,
        experienceYears: extractExperienceYears(resume.rawText),
        disqualified: true,
        missingMandatorySkills: missingMandatory,
      };
    }
  }

  // SKILL MATCHING
  const matchedSkills = jdSkills.filter((skill) =>
    skillPresentInText(skill, text)
  );

  const missingSkills = jdSkills.filter(
    (skill) => !matchedSkills.includes(skill)
  );

  const skillScore =
    jdSkills.length > 0
      ? Math.min(40, Math.round((matchedSkills.length / jdSkills.length) * 40))
      : 20;

  // EXPERIENCE
  const candidateYears = extractExperienceYears(resume.rawText);

  let experienceScore = 0;
  if (candidateYears >= requiredYears) experienceScore = 30;
  else if (candidateYears >= requiredYears - 1) experienceScore = 22;
  else if (candidateYears >= requiredYears - 2) experienceScore = 15;
  else if (candidateYears > 0) experienceScore = 8;

  // EDUCATION
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
    disqualified: false,
    missingMandatorySkills: [],
  };
}