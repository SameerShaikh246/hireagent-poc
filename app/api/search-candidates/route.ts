import { groqGenerate } from "@/lib/groq";
import { NextRequest, NextResponse } from "next/server";
import { normalizePDLCandidate, normalizeGitHubCandidate, normalizeWebCandidate, normalizeProfileUrl } from "@/lib/normalizer/normalizeCandidate";
import { upsertCandidate } from "@/lib/dedup/upsertCandidate";
import {
  buildSearchContextHash,
  filterByFreshness,
  recordSearchHistory,
  findRecentlySeenIdentityValues,
  countSeenPdlCandidates,
  FRESHNESS_WINDOW_MS,
} from "@/lib/searchHistory/freshness";
import { gatherUntil, type PageProcessed } from "@/lib/search/gatherUntil";
import { db } from "@/lib/db";
import { convertUsdToInr } from "@/lib/utils/currency";
import { applyCandidateFilters, type CandidateFilters } from "@/lib/filters/applyCandidateFilters";
import { withKeyFailover, getProviderKeys, getCentralGroqKeys, ProviderKeyError } from "@/lib/providerKeys";
import { parseExperienceYears, parseEducation } from "@/lib/normalizer/parseProfileText";
import { cleanLocations, expandLocation, expandLocations } from "@/lib/search/locations";
import { isPlausiblePersonName, nameFromLinkedInUrl, UNKNOWN_NAME } from "@/lib/normalizer/validateName";

// A search may fetch several pages (each a provider call + a Groq call + DB
// writes), which can outlast the default serverless timeout on some hosts.
export const maxDuration = 60;

// ─── Shared types ──────────────────────────────────────────────────────────────
export interface WebCandidate {
  id: string;
  name: string;
  title: string;                    // current job title
  company: string;                  // current company
  url: string;                      // linkedin_url or profile link
  source: "linkedin" | "github" | "portfolio" | "other";
  snippet: string;                  // Human-readable recruiter summary
  rawSnippet?: string;              // Original search-engine text
  rawTitle?: string;                // Unmodified search-result title (pre-parse) — kept for Groq enrichment
  matchedSkills: string[];
  missingSkills: string[];
  relevanceScore: number;
  location?: string;
  experienceYears?: number;         // PDL-derived
  education?: string;               // highest degree
  provider: "pdl" | "tavily" | "exa" | "serper" | "github" | "db";

  // Added for DB persistence / dedup:
  rawProvider?: unknown;       // raw PDL record / GitHub profile — feeds the normalizer
  confirmedSkills?: string[];  // GitHub only: matchedSkills confirmed via a language: query
  candidateId?: string;        // set after upsertCandidate() — the DB row this maps to
  // True when the AI clean-up call failed (e.g. every Groq key was at its
  // limit), so name/title/summary are the raw search-engine text. Such a
  // profile is shown, but NOT recorded as "seen" and saved at low trust, so a
  // later search retries it instead of leaving raw text behind for 30 days.
  enrichmentFailed?: boolean;

  // Candidate information enhancements. Populated from the
  // persisted Candidate row (post-merge), not just this one provider hit —
  // see the enrichment block in POST().
  certifications?: {
    name: string;
    issuer?: string;
    source: "PDL" | "WEB_EXTRACTED";
    confidence?: number;
  }[];
  estimatedSalary?: {
    min?: number;
    max?: number;
    currency?: string;
    minINR?: number;   // only set when currency is USD
    maxINR?: number;
    source?: string;   // e.g. "PDL inferred_salary" — surface this in the UI so recruiters know it's an estimate
  } | null;
  openToWork?: {
    status: "YES" | "NO" | "UNKNOWN";
    evidence?: string;
    source?: string;   // e.g. "github_hireable_field", "bio_phrase_match:tavily"
  };
}

export interface CandidateSearchResponse {
  candidates: WebCandidate[];
  totalFound: number;
  searchedAt: string;
  provider: "pdl" | "tavily" | "exa" | "serper" | "github" | "db";
  creditsUsed?: number;
  warning?: string;

  extractedJD?: {
    jobTitle: string;
    mandatorySkills: string[];
    mustHaveSkills: string[];
    niceToHaveSkills: string[];
  };
  suppressedByFreshness?: number; // count of candidates hidden by the 30-day freshness rule
  filteredOutByFilters?: number;  // count of candidates removed by recruiter-selected filters (Phase 8)
}


type Provider = "pdl" | "tavily" | "exa" | "serper" | "github" | "db";
type RawResult = { title: string; url: string; snippet: string };
type JDMode = "structured" | "freetext";

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

// ─── Hard allow-list sanitizer ─────────────────────────────────────────────────
// CRITICAL: this is the single source of truth that prevents any skill outside
// the JD's actual skill list from ever appearing in matchedSkills, regardless
// of what an LLM (Groq) or any heuristic returns. Every code path that sets
// matchedSkills — GitHub matching, web-search matching, Groq enrichment — must
// run its output through this before it's used or merged.
function sanitizeToAllowedSkills(skills: string[], allSkills: string[]): string[] {
  const allowedCanonical = new Set(allSkills.map(canonicalSkill));
  return [...new Set(
    skills
      .map((s) => canonicalSkill(s))
      .filter((s) => allowedCanonical.has(s))
  )];
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
  return Math.min(99, Math.round(skillRatio * 65 + sourceBonus + lengthBonus));
}

function scoreWebCandidate(
  c: WebCandidate, jobTitle: string,
  mandatory: string[], must: string[], nice: string[],
): number {
  const have = new Set(c.matchedSkills.map(canonicalSkill));
  const ratio = (list: string[], empty: number) =>
    list.length ? list.filter((s) => have.has(canonicalSkill(s))).length / list.length : empty;

  const headline = normalize(`${c.rawTitle ?? ""} ${c.title}`);
  const padded = ` ${headline} `;
  const all = getAllJDSkills(mandatory, must, nice);
  // skills named in the headline = the person's core stack, not a passing mention
  const prominence = all.length
    ? all.filter((s) => aliasesFor(s).some((a) => padded.includes(` ${a} `))).length / all.length
    : 0;

  const titleWords = normalize(jobTitle).split(" ").filter((w) => w.length > 2);
  const titleMatch = titleWords.length
    ? titleWords.filter((w) => headline.includes(w)).length / titleWords.length
    : 0.5;

  const exp = c.experienceYears ? Math.min(5, c.experienceYears) : 2;
  const sourceBonus = c.source === "linkedin" ? 5 : c.source === "portfolio" ? 3 : 1;

  return Math.min(99, Math.round(
    ratio(mandatory, 1) * 35 + ratio(must, 1) * 20 + ratio(nice, 0.5) * 5 +
    prominence * 15 + titleMatch * 15 + exp + sourceBonus,
  ));
}

// ─── Free-text JD extraction (Groq) ───────────────────────────────────────
interface ExtractedJDFields {
  jobTitle: string;
  mandatorySkills: string[];
  mustHaveSkills: string[];
  niceToHaveSkills: string[];
}

async function extractJDFieldsForSearch(
  jdText: string,
): Promise<ExtractedJDFields> {
  const prompt = `You are a recruiting assistant.

Extract structured hiring criteria from the job description below.

Return ONLY valid JSON matching exactly this shape:
{
  "jobTitle": "string",
  "mandatorySkills": ["string"],
  "mustHaveSkills": ["string"],
  "niceToHaveSkills": ["string"]
}

Rules:

- "mandatorySkills": absolute non-negotiable requirements explicitly called out as "must have", "required", "mandatory", or "non-negotiable".
- "mustHaveSkills": important skills clearly expected for the role but not explicitly flagged as non-negotiable.
- "niceToHaveSkills": bonus, preferred, or "good to have" skills.
- Never duplicate a skill across the three lists.
- Use short, common skill names such as "React", "AWS", "SQL".
- Maximum 8 items per list.
- "jobTitle" should be the single best-fit role title, such as "Senior Backend Engineer".
- Only extract skills that are explicitly mentioned in the job description.
- Do not infer related, implied, commonly paired, or industry-standard skills.
- For example, if the JD says "React", do not add JavaScript, HTML, CSS, Redux, or TypeScript unless they are explicitly mentioned.
- If the JD mentions a technology only as background/context and does not require or prefer it, do not include it as a hiring skill.
- Do not convert responsibilities into skills unless the responsibility explicitly names a skill or technology.
- Ignore technologies mentioned only as company infrastructure, existing systems,
  examples, unrelated teams, or general company background unless the JD explicitly
  requires candidates to have those skills.
- Ignore technologies mentioned only in phrases such as "we use", "our stack includes",
  "you may work alongside", or "our engineering team uses", unless the candidate is
  explicitly expected to know them.



Job description:

"""${jdText.slice(0, 6000)}"""`;

  const raw = await groqGenerate(prompt, {
    ...getCentralGroqKeys(),
    model: "openai/gpt-oss-20b",
    temperature: 0.1,
    maxTokens: 800,
    reasoningFormat: "hidden",
    responseFormat: {
      type: "json_object",
    },
  });

  let parsed: Partial<ExtractedJDFields>;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      "Couldn't parse the JD extraction response — try structured JD mode instead.",
    );
  }

  return {
    jobTitle:
      typeof parsed.jobTitle === "string"
        ? parsed.jobTitle.trim()
        : "",

    mandatorySkills: Array.isArray(parsed.mandatorySkills)
      ? parsed.mandatorySkills.slice(0, 8).map(String)
      : [],

    mustHaveSkills: Array.isArray(parsed.mustHaveSkills)
      ? parsed.mustHaveSkills.slice(0, 8).map(String)
      : [],

    niceToHaveSkills: Array.isArray(parsed.niceToHaveSkills)
      ? parsed.niceToHaveSkills.slice(0, 8).map(String)
      : [],
  };
}

interface EnrichedCandidate {
  name: string;
  title: string;
  company: string;
  location?: string;
  summary: string;
  experienceYears?: number;
  matchedSkills: string[];
  confidence: number;
  // Candidate quality gate
  isValidCandidate: boolean;
  nameConfidence: number;
  rejectionReason?: string;
}

