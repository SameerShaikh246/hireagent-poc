import { groqGenerate } from "@/lib/groq";
import { NextRequest, NextResponse } from "next/server";

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
  provider: "pdl" | "tavily" | "exa" | "serper";
}

export interface CandidateSearchResponse {
  candidates: WebCandidate[];
  totalFound: number;
  searchedAt: string;
  provider: "pdl" | "tavily" | "exa" | "serper";
  creditsUsed?: number;
  // NEW: present only when jdMode === "freetext" — tells the client what
  // the Groq extraction step inferred, so the UI can show it after search.
  extractedJD?: {
    jobTitle: string;
    mandatorySkills: string[];
    mustHaveSkills: string[];
    niceToHaveSkills: string[];
  };
}

type Provider = "pdl" | "tavily" | "exa" | "serper";
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

// ─── Free-text JD extraction (Groq) ───────────────────────────────────────
// When jdMode === "freetext" the client only has raw JD text — no title / skill
// tiers. We ask Groq to derive them so the rest of the pipeline (PDL query
// builder, web search query builder, skill matching, scoring) can run exactly
// as it already does for structured JDs, completely unchanged.

interface ExtractedJDFields {
  jobTitle: string;
  mandatorySkills: string[];
  mustHaveSkills: string[];
  niceToHaveSkills: string[];
}

