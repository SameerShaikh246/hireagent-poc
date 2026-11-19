import { db } from "../lib/db";
import { isPlausibleLocation } from "../lib/search/locations";

const apply = process.argv.includes("--apply");

async function main() {
    const rows = await db.candidate.findMany({
        where: {
            location: { not: null },
            providerRecords: { some: { provider: { in: ["TAVILY", "EXA", "SERPER"] } } },
        },
        select: { id: true, location: true },
    });

    const bad = rows.filter((c) => !isPlausibleLocation(c.location));
    bad.slice(0, 30).forEach((c) => console.log(`CLEAR ${c.id}: "${c.location}"`));
    console.log(`${bad.length} of ${rows.length} web candidates have an invalid location.`);

    if (apply && bad.length) {
        await db.candidate.updateMany({
            where: { id: { in: bad.map((c) => c.id) } },
            data: { location: null },
        });
        console.log("Cleared.");
    } else if (!apply) {
        console.log("Dry run only. Pass --apply to clear them.");
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exitCode = 1;
    })
    .finally(() => db.$disconnect());