function extractProfileSource(candidate: WebCandidate): string {
  const raw = candidate.rawSnippet || candidate.snippet || "";

  const aboutMatch = raw.match(/##\s*About\s*\n+([\s\S]*?)(?=\n##\s|\n#\s|$)/i);
  const about = aboutMatch?.[1]?.trim();

  const headerMatch = raw.match(/^#\s*(.+)\n([\s\S]*?)\n/);
  const headerLines = headerMatch ? `${headerMatch[1]}\n${headerMatch[2]}`.trim() : "";

  if (about && about.length > 15 && !/^n\/a$/i.test(about)) {
    return `${headerLines}\n${about}`.trim().slice(0, 600);
  }

  const stripped = raw
    .split(/##\s*(Activity|People Also Viewed|Publications|Honors & Awards|Certifications|Volunteering|Languages|Organizations)/i)[0]
    .trim();

  return (stripped || raw).slice(0, 600);
}

async function enrichBatchWithGroq(
  candidates: WebCandidate[],
  allSkills: string[],
): Promise<WebCandidate[]> {
  if (!candidates.length || !getProviderKeys("groq").length) {
    return candidates; // enrichment is optional — degrade gracefully with no Groq key configured
  }

  const input = candidates.map((candidate, index) => ({
    index,
    nameFromSearch: candidate.name,
    titleFromSearch: candidate.rawTitle || candidate.title,
    companyFromSearch: candidate.company,
    locationFromSearch: candidate.location,
    profileText: extractProfileSource(candidate),
    url: candidate.url,
    matchedSkills: candidate.matchedSkills,
  }));

  const prompt = `You are an expert technical recruiter and profile information normalizer.

You are given search-engine results for potential candidates.

Your job is to transform each search result into a clean, professional candidate profile — OR flag it as not a real candidate.

IMPORTANT RULES:

1. Do NOT invent information.
2. Only use information explicitly present in the supplied title, profileText, URL, or existing extracted fields.
3. If the person's real name cannot be determined with reasonable confidence, return "Unknown Candidate" and set nameConfidence low.
4. Never use a job title as a person's name.
5. Never use a company name as a person's name.
6. Do not treat words like "developer", "engineer", "manager", "software", "profile", etc. as names.
7. Prefer a person's name explicitly appearing in the search result.
8. LinkedIn URLs may contain a person's name, but only use the URL slug as a name when it is clearly a human name.
9. Clean up job titles. For example:
   "React JS Developer | Software Engineer at ABC"
   should become something like:
   "React.js Developer"
   A company name alone (e.g. "Wipro", "TCS") is NEVER a valid job title — if that's all you have, infer the likely title from profileText instead, or leave it generic (e.g. "Professional") only if profileText supports it. NEVER output placeholder text like "Cleaned title not available" — if you truly cannot determine a title, just output "Professional".
10. Extract the current company only when supported by the source.
11. Write a concise, professional recruiter-style summary — 1-2 sentences, third person, factual. Never copy or lightly reword social-media "activity feed" language (e.g. "liked this", "exploring life", "excited to share"). If the only available text is feed noise with no real bio, keep the summary short and generic based on title/company/skills only, and lower confidence accordingly.
12. The summary should explain:
    - what the candidate does
    - their relevant technical experience
    - important matching technologies
    - role relevance
13. Do not claim years of experience unless supported by the source.
14. Do not invent employers, projects, degrees, skills, seniority, or locations.
15. matchedSkills MUST be a subset of this EXACT list — do not include ANY skill, technology,
    or term that is not verbatim (or a clear synonym) of an item in this list, even if something
    else appears in the candidate's bio/profile. If none of these skills are supported by the
    candidate's information, return an empty array. Do not substitute similar-sounding or
    generically "related" skills — e.g. if the allowed list is marketing skills, do NOT return
    programming languages or frameworks, and vice versa:
    ${JSON.stringify(allSkills)}
16. confidence must represent how confident you are in identifying/normalizing the profile from the source.
17. QUALITY GATE — set "isValidCandidate": false (and give a short "rejectionReason") when the result is NOT an actual individual candidate profile, for example:
    - It's a job listing / job board page ("Jobs Openings", "Active Jobs", "Hiring", "Apply Now" pages)
    - It's a company page, hashtag feed, or aggregator page with no identifiable individual
    - The "candidate" is actually a recruiter's hiring post with no personal profile info
    - No real name can be identified at all
    Otherwise set "isValidCandidate": true.
18. "nameConfidence" (0-1) reflects specifically how sure you are the "name" field is a real person's name (separate from overall "confidence").
19. Return ONLY valid JSON.
20. Preserve the candidate index exactly.
21. Evaluate EACH candidate independently based ONLY on their own profileText/title/company —
    never reuse the same matchedSkills, title, or summary across multiple candidates unless
    their source material genuinely supports identical output.

The skills being searched for are:

${JSON.stringify(allSkills)}

Return exactly this structure:

{
  "candidates": [
    {
      "index": 0,
      "name": "string",
      "title": "string",
      "company": "string",
      "location": "string",
      "summary": "string",
      "experienceYears": null,
      "matchedSkills": [],
      "confidence": 0,
      "isValidCandidate": true,
      "nameConfidence": 0,
      "rejectionReason": ""
    }
  ]
}

Candidate search results:

${JSON.stringify(input, null, 2)}
`;

  try {
    const raw = await groqGenerate(prompt, {
      ...getCentralGroqKeys(),
      model: "openai/gpt-oss-120b",
      temperature: 0.1,
      maxTokens: 3000, // a batch is ENRICH_BATCH_SIZE candidates now, not a whole page
      reasoningFormat: "hidden",
      responseFormat: {
        type: "json_object",
      },
    });

    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed?.candidates)) {
      throw new Error("Groq returned an unexpected response shape (no candidates array)");
    }

    const enrichmentMap = new Map<number, EnrichedCandidate>();

    for (const item of parsed.candidates) {
      if (
        typeof item?.index !== "number" ||
        !candidates[item.index]
      ) {
        continue;
      }

      const rawTitle =
        typeof item.title === "string" && item.title.trim()
          ? item.title.trim()
          : candidates[item.index].title;

      enrichmentMap.set(item.index, {
        name:
          typeof item.name === "string" && item.name.trim()
            ? item.name.trim()
            : "Unknown Candidate",

        title:
          /cleaned title not available/i.test(rawTitle) || !rawTitle.trim()
            ? "Professional"
            : rawTitle,

        company:
          typeof item.company === "string"
            ? item.company.trim()
            : candidates[item.index].company,

        location:
          typeof item.location === "string" && item.location.trim()
            ? item.location.trim()
            : candidates[item.index].location,

        summary:
          typeof item.summary === "string" && item.summary.trim()
            ? item.summary.trim()
            : candidates[item.index].snippet,

        experienceYears:
          typeof item.experienceYears === "number" &&
            item.experienceYears >= 0
            ? Math.round(item.experienceYears)
            : candidates[item.index].experienceYears,

        matchedSkills: sanitizeToAllowedSkills(
          Array.isArray(item.matchedSkills) ? item.matchedSkills.map(String) : [],
          allSkills,
        ),

        confidence:
          typeof item.confidence === "number"
            ? Math.max(0, Math.min(1, item.confidence))
            : 0,

        isValidCandidate:
          typeof item.isValidCandidate === "boolean"
            ? item.isValidCandidate
            : true,

        nameConfidence:
          typeof item.nameConfidence === "number"
            ? Math.max(0, Math.min(1, item.nameConfidence))
            : 0,

        rejectionReason:
          typeof item.rejectionReason === "string"
            ? item.rejectionReason.trim()
            : undefined,
      });
    }

    const merged = candidates
      .map((candidate, index) => {
        const enriched = enrichmentMap.get(index);

        if (!enriched) {
          return candidate;
        }

        if (!enriched.isValidCandidate) {
          return null;
        }

        const matchedSkills = sanitizeToAllowedSkills(
          [...candidate.matchedSkills, ...enriched.matchedSkills],
          allSkills,
        );

        const missingSkills = allSkills.filter(
          (skill) => !matchedSkills.includes(canonicalSkill(skill)),
        );

        return {
          ...candidate,

          name:
            enriched.nameConfidence >= 0.65 && isPlausiblePersonName(enriched.name)
              ? enriched.name
              : candidate.name,

          title: enriched.title,
          company: enriched.company,

          snippet: enriched.summary.slice(0, 350),

          location: enriched.location,

          experienceYears: candidate.experienceYears ?? enriched.experienceYears,

          matchedSkills,

          missingSkills,
        };
      })
      .filter((c): c is WebCandidate => c !== null);

    return merged;
  } catch (error) {
    // Re-throw: the caller (enrichWebCandidatesWithGroq) decides what a failed
    // batch means. Swallowing it here is what used to leave a whole page of raw
    // profiles with no explanation.
    throw error;
  }
}

// How many candidates go into ONE Groq request. A whole page (15) in a single
// request is large (~9k tokens incl. the completion budget): a key on a smaller
// plan rejects it outright (HTTP 413), and one bad response blanks every
// profile on the page. Small batches fit lower per-minute limits, fail
// independently, and each batch benefits from key failover on its own.
const ENRICH_BATCH_SIZE = 5;

interface EnrichmentResult {
  candidates: WebCandidate[];
  /** How many candidates could NOT be cleaned up and are still raw. */
  failed: number;
  /** Why (first failure), for the warning shown to the recruiter. */
  error?: string;
}

async function enrichWebCandidatesWithGroq(
  candidates: WebCandidate[],
  allSkills: string[],
): Promise<EnrichmentResult> {
  if (!candidates.length || !getProviderKeys("groq").length) {
    return { candidates, failed: 0 }; // enrichment is optional — degrade gracefully with no Groq key configured
  }

  const out: WebCandidate[] = [];
  let failed = 0;
  let firstError: string | undefined;
  let giveUp = false;

  for (let i = 0; i < candidates.length; i += ENRICH_BATCH_SIZE) {
    const batch = candidates.slice(i, i + ENRICH_BATCH_SIZE);

    if (giveUp) {
      failed += batch.length;
      out.push(...batch.map((c) => ({ ...c, enrichmentFailed: true })));
      continue;
    }

    try {
      out.push(...(await enrichBatchWithGroq(batch, allSkills)));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("Groq candidate enrichment failed for a batch:", message);
      firstError ??= message;
      failed += batch.length;
      out.push(...batch.map((c) => ({ ...c, enrichmentFailed: true })));

      // Every key is rate-limited / out of quota: the remaining batches would
      // fail identically, so don't hammer Groq — mark them and move on.
      const status = (error as { status?: number })?.status;
      if (status === 429 || status === 401 || status === 402 || status === 403) giveUp = true;
    }
  }

  return { candidates: out, failed, error: firstError };
}

// One-line, human wording for the banner shown on the results page.
function enrichmentWarning(result: EnrichmentResult): string | undefined {
  if (result.failed === 0) return undefined;
  const limited = /429|rate limit|daily limit|413|too large|All \d+ Groq key/i.test(result.error ?? "");
  return (
    `AI profile clean-up was unavailable for ${result.failed} candidate${result.failed === 1 ? "" : "s"}` +
    `${limited ? " (Groq limit reached on every configured key)" : ""} — their names/titles may show raw profile text. ` +
    `They'll be retried on the next search.`
  );
}


// ─── PDL: People Data Labs ─────────────────────────────────────────────────────
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
  locations: string[] = [],
): string {
  const conditions: string[] = [];
  conditions.push(`location_country = 'india'`);

  const locTerms = expandLocations(locations);
  if (locTerms.length > 0) {
    conditions.push(
      `(${locTerms.map((l) => `location_name LIKE '%${l.replace(/'/g, "''")}%'`).join(" OR ")})`,
    );
  }
  if (locTerms.length > 0) {
    conditions.push(
      `(${locTerms.map((l) => `location_name LIKE '%${l.replace(/'/g, "''")}%'`).join(" OR ")})`,
    );
  }
  if (jobTitle.trim()) {
    const cleanTitle = jobTitle.toLowerCase()
      .replace(/\b(senior|sr|junior|jr|lead|staff|principal|associate|mid|entry)\b/g, "")
      .trim();
    if (cleanTitle) {
      conditions.push(`job_title LIKE '%${cleanTitle.replace(/'/g, "''")}%'`);
    }
  }

  for (const skill of mandatorySkills.slice(0, 3)) {
    conditions.push(`skills IN ('${skill.toLowerCase().replace(/'/g, "''")}')`);
  }

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

