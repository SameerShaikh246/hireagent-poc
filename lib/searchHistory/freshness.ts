// ─────────────────────────────────────────────────────────────────────────
// HireAgent — Search History & 30-Day Freshness Rule (Phase 5)
//
// Scoped PER SEARCH CONTEXT (job title + full skill list), not globally —
// a candidate excluded from a "React Developer" search today can still
// surface for an unrelated "Data Analyst" search tomorrow. Two searches
// only share exclusion history if their job title + skill set are
// (near-)identical after normalization.
//
// Flow (see route wiring example at the bottom):
//   1. buildSearchContextHash()  — before querying providers
//   2. filterByFreshness()       — after normalizing + deduping results,
//                                   before returning them to the recruiter
//   3. recordSearchHistory()     — after the response is built, for every
//                                   candidate actually shown (not the ones
//                                   filtered out)
// ─────────────────────────────────────────────────────────────────────────

import { db } from "@/lib/db";
import crypto from "crypto";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Normalizes job title + the full (mandatory + must-have + nice-to-have)
 * skill list into a stable hash. Order-independent (skills are sorted) and
 * case-insensitive, so "React Developer" + [react, aws] hashes identically
 * regardless of which order the skills were entered in, or how they were
 * capitalized.
 */
export function buildSearchContextHash(jobTitle: string, allSkills: string[]): string {
    const normalizedTitle = jobTitle.trim().toLowerCase();
    const normalizedSkills = [...new Set(allSkills.map((s) => s.trim().toLowerCase()))].sort();
    const key = `${normalizedTitle}::${normalizedSkills.join(",")}`;
    return crypto.createHash("sha256").update(key).digest("hex").slice(0, 32);
}

export interface FreshnessResult {
    freshCandidateIds: string[];
    excludedCandidateIds: string[];
}

/**
 * Splits candidateIds into "fresh" (safe to show) and "excluded" (seen for
 * this exact search context within the last 30 days). If freshSearch=true,
 * nothing is excluded — this is the "Fresh Search" override button.
 */
export async function filterByFreshness(
    candidateIds: string[],
    searchContextHash: string,
    freshSearch: boolean,
): Promise<FreshnessResult> {
    if (freshSearch || candidateIds.length === 0) {
        return { freshCandidateIds: candidateIds, excludedCandidateIds: [] };
    }

    const cutoff = new Date(Date.now() - THIRTY_DAYS_MS);
    const recentlySeen = await db.searchHistory.findMany({
        where: {
            candidateId: { in: candidateIds },
            searchContextHash,
            lastSeenAt: { gte: cutoff },
        },
        select: { candidateId: true },
    });

    const excluded = new Set(recentlySeen.map((r) => r.candidateId));
    return {
        freshCandidateIds: candidateIds.filter((id) => !excluded.has(id)),
        excludedCandidateIds: candidateIds.filter((id) => excluded.has(id)),
    };
}

/**
 * Call once per candidate actually shown in a search's results (i.e. after
 * freshness filtering — don't record excluded candidates again, that would
 * just refresh their lastSeenAt without them ever having been re-surfaced).
 * Upserts so re-seeing the same candidate in the same context just bumps
 * lastSeenAt/timesSeen rather than erroring on the unique constraint.
 */
export async function recordSearchHistory(
    candidateIds: string[],
    searchContextHash: string,
    jobTitleSnapshot: string,
): Promise<void> {
    if (candidateIds.length === 0) return;

    // Prisma has no bulk upsert — this stays a loop, but it's cheap (a few
    // dozen candidates max per search) and each write is independent.
    await Promise.all(
        candidateIds.map((candidateId) =>
            db.searchHistory.upsert({
                where: { candidateId_searchContextHash: { candidateId, searchContextHash } },
                update: { lastSeenAt: new Date(), timesSeen: { increment: 1 } },
                create: { candidateId, searchContextHash, jobTitleSnapshot },
            }),
        ),
    );
}

// ─── Example wiring (for reference — not called from here) ────────────────
//
// const allSkills = [...mandatorySkills, ...mustHaveSkills, ...niceToHaveSkills];
// const searchContextHash = buildSearchContextHash(jobTitle, allSkills);
//
// // ... run providers, normalize, upsertCandidate() each result ...
// // candidateIds = the upserted Candidate.id for every result this run
//
// const { freshCandidateIds, excludedCandidateIds } = await filterByFreshness(
//   candidateIds, searchContextHash, body.freshSearch ?? false,
// );
//
// // Build the response using only freshCandidateIds' data.
// // Then, after the response is built:
// await recordSearchHistory(freshCandidateIds, searchContextHash, jobTitle);
//
// // excludedCandidateIds isn't discarded — surface a count in the response,
// // e.g. `suppressedByFreshness: excludedCandidateIds.length`, so the
// // recruiter knows candidates existed but were hidden as "already seen
// // recently," rather than the search silently returning fewer results.