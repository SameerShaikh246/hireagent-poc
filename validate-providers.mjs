/**
 * HireAgent — Provider Field Validation Script (Phase 1)
 * ---------------------------------------------------------
 * Run this LOCALLY (not in the app) with your 5 trial keys to confirm
 * exactly what fields PDL / Tavily / Exa / Serper actually return, so we
 * can build the Prisma schema and normalizer against real data instead
 * of guessing from docs.
 *
 * Usage:
 *   PDL_API_KEY=xxx TAVILY_API_KEY=xxx EXA_API_KEY=xxx SERPER_API_KEY=xxx \
 *   GITHUB_TOKEN=xxx node validate-providers.mjs
 *
 * (GITHUB_TOKEN is optional — raises the rate limit, doesn't require it)
 *
 * Requires Node 18+ (built-in fetch). No npm install needed.
 *
 * IMPORTANT: This only prints field NAMES and value TYPES/samples to the
 * console — it does not write anything to disk or send data anywhere.
 * Review the output before pasting it back for review; redact anything
 * that looks like a real person's PII you don't want shared (name/email/
 * phone are usually fine to redact — we mainly need field *shapes*).
 */
import "dotenv/config";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const SAMPLE_TITLE = "software engineer";
const SAMPLE_SKILLS = ["react", "javascript", "aws"];
const SAMPLE_LOCATION = "India";

function section(title) {
  console.log("\n" + "=".repeat(70));
  console.log(title);
  console.log("=".repeat(70));
}

function inspectFields(label, obj, fieldsOfInterest) {
  console.log(`\n--- ${label}: fields of interest ---`);
  for (const f of fieldsOfInterest) {
    const present = Object.prototype.hasOwnProperty.call(obj ?? {}, f);
    const val = obj?.[f];
    console.log(
      `  ${f.padEnd(28)} present=${String(present).padEnd(6)} type=${typeof val
        }${present ? `  sample=${JSON.stringify(val)?.slice(0, 200)}` : ""}`,
    );
  }
}

async function validatePDL() {
  section("PDL — /v5/person/search");
  const key = process.env.PDL_API_KEY;
  if (!key) return console.log("  SKIPPED — no PDL_API_KEY set");

  const sql = `SELECT * FROM person WHERE location_country = 'india' AND job_title LIKE '%${SAMPLE_TITLE}%'`;
  const res = await fetch("https://api.peopledatalabs.com/v5/person/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Api-Key": key },
    body: JSON.stringify({ sql, size: 1, titlecase: true, dataset: "resume" }),
  });
  const data = await res.json();
  if (!res.ok) return console.log(`  ERROR ${res.status}:`, JSON.stringify(data).slice(0, 500));

  const record = data.data?.[0];
  console.log(`  total=${data.total}, records_returned=${data.data?.length ?? 0}`);
  if (!record) return console.log("  No record returned — try broadening the sample query.");

  // The fields the action-plan doc specifically asked us to confirm:
  inspectFields("PDL record", record, [
    "id",
    "full_name",
    "job_title",
    "job_company_name",
    "linkedin_url",
    "github_url",
    "skills",
    "certifications",              // <- confirm this exists / what shape
    "inferred_salary",             // <- confirm this exists / what shape
    "inferred_years_experience",
    "education",
    "experience",
    "job_last_changed",            // sometimes used as an open-to-work-ish proxy
    "job_last_verified",
  ]);
  console.log("\n  FULL top-level keys on this record:", Object.keys(record).join(", "));
}