function getAllJDSkills(
  mandatorySkills: string[],
  mustHaveSkills: string[],
  niceToHaveSkills: string[],
): string[] {
  return [
    ...new Set([
      ...mandatorySkills,
      ...mustHaveSkills,
      ...niceToHaveSkills,
    ].map(canonicalSkill)),
  ];
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
  // startOffset = how many PDL records were already shown for this search, so
  // this call resumes after them instead of re-buying the same top records.
  ctx: { page: number; startOffset: number, locations?: string[] } = { page: 0, startOffset: 0 },
): Promise<PageFetchResult> {
  const sql = buildPDLQuery(jobTitle, mandatorySkills, mustHaveSkills, niceToHaveSkills, ctx.locations ?? []);

  // PDL's `from` offset (documented as legacy but supported) must satisfy
  // from + size < 10,000. Past that there is nothing more we can page to.
  const from = ctx.startOffset + ctx.page * PDL_PAGE_SIZE;
  if (from + PDL_PAGE_SIZE >= 10_000) {
    return { candidates: [], totalFound: 0, creditsUsed: 0, exhausted: true };
  }

  // PDL bills per record returned, so its pool stays at 5 per call (unlike
  // the 15 used for the web/GitHub providers). 401/402/403 here mean a bad
  // or exhausted key — withKeyFailover moves on to the next PDL key, if any.
  const data = await withKeyFailover("pdl", async (apiKey) => {
    const res = await fetch("https://api.peopledatalabs.com/v5/person/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
      },
      body: JSON.stringify({
        sql,
        size: PDL_PAGE_SIZE,
        ...(from > 0 ? { from } : {}),
        titlecase: true,
        dataset: "resume",
      }),
    });

    // PDL answers "no records match" (or "offset is past the end") with HTTP
    // 404, not an empty 200. That is a normal empty page, not a failure —
    // treating it as an error made a legitimately empty search look broken.
    if (res.status === 404) {
      return { data: [], total: 0 };
    }

    if (!res.ok) {
      const text = await res.text();
      if (res.status === 401 || res.status === 403) {
        throw new ProviderKeyError("Invalid PDL API key.", res.status);
      }
      if (res.status === 402) {
        throw new ProviderKeyError("PDL credits exhausted on this key.", res.status);
      }
      throw new ProviderKeyError(`PDL API error ${res.status}: ${text.slice(0, 300)}`, res.status);
    }

    return res.json();
  });
  const records: PDLPersonRecord[] = data.data ?? [];
  const totalFound: number = data.total ?? records.length;
  const allSkills = getAllJDSkills(mandatorySkills, mustHaveSkills, niceToHaveSkills);

  const candidates: WebCandidate[] = records.map((r, i) => {
    const pdlSkills = (r.skills ?? []).map((s) => s.toLowerCase());
    const allText = `${r.job_title ?? ""} ${r.summary ?? ""} ${r.headline ?? ""} ${pdlSkills.join(" ")}`;
    const matchedSkills = sanitizeToAllowedSkills([
      ...allSkills.filter((s) => pdlSkills.includes(s.toLowerCase())),
      ...matchSkillsInText(allText, allSkills),
    ], allSkills);
    const missingSkills = allSkills.filter((s) => !matchedSkills.includes(canonicalSkill(s)));
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
      rawProvider: r,
      provider: "pdl",
    };
  });

  return {
    candidates: candidates.sort((a, b) => b.relevanceScore - a.relevanceScore),
    totalFound,
    creditsUsed: records.length,
    exhausted: records.length < PDL_PAGE_SIZE, // a short page means we reached the end
  };
}

// ─── Web search providers (Tavily / Exa / Serper) ─────────────────────────────
function detectSource(url: string): WebCandidate["source"] {
  const normalizedUrl = url.toLowerCase();

  if (normalizedUrl.includes("linkedin.com/in/")) return "linkedin";
  if (
    normalizedUrl.includes("github.com/") &&
    normalizedUrl.split("/").filter(Boolean).length <= 4
  ) {
    return "github";
  }

  if (
    normalizedUrl.includes("behance") ||
    normalizedUrl.includes("dribbble") ||
    normalizedUrl.includes("portfolio") ||
    normalizedUrl.includes("about.me")
  ) {
    return "portfolio";
  }

  return "other";
}


const JOB_SIGNALS = [
  "linkedin.com/jobs", "indeed.com", "glassdoor.com", "naukri.com", "monster.com",
  "dice.com", "ziprecruiter", "/jobs/", "/careers/", "job listing", "apply now",
  "we are hiring", "greenhouse.io", "myworkdayjobs", "breezy.hr", "jobs.lever.co",
  "linkedin.com/company/", "linkedin.com/posts/", "linkedin.com/pulse/",
  "github.com/topics/", "github.com/trending", "stackoverflow.com",
  "shine.com", "timesjobs.com", "freshersworld.com", "instahyre.com",
  "foundit.in", "iimjobs.com", "cutshort.io", "hirist.com",
  "jobs openings", "active jobs", "job openings", "job search",
];

function isUsefulWebResult(url: string, title: string, snippet: string): boolean {
  const combined = `${url} ${title} ${snippet}`.toLowerCase();
  return !JOB_SIGNALS.some((s) => combined.includes(s));
}

const NAME_RE = /^([A-Z][a-zÀ-ÿ'-]+(?:\s+[A-Z][a-zÀ-ÿ'-]+){1,3})\s*[-–|·]/;
const PERSON_SEGMENT_RE = /^[A-Z][a-zÀ-ÿ'.-]+(?:\s+[A-Z][a-zÀ-ÿ'.-]+){1,3}$/;

function extractName(title: string, snippet: string, url = ""): string {
  // "Rahul Sharma Resume - Pune" -> "Rahul Sharma  - Pune"
  const cleanTitle = title.replace(/\b(resume|curriculum vitae|cv|profile|portfolio)\b/gi, " ").replace(/\s+/g, " ").trim();

  const m = cleanTitle.match(NAME_RE);
  if (m && isPlausiblePersonName(m[1])) return m[1];

  // Try each segment of the title: "Resume | Rahul Sharma | Pune"
  for (const part of cleanTitle.split(/\s*[|\-–—·•,]\s*/)) {
    const p = part.replace(/\(.*?\)/g, "").trim();
    if (PERSON_SEGMENT_RE.test(p) && isPlausiblePersonName(p)) return p;
  }

  const firstLine = snippet.split("\n")[0]?.trim() ?? "";
  if (/^[A-Z][a-z]+ [A-Z][a-z]/.test(firstLine) && isPlausiblePersonName(firstLine.slice(0, 50))) {
    return firstLine.slice(0, 50);
  }

  return nameFromLinkedInUrl(url) ?? UNKNOWN_NAME;
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
  const matchedSkills = sanitizeToAllowedSkills(matchSkillsInText(combined, allSkills), allSkills);
  const missingSkills = allSkills.filter((s) => !matchedSkills.includes(canonicalSkill(s)));
  return {
    id: `web-${normalizeProfileUrl(r.url) || i + 1}`, // stable per profile; index-based ids collided across pages
    name: extractName(r.title, r.snippet, r.url),
    title: r.title.split("-")[1]?.split("|")[0]?.trim() ?? "Professional",
    company: "",
    url: r.url,
    source,
    snippet: r.snippet.slice(0, 380),
    rawSnippet: r.snippet.slice(0, 1000),
    rawTitle: r.title,
    matchedSkills,
    missingSkills,
    relevanceScore: scoreWebResult(matchedSkills, allSkills, source, r.snippet.length),
    location: extractLocation(r.snippet),
    experienceYears: parseExperienceYears(r.snippet),
    education: parseEducation(r.snippet),
    provider: provider as "tavily" | "exa" | "serper",
  };
}

