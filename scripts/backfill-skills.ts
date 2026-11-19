import { db } from "../lib/db";
import { extractAllSkills } from "../lib/skills/skillCatalog";

const apply = process.argv.includes("--apply");
const BATCH = 300;

async function main() {
    let cursor: string | undefined;
    let scanned = 0;
    let added = 0;
    const touched = new Set<string>();

    while (true) {
        const rows = await db.candidateProvider.findMany({
            where: { provider: { in: ["TAVILY", "EXA", "SERPER", "GITHUB"] } },
            select: { id: true, candidateId: true, provider: true, rawData: true },
            orderBy: { id: "asc" },
            take: BATCH,
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
        if (!rows.length) break;
        cursor = rows[rows.length - 1].id;
        scanned += rows.length;

        const found = new Map<string, { candidateId: string; skill: string }>();
        for (const r of rows) {
            const raw = (r.rawData ?? {}) as Record<string, unknown>;
            const text =
                r.provider === "GITHUB"
                    ? `${raw.bio ?? ""} ${raw.company ?? ""}`
                    : `${raw.rawTitle ?? ""}\n${raw.rawSnippet ?? ""}\n${raw.snippet ?? ""}`;
            for (const skill of extractAllSkills(text)) {
                found.set(`${r.candidateId}|${skill}`, { candidateId: r.candidateId, skill });
            }
        }

        const existing = await db.candidateSkill.findMany({
            where: { candidateId: { in: [...new Set(rows.map((r) => r.candidateId))] } },
            select: { candidateId: true, skill: true },
        });
        const have = new Set(existing.map((e) => `${e.candidateId}|${e.skill}`));
        const missing = [...found.entries()].filter(([k]) => !have.has(k)).map(([, v]) => v);

        missing.forEach((m) => touched.add(m.candidateId));
        added += missing.length;

        if (apply && missing.length) {
            await db.candidateSkill.createMany({
                data: missing.map((m) => ({ ...m, source: "BIO_EXTRACTED" as const })),
                skipDuplicates: true,
            });
        }
    }

    console.log(
        `${apply ? "Applied" : "Dry run"}: scanned ${scanned} provider records, ` +
        `${added} skills ${apply ? "added" : "would be added"} for ${touched.size} candidates.`,
    );
}

main()
    .catch((e) => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(() => db.$disconnect());