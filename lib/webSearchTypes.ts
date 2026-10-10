export type Provider = "pdl" | "tavily" | "exa" | "serper" | "github" | "db";

// Candidate information enhancements
export interface CertificationInfo {
  name: string;
  issuer?: string;
  source: "PDL" | "WEB_EXTRACTED";
  confidence?: number;
}

export interface EstimatedSalary {
  min?: number;
  max?: number;
  currency?: string;
  minINR?: number; // only present when currency is USD — rough conversion
  maxINR?: number;
  source?: string; // e.g. "PDL inferred_salary" — always show this alongside the number, it's an estimate
}

export interface OpenToWorkInfo {
  status: "YES" | "NO" | "UNKNOWN";
  evidence?: string;
  source?: string; // e.g. "github_hireable_field", "bio_phrase_match:tavily"
}

export interface WebCandidate {
  id: string;
  name: string;
  title: string;
  company: string;
  url: string;
  source: "linkedin" | "github" | "portfolio" | "other";
  snippet: string;
  matchedSkills: string[];
  missingSkills: string[];
  relevanceScore: number;
  location?: string;
  experienceYears?: number;
  education?: string;
  provider: Provider;

  // Additions. May be absent/empty — treat as "Not Available" in
  // the UI, never as an error or a reason to hide the field entirely.
  candidateId?: string;
  certifications?: CertificationInfo[];
  estimatedSalary?: EstimatedSalary | null;
  openToWork?: OpenToWorkInfo;
}

export interface ExtractedJD {
  jobTitle: string;
  mandatorySkills: string[];
  mustHaveSkills: string[];
  niceToHaveSkills: string[];
}

// Recruiter-selected result filters, sent to /api/search-candidates.
export type EducationFilterLevel = "any" | "diploma" | "bachelor" | "master" | "phd";

export interface CandidateFilters {
  skills?: string[];
  minScore?: number;
  maxScore?: number;
  education?: EducationFilterLevel;
  minExperience?: number;
  maxExperience?: number;
  includeUnknown?: boolean;
}