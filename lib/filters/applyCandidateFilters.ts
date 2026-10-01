// ─────────────────────────────────────────────────────────────────────────
// HireAgent — Candidate Result Filters
//
// Pure function: takes any list of result candidates (PDL, GitHub, web
// search, or internal DB — they all share the WebCandidate shape) and
// applies recruiter-selected filters. No DB or network calls.
//
// Missing-data policy: many web-sourced candidates have no experienceYears
// or education. By default a candidate with UNKNOWN data is excluded when
// the matching filter is active (a "min 3 years" filter shouldn't quietly
// let through people whose experience we simply don't know). Set
// includeUnknown: true to keep them instead.
// ─────────────────────────────────────────────────────────────────────────

export type EducationLevel = "any" | "diploma" | "bachelor" | "master" | "phd";

export interface CandidateFilters {
    /** Candidate must have ALL of these skills in matchedSkills. */
    skills?: string[];
    minScore?: number;
    maxScore?: number;
    /** Minimum education level. */
    education?: EducationLevel;
    minExperience?: number;
    maxExperience?: number;
    /** Keep candidates whose experience/education is unknown. Default false. */
    includeUnknown?: boolean;
}

interface FilterableCandidate {
    matchedSkills: string[];
    relevanceScore: number;
    experienceYears?: number;
    education?: string;
}

const EDUCATION_RANK: Record<Exclude<EducationLevel, "any">, number> = {
    diploma: 1,
    bachelor: 3,
    master: 4,
    phd: 5,
};

// Free-text degree -> rank. Handles PDL-style ("Bachelors", "Masters") and
// common resume/profile spellings. Returns 0 when nothing recognizable.
export function educationRank(text?: string): number {
    if (!text) return 0;
    const t = text.toLowerCase();
    if (/(phd|ph\.d|doctor)/.test(t)) return 5;
    if (/(master|mba|m\.?tech|m\.?sc|m\.?e\b|mca)/.test(t)) return 4;
    if (/(bachelor|b\.?tech|b\.?sc|b\.?e\b|bca|b\.?com|undergrad)/.test(t)) return 3;
    if (/associate/.test(t)) return 2;
    if (/diploma/.test(t)) return 1;
    return 0;
}

export function applyCandidateFilters<T extends FilterableCandidate>(
    candidates: T[],
    filters: CandidateFilters | undefined,
    canonicalize: (skill: string) => string,
): { candidates: T[]; removed: number } {
    if (!filters) return { candidates, removed: 0 };

    const requiredSkills = (filters.skills ?? []).map(canonicalize);
    const includeUnknown = filters.includeUnknown ?? false;
    const minEduRank =
        filters.education && filters.education !== "any" ? EDUCATION_RANK[filters.education] : 0;
    const hasExperienceFilter = filters.minExperience !== undefined || filters.maxExperience !== undefined;

    const kept = candidates.filter((c) => {
        // Skills — must contain every selected skill.
        if (requiredSkills.length > 0) {
            const have = new Set(c.matchedSkills.map(canonicalize));
            if (!requiredSkills.every((s) => have.has(s))) return false;
        }

        // Skill score range.
        if (filters.minScore !== undefined && c.relevanceScore < filters.minScore) return false;
        if (filters.maxScore !== undefined && c.relevanceScore > filters.maxScore) return false;

        // Education (minimum level).
        if (minEduRank > 0) {
            const rank = educationRank(c.education);
            if (rank === 0) {
                if (!includeUnknown) return false;
            } else if (rank < minEduRank) {
                return false;
            }
        }

        // Experience range.
        if (hasExperienceFilter) {
            if (c.experienceYears === undefined) {
                if (!includeUnknown) return false;
            } else {
                if (filters.minExperience !== undefined && c.experienceYears < filters.minExperience) return false;
                if (filters.maxExperience !== undefined && c.experienceYears > filters.maxExperience) return false;
            }
        }

        return true;
    });

    return { candidates: kept, removed: candidates.length - kept.length };
}