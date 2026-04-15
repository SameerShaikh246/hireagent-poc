// ROLE & JD TYPES
export type RoleType = "technical" | "non-technical" | "custom";
export type EmploymentType = "full-time" | "contract" | "part-time" | "internship";
export type EducationLevel = "any" | "diploma" | "bachelor" | "master" | "phd";
export type JDMode = "structured" | "freetext";

export interface StructuredJD {
  title: string;
  department?: string;
  roleType: RoleType;
  employmentType: EmploymentType;
  mustHaveSkills: string[];
  niceToHaveSkills: string[];
  responsibilities: string;
  experienceRange: { min: number; max: number };
  educationRequired: EducationLevel;
}

// JD INTELLIGENCE AGENT
export interface JDIntelligenceResult {
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
}

export interface JDChange {
  type: "added" | "removed" | "reclassified" | "normalized" | "experience_adjusted";
  skill?: string;
  from?: string;
  to?: string;
  reason: string;
}

// SCORING WEIGHTS 
export interface ScoringWeights {
  skills: number;
  skillDepth: number;
  projects: number;
  experience: number;
  education: number;
  impactScore?: number;
  softSkills?: number;
  domainSignals?: number;
}

// SKILL DEPTH
export interface SkillDepthResult {
  skill: string;
  present: boolean;
  depth: "deep" | "mentioned" | "absent";
  score: number;
}

export interface ProjectScore {
  projectsDetected: number;
  relevantProjects: number;
  score: number;
}

// NON-TECHNICAL SCORES
export interface ImpactScore {
  detected: string[];
  score: number;
  raw: number;
}

export interface SoftSkillScore {
  detected: string[];
  score: number;
}

export interface DomainSignalScore {
  domain: string;
  signals: string[];
  score: number;
}

// PARSED RESUME
export interface ParsedResume {
  fileName: string;
  rawText: string;
  parseMethod: string;
  contentHash?: string;
}

// RULE-BASED SCORE
export interface RuleBasedScore {
  skillScore: number;
  experienceScore: number;
  educationScore: number;
  total: number;
  matchedSkills: string[];
  missingSkills: string[];
  experienceYears: number;
  // skillDepthScore: number;
  // projectScore: number;
  // impactScore: number;
  // softSkillScore: number;
  // domainSignalScore: number;
  // skillDepthResults: SkillDepthResult[];
  // projectDetails: ProjectScore;
  // impactDetails: ImpactScore;
  // softSkillDetails: SoftSkillScore;
  // domainDetails: DomainSignalScore;
}

// AI ASSESSMENT
export interface AIAssessment {
  roleFitScore: number;
  overallScore: number;
  strengths: string[];
  gaps: string[];
  explanation: string;
  whySelect: string;
  whyNotSelect: string;
  recommendation: "Strong Yes" | "Yes" | "Maybe" | "No";
  alternateRoles?: string[];
}

// CANDIDATE RESULT
export interface CandidateResult {
  id: string;
  fileName: string;
  contentHash?: string;
  isDuplicate?: boolean;
  duplicateOf?: string;
  ruleScore: RuleBasedScore;
  aiAssessment: AIAssessment;
  finalScore: number;
  rank: number;
  jdUsed?: "original" | "corrected";
}

// SCREENING RESPONSE
export interface ScreeningResponse {
  candidates: CandidateResult[];
  jdIntelligence: JDIntelligenceResult;
  processedAt: string;
  totalResumes: number;
  duplicatesFound: number;
  ruleBlend: number;
  customWeights?: ScoringWeights;
}