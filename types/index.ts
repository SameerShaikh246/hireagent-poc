// Skill tiers
export type RoleType = "technical" | "non-technical" | "custom";
export type EducationLevel = "any" | "diploma" | "bachelor" | "master" | "phd";
export type JDMode = "structured" | "freetext";
export type EmploymentType = "full-time" | "contract" | "part-time" | "internship";

export type ScoringWeights = {
  skills: number;
  skillDepth: number;
  projects: number;
  experience: number;
  education: number;
  impactScore: number;
  softSkills: number;
  domainSignals: number;
};

export type SkillMultipliers = Record<string, number>;

// Structured JD — now has THREE skill tiers
export type StructuredJD = {
  title: string;
  department?: string;
  roleType: RoleType;
  employmentType: EmploymentType;
  /** Hard filter — candidates missing ANY of these are auto-disqualified */
  mandatorySkills: string[];
  /** Score penalty if missing, but not a disqualifier */
  mustHaveSkills: string[];
  /** Bonus if present, no penalty if absent */
  niceToHaveSkills: string[];
  responsibilities: string;
  experienceRange: { min: number; max: number };
  educationRequired: EducationLevel;
};

// Rule-based score — now tracks disqualification
export type SkillDepthResult = {
  skill: string;
  present: boolean;
  depth: "deep" | "mentioned" | "absent";
  score: number;
};

export type RuleBasedScore = {
  skillScore: number;
  experienceScore: number;
  educationScore: number;
  total: number;
  matchedSkills: string[];
  missingSkills: string[];
  experienceYears: number;
  // true when candidate failed the mandatory skills hard filter
  disqualified: boolean;
  // which mandatory skills were missing
  missingMandatorySkills: string[];
};

// AI assessment
export type AIAssessment = {
  roleFitScore: number;
  overallScore: number;
  strengths: string[];
  gaps: string[];
  explanation: string;
  whySelect: string;
  whyNotSelect: string;
  recommendation: "Strong Yes" | "Yes" | "Maybe" | "No";
  alternateRoles: string[];
};

export type CandidateResult = {
  id: string;
  fileName: string;
  contentHash?: string;
  isDuplicate: boolean;
  duplicateOf?: string;
  ruleScore: RuleBasedScore;
  aiAssessment: AIAssessment;
  finalScore: number;
  rank: number;
  jdUsed: "original" | "corrected";
};

export type JDChange = {
  type: "added" | "removed" | "reclassified" | "normalized" | "experience_adjusted";
  skill?: string;
  from?: string;
  to?: string;
  reason: string;
};

export type JDIntelligenceResult = {
  finalSkills: string[];
  mustHaveSkills: string[];
  niceToHaveSkills: string[];
  correctedExperienceRange: { min: number; max: number };
  roleType: RoleType;
  confidence: number;
  warnings: string[];
  changes: JDChange[];
  originalMustHave: string[];
  originalNiceToHave: string[];
};

export type ScreeningResponse = {
  candidates: CandidateResult[];
  disqualifiedCandidates: CandidateResult[]; 
  jdIntelligence: JDIntelligenceResult;
  processedAt: string;
  totalResumes: number;
  duplicatesFound: number;
  ruleBlend: number;
  customWeights?: ScoringWeights;
  skillMultipliers?: SkillMultipliers;
  mandatorySkills: string[]; 
};

export type SkillSuggestion = {
  skill: string;
  confidence: "high" | "medium";
  reason: string;
};

export type SkillSuggestions = {
  mandatory: SkillSuggestion[];
  mustHave: SkillSuggestion[];
  niceToHave: SkillSuggestion[];
};

export type ParsedResume = {
  fileName: string;
  rawText: string;
  contentHash?: string;
  metadata?: Record<string, unknown>;
  parseMethod: "plain-text" | "unpdf" | "pdf-parse-fallback" | "mammoth" | "failed"|"unsupported";
};