async function searchTavily(query: string, apiKey: string, geoBias = true): Promise<RawResult[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: apiKey, query: geoBias ? `${query} (India OR Bangalore OR Hyderabad OR Pune)` : query, search_depth: "advanced", max_results: WEB_SEARCH_POOL_SIZE, include_raw_content: true }),
  });
  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    throw new ProviderKeyError(
      `Tavily error ${res.status}${bodyText ? ` — ${bodyText.slice(0, 200)}` : ""}`,
      res.status,
    );
  }
  const data = await res.json();
  return (data.results ?? []).map((r: { title?: string; url?: string; content?: string }) => ({
    title: r.title ?? "", url: r.url ?? "", snippet: r.content ?? "",
  }));
}

async function searchExa(query: string, apiKey: string, geoBias = true): Promise<RawResult[]> {
  const res = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify({ query: geoBias ? `${query} India` : query, numResults: WEB_SEARCH_POOL_SIZE, type: "keyword", contents: { text: { maxCharacters: 400 } } }),
  });
  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    throw new ProviderKeyError(
      `Exa error ${res.status}${bodyText ? ` — ${bodyText.slice(0, 200)}` : ""}`,
      res.status,
    );
  }
  const data = await res.json();
  return (data.results ?? []).map((r: { title?: string; url?: string; text?: string }) => ({
    title: r.title ?? "", url: r.url ?? "", snippet: (r.text ?? "").slice(0, 500),
  }));
}

// Serper's free plan rejects some patterns (grouped OR with parentheses).
// Google's OR already binds tighter than the implicit AND, so parentheses add nothing.
function simplifyForSerper(q: string): string {
  return q.replace(/[()]/g, " ").replace(/\s+/g, " ").trim();
}

async function searchSerper(query: string, apiKey: string, _geoBias = true): Promise<RawResult[]> {
  const call = (q: string) =>
    fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ q, num: WEB_SEARCH_POOL_SIZE, gl: "in", hl: "en", location: "India" }),
    });

  const simple = simplifyForSerper(query);
  let res = await call(simple);

  // Still rejected: retry once without the exclusion operators and quotes.
  if (res.status === 400) {
    const plain = simple.replace(/\s-\w+/g, "").replace(/"/g, "").trim();
    console.warn(`Serper rejected query, retrying simplified: ${simple} -> ${plain}`);
    res = await call(plain);
  }

  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    console.warn(`Serper failed for query: ${simple}`);
    throw new ProviderKeyError(
      `Serper error ${res.status}${bodyText ? ` — ${bodyText.slice(0, 200)}` : ""}`,
      res.status,
    );
  }
  const data = await res.json();
  return (data.organic ?? []).map((r: { title?: string; link?: string; snippet?: string }) => ({
    title: r.title ?? "", url: r.link ?? "", snippet: r.snippet ?? "",
  }));
}
const DEFAULT_LOCATION = "India";

// How many NEW candidates a search tries to return, per provider. A search
// keeps fetching deeper pages (up to MAX_PAGES) until it has this many
// candidates that are unseen AND pass the recruiter's filters.
//   pdl: 5  — PDL bills per record, so keep it small
//   db : 10 — one "virtualized" page of the saved-candidate DB at a time
const DISPLAY_TARGET: Record<Provider, number> = {
  pdl: 5,
  github: 15,
  tavily: 15,
  exa: 15,
  serper: 15,
  db: 10,
};

// Hard cap on pages per search — bounds cost/latency (every page is a
// provider call, a Groq call and DB writes). Raise with care: PDL pages cost
// real credits, and unauthenticated GitHub only allows 10 searches/minute.
const MAX_PAGES: Record<Provider, number> = {
  pdl: 3,
  github: 3,
  tavily: 4,
  exa: 4,
  serper: 4,
  db: 5,
};

// Per-page pool sizes (candidates requested per provider call).
const WEB_SEARCH_POOL_SIZE = 15;
const GITHUB_POOL_SIZE = 15;
const PDL_PAGE_SIZE = 5;
const DB_RANK_CAP = 5000; // rows ranked per DB search (id/skills only — cheap)

// What a single provider page hands back to the paging loop.
interface PageFetchResult {
  candidates: WebCandidate[];
  totalFound: number;
  creditsUsed?: number;
  warning?: string;
  /** Dropped BEFORE enrichment because already shown in this context — counted as "hidden as recently seen". */
  skippedAsSeen?: number;
  /** Provider has nothing further for this query. */
  exhausted?: boolean;
}

// Web providers have no offset parameter, so page N>0 searches a different
// slice of the market (one city group per page) instead of repeating page 0.
const CITY_GROUPS: string[][] = [
  ["Bengaluru", "Bangalore"],
  ["Hyderabad"],
  ["Pune"],
  ["Chennai"],
  ["Mumbai"],
  ["Delhi", "Noida", "Gurgaon", "Gurugram"],
  ["Kolkata"],
  ["Ahmedabad"],
];
const WEB_QUERY_VARIANTS = 3;

function buildWebQueries(page: number, jobTitle: string, skills: string, locations: string[]): string[] {
  if (locations.length === 0) {
    // unchanged default behaviour (country-wide, then city groups)
    if (page === 0) {
      return [
        `site:linkedin.com/in ${jobTitle} ${skills} "${DEFAULT_LOCATION}"`,
        `site:linkedin.com/in ${jobTitle} ${skills} Bengaluru OR Bangalore OR Hyderabad OR Pune OR Chennai OR Mumbai OR Delhi`,
        `${jobTitle} resume OR portfolio ${skills} "${DEFAULT_LOCATION}" -jobs -hiring`,
      ];
    }
    const cities = CITY_GROUPS[(page - 1) % CITY_GROUPS.length];
    const cityExpr = cities.map((c) => `"${c}"`).join(" OR ");
    return [
      `site:linkedin.com/in ${jobTitle} ${skills} (${cityExpr})`,
      `${jobTitle} ${skills} (${cityExpr}) resume OR portfolio -jobs -hiring`,
    ];
  }

  const loc = locations[page % locations.length];
  const variant = Math.floor(page / locations.length) % WEB_QUERY_VARIANTS;
  const locExpr = `(${expandLocation(loc).map((l) => `"${l}"`).join(" OR ")})`;

  if (variant === 0) {
    return [
      `site:linkedin.com/in ${jobTitle} ${skills} ${locExpr}`,
      `${jobTitle} resume OR portfolio ${skills} ${locExpr} -jobs -hiring`,
    ];
  }
  if (variant === 1) {
    return [
      `site:linkedin.com/in ${skills} ${locExpr} developer OR engineer`,
      `${skills} ${locExpr} profile -jobs -hiring`,
    ];
  }
  return [
    `site:linkedin.com/in ${jobTitle} ${locExpr}`,
    `${skills} ${locExpr} resume OR cv -jobs -hiring`,
  ];
}
// Of these raw web results, drop the ones whose profile was already shown for
// this search context — BEFORE paying for Groq enrichment. Fails open: if the
// lookup errors, everything is kept and the later freshness check still applies.
async function dropSeenWebResults(
  results: RawResult[],
  seenContext: string | undefined,
): Promise<{ kept: RawResult[]; skipped: number }> {
  if (!seenContext || results.length === 0) return { kept: results, skipped: 0 };
  try {
    const typeOf = (url: string) => {
      const src = detectSource(url);
      return src === "linkedin" ? "LINKEDIN_URL" : src === "github" ? "GITHUB_URL" : src === "portfolio" ? "PORTFOLIO_URL" : null;
    };
    const byType = new Map<"LINKEDIN_URL" | "GITHUB_URL" | "PORTFOLIO_URL", string[]>();
    for (const r of results) {
      const t = typeOf(r.url);
      if (!t) continue;
      byType.set(t, [...(byType.get(t) ?? []), normalizeProfileUrl(r.url)]);
    }
    const seen = new Map<string, Set<string>>();
    await Promise.all(
      [...byType.entries()].map(async ([t, values]) => {
        seen.set(t, await findRecentlySeenIdentityValues(t, [...new Set(values)], seenContext));
      }),
    );
    const kept = results.filter((r) => {
      const t = typeOf(r.url);
      return !(t && seen.get(t)?.has(normalizeProfileUrl(r.url)));
    });
    return { kept, skipped: results.length - kept.length };
  } catch (error) {
    console.warn("Seen-profile pre-check failed, continuing without it:", error instanceof Error ? error.message : error);
    return { kept: results, skipped: 0 };
  }
}

