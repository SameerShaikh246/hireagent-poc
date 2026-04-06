// ─── TEXT NORMALIZER (fixes PDF extraction artifacts) ────────────────────────
function normalizeResumeText(raw: string): string {
  return (
    raw
      // Fix ligatures (common in PDFs)
      .replace(/\uFB01/g, "fi")
      .replace(/\uFB02/g, "fl")
      .replace(/\uFB00/g, "ff")
      .replace(/\uFB03/g, "ffi")
      .replace(/\uFB04/g, "ffl")

      // Fix camelCase merged words e.g. "ReactJS" -> "React JS"
      .replace(/([a-z])([A-Z])/g, "$1 $2")

      // Collapse multiple spaces/tabs to single space
      .replace(/[ \t]{2,}/g, " ")

      // Fix single-letter lines caused by PDF column breaks
      .replace(/\n([A-Za-z])\n/g, " $1 ")

      // Normalize line endings
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")

      // Remove lines that are just punctuation/numbers (page numbers, dividers)
      .replace(/^\s*[\d\-\u2013\u2014|•·]+\s*$/gm, "")

      // Collapse 3+ newlines to 2
      .replace(/\n{3,}/g, "\n\n")

      .trim()
  );
}
export default normalizeResumeText;