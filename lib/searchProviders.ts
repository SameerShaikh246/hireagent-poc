import type { Provider } from "./webSearchTypes";

export const PROVIDERS: Record<
  Provider,
  {
    label: string;
    free: string;
    signupUrl: string;
    placeholder: string;
    keyHint: string;
    bestFor: string;
    badgeBg: string;
    badgeColor: string;
    badgeBorder: string;
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
    badgeBg: "#fef3c7",
    badgeColor: "#92400e",
    badgeBorder: "#fcd34d",
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
    badgeBg: "#dcfce7",
    badgeColor: "#166534",
    badgeBorder: "#86efac",
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
    badgeBg: "#fce7f3",
    badgeColor: "#be185d",
    badgeBorder: "#f9a8d4",
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
    badgeBg: "#ede9fe",
    badgeColor: "#6d28d9",
    badgeBorder: "#c4b5fd",
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
    badgeBg: "#dbeafe",
    badgeColor: "#1d4ed8",
    badgeBorder: "#93c5fd",
    tip: "Raw Google results. Good fallback for both role types but may surface job postings — filtered automatically. Use PDL for accurate structured results.",
    isStructured: false,
    icon: "globe",
  },
};

export const SOURCE_META = {
  linkedin: { label: "LinkedIn", color: "#0077b5", bg: "#e8f4fb", border: "#93c5fd" },
  github: { label: "GitHub", color: "#24292f", bg: "#f3f4f6", border: "#d1d5db" },
  portfolio: { label: "Portfolio", color: "#7c3aed", bg: "#ede9fe", border: "#c4b5fd" },
  other: { label: "Web", color: "#374151", bg: "#f9fafb", border: "#e5e7eb" },
} as const;

export function scoreColor(s: number) {
  return s >= 70 ? "var(--success)" : s >= 50 ? "var(--warning)" : "var(--danger)";
}

export function recLabel(score: number) {
  if (score >= 75) return { label: "Strong Match", bg: "#dcfce7", color: "#15803d", border: "#86efac" };
  if (score >= 55) return { label: "Good Match", bg: "#dbeafe", color: "#1d4ed8", border: "#93c5fd" };
  if (score >= 35) return { label: "Partial", bg: "#fef9c3", color: "#854d0e", border: "#fde047" };
  return { label: "Low Match", bg: "#fee2e2", color: "#991b1b", border: "#fca5a5" };
}