async function runWebSearch(
  provider: "tavily" | "exa" | "serper",
  jobTitle: string,
  mandatorySkills: string[],
  mustHaveSkills: string[],
  niceToHaveSkills: string[],
  ctx: { page: number; seenContext?: string; locations?: string[] },
): Promise<PageFetchResult> {
  const locations = ctx.locations ?? [];
  const geoBias = locations.length === 0;
  const skills = [...new Set([...mandatorySkills, ...mustHaveSkills])].slice(0, 4).join(" ");
  const allSkills = getAllJDSkills(mandatorySkills, mustHaveSkills, niceToHaveSkills);

  const queries = buildWebQueries(ctx.page, jobTitle, skills, locations);
  const run = provider === "tavily" ? searchTavily : provider === "exa" ? searchExa : searchSerper;

  const merged = await withKeyFailover(provider, async (apiKey) => {
    const settled = await Promise.allSettled(queries.map((q) => run(q, apiKey, geoBias)));
    if (!settled.some((r) => r.status === "fulfilled")) {
      // Re-throw the first rejection so withKeyFailover can read its status
      // and decide whether to fail over to the next key.
      const err = settled.find((r) => r.status === "rejected") as PromiseRejectedResult;
      throw err?.reason ?? new Error("Search failed");
    }
    const seen = new Set<string>();
    const out: RawResult[] = [];
    for (const r of settled) {
      if (r.status !== "fulfilled") continue;
      for (const item of r.value) {
        if (item.url && !seen.has(item.url)) { seen.add(item.url); out.push(item); }
      }
    }
    return out;
  });

  const useful = merged.filter((r) => isUsefulWebResult(r.url, r.title, r.snippet));
  // Drop people already shown BEFORE enrichment, so a repeat search spends
  // Groq tokens only on candidates it can actually show.
  const { kept, skipped } = await dropSeenWebResults(useful, ctx.seenContext);
  const rescore = (c: WebCandidate) => ({
    ...c,
    relevanceScore: scoreWebCandidate(c, jobTitle, mandatorySkills, mustHaveSkills, niceToHaveSkills),
  });

  let candidates = kept
    .map((r, i) => rescore(webResultToCandidate(r, i, allSkills, provider)))
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, WEB_SEARCH_POOL_SIZE);

  let warning: string | undefined;
  if (getProviderKeys("groq").length > 0) {
    const enriched = await enrichWebCandidatesWithGroq(candidates, allSkills);
    candidates = enriched.candidates.map(rescore);
    warning = enrichmentWarning(enriched);
  }

  return { candidates, totalFound: merged.length, skippedAsSeen: skipped, warning, exhausted: locations.length > 0 && ctx.page + 1 >= locations.length * WEB_QUERY_VARIANTS, };
}

// ─── GitHub: dynamic query planning via Groq ───────────────────────────────
const GITHUB_VALID_LANGUAGES = new Set([
  "javascript", "typescript", "python", "java", "c", "c++", "c#", "go", "rust",
  "ruby", "php", "swift", "kotlin", "dart", "scala", "r", "matlab", "perl",
  "haskell", "elixir", "clojure", "shell", "powershell", "html", "css", "vue",
  "jupyter notebook", "dockerfile", "solidity", "objective-c", "lua", "groovy", "julia",
]);

interface GitHubLanguagePlan {
  language: string;
  skills: string[];
}

interface GitHubQueryPlan {
  languages: GitHubLanguagePlan[];
  keywords: string[];
}

async function planGitHubQuery(
  jobTitle: string,
  mandatorySkills: string[],
  mustHaveSkills: string[],
  niceToHaveSkills: string[],
): Promise<GitHubQueryPlan> {
  const allSkills = getAllJDSkills(mandatorySkills, mustHaveSkills, niceToHaveSkills);

  const prompt = `You are building GitHub user-search queries for a recruiter.

Role: "${jobTitle}"
Skills: ${JSON.stringify(allSkills)}

GitHub user search only supports:
- "language:X" — a repo-language qualifier, X must be a REAL programming language (e.g. "javascript", "python"). Only technical/programming roles should ever get language entries.
- free-text keywords matched loosely against bio/name/company. Each additional word narrows results (AND logic), so keywords must be searched ONE AT A TIME, never combined into a single multi-word query.

Task:
1. "languages": ONLY if the role/skills are programming-related, map each skill that has
   an underlying GitHub repo language to that language — e.g. React/Redux/Next.js/Node/Express/
   Angular/Vue -> "javascript" and/or "typescript"; Django/Flask -> "python"; Spring -> "java".
   Merge skills that map to the same language into ONE entry: {"language": "...", "skills": [...]}.
   Max 3 entries. If the role is NOT programming-related (e.g. marketing, sales, design, HR,
   finance, operations), return an EMPTY languages array — do not force-fit a language.
2. "keywords": up to 4 short (1-2 word) high-signal bio search terms drawn directly from the
   role and skills list — e.g. for a marketing role: "seo", "content marketing", "digital
   marketing". For a technical role, use this for skills with no language equivalent (e.g.
   "aws", "docker", "testing"). Never include generic filler words like "developer",
   "engineer", "experience", "professional". Every keyword must correspond to something
   actually in the role/skills list above — do not invent unrelated terms.

Return ONLY valid JSON, nothing else:
{"languages": [{"language": "string", "skills": ["string"]}], "keywords": ["string"]}`;

  try {
    const raw = await groqGenerate(prompt, {
      ...getCentralGroqKeys(),
      model: "openai/gpt-oss-20b",
      temperature: 0.1,
      maxTokens: 400,
      reasoningFormat: "hidden",
      responseFormat: { type: "json_object" },
    });
    const parsed = JSON.parse(raw);

    const languages: GitHubLanguagePlan[] = Array.isArray(parsed.languages)
      ? parsed.languages
        .map((entry: unknown) => {
          const e = entry as { language?: unknown; skills?: unknown };
          return {
            language: String(e?.language ?? "").toLowerCase().trim(),
            skills: Array.isArray(e?.skills)
              ? sanitizeToAllowedSkills(e.skills.map(String), allSkills)
              : [],
          };
        })
        .filter((e: GitHubLanguagePlan) => GITHUB_VALID_LANGUAGES.has(e.language) && e.skills.length > 0)
        .slice(0, 3)
      : [];

    const keywords = Array.isArray(parsed.keywords)
      ? [...new Set(parsed.keywords.map((k: unknown) => String(k).trim().toLowerCase()).filter(Boolean))].slice(0, 4) as string[]
      : [];

    if (languages.length === 0 && keywords.length === 0) {
      throw new Error("Empty plan");
    }
    return { languages, keywords };
  } catch (error) {
    console.error("GitHub query planning failed, using fallback:", error instanceof Error ? error.message : error);
    const naiveLangMap: Record<string, string> = {
      javascript: "javascript", typescript: "typescript", react: "javascript",
      nextjs: "typescript", nodejs: "javascript", angular: "typescript", vue: "javascript",
      python: "python", java: "java",
    };
    const byLang = new Map<string, string[]>();
    for (const s of allSkills) {
      const lang = naiveLangMap[canonicalSkill(s)];
      if (lang) byLang.set(lang, [...(byLang.get(lang) ?? []), s]);
    }
    const languages = [...byLang.entries()].map(([language, skills]) => ({ language, skills }));
    const keywords = allSkills.filter((s) => !naiveLangMap[canonicalSkill(s)]).slice(0, 4);
    return { languages, keywords };
  }
}

interface GitHubUserSearchItem {
  login: string;
  html_url: string;
}

interface GitHubUserProfile {
  login: string;
  name: string | null;
  company: string | null;
  location: string | null;
  bio: string | null;
  blog: string | null;
  public_repos: number;
  followers: number;
  html_url: string;
  hireable?: boolean | null; // confirmed real field — see lib/normalizer/normalizeCandidate.ts
}

async function fetchGitHubJSON(
  url: string,
  headers: Record<string, string>,
) {
  const res = await fetch(url, { headers });

  const remaining = res.headers.get("x-ratelimit-remaining");
  const limit = res.headers.get("x-ratelimit-limit");
  const reset = res.headers.get("x-ratelimit-reset");

  if (!res.ok) {
    // ProviderKeyError carries the HTTP status so withKeyFailover can tell a
    // rate-limit/bad-key failure (try the next token) from anything else.
    if (res.status === 401) {
      throw new ProviderKeyError("Invalid GitHub token.", 401);
    }

    if (res.status === 403 && remaining === "0") {
      const resetAt = reset
        ? new Date(Number(reset) * 1000)
        : undefined;

      const resetText = resetAt
        ? ` Try again after ${resetAt.toLocaleTimeString()}.`
        : "";

      if (headers.Authorization) {
        throw new ProviderKeyError(`GitHub API rate limit reached.${resetText}`, 429);
      }

      throw new ProviderKeyError(
        `GitHub API rate limit reached for unauthenticated requests. Ask an admin to configure GITHUB_API_KEYS on the server.${resetText}`,
        429,
      );
    }

    if (res.status === 429) {
      throw new ProviderKeyError("GitHub API rate limit exceeded.", 429);
    }

    if (res.status === 403) {
      throw new ProviderKeyError("GitHub API request forbidden — check the token's permissions.", 403);
    }

    const text = await res.text();

    throw new ProviderKeyError(`GitHub API error ${res.status}: ${text.slice(0, 200)}`, res.status);
  }

  const data = await res.json();

  return {
    data,
    rateLimitRemaining: remaining ? Number(remaining) : undefined,
    rateLimitLimit: limit ? Number(limit) : undefined,
    rateLimitReset: reset ? Number(reset) : undefined,
  };

}


// Outer dispatcher: uses the centralized GITHUB_API_KEYS pool with failover
// when tokens are configured, and falls back to GitHub's unauthenticated
// (60/hr) mode when none are — so GitHub search still works out of the box
// on a fresh deployment, unlike PDL/Tavily/Exa/Serper which hard-require keys.
// `plan` is computed ONCE per request by the caller (it costs a Groq call) and
// reused for every page, instead of re-planning on each page.
interface GitHubPageContext {
  page: number;
  seenContext?: string;
  plan: GitHubQueryPlan;
  locations?: string[];
}

async function searchGitHubAPI(
  jobTitle: string,
  mandatorySkills: string[],
  mustHaveSkills: string[],
  niceToHaveSkills: string[],
  ctx: GitHubPageContext,
  location: string = DEFAULT_LOCATION,
): Promise<PageFetchResult> {
  if (getProviderKeys("github").length === 0) {
    return runGitHubSearch(jobTitle, mandatorySkills, mustHaveSkills, niceToHaveSkills, "", ctx, location);
  }
  return withKeyFailover("github", (key) =>
    runGitHubSearch(jobTitle, mandatorySkills, mustHaveSkills, niceToHaveSkills, key, ctx, location),
  );
}