async function extractJDFieldsForSearch(
  jdText: string,
  groqApiKey: string,
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

Job description:

"""${jdText.slice(0, 6000)}"""`;

  const raw = await groqGenerate(prompt, {
    apiKey: groqApiKey,
    model: "llama-3.3-70b-versatile",
    temperature: 0.1,
    maxTokens: 800,
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

// Search results scraped from LinkedIn/profile pages come bundled with a lot
// of noise that has nothing to do with the candidate themselves: activity-feed
// posts ("Liked by X — View Post"), "People Also Viewed" lists full of OTHER
// people's names, hiring-post reposts, etc. Feeding that straight to Groq is
// what produces junk like "Exploring life and learning new technologies" as a
// summary, or the model getting confused about whose name is whose. Here we
// isolate just the person's own "About" section (their real bio) when present,
// and fall back to a trimmed raw snippet only if there's no About section to
// extract from.
function extractProfileSource(candidate: WebCandidate): string {
  const raw = candidate.rawSnippet || candidate.snippet || "";

  const aboutMatch = raw.match(/##\s*About\s*\n+([\s\S]*?)(?=\n##\s|\n#\s|$)/i);
  const about = aboutMatch?.[1]?.trim();

  const headerMatch = raw.match(/^#\s*(.+)\n([\s\S]*?)\n/);
  const headerLines = headerMatch ? `${headerMatch[1]}\n${headerMatch[2]}`.trim() : "";

  if (about && about.length > 15 && !/^n\/a$/i.test(about)) {
    return `${headerLines}\n${about}`.trim().slice(0, 600);
  }

  // No usable About section — strip the noisiest sections (Activity, People
  // Also Viewed) out of the raw text rather than sending them wholesale.
  const stripped = raw
    .split(/##\s*(Activity|People Also Viewed|Publications|Honors & Awards|Certifications|Volunteering|Languages|Organizations)/i)[0]
    .trim();

  return (stripped || raw).slice(0, 600);
}

async function enrichWebCandidatesWithGroq(
  candidates: WebCandidate[],
  allSkills: string[],
  groqApiKey: string,
): Promise<WebCandidate[]> {
  if (!candidates.length || !groqApiKey?.trim()) {
    return candidates;
  }

  const input = candidates.map((candidate, index) => ({
    index,
    nameFromSearch: candidate.name,
    // Use the ORIGINAL, unmodified search-result title — not the naive
    // string-split guess used for display — so Groq isn't reasoning from an
    // already-corrupted value (e.g. a company name that got misparsed as a title).
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
   A company name alone (e.g. "Wipro", "TCS") is NEVER a valid job title — if that's all you have, infer the likely title from profileText instead, or leave it generic (e.g. "Software Engineer") only if profileText supports it.
10. Extract the current company only when supported by the source.
11. Write a concise, professional recruiter-style summary — 1-2 sentences, third person, factual. Never copy or lightly reword social-media "activity feed" language (e.g. "liked this", "exploring life", "excited to share"). If the only available text is feed noise with no real bio, keep the summary short and generic based on title/company/skills only, and lower confidence accordingly.
12. The summary should explain:
    - what the candidate does
    - their relevant technical experience
    - important matching technologies
    - role relevance
13. Do not claim years of experience unless supported by the source.
14. Do not invent employers, projects, degrees, skills, seniority, or locations.
15. matchedSkills must contain only skills supported by the supplied information.
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
      apiKey: groqApiKey.trim(),
      model: "llama-3.3-70b-versatile",
      temperature: 0.1,
      maxTokens: 5000,
      responseFormat: {
        type: "json_object",
      },
    });

    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed?.candidates)) {
      return candidates;
    }

    const enrichmentMap = new Map<number, EnrichedCandidate>();

    for (const item of parsed.candidates) {
      if (
        typeof item?.index !== "number" ||
        !candidates[item.index]
      ) {
        continue;
      }

      enrichmentMap.set(item.index, {
        name:
          typeof item.name === "string" && item.name.trim()
            ? item.name.trim()
            : "Unknown Candidate",

        title:
          typeof item.title === "string" && item.title.trim()
            ? item.title.trim()
            : candidates[item.index].title,

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

        matchedSkills: Array.isArray(item.matchedSkills)
          ? item.matchedSkills.map(String)
          : candidates[item.index].matchedSkills,

        confidence:
          typeof item.confidence === "number"
            ? Math.max(0, Math.min(1, item.confidence))
            : 0,

        isValidCandidate:
          typeof item.isValidCandidate === "boolean"
            ? item.isValidCandidate
            : true, // default to keeping the candidate if the model omitted the field

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

        // Drop results Groq identified as not being real candidate profiles
        // (job listings, hiring posts, company pages, etc.)
        if (!enriched.isValidCandidate) {
          return null;
        }

        const matchedSkills = [
          ...new Set([
            ...candidate.matchedSkills,
            ...enriched.matchedSkills,
          ]),
        ];

        const missingSkills = allSkills.filter(
          (skill) =>
            !matchedSkills
              .map(canonicalSkill)
              .includes(canonicalSkill(skill)),
        );

        return {
          ...candidate,

          name:
            enriched.nameConfidence >= 0.65
              ? enriched.name
              : candidate.name,

          title: enriched.title,
          company: enriched.company,

          snippet: enriched.summary.slice(0, 350),

          location: enriched.location,

          experienceYears: enriched.experienceYears,

          matchedSkills,

          missingSkills,
        };
      })
      .filter((c): c is WebCandidate => c !== null);

    return merged;
  } catch (error) {
    console.error(
      "Groq candidate enrichment failed:",
      error instanceof Error ? error.message : error,
    );

    // Important: search should still work even if Groq enrichment fails.
    return candidates;
  }
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
  // Job-board / aggregator domains and phrasing (these slip through as fake
  // "candidates" if not explicitly caught — they're listing pages, not people)
  "shine.com", "timesjobs.com", "freshersworld.com", "instahyre.com",
  "foundit.in", "iimjobs.com", "cutshort.io", "hirist.com",
  "jobs openings", "active jobs", "job openings", "job search",
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
    snippet: r.snippet.slice(0, 380),  // Initial fallback description — replaced by Groq enrichment when available
    rawSnippet: r.snippet.slice(0, 1000),  // Preserve original source
    rawTitle: r.title,  // Unmodified — used by Groq enrichment instead of the naive split above
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
    body: JSON.stringify({ api_key: apiKey, query: `${query} (India OR Bangalore OR Hyderabad OR Pune)`, search_depth: "advanced", max_results: 20,  include_raw_content: true }),
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
    body: JSON.stringify({ query: `${query} India`, numResults: 20, type: "keyword", contents: { text: { maxCharacters: 400 } } }),
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
  groqApiKey?: string,
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

  let candidates = merged
    .filter((r) => isUsefulWebResult(r.url, r.title, r.snippet))
    .map((r, i) => webResultToCandidate(r, i, allSkills, provider))
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, 15);

  // Enhance names, titles, companies and summaries with Groq, and drop any
  // results that turn out not to be real individual candidates.
  if (groqApiKey?.trim()) {
    candidates = await enrichWebCandidatesWithGroq(
      candidates,
      allSkills,
      groqApiKey,
    );
  }

  return {
    candidates,
    totalFound: merged.length,
  };
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
      jdMode = "structured",
      jdText = "",
      groqApiKey = "",
    }: {
      provider: Provider;
      apiKey: string;
      jobTitle: string;
      mustHaveSkills: string[];
      mandatorySkills: string[];
      niceToHaveSkills: string[];
      jdMode?: JDMode;
      jdText?: string;
      groqApiKey?: string;
    } = body;

    if (!["pdl", "tavily", "exa", "serper"].includes(provider))
      return NextResponse.json({ error: "Invalid provider." }, { status: 400 });
    if (!apiKey || apiKey.trim().length < 5)
      return NextResponse.json({ error: "API key is required." }, { status: 400 });

    // Web-search providers scrape raw pages, not structured records — without
    // Groq to clean names/titles/summaries and filter out non-candidate pages
    // (job listings, company pages, etc.), results will contain garbled names
    // and unprofessional "activity feed" text. Require it for these providers.
    if (provider !== "pdl" && (!groqApiKey || groqApiKey.trim().length < 10)) {
      return NextResponse.json(
        { error: "A Groq API key is required for web-search providers (tavily/exa/serper) so results can be cleaned up and validated. PDL doesn't need it since it returns structured data directly." },
        { status: 400 },
      );
    }

    // Values actually used for the search — identical to the structured path
    // unless jdMode === "freetext", in which case they get filled in below.
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
      if (!groqApiKey || groqApiKey.trim().length < 10)
        return NextResponse.json(
          { error: "A Groq API key is required to parse a free-text JD." },
          { status: 400 },
        );

      const extracted = await extractJDFieldsForSearch(jdText.trim(), groqApiKey.trim());

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
        { error: jdMode === "freetext"
          ? "Couldn't detect a role or skills from that JD — try structured JD mode instead."
          : "Add a job title or skills to the JD first." },
        { status: 400 },
      );

    let result: { candidates: WebCandidate[]; totalFound: number; creditsUsed?: number };

    if (provider === "pdl") {
      result = await searchPDL(finalJobTitle, finalMandatorySkills, finalMustHaveSkills, finalNiceToHaveSkills, apiKey.trim());
    } else {
      result = await runWebSearch(
        provider,
        apiKey.trim(),
        finalJobTitle,
        finalMandatorySkills,
        finalMustHaveSkills,
        finalNiceToHaveSkills,
        DEFAULT_LOCATION,
        groqApiKey.trim(),
      );
    }

    return NextResponse.json({
      candidates: result.candidates,
      totalFound: result.totalFound,
      searchedAt: new Date().toISOString(),
      provider,
      creditsUsed: result.creditsUsed,
      extractedJD,
    } as CandidateSearchResponse);

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Candidate search error:", message);
    return NextResponse.json({ error: `Search failed: ${message}` }, { status: 500 });
  }
}