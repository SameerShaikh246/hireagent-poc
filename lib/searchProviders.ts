import type { Provider } from "./webSearchTypes";
import { toneStyle, recommendationTone, sourceTone, type Tone } from "./badgeTones";

export const PROVIDERS: Record<
  Provider,
  {
    label: string;
    free: string;
    signupUrl: string;
    placeholder: string;
    keyHint: string;
    bestFor: string;
    tone: Tone;
    tip: string;
    isStructured: boolean;
    icon: string;
  }
> = {
  pdl: {
    label: "People Data Labs",
    free: "100 records/month (500 on trial)",
    signupUrl: "https://peopledatalabs.com",
    placeholder: "Paste your PDL API key…",
    keyHint: "Sign up → Dashboard → API Keys",
    bestFor: "Best accuracy",
    tone: "warning",
    tip: "Structured database of 1.5B+ verified profiles with real skills, job history, education, and LinkedIn URLs. Not web scraping — actual person records. Best accuracy for both tech and non-tech roles.",
    isStructured: true,
    icon: "database",
  },
  github: {
    label: "GitHub",
    free: "60/hr free, 5,000/hr with a token",
    signupUrl: "https://github.com/settings/tokens",
    placeholder: "ghp_… (optional — leave blank to use free tier)",
    keyHint: "Optional. Settings → Developer settings → Personal access tokens → Generate (no scopes needed)",
    bestFor: "Free • Technical roles",
    tone: "success",
    tip: "Searches real GitHub profiles by location + language + bio keywords, then pulls each profile's bio, company, and repo activity directly from GitHub's API. Completely free, no signup required — add a personal access token only if you hit the 60/hr rate limit.",
    isStructured: false,
    icon: "github",
  },
  tavily: {
    label: "Tavily",
    free: "1,000/month forever",
    signupUrl: "https://tavily.com",
    placeholder: "tvly-…",
    keyHint: "Sign up → Dashboard → API Keys",
    bestFor: "Non-technical roles",
    tone: "accent",
    tip: "Web search. Best for non-technical roles (marketing, HR, sales, finance) — returns good coverage of professional profiles and portfolio pages. Less accurate than PDL since results are web-scraped.",
    isStructured: false,
    icon: "search",
  },
  exa: {
    label: "Exa",
    free: "$20 signup + $10/month",
    signupUrl: "https://exa.ai",
    placeholder: "exa-…",
    keyHint: "Sign up → API Keys → Create key",
    bestFor: "Technical roles",
    tone: "info",
    tip: "Neural web search. Best for technical roles (engineers, developers, data scientists) — semantic search trained on 1B+ profiles surfaces GitHub and LinkedIn for tech candidates well.",
    isStructured: false,
    icon: "brain",
  },
  serper: {
    label: "Serper",
    free: "2,500 one-time",
    signupUrl: "https://serper.dev",
    placeholder: "Paste your Serper API key…",
    keyHint: "Sign up → Dashboard → API Key",
    bestFor: "General fallback",
    tone: "info",
    tip: "Raw Google results. Good fallback for both role types but may surface job postings — filtered automatically. Use PDL for accurate structured results.",
    isStructured: false,
    icon: "globe",
  },
};

export const SOURCE_LABEL: Record<"linkedin" | "github" | "portfolio" | "other", string> = {
  linkedin: "LinkedIn",
  github: "GitHub",
  portfolio: "Portfolio",
  other: "Web",
};

export function sourceStyle(source: "linkedin" | "github" | "portfolio" | "other") {
  return toneStyle(sourceTone(source));
}

export function scoreColor(s: number) {
  return s >= 70 ? "var(--success)" : s >= 50 ? "var(--warning)" : "var(--danger)";
}

const REC_LABEL: Record<string, string> = {
  success: "Strong Match",
  info: "Good Match",
  warning: "Partial",
  danger: "Low Match", 
};

export function recLabel(score: number) {
  const tone: Tone = score >= 75 ? "success" : score >= 55 ? "info" : score >= 35 ? "warning" : "danger";
  return { label: REC_LABEL[tone], ...toneStyle(tone) };
}

export { toneStyle, recommendationTone };