// ─────────────────────────────────────────────────────────────────────────
// HireAgent — Candidate Normalizer (Phase 3)
//
// NormalizedCandidate structure. This is what Phase dedup and the DB
// persistence layer will consume — neither of those need to know that PDL
// calls it `full_name` and GitHub calls it `name`.
//
// This file does NOT touch the database — it's a pure mapping layer.
// Persisting a NormalizedCandidate (look up existing identities, merge or
// create, upsert skills/certifications).
//─────────────────────────────────────────────────────────────────────────

export type Provider = "PDL" | "GITHUB" | "TAVILY" | "EXA" | "SERPER" | "INTERNAL_DB";

export type IdentityType =
  | "LINKEDIN_URL"
  | "GITHUB_URL"
  | "PORTFOLIO_URL"
  | "PDL_ID"
  | "GITHUB_LOGIN"
  | "EMAIL_HASH"
  | "NAME_COMPANY";

export type SkillSource = "PDL_STRUCTURED" | "GITHUB_LANGUAGE" | "BIO_EXTRACTED" | "GROQ_ENRICHED";
export type CertificationSource = "PDL" | "WEB_EXTRACTED";
export type OpenToWorkStatus = "YES" | "NO" | "UNKNOWN";

// Priority order for Phase 4 dedup lookups — check identities in this order
// and merge into the first Candidate found; only create a new Candidate if
// NONE of these match anything in CandidateIdentity.
export const IDENTITY_PRIORITY: IdentityType[] = [
  "PDL_ID",
  "GITHUB_LOGIN",
  "LINKEDIN_URL",
  "GITHUB_URL",
  "PORTFOLIO_URL",
  "EMAIL_HASH",
  "NAME_COMPANY",
];

export interface NormalizedIdentity {
  type: IdentityType;
  value: string;
}

export interface NormalizedSkill {
  skill: string; // already canonicalized (run through canonicalSkill() from the existing skill-alias map)
  source: SkillSource;
  confidence?: number;
}

export interface NormalizedCertification {
  name: string;
  issuer?: string;
  source: CertificationSource;
  sourceUrl?: string;
  confidence?: number;
}

export interface NormalizedCandidate {
  fullName: string;
  currentTitle?: string;
  currentCompany?: string;
  location?: string;
  summary?: string;
  experienceYears?: number;
  educationLevel?: string;

  // Phase 6 fields — always present on the shape, but null/UNKNOWN unless
  // a provider actually supports them (see per-function notes below).
  estimatedSalaryMin?: number;
  estimatedSalaryMax?: number;
  estimatedSalaryCurrency?: string;
  salarySource?: string;

  openToWork: OpenToWorkStatus;
  openToWorkEvidence?: string;
  openToWorkSource?: string;

  identities: NormalizedIdentity[];
  skills: NormalizedSkill[];
  certifications: NormalizedCertification[];

  /** Profile text is raw/un-cleaned (AI clean-up failed) — persist at reduced trust. */
  lowConfidence?: boolean;

  provider: Provider;
  providerCandidateId?: string;
  profileUrl?: string;
  rawData: unknown; // stored as-is into CandidateProvider.rawData for audit/re-enrichment
}

// ─── Shared helpers ─────────────────────────────────────────────────────

