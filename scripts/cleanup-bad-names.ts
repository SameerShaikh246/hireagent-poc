import { db } from "../lib/db";
import { isPlausiblePersonName, nameFromLinkedInUrl } from "../lib/normalizer/validateName";

const apply = process.argv.includes("--apply");

async function main() {
    const all = await db.candidate.findMany({
        where: { providerRecords: { some: { provider: { in: ["TAVILY", "EXA", "SERPER"] } } } },
        select: { id: true, fullName: true, identities: { select: { type: true, value: true } } },
    });

    const bad = all.filter((c) => !isPlausiblePersonName(c.fullName, { requireFullName: true }));
    console.log(`${bad.length} of ${all.length} web candidates have an invalid name.`);

    let fixed = 0;
    let removed = 0;

    for (const c of bad) {
        const li = c.identities.find((i) => i.type === "LINKEDIN_URL");
        const recovered = li ? nameFromLinkedInUrl(li.value) : undefined;

        if (recovered) {
            console.log(`FIX    ${c.id}: "${c.fullName}" -> "${recovered}"`);
            if (apply) await db.candidate.update({ where: { id: c.id }, data: { fullName: recovered } });
            fixed++;
        } else {
            console.log(`DELETE ${c.id}: "${c.fullName}"`);
            if (apply) {
                await db.$transaction([
                    db.searchHistory.deleteMany({ where: { candidateId: c.id } }),
                    db.candidateSkill.deleteMany({ where: { candidateId: c.id } }),
                    db.candidateCertification.deleteMany({ where: { candidateId: c.id } }),
                    db.candidateProvider.deleteMany({ where: { candidateId: c.id } }),
                    db.candidateIdentity.deleteMany({ where: { candidateId: c.id } }),
                    db.candidate.delete({ where: { id: c.id } }),
                ]);
            }
            removed++;
        }
    }

    console.log(`${apply ? "Applied" : "Dry run"}: ${fixed} renamed, ${removed} deleted.`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(() => db.$disconnect());