async function validateTavily() {
  section("Tavily — /search");
  const key = process.env.TAVILY_API_KEY;
  if (!key) return console.log("  SKIPPED — no TAVILY_API_KEY set");

  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: key,
      query: `site:linkedin.com/in "${SAMPLE_TITLE}" ${SAMPLE_SKILLS.join(" ")} "${SAMPLE_LOCATION}"`,
      search_depth: "advanced",
      max_results: 3,
      include_raw_content: true,
    }),
  });
  const data = await res.json();
  if (!res.ok) return console.log(`  ERROR ${res.status}:`, JSON.stringify(data).slice(0, 500));

  const results = data.results ?? [];
  console.log(`  results_returned=${results.length}`);
  if (!results[0]) return console.log("  No results — try a broader query.");

  console.log("\n  Top-level keys per result:", Object.keys(results[0]).join(", "));
  console.log("\n  Sample raw_content snippet (first 400 chars):");
  console.log("  " + (results[0].raw_content ?? "").slice(0, 400).replace(/\n/g, "\n  "));
  console.log("\n  Does raw_content contain 'open to work' style phrases?",
    /open to work|actively seeking|looking for (a )?new (role|opportunit)/i.test(results[0].raw_content ?? ""));
  console.log("  Does raw_content contain 'certif' mentions?",
    /certif/i.test(results[0].raw_content ?? ""));
}

async function validateExa() {
  section("Exa — /search");
  const key = process.env.EXA_API_KEY;
  if (!key) return console.log("  SKIPPED — no EXA_API_KEY set");

  const res = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key },
    body: JSON.stringify({
      query: `"${SAMPLE_TITLE}" ${SAMPLE_SKILLS.join(" ")} India linkedin`,
      numResults: 3,
      type: "keyword",
      contents: { text: { maxCharacters: 800 } },
    }),
  });
  const data = await res.json();
  if (!res.ok) return console.log(`  ERROR ${res.status}:`, JSON.stringify(data).slice(0, 500));

  const results = data.results ?? [];
  console.log(`  results_returned=${results.length}`);
  if (!results[0]) return console.log("  No results — try a broader query.");

  console.log("\n  Top-level keys per result:", Object.keys(results[0]).join(", "));
  const text = results[0].text ?? "";
  console.log("\n  Sample text snippet (first 400 chars):");
  console.log("  " + text.slice(0, 400).replace(/\n/g, "\n  "));
  console.log("\n  Does text contain 'open to work' style phrases?",
    /open to work|actively seeking|looking for (a )?new (role|opportunit)/i.test(text));
  console.log("  Does text contain 'certif' mentions?", /certif/i.test(text));
}

async function validateSerper() {
  section("Serper — /search");
  const key = process.env.SERPER_API_KEY;
  if (!key) return console.log("  SKIPPED — no SERPER_API_KEY set");

  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      q: `site:linkedin.com/in "${SAMPLE_TITLE}" ${SAMPLE_SKILLS.join(" ")}`,
      num: 3,
      gl: "in",
      hl: "en",
      location: "India",
    }),
  });
  const data = await res.json();
  if (!res.ok) return console.log(`  ERROR ${res.status}:`, JSON.stringify(data).slice(0, 500));

  const results = data.organic ?? [];
  console.log(`  results_returned=${results.length}`);
  if (!results[0]) return console.log("  No results — try a broader query.");

  console.log("\n  Top-level keys per result:", Object.keys(results[0]).join(", "));
  console.log("\n  Sample snippet:", (results[0].snippet ?? "").slice(0, 300));
}

async function validateGitHubProfile() {
  section("GitHub — /users/{login} (sanity check only — no cert/salary/OTW fields exist here)");
  const headers = { Accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  const searchRes = await fetch(
    `https://api.github.com/search/users?q=type:user+location:India+language:javascript+repos:%3E=1&per_page=1`,
    { headers },
  );
  const searchData = await searchRes.json();
  const login = searchData.items?.[0]?.login;
  if (!login) return console.log("  Could not get a sample user — rate limited or no results.");

  const profRes = await fetch(`https://api.github.com/users/${login}`, { headers });
  const profile = await profRes.json();
  if (!profRes.ok) return console.log(`  ERROR ${profRes.status}:`, JSON.stringify(profile).slice(0, 300));

  console.log("  Sample login:", login);
  console.log("  Top-level keys:", Object.keys(profile).join(", "));
  console.log("  (Confirmed: no certifications/salary/open-to-work field exists on this object.)");
}

async function main() {
  await validatePDL();
  await validateTavily();
  await validateExa();
  await validateSerper();
  await validateGitHubProfile();
  console.log("\n\nDone. Paste the output back for schema review.");
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
