import { NextRequest, NextResponse } from "next/server";

// ─── Shared types ──────────────────────────────────────────────────────────────
export interface WebCandidate {
  id: string;
  name: string;
  title: string;                    // current job title
  company: string;                  // current company
  url: string;                      // linkedin_url or profile link
  source: "linkedin" | "github" | "portfolio" | "other";
  snippet: string;                  // summary / headline
  matchedSkills: string[];
  missingSkills: string[];
  relevanceScore: number;
  location?: string;
  experienceYears?: number;         // PDL-derived
  education?: string;               // highest degree
  provider: "pdl" | "tavily" | "exa" | "serper";
}

export interface CandidateSearchResponse {
  candidates: WebCandidate[];
  totalFound: number;
  searchedAt: string;
  provider: "pdl" | "tavily" | "exa" | "serper";
  creditsUsed?: number;
}

type Provider = "pdl" | "tavily" | "exa" | "serper";
type RawResult = { title: string; url: string; snippet: string };

// ─── Skill matching (shared) ───────────────────────────────────────────────────
const SKILL_ALIASES: Record<string, string[]> = {
  javascript: ["javascript", "js", "ecmascript", "es6", "es2015"],
  typescript: ["typescript", "ts"],
  react: ["react", "reactjs", "react.js"],
  nextjs: ["next", "next.js", "nextjs"],
  nodejs: ["node", "node.js", "nodejs"],
  html: ["html", "html5"],
  css: ["css", "css3", "scss", "sass"],
  aws: ["aws", "amazon web services"],
  redux: ["redux", "redux toolkit"],
  graphql: ["graphql", "gql"],
  postgresql: ["postgresql", "postgres", "psql"],
  angular: ["angular", "angularjs"],
  vue: ["vue", "vuejs", "vue.js"],
  docker: ["docker", "containerization"],
  kubernetes: ["kubernetes", "k8s"],
  mongodb: ["mongodb", "mongo"],
  sql: ["sql", "mysql", "mssql"],
  python: ["python", "python3"],
  java: ["java", "java8", "java11"],
  git: ["git", "github", "gitlab"],
  selenium: ["selenium", "selenium webdriver"],
  cypress: ["cypress"],
  jest: ["jest", "testing library"],
  tensorflow: ["tensorflow", "tf"],
  pytorch: ["pytorch", "torch"],
  "machine learning": ["machine learning", "ml", "deep learning"],
  tableau: ["tableau"],
  "power bi": ["power bi", "powerbi"],
};

