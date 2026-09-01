import type {
  ParsedResume,
  RuleBasedScore,
  EducationLevel,
} from "@/types";
import { skillPresentInText } from "../scoring/skillMatcher";

// EXPERIENCE
function extractExperienceYears(text: string): number {
  const explicit = [
    /(\d+)\+?\s*years?\s+(?:of\s+)?(?:experience|exp)/gi,
    /experience\s*[:\-]?\s*(\d+)\+?\s*years?/gi,
  ];

  const years: number[] = [];
  for (const p of explicit) {
    let m: RegExpExecArray | null;
    while ((m = p.exec(text)) !== null) years.push(parseInt(m[1]));
  }
  if (years.length) return Math.max(...years);

  // Fallback: sum up date ranges like "Jan 2020 - Present", "2019 – 2022"
  const rangePattern =
    /(\d{4})\s*[-–—to]+\s*(present|current|\d{4})/gi;
  let totalMonths = 0;
  let m: RegExpExecArray | null;
  while ((m = rangePattern.exec(text)) !== null) {
    const start = parseInt(m[1]);
    const end = /present|current/i.test(m[2]) ? new Date().getFullYear() : parseInt(m[2]);
    if (end >= start) totalMonths += (end - start) * 12;
  }
  return totalMonths > 0 ? Math.round(totalMonths / 12) : 0;
}

// EDUCATION (max 25)
function detectEducation(text: string): number {
  const t = text.toLowerCase();
  if (t.includes("phd")) return 25;
  if (t.includes("master") || t.includes("mba") || t.includes("m.tech"))
    return 20;
  if (t.includes("bachelor") || t.includes("b.tech") || t.includes("degree"))
    return 17;
  if (t.includes("diploma")) return 10;

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

// SKILL (unchanged — already max 40, matches your target)
  const skillScore =
    jdSkills.length > 0
      ? Math.min(40, Math.round((matchedSkills.length / jdSkills.length) * 40))
      : 20;

  // EXPERIENCE (max 35)
  const candidateYears = extractExperienceYears(resume.rawText);

  let experienceScore = 0;
  if (candidateYears >= requiredYears) experienceScore = 35;
  else if (candidateYears >= requiredYears - 1) experienceScore = 26;
  else if (candidateYears >= requiredYears - 2) experienceScore = 18;
  else if (candidateYears > 0) experienceScore = 9;
  else experienceScore = 5;

  // EDUCATION (max 25)
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