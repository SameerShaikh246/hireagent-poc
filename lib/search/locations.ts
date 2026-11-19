const LOCATION_ALIASES: string[][] = [
  ["bengaluru", "bangalore"],
  ["gurugram", "gurgaon"],
  ["mumbai", "bombay"],
  ["chennai", "madras"],
  ["kolkata", "calcutta"],
  ["delhi", "new delhi"],
];

/** "Bengaluru" -> ["bengaluru", "bangalore"] */
export function expandLocation(loc: string): string[] {
  const l = loc.toLowerCase().trim();
  return LOCATION_ALIASES.find((g) => g.includes(l)) ?? [l];
}

export function expandLocations(locs: string[]): string[] {
  return [...new Set(locs.flatMap(expandLocation))];
}

const KNOWN_CITIES =
  "Bengaluru|Bangalore|Hyderabad|Pune|Chennai|Mumbai|Delhi|New Delhi|Noida|Gurugram|Gurgaon|Kolkata|Ahmedabad|Jaipur|Indore|Kochi|Coimbatore|Chandigarh|Nagpur|Surat|Thane";

const CITY_RE = new RegExp(
  `(?<![A-Za-z])(${KNOWN_CITIES})\\b((?:,\\s*[A-Z][a-z]+(?:\\s[A-Z][a-z]+)?){0,2})`,
);
const INDIA_RE =
  /(?<![A-Za-z])([A-Z][a-z]+(?:\s[A-Z][a-z]+)*(?:,\s*[A-Z][a-z]+(?:\s[A-Z][a-z]+)*)*,\s*India)\b/;

/** Pulls a real location out of free text, or undefined. */
export function extractLocationFromText(text: string): string | undefined {
  const city = text.match(CITY_RE);
  if (city) return `${city[1]}${city[2]}`.slice(0, 50);
  return text.match(INDIA_RE)?.[1]?.slice(0, 50);
}

/** True only for a known city or a "..., India" value. Rejects "Script, React", "Assistant, Dean". */
export function isPlausibleLocation(loc?: string | null): boolean {
  if (!loc) return false;
  const l = loc.trim();
  if (l.length < 3 || l.length > 60 || /\d/.test(l)) return false;
  return CITY_RE.test(l) || /(^|,\s*)India$/i.test(l);
}


const LOCATION_TYPOS: Record<string, string> = {
  hydrabad: "Hyderabad", hyderbad: "Hyderabad", hydrebad: "Hyderabad", hyd: "Hyderabad",
  banglore: "Bengaluru", bangalor: "Bengaluru", bengalore: "Bengaluru", bangalore: "Bengaluru", blr: "Bengaluru",
  poona: "Pune", chenai: "Chennai", madras: "Chennai",
  bombay: "Mumbai", mumbay: "Mumbai",
  gurgaon: "Gurugram", gurgoan: "Gurugram",
  calcutta: "Kolkata", kolkatta: "Kolkata",
  "new delhi": "Delhi",
};

// Not cities: never treated as a location filter.
const IGNORED_LOCATIONS = new Set([
  "remote", "hybrid", "onsite", "on site", "anywhere", "any", "all", "india", "pan india",
  "wfh", "work from home", "flexible", "tbd", "na", "n/a",
]);

function canonicalizeLocation(raw: string): string {
  const l = raw.toLowerCase().trim();
  return LOCATION_TYPOS[l] ?? l.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/** Trim, fix typos, drop non-cities, dedupe, strip quote characters, max 5. */
export function cleanLocations(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return [
    ...new Set(
      input
        .map((l) => String(l).replace(/["'\\]/g, "").replace(/\(.*?\)/g, "").trim())
        .filter((l) => l.length >= 2 && l.length <= 60 && !IGNORED_LOCATIONS.has(l.toLowerCase()))
        .map(canonicalizeLocation),
    ),
  ].slice(0, 5);
}

/**
 * Fallback when the model misses it: reads an explicit "Location" / "Required location" /
 * "Preferred location" / "Work location" / "Based in" section from the JD text.
 */
export function extractLocationsFromJD(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const LABEL =
    /^\s*[-•*]?\s*(?:required\s+|preferred\s+|job\s+|work\s+|office\s+)?(?:locations?|based\s+in)\s*[:\-–—]?\s*(.*)$/i;
  const HEADING = /^[A-Z][A-Z &/()-]{3,}$/; // e.g. "EXPERIENCE", "REQUIRED SKILLS"
  const found: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(LABEL);
    if (!m) continue;

    let value = m[1].trim();
    // Value on the following lines: "REQUIRED LOCATION\n• Pune\n• Hyderabad"
    for (let j = i + 1; !value.length || (j < lines.length && j < i + 6); j++) {
      const next = lines[j]?.trim();
      if (next === undefined || next === "" || HEADING.test(next)) break;
      value += `,${next}`;
    }

    found.push(
      ...value
        .replace(/^[,\s]+/, "")
        .split(/[,/;|&\n•*]+|\band\b|\bor\b/i)
        .map((s) => s.replace(/^[-–—\s]+/, "").trim())
        .filter(Boolean),
    );
  }
  return cleanLocations(found);
}