// Canonical form of a profile URL, used as the dedup identity. Exported so
// the search layer can recognise an already-seen profile BEFORE doing any
// expensive work (Groq enrichment, GitHub profile fetches) — both sides must
// normalize identically or "seen" lookups silently miss.
//
// Fixes real duplicate-causing variants:
//   https://in.linkedin.com/in/jane-doe   (regional subdomain)
//   https://www.linkedin.com/in/jane-doe/?trk=public_profile (query/trailing /)
//   https://linkedin.com/in/jane-doe/en   (extra path after the slug)
// ...all become  linkedin.com/in/jane-doe
export function normalizeProfileUrl(url: string): string {
  let u = url.trim().toLowerCase();
  u = u.replace(/^https?:\/\//, "").replace(/^www\./, "");
  u = u.split("#")[0].split("?")[0];
  u = u.replace(/^[a-z0-9-]+\.linkedin\.com/, "linkedin.com");

  const li = u.match(/^linkedin\.com\/in\/([^/]+)/);
  if (li) {
    let slug = li[1];
    try { slug = decodeURIComponent(slug); } catch { /* keep raw slug */ }
    return `linkedin.com/in/${slug}`;
  }
  return u.replace(/\/+$/, "");
}

const normalizeUrl = normalizeProfileUrl;

// Explicit phrases only — per the demo decision, we never infer "open to
// work" from anything other than a clear, direct statement (or GitHub's
// `hireable` field, which is handled separately in normalizeGitHubCandidate).
const OPEN_TO_WORK_PATTERNS: RegExp[] = [
  /open to work/i,
  /#opentowork/i,
  /\bactively seeking\b/i,
  /\bseeking (?:a )?new role/i,
  /\bavailable for (?:new )?(?:opportunit\w*|hire)/i,
  // "looking for new job opportunities", "seeking a new role", "looking for a job"
  /\b(?:looking|seeking|searching)\s+for\s+(?:(?:an?|new|better|job|full[- ]?time|\w+)\s+){0,3}(?:roles?|jobs?|opportunit\w*|positions?|openings?)\b/i,
];

function detectOpenToWorkFromText(text: string) {
  if (!text) return { status: "UNKNOWN" as OpenToWorkStatus };
  for (const pattern of OPEN_TO_WORK_PATTERNS) {
    const match = text.match(pattern);
    if (match && match.index !== undefined) {
      // skip recruiter phrasing: "we are looking for a role…"
      const before = text.slice(Math.max(0, match.index - 25), match.index).toLowerCase();
      if (/\b(we are|we're|we’re|hiring|our team)\b/.test(before)) continue;
      const start = Math.max(0, match.index - 40);
      return { status: "YES" as OpenToWorkStatus, evidence: text.slice(start, match.index + match[0].length + 40).trim() };
    }
  }
  return { status: "UNKNOWN" as OpenToWorkStatus };
}

// MVP heuristic: looks for a LinkedIn-style "## Certifications" /
// "## Licenses & Certifications" section (this is the format Tavily/Exa
// raw_content came back in during validation) and pulls each line as a
// candidate certification name. This is intentionally rough — Phase 6 will
// hand this section to Groq for structured, validated extraction (name vs.
// issuer vs. date) instead of a flat line dump. Confidence is set low (0.4)
// to reflect that.
function extractCertificationsHeuristic(text: string): NormalizedCertification[] {
  if (!text) return [];
  const sectionMatch = text.match(
    /##?\s*(?:licenses?\s*(?:&|and)?\s*)?certifications?\s*\n+([\s\S]*?)(?=\n##?\s|\n#\s|$)/i,
  );
  if (!sectionMatch) return [];

  let body = sectionMatch[1];
  // Tavily's truncation marker + inline next heading: cut there.
  const cut = body.search(/\s*\[\.\.\.\]|\s##\s/);
  const wasCut = cut !== -1;
  if (wasCut) body = body.slice(0, cut);

  let lines = body.split("\n")
    .map((l) => l.replace(/^[-*•\d.]+\s*/, "").trim())
    .filter((l) => l.length > 3 && l.length < 120 && !l.startsWith("#"));

  // rawSnippet is capped at 1000 chars: a section that runs to the end of the
  // text probably ends mid-word ("IBM (2022", "Android Application Devel").
  if (!wasCut && text.length >= 990) lines = lines.slice(0, -1);

  return [...new Set(lines)].slice(0, 10)
    .map((name) => ({ name, source: "WEB_EXTRACTED" as CertificationSource, confidence: 0.4 }));
}

function highestDegree(education?: { degrees?: string[] }[]): string | undefined {
  const rank: Record<string, number> = {
    phd: 5, doctorate: 5, masters: 4, mba: 4, bachelors: 3, bachelor: 3, associate: 2, diploma: 1,
  };
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

// ─── PDL ────────────────────────────────────────────────────────────────
// Confirmed via validate-providers.mjs against a live trial record:
// `certifications`, `inferred_salary`, `inferred_years_experience` are all
// ABSENT on the current plan/dataset ("resume"). The mapping below is kept
// so nothing needs to change if the PDL plan is upgraded later — until
// then these will simply always come back undefined -> "Not Available" in
// the UI.

interface PDLRecordForNormalize {
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
  education?: { degrees?: string[]; school?: { name?: string } }[];
  inferred_years_experience?: number;
  // Not present on current trial/dataset — typed optionally for forward-compat.
  certifications?: Array<string | { name?: string; issuer?: string }>;
  inferred_salary?: { min?: number; max?: number; currency?: string };
}

export function normalizePDLCandidate(
  record: PDLRecordForNormalize,
  canonicalSkill: (skill: string) => string,
): NormalizedCandidate {
  const identities: NormalizedIdentity[] = [];
  if (record.id) identities.push({ type: "PDL_ID", value: record.id });
  if (record.linkedin_url) identities.push({ type: "LINKEDIN_URL", value: normalizeUrl(record.linkedin_url) });
  if (record.github_url) identities.push({ type: "GITHUB_URL", value: normalizeUrl(record.github_url) });

  const skills: NormalizedSkill[] = (record.skills ?? []).map((s) => ({
    skill: canonicalSkill(s),
    source: "PDL_STRUCTURED",
  }));

  const certifications: NormalizedCertification[] = (record.certifications ?? []).map((c) => ({
    name: typeof c === "string" ? c : c.name ?? "Unknown certification",
    issuer: typeof c === "object" ? c.issuer : undefined,
    source: "PDL",
  }));

  const salary = record.inferred_salary;

  const profileUrl = record.linkedin_url
    ? record.linkedin_url.startsWith("http") ? record.linkedin_url : `https://${record.linkedin_url}`
    : record.github_url;

  return {
    fullName: record.full_name || `${record.first_name ?? ""} ${record.last_name ?? ""}`.trim() || "Unknown",
    currentTitle: record.job_title,
    currentCompany: record.job_company_name,
    location: record.location_name,
    summary: record.summary ?? record.headline,
    experienceYears: record.inferred_years_experience,
    educationLevel: highestDegree(record.education),

    estimatedSalaryMin: salary?.min,
    estimatedSalaryMax: salary?.max,
    estimatedSalaryCurrency: salary ? (salary.currency ?? "USD") : undefined,
    salarySource: salary ? "PDL inferred_salary" : undefined,

    // Per the demo decision: PDL job-change/tenure data is NEVER treated as
    // an open-to-work signal — always UNKNOWN for this provider.
    openToWork: "UNKNOWN",
    identities,
    skills,
    certifications,
    provider: "PDL",
    providerCandidateId: record.id,
    profileUrl,
    rawData: record,
  };
}

// ─── GitHub ─────────────────────────────────────────────────────────────
// Confirmed via validate-providers.mjs: `hireable` (boolean | null) is a
// REAL field on the GitHub user object — an explicit "available for hire"
// flag the user sets themselves. This is a much stronger signal than bio
// text pattern-matching, so it's checked first.

interface GitHubProfileForNormalize {
  login: string;
  name: string | null;
  company: string | null;
  location: string | null;
  bio: string | null;
  html_url: string;
  hireable?: boolean | null;
}

export function normalizeGitHubCandidate(
  profile: GitHubProfileForNormalize,
  matchedSkills: string[],
  confirmedLanguageSkills: string[], // subset of matchedSkills confirmed via a language: query match (higher trust)
): NormalizedCandidate {
  const identities: NormalizedIdentity[] = [
    { type: "GITHUB_LOGIN", value: profile.login.toLowerCase() },
    { type: "GITHUB_URL", value: normalizeUrl(profile.html_url) },
  ];

  const skills: NormalizedSkill[] = matchedSkills.map((s) => ({
    skill: s,
    source: confirmedLanguageSkills.includes(s) ? "GITHUB_LANGUAGE" : "BIO_EXTRACTED",
  }));

  const certifications = extractCertificationsHeuristic(profile.bio ?? "");

  let openToWork: OpenToWorkStatus = "UNKNOWN";
  let openToWorkEvidence: string | undefined;
  let openToWorkSource: string | undefined;

  if (profile.hireable === true) {
    openToWork = "YES";
    openToWorkEvidence = "GitHub profile 'Available for hire' setting is enabled";
    openToWorkSource = "github_hireable_field";
  } else if (profile.hireable === false) {
    openToWork = "NO";
    openToWorkSource = "github_hireable_field";
  } else {
    const bioSignal = detectOpenToWorkFromText(profile.bio ?? "");
    openToWork = bioSignal.status;
    openToWorkEvidence = bioSignal.evidence;
    if (bioSignal.status === "YES") openToWorkSource = "bio_phrase_match:github";
  }

  return {
    fullName: profile.name?.trim() || profile.login,
    currentTitle: "Professional", // upstream Groq enrichment already refines this from bio before normalize() is called
    currentCompany: profile.company?.replace(/^@/, "").trim() || undefined,
    location: profile.location ?? undefined,
    summary: profile.bio ?? undefined,

    // Salary/certifications: no such fields exist anywhere on GitHub's user
    // API (confirmed) — certifications come only from the bio heuristic above.
    openToWork,
    openToWorkEvidence,
    openToWorkSource,
    identities,
    skills,
    certifications,
    provider: "GITHUB",
    providerCandidateId: profile.login,
    profileUrl: profile.html_url,
    rawData: profile,
  };
}

// ─── Web search providers (Tavily / Exa / Serper) ──────────────────────
// Input here is your EXISTING `WebCandidate` shape (already through
// webResultToCandidate + enrichWebCandidatesWithGroq upstream) — this just
// reshapes it, it doesn't redo any of that work.
//
// Note from validation: Serper only returns a short `snippet`, no full
// profile text — so certifications/open-to-work will realistically almost
// always come back empty/UNKNOWN for Serper specifically. That's expected,
// not a bug in this mapping.

interface WebCandidateForNormalize {
  name: string;
  title: string;
  company: string;
  url: string;
  source: "linkedin" | "github" | "portfolio" | "other";
  snippet: string;
  rawSnippet?: string;
  matchedSkills: string[];
  location?: string;
  provider: "tavily" | "exa" | "serper";
  rawTitle?: string;
  experienceYears?: number;
  education?: string;
}

const WEB_PROVIDER_MAP: Record<WebCandidateForNormalize["provider"], Provider> = {
  tavily: "TAVILY",
  exa: "EXA",
  serper: "SERPER",
};

export function normalizeWebCandidate(candidate: WebCandidateForNormalize): NormalizedCandidate {
  const identities: NormalizedIdentity[] = [];

  if (candidate.source === "linkedin") {
    identities.push({ type: "LINKEDIN_URL", value: normalizeUrl(candidate.url) });
  } else if (candidate.source === "github") {
    identities.push({ type: "GITHUB_URL", value: normalizeUrl(candidate.url) });
  } else if (candidate.source === "portfolio") {
    identities.push({ type: "PORTFOLIO_URL", value: normalizeUrl(candidate.url) });
  }

  // Always add a name+company fallback too, even when a stronger identity
  // exists — cheap safety net for Phase 4 dedup, and harmless since Phase 4
  // checks identities in priority order rather than requiring a single one.
  // Only when there IS a company: a bare name ("Rahul Sharma") matches every
  // namesake, which would merge different people into one record.
  if (candidate.name && candidate.name !== "Unknown Candidate" && candidate.company?.trim()) {
    identities.push({
      type: "NAME_COMPANY",
      value: `${candidate.name.toLowerCase().trim()}::${(candidate.company || "").toLowerCase().trim()}`,
    });
  }

  const skills: NormalizedSkill[] = candidate.matchedSkills.map((s) => ({
    skill: s,
    source: "GROQ_ENRICHED",
  }));

  const sourceText = `${candidate.rawTitle ?? ""}\n${candidate.rawSnippet || candidate.snippet || ""}`;
  const certifications = extractCertificationsHeuristic(candidate.rawSnippet || candidate.snippet || "");
  const otwSignal = detectOpenToWorkFromText(sourceText);

  return {
    fullName: candidate.name,
    currentTitle: candidate.title,
    currentCompany: candidate.company || undefined,
    location: candidate.location,
    summary: candidate.snippet,

    openToWork: otwSignal.status,
    openToWorkEvidence: otwSignal.evidence,
    openToWorkSource: otwSignal.status === "YES" ? `bio_phrase_match:${candidate.provider}` : undefined,

    identities,
    skills,
    certifications,
    provider: WEB_PROVIDER_MAP[candidate.provider],
    profileUrl: candidate.url,
    rawData: candidate,
    experienceYears: candidate.experienceYears,
    educationLevel: candidate.education,
  };
}