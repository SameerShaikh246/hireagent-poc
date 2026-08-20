export type Provider = "pdl" | "tavily" | "exa" | "serper" | "github";

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
}

export interface ExtractedJD {
  jobTitle: string;
  mandatorySkills: string[];
  mustHaveSkills: string[];
  niceToHaveSkills: string[];
}