function normalize(s: string): string {
  return s.toLowerCase().replace(/[.\-_/]+/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function aliasesFor(skill: string): string[] {
  const norm = normalize(skill);
  for (const [canonical, variants] of Object.entries(SKILL_ALIASES)) {
    if (variants.some((v) => normalize(v) === norm) || normalize(canonical) === norm) {
      return [...new Set(variants.map(normalize).concat(normalize(canonical)))];
    }
  }
  return [norm];
}

function canonicalSkill(skill: string): string {
  const norm = normalize(skill);
  for (const [canonical, variants] of Object.entries(SKILL_ALIASES)) {
    if (variants.some((v) => normalize(v) === norm) || normalize(canonical) === norm) return canonical;
  }
  return norm;
}

function matchSkillsInText(text: string, skills: string[]): string[] {
  const padded = ` ${normalize(text)} `;
  const seen = new Set<string>();
  for (const skill of skills) {
    if (aliasesFor(skill).some((alias) => padded.includes(` ${alias} `))) {
      seen.add(canonicalSkill(skill));
    }
  }
  return [...seen];
}

// ─── Simple relevance scorer (web-search fallback) ────────────────────────────
function scoreWebResult(
  matchedSkills: string[],
  allSkills: string[],
  source: WebCandidate["source"],
  snippetLength: number
): number {
  const skillRatio = allSkills.length > 0 ? matchedSkills.length / allSkills.length : 0;
  const sourceBonus = source === "linkedin" ? 20 : source === "portfolio" ? 12 : source === "github" ? 8 : 4;
  const lengthBonus = snippetLength > 150 ? 5 : 0;
  const jitter = Math.floor(Math.random() * 5);
  return Math.min(99, Math.round(skillRatio * 65 + sourceBonus + lengthBonus + jitter));
}

// ─── PDL: People Data Labs ─────────────────────────────────────────────────────
// Uses the Person Search API with SQL queries — real structured data, not web scraping.
// Free tier: 100 records/month. Signup: peopledatalabs.com

interface PDLPersonRecord {
  id?: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  job_title?: string;
  job_company_name?: string;
  linkedin_url?: string;
  github_url?: string;
  location_name?: string;
  summary?: string;
  headline?: string;
  skills?: string[];
  experience?: {
    company?: { name?: string };
    title?: { name?: string };
    start_date?: string;
    end_date?: string;
    is_primary?: boolean;
  }[];
  education?: {
    degrees?: string[];
    school?: { name?: string };
  }[];
  inferred_years_experience?: number;
}

function buildPDLQuery(
  jobTitle: string,
  mandatorySkills: string[],
  mustHaveSkills: string[],
  niceToHaveSkills: string[],
): string {
  const conditions: string[] = [];
  conditions.push(`location_country = 'india'`);
  // Job title — try broad match
  if (jobTitle.trim()) {
    // strip seniority words for broader match
    const cleanTitle = jobTitle.toLowerCase()
      .replace(/\b(senior|sr|junior|jr|lead|staff|principal|associate|mid|entry)\b/g, "")
      .trim();
    if (cleanTitle) {
      conditions.push(`job_title LIKE '%${cleanTitle.replace(/'/g, "''")}%'`);
    }
  }

  // Mandatory skills — must have ALL of them (AND)
  for (const skill of mandatorySkills.slice(0, 3)) {
    conditions.push(`skills IN ('${skill.toLowerCase().replace(/'/g, "''")}')`);
  }

  // Must-have skills — at least 1 (OR group), capped so query stays selective
  if (mustHaveSkills.length > 0) {
    const mustStr = mustHaveSkills
      .slice(0, 5)
      .map((s) => `'${s.toLowerCase().replace(/'/g, "''")}'`)
      .join(",");
    conditions.push(`skills IN (${mustStr})`);
  }

  const where = conditions.length > 0 ? conditions.join(" AND ") : "job_title IS NOT NULL";
  return `SELECT * FROM person WHERE ${where}`;
}

function calcExperienceYears(experience: PDLPersonRecord["experience"]): number {
  if (!experience || experience.length === 0) return 0;
  const totalMonths = experience.reduce((sum, e) => {
    if (!e.start_date) return sum;
    const start = new Date(e.start_date);
    const end = e.end_date ? new Date(e.end_date) : new Date();
    const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
    return sum + Math.max(0, months);
  }, 0);
  return Math.round(totalMonths / 12);
}

function highestDegree(education: PDLPersonRecord["education"]): string | undefined {
  const rank: Record<string, number> = { phd: 5, doctorate: 5, masters: 4, mba: 4, bachelors: 3, bachelor: 3, associate: 2, diploma: 1 };
  let best = "";
  let bestRank = 0;
  for (const edu of education ?? []) {
    for (const deg of edu.degrees ?? []) {
      const norm = deg.toLowerCase();
      for (const [key, r] of Object.entries(rank)) {
        if (norm.includes(key) && r > bestRank) {
          bestRank = r;
          best = deg;
        }
      }
    }
  }
  return best || undefined;
}

function scorePDLCandidate(
  record: PDLPersonRecord,
  mandatorySkills: string[],
  mustHaveSkills: string[],
  niceToHaveSkills: string[],
  jobTitle: string,
): number {
  const skills = (record.skills ?? []).map((s) => s.toLowerCase());
  const allText = `${record.job_title ?? ""} ${record.summary ?? ""} ${record.headline ?? ""} ${skills.join(" ")}`;

  // Skill match scoring (weighted per tier)
  const matchMandatory = mandatorySkills.filter((s) =>
    skills.includes(s.toLowerCase()) || matchSkillsInText(allText, [s]).length > 0
  );
  const matchMust = mustHaveSkills.filter((s) =>
    skills.includes(s.toLowerCase()) || matchSkillsInText(allText, [s]).length > 0
  );
  const matchNice = niceToHaveSkills.filter((s) =>
    skills.includes(s.toLowerCase()) || matchSkillsInText(allText, [s]).length > 0
  );

  const mandRatio = mandatorySkills.length > 0 ? matchMandatory.length / mandatorySkills.length : 1;
  const mustRatio = mustHaveSkills.length > 0 ? matchMust.length / mustHaveSkills.length : 0.5;
  const niceRatio = niceToHaveSkills.length > 0 ? matchNice.length / niceToHaveSkills.length : 1;

  // Title similarity bonus
  const reqTitle = normalize(jobTitle);
  const candTitle = normalize(record.job_title ?? "");
  const titleWords = reqTitle.split(" ").filter((w) => w.length > 2);
  const titleMatch = titleWords.length > 0
    ? titleWords.filter((w) => candTitle.includes(w)).length / titleWords.length
    : 0.5;

  const score =
    mandRatio * 40 +
    mustRatio * 25 +
    niceRatio * 10 +
    titleMatch * 15 +
    (record.inferred_years_experience ? Math.min(10, record.inferred_years_experience / 2) : 5);

  return Math.min(99, Math.round(score));
}

async function searchPDL(
  jobTitle: string,
  mandatorySkills: string[],
  mustHaveSkills: string[],
  niceToHaveSkills: string[],
  apiKey: string,
): Promise<{ candidates: WebCandidate[]; totalFound: number; creditsUsed: number }> {
  const sql = buildPDLQuery(jobTitle, mandatorySkills, mustHaveSkills, niceToHaveSkills);

  const res = await fetch("https://api.peopledatalabs.com/v5/person/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": apiKey,
    },
    body: JSON.stringify({
      sql,
      size: 5,
      titlecase: true,
      dataset: "resume",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 401 || res.status === 403) {
      throw new Error("Invalid PDL API key. Sign up at https://peopledatalabs.com");
    }
    if (res.status === 402) {
      throw new Error("PDL credits exhausted. Upgrade your plan at https://peopledatalabs.com/pricing");
    }
    throw new Error(`PDL API error ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  const records: PDLPersonRecord[] = data.data ?? [];
  const totalFound: number = data.total ?? records.length;
  const allSkills = [...new Set([...mandatorySkills, ...mustHaveSkills, ...niceToHaveSkills])];

  const candidates: WebCandidate[] = records.map((r, i) => {
    const pdlSkills = (r.skills ?? []).map((s) => s.toLowerCase());
    const allText = `${r.job_title ?? ""} ${r.summary ?? ""} ${r.headline ?? ""} ${pdlSkills.join(" ")}`;
    const matchedSkills = [...new Set([
      ...allSkills.filter((s) => pdlSkills.includes(s.toLowerCase())),
      ...matchSkillsInText(allText, allSkills),
    ])];
    const missingSkills = allSkills.filter((s) => !matchedSkills.map(canonicalSkill).includes(canonicalSkill(s)));
    const expYears = r.inferred_years_experience ?? calcExperienceYears(r.experience);
    const edu = highestDegree(r.education);
    const url = r.linkedin_url
      ? (r.linkedin_url.startsWith("http") ? r.linkedin_url : `https://${r.linkedin_url}`)
      : r.github_url ?? "";

    const snippet = r.summary ?? r.headline ?? [
      r.job_title, r.job_company_name, expYears > 0 ? `${expYears} yrs exp` : "", r.location_name,
    ].filter(Boolean).join(" · ");

    return {
      id: r.id ?? `pdl-${i + 1}`,
      name: r.full_name ?? (`${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() || "Unknown"),
      title: r.job_title ?? "Professional",
      company: r.job_company_name ?? "",
      url,
      source: r.linkedin_url ? "linkedin" : r.github_url ? "github" : "other",
      snippet: snippet.slice(0, 300),
      matchedSkills,
      missingSkills,
      relevanceScore: scorePDLCandidate(r, mandatorySkills, mustHaveSkills, niceToHaveSkills, jobTitle),
      location: r.location_name,
      experienceYears: expYears > 0 ? expYears : undefined,
      education: edu,
      provider: "pdl",
    };
  });

  return {
    candidates: candidates.sort((a, b) => b.relevanceScore - a.relevanceScore),
    totalFound,
    creditsUsed: records.length,
  };
}

// ─── Web search providers (Tavily / Exa / Serper) ─────────────────────────────
function detectSource(url: string): WebCandidate["source"] {
  if (url.includes("linkedin.com/in/")) return "linkedin";
  if (url.includes("github.com/") && url.split("/").filter(Boolean).length <= 4) return "github";
  if (url.includes("behance") || url.includes("dribbble") || url.includes("portfolio") || url.includes("about.me")) return "portfolio";
  return "other";
}

const JOB_SIGNALS = [
  "linkedin.com/jobs", "indeed.com", "glassdoor.com", "naukri.com", "monster.com",
  "dice.com", "ziprecruiter", "/jobs/", "/careers/", "job listing", "apply now",
  "we are hiring", "greenhouse.io", "myworkdayjobs", "breezy.hr", "jobs.lever.co",
  "linkedin.com/company/", "linkedin.com/posts/", "linkedin.com/pulse/",
  "github.com/topics/", "github.com/trending", "stackoverflow.com",
];

function isUsefulWebResult(url: string, title: string, snippet: string): boolean {
  const combined = `${url} ${title} ${snippet}`.toLowerCase();
  return !JOB_SIGNALS.some((s) => combined.includes(s));
}

const NAME_RE = /^([A-Z][a-zÀ-ÿ'-]+(?:\s+[A-Z][a-zÀ-ÿ'-]+){1,3})\s*[-–|·]/;
function extractName(title: string, snippet: string): string {
  const m = title.match(NAME_RE);
  if (m) return m[1];
  const lines = snippet.split("\n");
  if (lines[0] && /^[A-Z][a-z]+ [A-Z][a-z]/.test(lines[0].trim())) return lines[0].trim().slice(0, 50);
  return title.split("|")[0].split("-")[0].trim().slice(0, 50) || "Candidate";
}

function extractLocation(snippet: string): string | undefined {
  const m = snippet.match(/([A-Z][a-z]+(?:,\s*[A-Z][a-z]+)+)/);
  return m?.[1]?.slice(0, 50);
}

function webResultToCandidate(
  r: RawResult, i: number, allSkills: string[], provider: Provider
): WebCandidate {
  const source = detectSource(r.url);
  const combined = `${r.title} ${r.snippet}`;
  const matchedSkills = matchSkillsInText(combined, allSkills);
  const missingSkills = allSkills.filter((s) => !matchedSkills.map(canonicalSkill).includes(canonicalSkill(s)));
  return {
    id: `web-${i + 1}`,
    name: extractName(r.title, r.snippet),
    title: r.title.split("-")[1]?.split("|")[0]?.trim() ?? "Professional",
    company: "",
    url: r.url,
    source,
    snippet: r.snippet.slice(0, 280),
    matchedSkills,
    missingSkills,
    relevanceScore: scoreWebResult(matchedSkills, allSkills, source, r.snippet.length),
    location: extractLocation(r.snippet),
    provider: provider as "tavily" | "exa" | "serper",
  };
}

async function searchTavily(query: string, apiKey: string): Promise<RawResult[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: apiKey, query: `${query} (India OR Bangalore OR Hyderabad OR Pune)`, search_depth: "basic", max_results: 10 }),
  });
  if (!res.ok) throw new Error(res.status === 401 ? "Invalid Tavily API key" : `Tavily error ${res.status}`);
  const data = await res.json();
  return (data.results ?? []).map((r: { title?: string; url?: string; content?: string }) => ({
    title: r.title ?? "", url: r.url ?? "", snippet: r.content ?? "",
  }));
}

async function searchExa(query: string, apiKey: string): Promise<RawResult[]> {
  const res = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify({ query: `${query} India`, numResults: 10, type: "keyword", contents: { text: { maxCharacters: 400 } } }),
  });
  if (!res.ok) throw new Error(res.status === 401 ? "Invalid Exa API key" : `Exa error ${res.status}`);
  const data = await res.json();
  return (data.results ?? []).map((r: { title?: string; url?: string; text?: string }) => ({
    title: r.title ?? "", url: r.url ?? "", snippet: (r.text ?? "").slice(0, 500),
  }));
}

async function searchSerper(query: string, apiKey: string): Promise<RawResult[]> {
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      q: query,
      num: 10,
      gl: "in",      // Google India
      hl: "en",      // English
      location: "India"
    }),
  });
  if (!res.ok) throw new Error(res.status === 401 ? "Invalid Serper API key" : `Serper error ${res.status}`);
  const data = await res.json();
  return (data.organic ?? []).map((r: { title?: string; link?: string; snippet?: string }) => ({
    title: r.title ?? "", url: r.link ?? "", snippet: r.snippet ?? "",
  }));
}

const DEFAULT_LOCATION = "India";

async function runWebSearch(
  provider: "tavily" | "exa" | "serper",
  apiKey: string,
  jobTitle: string,
  mandatorySkills: string[],
  mustHaveSkills: string[],
  niceToHaveSkills: string[],
  location: string = DEFAULT_LOCATION,
): Promise<{ candidates: WebCandidate[]; totalFound: number }> {
  const skills = [...new Set([...mandatorySkills, ...mustHaveSkills])].slice(0, 4).join(" ");
  const allSkills = [...new Set([...mandatorySkills, ...mustHaveSkills, ...niceToHaveSkills])];

  const queries = [
    `site:linkedin.com/in "${jobTitle}" ${skills} "${location}"`,
    `site:linkedin.com/in "${jobTitle}" ${skills} Bengaluru OR Bangalore OR Hyderabad OR Pune OR Chennai OR Mumbai OR Delhi`,
    `"${jobTitle}" resume OR portfolio ${skills} "${location}" -jobs -hiring`,
  ];

  const run = provider === "tavily" ? searchTavily : provider === "exa" ? searchExa : searchSerper;

  const settled = await Promise.allSettled(queries.map((q) => run(q, apiKey)));
  const anySuccess = settled.some((r) => r.status === "fulfilled");
  if (!anySuccess) {
    const err = settled.find((r) => r.status === "rejected") as PromiseRejectedResult;
    throw new Error(err?.reason?.message ?? "Search failed");
  }

  const seen = new Set<string>();
  const merged: RawResult[] = [];
  for (const r of settled) {
    if (r.status === "fulfilled") {
      for (const item of r.value) {
        if (item.url && !seen.has(item.url)) { seen.add(item.url); merged.push(item); }
      }
    }
  }

  const candidates = merged
    .filter((r) => isUsefulWebResult(r.url, r.title, r.snippet))
    .map((r, i) => webResultToCandidate(r, i, allSkills, provider))
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, 15);

  return { candidates, totalFound: merged.length };
}

// ─── Main handler ──────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      provider,
      apiKey,
      jobTitle = "",
      mustHaveSkills = [],
      mandatorySkills = [],
      niceToHaveSkills = [],
    }: {
      provider: Provider;
      apiKey: string;
      jobTitle: string;
      mustHaveSkills: string[];
      mandatorySkills: string[];
      niceToHaveSkills: string[];
    } = body;

    if (!["pdl", "tavily", "exa", "serper"].includes(provider))
      return NextResponse.json({ error: "Invalid provider." }, { status: 400 });
    if (!apiKey || apiKey.trim().length < 5)
      return NextResponse.json({ error: "API key is required." }, { status: 400 });
    if (!jobTitle.trim() && mustHaveSkills.length === 0 && mandatorySkills.length === 0)
      return NextResponse.json({ error: "Add a job title or skills to the JD first." }, { status: 400 });

    let result: { candidates: WebCandidate[]; totalFound: number; creditsUsed?: number };

    if (provider === "pdl") {
      result = await searchPDL(jobTitle, mandatorySkills, mustHaveSkills, niceToHaveSkills, apiKey.trim());
    } else {
      result = await runWebSearch(provider, apiKey.trim(), jobTitle, mandatorySkills, mustHaveSkills, niceToHaveSkills);
    }

    return NextResponse.json({
      candidates: result.candidates,
      totalFound: result.totalFound,
      searchedAt: new Date().toISOString(),
      provider,
      creditsUsed: result.creditsUsed,
    } as CandidateSearchResponse);

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Candidate search error:", message);
    return NextResponse.json({ error: `Search failed: ${message}` }, { status: 500 });
  }
}