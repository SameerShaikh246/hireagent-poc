// ─────────────────────────────────────────────────────────────────────────
// HireAgent — Candidate Deduplication & Persistence (Phase 4)
//
// Takes a NormalizedCandidate (from lib/normalizer/normalizeCandidate.ts)
// and either merges it into an existing Candidate row or creates a new one.
//
// Dedup strategy: check each identity on the incoming result against
// CandidateIdentity, in IDENTITY_PRIORITY order (PDL_ID/GITHUB_LOGIN >
// LINKEDIN_URL > GITHUB_URL > PORTFOLIO_URL > EMAIL_HASH > NAME_COMPANY).
// First match wins. This means: if a Tavily result's LinkedIn URL matches
// a candidate PDL already found, they merge into ONE Candidate row instead
// of appearing as two separate people in results.
// ─────────────────────────────────────────────────────────────────────────

import { db } from "@/lib/db";
import {
    NormalizedCandidate,
    IDENTITY_PRIORITY,
    Provider,
    OpenToWorkStatus,
} from "@/lib/normalizer/normalizeCandidate";

// Higher = more trustworthy for OVERWRITING core profile fields.
// PDL: structured, verified records.
// GitHub: fields are at minimum self-reported by the actual account owner.
// Tavily/Exa: scraped profile text, cleaned by Groq — Tavily/Exa both return
// a full "About" section (confirmed during validation), so treated equally.
// Serper: confirmed to return only a short snippet, no full profile text —
// lowest trust of the three web-search providers.
const PROVIDER_TRUST: Record<Provider, number> = {
    PDL: 4,
    GITHUB: 3,
    TAVILY: 2,
    EXA: 2,
    SERPER: 1,
    INTERNAL_DB: 0, // re-reading our own DB isn't a new signal, never overwrites anything
};

// Open-to-Work signal strength — independent of provider trust above. An
// explicit field (GitHub's `hireable`) always beats an inferred bio phrase,
// regardless of which provider found it.
function otwSignalStrength(source?: string | null): number {
    if (!source) return 0;
    if (source.includes("hireable_field")) return 2;
    if (source.includes("bio_phrase_match")) return 1;
    return 0;
}

export interface UpsertResult {
    candidateId: string;
    isNew: boolean;
}

export async function upsertCandidate(normalized: NormalizedCandidate): Promise<UpsertResult> {
    const incomingTrust = PROVIDER_TRUST[normalized.provider];
    const existingCandidateId = await findExistingCandidateId(normalized);

    let candidateId: string;
    let isNew = false;

    if (existingCandidateId) {
        candidateId = existingCandidateId;
        const existing = await db.candidate.findUniqueOrThrow({
            where: { id: candidateId },
            select: { profileTrustScore: true, openToWork: true, openToWorkSource: true },
        });
        await db.candidate.update({
            where: { id: candidateId },
            data: buildMergeUpdate(normalized, existing, incomingTrust),
        });
    } else {
        const created = await db.candidate.create({ data: buildCreateData(normalized, incomingTrust) });
        candidateId = created.id;
        isNew = true;
    }

    // Link every identity found on this result — harmless even if the
    // candidate already has a stronger identity type recorded, since it's
    // just additional evidence pointing at the same row.
    for (const identity of normalized.identities) {
        await db.candidateIdentity.upsert({
            where: { type_value: { type: identity.type, value: identity.value } },
            update: {},
            create: { type: identity.type, value: identity.value, candidateId },
        });
    }

    for (const skill of normalized.skills) {
        await db.candidateSkill.upsert({
            where: { candidateId_skill: { candidateId, skill: skill.skill } },
            update: { source: skill.source, confidence: skill.confidence },
            create: { candidateId, skill: skill.skill, source: skill.source, confidence: skill.confidence },
        });
    }

    for (const cert of normalized.certifications) {
        // No natural unique key for certifications (name alone can collide
        // across genuinely different certs), so de-dupe by exact name match
        // per candidate rather than a DB constraint.
        const exists = await db.candidateCertification.findFirst({
            where: { candidateId, name: cert.name },
            select: { id: true },
        });
        if (!exists) {
            await db.candidateCertification.create({
                data: {
                    candidateId,
                    name: cert.name,
                    issuer: cert.issuer,
                    source: cert.source,
                    sourceUrl: cert.sourceUrl,
                    confidence: cert.confidence,
                },
            });
        }
    }

    // Always record the raw payload for this provider hit — full audit trail,
    // and lets Phase 6 re-process without re-calling the provider API.
    await db.candidateProvider.create({
        data: {
            candidateId,
            provider: normalized.provider,
            providerCandidateId: normalized.providerCandidateId,
            profileUrl: normalized.profileUrl,
            rawData: normalized.rawData as object,
        },
    });

    return { candidateId, isNew };
}

