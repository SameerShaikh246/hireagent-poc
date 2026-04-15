export default function normalizeResumeText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]{3,}/g, "  ")
    .replace(/\n{4,}/g, "\n\n\n")
    .replace(/[^\x20-\x7E\n\t\u00C0-\u024F\u2010-\u2027\u2030-\u205E]/g, " ")
    .replace(/ﬁ/g, "fi")
    .replace(/ﬂ/g, "fl")
    .replace(/ﬀ/g, "ff")
    .replace(/ﬃ/g, "ffi")
    .replace(/ﬄ/g, "ffl")
    .trim();
}