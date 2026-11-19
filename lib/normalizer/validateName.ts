const NON_NAME_WORDS = new Set([
    "resume", "resumes", "cv", "curriculum", "vitae", "profile", "profiles", "portfolio",
    "linkedin", "github", "unknown", "candidate", "professional", "user", "admin", "test",
    "developer", "engineer", "manager", "analyst", "consultant", "freelancer", "freelance",
    "software", "hiring", "jobs", "job", "about", "home", "contact", "page", "website",
    "na", "none", "null", "undefined",
    // seniority / role words
    "sr", "jr", "senior", "junior", "lead", "principal", "staff", "associate", "intern",
    "trainee", "fresher", "architect", "specialist", "designer", "programmer", "tester",
    "scientist", "sde", "sdet", "qa", "ui", "ux", "devops", "data", "cloud",
    // stack words
    "front", "frontend", "back", "backend", "full", "fullstack", "stack", "end", "web",
    "mobile", "react", "reactjs", "angular", "vue", "node", "nodejs", "java", "python",
    "javascript", "typescript", "net",
    // file / listing words
    "pdf", "doc", "docx", "database",
]);

export const UNKNOWN_NAME = "Unknown Candidate";

export function isPlausiblePersonName(
    name?: string | null,
    opts: { requireFullName?: boolean } = {},
): boolean {
    if (!name) return false;
    const n = name.trim();
    if (n.length < 2 || n.length > 60) return false;
    if (/[\d@/\\_|:<>]/.test(n)) return false;
    const words = n.split(/\s+/);
    if (words.length > 5) return false;
    if (opts.requireFullName && words.length < 2) return false;
    // split on spaces, hyphens and dots so "Front-End" and "Sr." are caught too
    const tokens = n.toLowerCase().split(/[\s\-.,]+/).filter(Boolean);
    return !tokens.some((t) => NON_NAME_WORDS.has(t));
}

/** linkedin.com/in/rahul-sharma-12a3b4c5 -> "Rahul Sharma" (only when it looks like a human name). */
export function nameFromLinkedInUrl(url: string): string | undefined {
    const m = url.toLowerCase().match(/linkedin\.com\/in\/([^/?#]+)/);
    if (!m) return undefined;
    let slug = m[1];
    try { slug = decodeURIComponent(slug); } catch { /* keep raw */ }
    const parts = slug
        .split("-")
        .filter((p) => /^[a-z]+$/.test(p) && p.length > 1); // drops numeric / hash suffixes
    if (parts.length < 2 || parts.length > 4) return undefined;
    const name = parts.map((p) => p[0].toUpperCase() + p.slice(1)).join(" ");
    return isPlausiblePersonName(name) ? name : undefined;
}