async function runGitHubSearch(
  jobTitle: string,
  mandatorySkills: string[],
  mustHaveSkills: string[],
  niceToHaveSkills: string[],
  apiKey: string, // empty string = unauthenticated
  ctx: GitHubPageContext,
  location: string = DEFAULT_LOCATION,
): Promise<PageFetchResult> {
  const allSkills = getAllJDSkills(mandatorySkills, mustHaveSkills, niceToHaveSkills);

  if (!getProviderKeys("groq").length) {
    throw new Error("GitHub search needs a Groq API key configured on the server (GROQ_API_KEYS) — it's used to translate the JD into an effective query and to clean up results.");
  }

  const plan = ctx.plan;
  const locs = ctx.locations?.length ? ctx.locations : [location];
  const loc = locs[ctx.page % locs.length];
  const ghPage = Math.floor(ctx.page / locs.length) + 1; // GitHub API page number

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (apiKey?.trim()) headers.Authorization = `Bearer ${apiKey.trim()}`;

  type QueryVariant = { q: string; confirmedSkills: string[] };
  const variants: QueryVariant[] = [];

  for (const entry of plan.languages) {
    variants.push({
      q: `type:user location:"${location}" language:${entry.language} repos:>=1`,
      confirmedSkills: entry.skills,
    });
  }
  for (const kw of plan.keywords) {
    variants.push({
      q: `type:user location:"${location}" ${kw} repos:>=1`,
      confirmedSkills: [kw],
    });
  }
  if (variants.length === 0) {
    variants.push({ q: `type:user location:"${location}" ${jobTitle} repos:>=1`, confirmedSkills: [] });
  }

  const settled = await Promise.allSettled(
    variants.map((v) =>
      fetchGitHubJSON(
        `https://api.github.com/search/users?q=${encodeURIComponent(v.q)}&per_page=${GITHUB_POOL_SIZE}&page=${ghPage} &sort=repositories&order=desc`,
        headers,
      ).then((result) => ({
        data: result.data,
        confirmedSkills: v.confirmedSkills,
        rateLimitRemaining: result.rateLimitRemaining,
        rateLimitLimit: result.rateLimitLimit,
        rateLimitReset: result.rateLimitReset,
      })),
    ),
  );

  const anySuccessWithItems = settled.some(
    (r) => r.status === "fulfilled" && (r.value.data.items?.length ?? 0) > 0,
  );

  let fallbackSettled: typeof settled = [];
  if (!anySuccessWithItems && ctx.page === 0) {
    const primary = plan.languages[0];
    const fallbackQ = primary
      ? `type:user location:"${location}" language:${primary.language}`
      : `type:user location:"${location}" ${jobTitle}`;
    fallbackSettled = await Promise.allSettled([
      fetchGitHubJSON(
        `https://api.github.com/search/users?q=${encodeURIComponent(
          fallbackQ
        )}&per_page=${GITHUB_POOL_SIZE}&page=${ctx.page + 1}&sort=followers&order=desc`,
        headers,
      ).then((result) => ({
        data: result.data,
        confirmedSkills: primary?.skills ?? [],
        rateLimitRemaining: result.rateLimitRemaining,
        rateLimitLimit: result.rateLimitLimit,
        rateLimitReset: result.rateLimitReset,
      })),
    ]);
  }
  const allSettled = [...settled, ...fallbackSettled];

  let githubWarning: string | undefined;

  const rateLimitInfo = allSettled
    .filter((r) => r.status === "fulfilled")
    .map((r) => r.value)
    .find((r) => r.rateLimitRemaining !== undefined);

  if (!apiKey?.trim()) {
    const remaining = rateLimitInfo?.rateLimitRemaining;
    const limit = rateLimitInfo?.rateLimitLimit;

    if (remaining !== undefined) {
      githubWarning =
        `GitHub search is using the unauthenticated API. ` +
        `You have ${remaining}${limit !== undefined ? ` of ${limit}` : ""} ` +
        `requests remaining. ` +
        `Configure GITHUB_API_KEYS on the server for higher rate limits.`;
    } else {
      githubWarning =
        "GitHub search is using the unauthenticated API. " +
        "Configure GITHUB_API_KEYS on the server for higher rate limits.";
    }
  }


  let totalFound = 0;
  const loginToConfirmedSkills = new Map<string, Set<string>>();
  const perVariant: GitHubUserSearchItem[][] = [];

  for (const r of allSettled) {
    if (r.status !== "fulfilled") continue;
    totalFound += r.value.data.total_count ?? 0;
    const list: GitHubUserSearchItem[] = r.value.data.items ?? [];
    perVariant.push(list);
    for (const item of list) {
      const set = loginToConfirmedSkills.get(item.login) ?? new Set<string>();
      r.value.confirmedSkills.forEach((s: string) => set.add(canonicalSkill(s)));
      loginToConfirmedSkills.set(item.login, set);
    }
  }

  // Round-robin across the query variants. Concatenating them meant the first
  // variant (15 results) filled the entire pool and every other variant's
  // API call was wasted.
  const items: GitHubUserSearchItem[] = [];
  const seenLogins = new Set<string>();
  const longest = Math.max(0, ...perVariant.map((l) => l.length));
  for (let i = 0; i < longest; i++) {
    for (const list of perVariant) {
      const item = list[i];
      if (item && !seenLogins.has(item.login)) { seenLogins.add(item.login); items.push(item); }
    }
  }

  // No results at all on this page = GitHub has nothing deeper for this query.
  const exhausted = items.length === 0 && ctx.page >= locs.length - 1;

  // Skip people already shown for this context BEFORE spending a profile
  // fetch (GitHub core API quota) and a Groq enrichment slot on them.
  let unseenItems = items;
  let skippedAsSeen = 0;
  if (ctx.seenContext && items.length > 0) {
    try {
      const alreadySeen = await findRecentlySeenIdentityValues(
        "GITHUB_LOGIN",
        items.map((i) => i.login.toLowerCase()),
        ctx.seenContext,
      );
      unseenItems = items.filter((i) => !alreadySeen.has(i.login.toLowerCase()));
      skippedAsSeen = items.length - unseenItems.length;
    } catch (error) {
      console.warn("GitHub seen-login pre-check failed, continuing without it:", error instanceof Error ? error.message : error);
    }
  }

  const profileSettled = await Promise.allSettled(
    unseenItems.slice(0, GITHUB_POOL_SIZE).map((item) =>
      fetchGitHubJSON(
        `https://api.github.com/users/${item.login}`,
        headers,
      ),
    ),
  );

  let candidates: WebCandidate[] = profileSettled
    .filter((p) => p.status === "fulfilled")
    .map((p) => (p as PromiseFulfilledResult<{ data: GitHubUserProfile }>).value.data)
    .map((p) => {

      const confirmed = [...(loginToConfirmedSkills.get(p.login) ?? [])];
      const combined = `${p.bio ?? ""} ${p.company ?? ""}`;
      const bioMatched = matchSkillsInText(combined, allSkills);

      const matchedSkills = sanitizeToAllowedSkills([...bioMatched, ...confirmed], allSkills);
      const missingSkills = allSkills.filter((s) => !matchedSkills.includes(canonicalSkill(s)));

      const snippet = p.bio || [p.company, p.location, `${p.public_repos} public repos`].filter(Boolean).join(" · ");

      const skillRatio = allSkills.length > 0 ? matchedSkills.length / allSkills.length : 0;
      const confirmedBonus = confirmed.length * 12;
      const repoActivityBonus = Math.min(8, Math.round(p.public_repos / 30));
      const followerBonus = Math.min(5, Math.round(Math.log10(p.followers + 1) * 2));
      const score = Math.min(99, Math.round(skillRatio * 45 + confirmedBonus + repoActivityBonus + followerBonus + 5));

      return {
        id: `github-${p.login}`,
        name: p.name?.trim() || p.login,
        title: "Professional",
        company: p.company?.replace(/^@/, "").trim() ?? "",
        url: p.html_url,
        source: "github" as const,
        snippet: snippet.slice(0, 380),
        rawSnippet:
          `${p.bio ?? ""}\nCompany: ${p.company ?? ""}\nLocation: ${p.location ?? ""}\n` +
          `Public repos: ${p.public_repos}\nFollowers: ${p.followers}`,
        rawTitle: p.bio || p.name || p.login,
        matchedSkills,
        missingSkills,
        relevanceScore: score,
        location: p.location ?? undefined,
        rawProvider: p,
        confirmedSkills: confirmed,
        provider: "github" as const,
      };
    })
    .sort((a, b) => b.relevanceScore - a.relevanceScore);
  // NOTE: no slice(0, N) here on purpose — POST() keeps this full scored
  // pool through the freshness check, and only slices down to the display
  // limit afterward. Slicing here would mean a repeat search has nothing
  // left to fall back on once the top 10 get suppressed as "already seen".

  let enrichWarn: string | undefined;
  if (getProviderKeys("groq").length > 0) {
    const enriched = await enrichWebCandidatesWithGroq(candidates, allSkills);
    candidates = enriched.candidates;
    enrichWarn = enrichmentWarning(enriched);
  }

  return {
    candidates,
    totalFound,
    warning: [githubWarning, enrichWarn].filter(Boolean).join(" · ") || undefined,
    skippedAsSeen,
    exhausted,
  };

}