async function findExistingCandidateId(normalized: NormalizedCandidate): Promise<string | null> {
    for (const type of IDENTITY_PRIORITY) {
        const identity = normalized.identities.find((i) => i.type === type);
        if (!identity) continue;
        const found = await db.candidateIdentity.findUnique({
            where: { type_value: { type, value: identity.value } },
            select: { candidateId: true },
        });
        if (found) return found.candidateId;
    }
    return null;
}

function buildCreateData(normalized: NormalizedCandidate, trust: number) {
    return {
        fullName: normalized.fullName,
        currentTitle: normalized.currentTitle,
        currentCompany: normalized.currentCompany,
        location: normalized.location,
        summary: normalized.summary,
        experienceYears: normalized.experienceYears,
        educationLevel: normalized.educationLevel,
        estimatedSalaryMin: normalized.estimatedSalaryMin,
        estimatedSalaryMax: normalized.estimatedSalaryMax,
        estimatedSalaryCurrency: normalized.estimatedSalaryCurrency,
        salarySource: normalized.salarySource,
        openToWork: normalized.openToWork,
        openToWorkEvidence: normalized.openToWorkEvidence,
        openToWorkSource: normalized.openToWorkSource,
        profileTrustScore: trust,
    };
}

function buildMergeUpdate(
    normalized: NormalizedCandidate,
    existing: { profileTrustScore: number; openToWork: OpenToWorkStatus; openToWorkSource: string | null },
    incomingTrust: number,
) {
    const data: Record<string, unknown> = { lastSeenAt: new Date() };

    // Core descriptive fields: only overwrite when this result is at least as
    // trustworthy as whatever currently owns them.
    if (incomingTrust >= existing.profileTrustScore) {
        if (normalized.fullName) data.fullName = normalized.fullName;
        if (normalized.currentTitle) data.currentTitle = normalized.currentTitle;
        if (normalized.currentCompany) data.currentCompany = normalized.currentCompany;
        if (normalized.location) data.location = normalized.location;
        if (normalized.summary) data.summary = normalized.summary;
        if (normalized.experienceYears !== undefined) data.experienceYears = normalized.experienceYears;
        if (normalized.educationLevel) data.educationLevel = normalized.educationLevel;
        data.profileTrustScore = Math.max(incomingTrust, existing.profileTrustScore);
    }

    // Salary — PDL-only field today; always safe to take the newer value
    // when present, since only one provider can ever populate it.
    if (normalized.estimatedSalaryMin !== undefined) {
        data.estimatedSalaryMin = normalized.estimatedSalaryMin;
        data.estimatedSalaryMax = normalized.estimatedSalaryMax;
        data.estimatedSalaryCurrency = normalized.estimatedSalaryCurrency;
        data.salarySource = normalized.salarySource;
    }

    // Open to Work — only overwrite when the new signal is at least as strong
    // as the existing one. Never silently downgrade a known YES/NO back to
    // UNKNOWN just because a weaker-signal provider found nothing.
    const incomingStrength = otwSignalStrength(normalized.openToWorkSource);
    const existingStrength = otwSignalStrength(existing.openToWorkSource);
    if (normalized.openToWork !== "UNKNOWN" && incomingStrength >= existingStrength) {
        data.openToWork = normalized.openToWork;
        data.openToWorkEvidence = normalized.openToWorkEvidence;
        data.openToWorkSource = normalized.openToWorkSource;
    }

    return data;
}