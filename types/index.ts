
export interface ParsedResume {
  fileName: string
  rawText: string
  parseMethod: 'pdf-parse' | 'pdf-parse-fallback' | 'unpdf' | 'mammoth' | 'ai-fallback' | 'plain-text'
}

export interface RuleBasedScore {
  skillScore: number       // 0–40
  experienceScore: number  // 0–30
  educationScore: number   // 0–30
  total: number            // 0–100
  matchedSkills: string[]
  missingSkills: string[]
  experienceYears: number
}

export interface AIAssessment {
  roleFitScore: number     // 0–100
  overallScore: number     // weighted final
  strengths: string[]
  gaps: string[]
  explanation: string
  whySelect: string        // specific JD-based reason to hire
  whyNotSelect: string     // specific JD-based reason to skip
  recommendation: 'Strong Yes' | 'Yes' | 'Maybe' | 'No'
}

export interface CandidateResult {
  id: string
  fileName: string
  ruleScore: RuleBasedScore
  aiAssessment: AIAssessment
  finalScore: number
  rank: number
}

export interface ScreeningRequest {
  jobDescription: string
  resumes: ParsedResume[]
  ruleScore: RuleBasedScore
}

export interface ScreeningResponse {
  candidates: CandidateResult[]
  processedAt: string
  totalResumes: number
}