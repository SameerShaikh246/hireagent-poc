const LOCATION_ALIASES: string[][] = [
  ["bengaluru", "bangalore"],
  ["gurugram", "gurgaon"],
  ["mumbai", "bombay"],
  ["chennai", "madras"],
  ["kolkata", "calcutta"],
  ["delhi", "new delhi"],
];

/** Trim, dedupe, strip quote characters (they would break SQL/search queries), max 5. */
export function cleanLocations(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return [
    ...new Set(
      input
        .map((l) => String(l).replace(/["'\\]/g, "").trim())
        .filter((l) => l.length >= 2 && l.length <= 60),
    ),
  ].slice(0, 5);
}

/** "Bengaluru" -> ["bengaluru", "bangalore"] */
export function expandLocation(loc: string): string[] {
  const l = loc.toLowerCase().trim();
  return LOCATION_ALIASES.find((g) => g.includes(l)) ?? [l];
}

export function expandLocations(locs: string[]): string[] {
  return [...new Set(locs.flatMap(expandLocation))];
}