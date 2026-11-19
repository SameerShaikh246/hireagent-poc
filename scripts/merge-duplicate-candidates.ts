import { db } from "../lib/db";
import { normalizeProfileUrl } from "../lib/normalizer/normalizeCandidate";

const apply = process.argv.includes("--apply");

async function main() {
    const rows = await db.candidateProvider.findMany({
        where: { profileUrl: { not: null } },
        select: { candidateId: true, profileUrl: true },
    });

    const groups = new Map<string, Set<string>>();
    for (const r of rows) {
        const key = normalizeProfileUrl(r.profileUrl!);
        if (!key) continue;
        groups.set(key, (groups.get(key) ?? new Set()).add(r.candidateId));
    }

    let merged = 0;
    let failed = 0;

    for (const [url, idSet] of groups) {
        if (idSet.size < 2) continue;

        const cands = await db.candidate.findMany({
            where: { id: { in: [...idSet] } },
            orderBy: [{ profileTrustScore: "desc" }, { lastSeenAt: "desc" }],
            select: { id: true, fullName: true },
        });
        if (cands.length < 2) continue;

        const [keeper, ...dups] = cands;
        const dupIds = dups.map((d) => d.id);
        console.log(`MERGE ${url}: keep ${keeper.id} ("${keeper.fullName}"), remove ${dups.length}`);
        if (!apply) {
            merged += dups.length;
            continue;
        }

        try {
            await db.$transaction(
                async (tx) => {
                    // Skills: copy to keeper (skip ones it already has), then remove from duplicates.
                    const skills = await tx.candidateSkill.findMany({ where: { candidateId: { in: dupIds } } });
                    if (skills.length) {
                        await tx.candidateSkill.createMany({
                            data: skills.map((s) => ({
                                candidateId: keeper.id,
                                skill: s.skill,
                                source: s.source,
                                confidence: s.confidence,
                            })),
                            skipDuplicates: true,
                        });
                    }
                    await tx.candidateSkill.deleteMany({ where: { candidateId: { in: dupIds } } });

                    // Search history: same approach.
                    const hist = await tx.searchHistory.findMany({ where: { candidateId: { in: dupIds } } });
                    if (hist.length) {
                        await tx.searchHistory.createMany({
                            data: hist.map((h) => ({
                                candidateId: keeper.id,
                                searchContextHash: h.searchContextHash,
                                jobTitleSnapshot: h.jobTitleSnapshot,
                                lastSeenAt: h.lastSeenAt,
                                timesSeen: h.timesSeen,
                            })),
                            skipDuplicates: true,
                        });
                    }
                    await tx.searchHistory.deleteMany({ where: { candidateId: { in: dupIds } } });

                    // Move the rest onto the keeper.
                    await tx.candidateCertification.updateMany({ where: { candidateId: { in: dupIds } }, data: { candidateId: keeper.id } });
                    await tx.candidateProvider.updateMany({ where: { candidateId: { in: dupIds } }, data: { candidateId: keeper.id } });
                    await tx.candidateIdentity.updateMany({ where: { candidateId: { in: dupIds } }, data: { candidateId: keeper.id } });
                    await tx.candidate.deleteMany({ where: { id: { in: dupIds } } });

                    // Make sure the keeper owns the URL identity so future hits merge into it.
                    await tx.candidateIdentity.upsert({
                        where: { type_value: { type: "PORTFOLIO_URL", value: url } },
                        update: {},
                        create: { type: "PORTFOLIO_URL", value: url, candidateId: keeper.id },
                    });
                },
                { maxWait: 20_000, timeout: 120_000 },
            );
            merged += dups.length;
        } catch (e) {
            failed++;
            console.error(`FAILED ${url}:`, e instanceof Error ? e.message.split("\n").pop() : e);
        }
    }

    console.log(
        `${apply ? "Applied" : "Dry run"}: ${merged} duplicate rows ${apply ? "merged" : "would be merged"}` +
        (failed ? `, ${failed} group(s) failed (re-run to retry them).` : "."),
    );
}

main()
    .catch((e) => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(() => db.$disconnect());