// ─── Internal DB search (Phase 7) ──────────────────────────────────────────────
// The candidate DB behaves like just another provider: same skill matching,
// same scoring shape (reuses the PDL weighting — mandatory/must/nice/title/
// experience), same response shape. No API key, no Groq call needed — the
// data was already normalized and cleaned up when it was first persisted.
async function searchInternalDB(
  jobTitle: string,
  mandatorySkills: string[],
  mustHaveSkills: string[],
  niceToHaveSkills: string[],
  ctx: { page: number; seenContext?: string; excludeIds?: string[]; locations?: string[] },
): Promise<PageFetchResult> {
  const allSkills = getAllJDSkills(mandatorySkills, mustHaveSkills, niceToHaveSkills);
  const canonMandatory = mandatorySkills.map(canonicalSkill);
  const canonMust = mustHaveSkills.map(canonicalSkill);
  const canonNice = niceToHaveSkills.map(canonicalSkill);
  const titleWords = normalize(jobTitle).split(" ").filter((w) => w.length > 2);

  // Same weighting as the PDL scorer — mandatory 40 / must 25 / nice 10 /
  // title 15 / experience up to 10 — used for BOTH ranking and the final card.
  const scoreCandidate = (skillSet: Set<string>, title: string | null, years: number | null): number => {
    const ratio = (list: string[], emptyValue: number) =>
      list.length > 0 ? list.filter((s) => skillSet.has(s)).length / list.length : emptyValue;
    const candTitle = normalize(title ?? "");
    const titleMatch = titleWords.length > 0
      ? titleWords.filter((w) => candTitle.includes(w)).length / titleWords.length
      : 0.5;
    return Math.min(99, Math.round(
      ratio(canonMandatory, 1) * 40 + ratio(canonMust, 0.5) * 25 + ratio(canonNice, 1) * 10 + titleMatch * 15 +
      (years ? Math.min(10, years / 2) : 5),
    ));
  };

  const take = DISPLAY_TARGET.db;
  const cutoff = new Date(Date.now() - FRESHNESS_WINDOW_MS);
  const skillWhere = allSkills.length > 0 ? { skills: { some: { skill: { in: allSkills } } } } : {};
  const excludeWhere = ctx.excludeIds?.length ? { NOT: { id: { in: ctx.excludeIds } } } : {};
  const locs = expandLocations(ctx.locations ?? []);
  const locationWhere = locs.length
    ? { OR: locs.map((l) => ({ location: { contains: l, mode: "insensitive" as const } })) }
    : {};
  const baseWhere = { AND: [skillWhere, excludeWhere, locationWhere] };

  const seenWhere = ctx.seenContext
    ? { searchHistory: { some: { searchContextHash: ctx.seenContext, lastSeenAt: { gte: cutoff } } } }
    : null;

  const [light, hiddenAsSeen] = await Promise.all([
    db.candidate.findMany({
      where: seenWhere ? { AND: [baseWhere, { NOT: seenWhere }] } : baseWhere,
      select: { id: true, currentTitle: true, experienceYears: true, skills: { select: { skill: true } } },
      orderBy: { lastSeenAt: "desc" },
      take: DB_RANK_CAP,
    }),
    seenWhere && ctx.page === 0
      ? db.candidate.count({ where: { AND: [baseWhere, seenWhere] } })
      : Promise.resolve(0),
  ]);

  const ranked = light
    .map((c) => ({ id: c.id, score: scoreCandidate(new Set(c.skills.map((s) => s.skill)), c.currentTitle, c.experienceYears) }))
    .sort((a, b) => b.score - a.score);

  const pageIds = ranked.slice(ctx.page * take, (ctx.page + 1) * take).map((r) => r.id);
  const exhausted = (ctx.page + 1) * take >= ranked.length;
  if (pageIds.length === 0) {
    return { candidates: [], totalFound: ranked.length + hiddenAsSeen, skippedAsSeen: hiddenAsSeen, exhausted: true };
  }

  const hydrated = await db.candidate.findMany({
    where: { id: { in: pageIds } },
    include: { skills: true, certifications: true, identities: true },
  });
  const byId = new Map(hydrated.map((c) => [c.id, c]));

  const candidates: WebCandidate[] = pageIds
    .map((id) => byId.get(id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c))
    .map((c) => {
      const candidateSkillSet = new Set(c.skills.map((s) => s.skill));
      const matchedSkills = allSkills.filter((s) => candidateSkillSet.has(s));
      const missingSkills = allSkills.filter((s) => !candidateSkillSet.has(s));

      const linkedinIdentity = c.identities.find((i) => i.type === "LINKEDIN_URL");
      const githubIdentity = c.identities.find((i) => i.type === "GITHUB_URL");
      const portfolioIdentity = c.identities.find((i) => i.type === "PORTFOLIO_URL");
      const bestIdentity = linkedinIdentity ?? githubIdentity ?? portfolioIdentity;
      const url = bestIdentity ? `https://${bestIdentity.value}` : "";
      const currency = c.estimatedSalaryCurrency ?? "USD";

      return {
        id: `db-${c.id}`,
        name: c.fullName,
        title: c.currentTitle ?? "Professional",
        company: c.currentCompany ?? "",
        url,
        source: linkedinIdentity ? "linkedin" : githubIdentity ? "github" : portfolioIdentity ? "portfolio" : "other",
        snippet: c.summary ?? "",
        matchedSkills,
        missingSkills,
        relevanceScore: scoreCandidate(candidateSkillSet, c.currentTitle, c.experienceYears),
        location: c.location ?? undefined,
        experienceYears: c.experienceYears ?? undefined,
        education: c.educationLevel ?? undefined,
        candidateId: c.id, // already a DB row — skip re-normalize/upsert (see processPage)
        certifications: c.certifications.map((cert) => ({
          name: cert.name,
          issuer: cert.issuer ?? undefined,
          source: cert.source,
          confidence: cert.confidence ?? undefined,
        })),
        estimatedSalary: (c.estimatedSalaryMin != null || c.estimatedSalaryMax != null)
          ? {
            min: c.estimatedSalaryMin ?? undefined,
            max: c.estimatedSalaryMax ?? undefined,
            currency,
            minINR: currency === "USD" && c.estimatedSalaryMin != null ? convertUsdToInr(c.estimatedSalaryMin) : undefined,
            maxINR: currency === "USD" && c.estimatedSalaryMax != null ? convertUsdToInr(c.estimatedSalaryMax) : undefined,
            source: c.salarySource ?? undefined,
          }
          : null,
        openToWork: {
          status: c.openToWork,
          evidence: c.openToWorkEvidence ?? undefined,
          source: c.openToWorkSource ?? undefined,
        },
        provider: "db" as const,
      };
    });

  return {
    candidates,
    totalFound: ranked.length + hiddenAsSeen,
    skippedAsSeen: hiddenAsSeen,
    exhausted,
  };
}

// Normalize + upsert every candidate on a page and stamp `candidateId` on each.
// Sequential on purpose — if the same person appears twice, parallel upserts
// could race and create two Candidate rows instead of merging into one.
async function persistCandidates(candidates: WebCandidate[]): Promise<void> {
  for (const candidate of candidates) {
    // Already a DB row (internal DB search) — nothing to normalize or upsert.
    if (candidate.provider === "db") continue;

    let normalized;
    if (candidate.provider === "pdl") {
      normalized = normalizePDLCandidate(candidate.rawProvider as any, canonicalSkill);
    } else if (candidate.provider === "github") {
      normalized = normalizeGitHubCandidate(
        candidate.rawProvider as any,
        candidate.matchedSkills,
        candidate.confirmedSkills ?? [],
      );
    } else {
      normalized = normalizeWebCandidate(candidate as any);
    }
    // A raw (un-enriched) profile is saved at lower trust, so it can neither
    // overwrite a previously cleaned-up record nor outrank the enriched
    // version when this person is found again.
    if (candidate.enrichmentFailed) normalized.lowConfidence = true;
    const { candidateId } = await upsertCandidate(normalized);
    candidate.candidateId = candidateId;
  }
}

// Attach certifications / salary / open-to-work from the PERSISTED row. The
// row reflects the merge across every provider that ever found this person
// (e.g. a GitHub `hireable` flag still shows when Tavily found them this
// time). One batched query, not N+1.
async function attachPersistedInfo(candidates: WebCandidate[]): Promise<void> {
  const ids = candidates
    .filter((c) => c.provider !== "db") // DB results already carry this data
    .map((c) => c.candidateId)
    .filter((id): id is string => Boolean(id));
  if (ids.length === 0) return;

  const persisted = await db.candidate.findMany({
    where: { id: { in: ids } },
    include: { certifications: true },
  });
  const persistedById = new Map(persisted.map((c) => [c.id, c]));

  for (const candidate of candidates) {
    if (!candidate.candidateId) continue;
    const row = persistedById.get(candidate.candidateId);
    if (!row) continue;

    candidate.certifications = row.certifications.map((c) => ({
      name: c.name,
      issuer: c.issuer ?? undefined,
      source: c.source,
      confidence: c.confidence ?? undefined,
    }));

    const hasSalary = row.estimatedSalaryMin != null || row.estimatedSalaryMax != null;
    const currency = row.estimatedSalaryCurrency ?? "USD";
    candidate.estimatedSalary = hasSalary
      ? {
        min: row.estimatedSalaryMin ?? undefined,
        max: row.estimatedSalaryMax ?? undefined,
        currency,
        minINR: currency === "USD" && row.estimatedSalaryMin != null ? convertUsdToInr(row.estimatedSalaryMin) : undefined,
        maxINR: currency === "USD" && row.estimatedSalaryMax != null ? convertUsdToInr(row.estimatedSalaryMax) : undefined,
        source: row.salarySource ?? undefined,
      }
      : null;

    candidate.openToWork = {
      status: row.openToWork,
      evidence: row.openToWorkEvidence ?? undefined,
      source: row.openToWorkSource ?? undefined,
    };
  }
}

