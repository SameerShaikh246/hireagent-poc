import { educationRank } from "@/lib/filters/applyCandidateFilters";

export function parseExperienceYears(text: string): number | undefined {
  const m = text.match(/Experience:\s*(?:(\d+)\s*years?)?\s*(?:(\d+)\s*months?)?/i);
  if (!m || (!m[1] && !m[2])) return undefined;
  const total = Number(m[1] ?? 0) + Number(m[2] ?? 0) / 12;
  return total > 0 && total < 60 ? Math.round(total) : undefined;
}

const DEGREE_RE =
  /\b(ph\.?d|doctorate|master(?:'?s)?(?: of [a-z]+)?|mba|m\.?tech|m\.?sc|mca|bachelor(?:'?s)?(?: of [a-z]+)?|b\.?tech|b\.?e|b\.?sc|bca|b\.?com|diploma|associate)\b/gi;

// Highest degree found inside the "## Education" section only.
export function parseEducation(text: string): string | undefined {
  const sec = text.match(/##\s*Education\s*\n+([\s\S]*?)(?=\n##\s|\[\.\.\.\]|$)/i);
  if (!sec) return undefined;
  let best: string | undefined;
  let bestRank = 0;
  for (const line of sec[1].split("\n")) {
    for (const m of line.matchAll(DEGREE_RE)) {
      const r = educationRank(m[0]);
      if (r > bestRank) { bestRank = r; best = m[0].trim(); }
    }
  }
  return best;
}