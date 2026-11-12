const NON_NAME_WORDS = new Set([
    "resume", "resumes", "cv", "curriculum", "vitae",
    "profile", "portfolio", "linkedin", "github",
    "candidate", "professional", "unknown", "admin",
    "developer", "engineer", "manager", "analyst",
    "consultant", "architect", "designer", "recruiter",
    "frontend", "backend", "fullstack", "software",
    "senior", "junior", "lead", "principal",
    "intern", "freelancer", "freelance",
    "hiring", "jobs", "job", "open", "available",
    "seeking", "opportunity", "career",
    "about", "home", "contact", "website",
    "test", "user", "null", "undefined", "none",
]);

export const UNKNOWN_NAME = "Unknown Candidate";

/** True only when `name` looks like a real person's name (not "Resume", "CV", a job title...). */
export function isPlausiblePersonName(
    name?: string | null
): boolean {
    if (!name) return false;

    const n = name.trim().replace(/\s+/g, " ");

    if (n.length < 2 || n.length > 60) return false;

    if (/[\d@/\\_|:<>#]/.test(n)) return false;

    const words = n.split(" ");

    if (words.length < 2 || words.length > 5) return false;

    if (words.some(word =>
        NON_NAME_WORDS.has(
            word.toLowerCase().replace(/[.,'-]/g, "")
        )
    )) return false;

    // Reject obvious URLs, emails and handle-like values.
    if (/^(https?:|www\.|@)/i.test(n)) return false;

    return true;
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