// ─── Main handler ──────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // API keys are no longer accepted from the client — they come from the
    // server's environment (see lib/providerKeys.ts). Any apiKey/groqApiKey
    // still sent in the body is simply ignored.
    const {
      provider,
      jobTitle = "",
      mustHaveSkills = [],
      mandatorySkills = [],
      niceToHaveSkills = [],
      jdMode = "structured",
      jdText = "",
      freshSearch = false,
      filters,
      startPage = 0,
      excludeKeys = [],

    }: {
      provider: Provider;
      jobTitle: string;
      mustHaveSkills: string[];
      mandatorySkills: string[];
      niceToHaveSkills: string[];
      jdMode?: JDMode;
      jdText?: string;
      freshSearch?: boolean;
      filters?: CandidateFilters;
      startPage?: number;
      excludeKeys?: string[];
    } = body;

    if (!["pdl", "tavily", "exa", "serper", "github", "db"].includes(provider))
      return NextResponse.json({ error: "Invalid provider." }, { status: 400 });

    // Fail early with a clear, actionable message when the SERVER isn't
    // configured — rather than a deep 500 from inside a provider call.
    // GitHub works without keys (unauthenticated, 60/hr) and db needs none.
    if (!["github", "db"].includes(provider) && !getProviderKeys(provider as "pdl" | "tavily" | "exa" | "serper").length) {
      return NextResponse.json(
        { error: `${provider.toUpperCase()} is not configured on the server. Ask an admin to set ${provider.toUpperCase()}_API_KEYS.` },
        { status: 503 },
      );
    }

    // Groq is needed for everything except PDL (already structured) and db
    // (already cleaned up when first persisted), plus free-text JD parsing.
    const needsGroq = !["pdl", "db"].includes(provider) || jdMode === "freetext";
    if (needsGroq && !getProviderKeys("groq").length) {
      return NextResponse.json(
        { error: "Groq is not configured on the server. Ask an admin to set GROQ_API_KEYS." },
        { status: 503 },
      );
    }

    let finalJobTitle = jobTitle;
    let finalMandatorySkills = mandatorySkills;
    let finalMustHaveSkills = mustHaveSkills;
    let finalNiceToHaveSkills = niceToHaveSkills;
    let extractedJD: CandidateSearchResponse["extractedJD"];

    if (jdMode === "freetext") {
      if (!jdText || jdText.trim().length < 20)
        return NextResponse.json(
          { error: "Paste at least 20 characters of job description first." },
          { status: 400 },
        );
      // Groq availability was already validated above (needsGroq covers
      // freetext mode), so no per-request key check is needed here.
      const extracted = await extractJDFieldsForSearch(jdText.trim());

      finalJobTitle = extracted.jobTitle || finalJobTitle;
      finalMandatorySkills = extracted.mandatorySkills.length > 0 ? extracted.mandatorySkills : finalMandatorySkills;
      finalMustHaveSkills = extracted.mustHaveSkills.length > 0 ? extracted.mustHaveSkills : finalMustHaveSkills;
      finalNiceToHaveSkills = extracted.niceToHaveSkills.length > 0 ? extracted.niceToHaveSkills : finalNiceToHaveSkills;

      extractedJD = {
        jobTitle: finalJobTitle,
        mandatorySkills: finalMandatorySkills,
        mustHaveSkills: finalMustHaveSkills,
        niceToHaveSkills: finalNiceToHaveSkills,
      };
    }

    if (!finalJobTitle.trim() && finalMustHaveSkills.length === 0 && finalMandatorySkills.length === 0)
      return NextResponse.json(
        {
          error: jdMode === "freetext"
            ? "Couldn't detect a role or skills from that JD — try structured JD mode instead."
            : "Add a job title or skills to the JD first."
        },
        { status: 400 },
      );

    const allSkills = getAllJDSkills(finalMandatorySkills, finalMustHaveSkills, finalNiceToHaveSkills);
    const searchLocations = cleanLocations(filters?.locations);
    const searchContextHash = buildSearchContextHash(finalJobTitle, allSkills, searchLocations);
    // Undefined on a "fresh search": every already-seen pre-check and exclusion
    // below keys off this, so leaving it unset turns the 30-day rule off.
    const seenContext = freshSearch ? undefined : searchContextHash;
    const excludeSet = new Set<string>(excludeKeys);
    // Cursor only matters in fresh mode (nothing else advances the search then).
    // In normal mode, the 30-day "seen" rule already moves the search forward, and
    // the DB provider advances via SQL exclusion, so it always starts at page 0.
    const baseStartPage = freshSearch && provider !== "db"
      ? Math.max(0, Math.floor(Number(startPage)) || 0)
      : 0;
    const target = DISPLAY_TARGET[provider];
    const maxPages = MAX_PAGES[provider];


    // One page of results from the chosen provider. The loop below calls this
    // for page 0, 1, 2... until it has `target` NEW candidates.
    let fetchProviderPage: (page: number) => Promise<PageFetchResult>;

    if (provider === "pdl") {
      // Resume after the PDL records already shown, so repeat searches don't
      // re-buy (and re-hide) the same top records every time.
      let startOffset = 0;
      if (seenContext) {
        try { startOffset = await countSeenPdlCandidates(seenContext); }
        catch (error) { console.warn("PDL resume-offset lookup failed, starting from 0:", error instanceof Error ? error.message : error); }
      }
      fetchProviderPage = (page) =>
        searchPDL(finalJobTitle, finalMandatorySkills, finalMustHaveSkills, finalNiceToHaveSkills,
          { page, startOffset, locations: searchLocations })
    } else if (provider === "db") {
      fetchProviderPage = (page) =>
        searchInternalDB(finalJobTitle, finalMandatorySkills, finalMustHaveSkills, finalNiceToHaveSkills, { page, seenContext, excludeIds: [...excludeSet], locations: searchLocations });
    } else if (provider === "github") {
      // The query plan costs a Groq call — compute it once, reuse every page.
      let plan: GitHubQueryPlan | undefined;
      fetchProviderPage = async (page) => {
        if (!plan) plan = await planGitHubQuery(finalJobTitle, finalMandatorySkills, finalMustHaveSkills, finalNiceToHaveSkills);
        return searchGitHubAPI(
          finalJobTitle, finalMandatorySkills, finalMustHaveSkills, finalNiceToHaveSkills,
          { page, seenContext, plan, locations: searchLocations }, DEFAULT_LOCATION
        );
      };
    } else {
      fetchProviderPage = (page) =>
        runWebSearch(provider, finalJobTitle, finalMandatorySkills, finalMustHaveSkills, finalNiceToHaveSkills,
          { page, seenContext, locations: searchLocations })
    }

    // Persistence / freshness are additive: if the DB is down the search still
    // returns results (failing OPEN), it just can't judge "already seen".
    let persistenceHealthy = true;

    const processPage = async (rawItems: WebCandidate[]): Promise<PageProcessed<WebCandidate>> => {
      const notShown = excludeSet.size
        ? rawItems.filter((c) => ![c.candidateId, c.url, c.id].some((k) => k && excludeSet.has(k)))
        : rawItems;

      // DB rows are already saved; everything else must have a real person's name.
      const items = notShown.filter((c) => c.provider === "db" || isPlausiblePersonName(c.name));

      let fresh = items;
      let suppressed = 0;
      if (persistenceHealthy) {
        try {
          await persistCandidates(items);
          const ids = items.map((c) => c.candidateId).filter((id): id is string => Boolean(id));
          const { freshCandidateIds, excludedCandidateIds } = await filterByFreshness(ids, searchContextHash, freshSearch);
          const freshSet = new Set(freshCandidateIds);
          fresh = items.filter((c) => !c.candidateId || freshSet.has(c.candidateId));
          suppressed = excludedCandidateIds.length;
          await attachPersistedInfo(fresh);
        } catch (dbError) {
          persistenceHealthy = false;
          fresh = items;
          suppressed = 0;
          console.error(
            "Candidate persistence/freshness step failed — returning un-persisted results:",
            dbError instanceof Error ? dbError.message : dbError,
          );
        }
      }
      // Recruiter filters count toward the target, so a strict filter makes
      // the loop page deeper instead of just returning fewer people.
      const filtered = applyCandidateFilters(fresh, filters, canonicalSkill);
      return { accepted: filtered.candidates, suppressed, filteredOut: filtered.removed };
    };

    // Metadata gathered across pages.
    let totalFound = 0;
    let creditsUsed: number | undefined;
    const providerWarnings = new Set<string>();
    let skippedAsSeen = 0;

    const gathered = await gatherUntil<WebCandidate>({
      target,
      maxPages,
      startPage: baseStartPage,
      keyOf: (c) => c.candidateId ?? c.url ?? c.id,
      stopWhen: () => !persistenceHealthy,
      processPage,
      fetchPage: async (page) => {
        const r = await fetchProviderPage(page);
        if (page === 0) totalFound = r.totalFound;
        if (r.creditsUsed !== undefined) creditsUsed = (creditsUsed ?? 0) + r.creditsUsed;
        if (r.warning) providerWarnings.add(r.warning);
        skippedAsSeen += r.skippedAsSeen ?? 0;
        return { items: r.candidates, exhausted: r.exhausted };
      },
    });

    const sorted = [...gathered.items].sort((a, b) => b.relevanceScore - a.relevanceScore);
    const finalCandidates = sorted.slice(0, target);

    // If we trimmed candidates, don't skip past the page they came from: re-fetching
    // the last page is safe because excludeKeys removes whoever was shown.
    const nextPage = baseStartPage + (gathered.items.length > target
      ? Math.max(0, gathered.pagesFetched - 1)
      : gathered.pagesFetched);

    // Record only what is actually shown — a candidate hidden by a filter or
    // trimmed above was never seen, so it must not be suppressed next time.
    if (persistenceHealthy) {
      try {
        // A profile whose AI clean-up failed is shown, but not recorded as seen:
        // the 30-day rule would otherwise hide it from future searches and leave
        // its raw text behind. Left unrecorded, the next search retries it.
        const shownIds = finalCandidates
          .filter((c) => !c.enrichmentFailed)
          .map((c) => c.candidateId)
          .filter((id): id is string => Boolean(id));
        await recordSearchHistory(shownIds, searchContextHash, finalJobTitle);
      } catch (error) {
        console.error("Failed to record search history:", error instanceof Error ? error.message : error);
      }
    }

    const warning =
      [...providerWarnings, gathered.stoppedEarly ? `Stopped fetching more results early: ${gathered.stoppedEarly}` : undefined]
        .filter(Boolean)
        .join(" · ") || undefined;

    return NextResponse.json({
      candidates: finalCandidates,
      totalFound,
      searchedAt: new Date().toISOString(),
      provider,
      creditsUsed,
      warning,
      nextPage,
      exhausted: gathered.exhausted,
      // Hidden as already-seen = skipped before enrichment + dropped after persisting.
      suppressedByFreshness: gathered.suppressed + skippedAsSeen,
      filteredOutByFilters: gathered.filteredOut,
    } as CandidateSearchResponse);

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Candidate search error:", message);
    return NextResponse.json({ error: `Search failed: ${message}` }, { status: 500 });
  }
}