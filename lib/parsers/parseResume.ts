import { ParsedResume } from "@/types";
import normalizeResumeText from "./normalizeText";

// ─── PARSE AGENT ─────────────────────────────────────────────────────────────
async function parseAgent(file: File): Promise<ParsedResume> {
  const name = file.name.toLocaleLowerCase();

  if (name.endsWith(".txt")) {
    const text = await file.text(); 

    return {
      fileName: file.name,
      rawText: normalizeResumeText(text),
      parseMethod: "plain-text",
    };
  }

  if (name.endsWith(".pdf")) {
    // Primary: unpdf (handles multi-column layouts and ligatures better than pdf-parse)
    try {
      const arrayBuffer = await file.arrayBuffer();
      const { extractText } = await import("unpdf");
      const { text } = await extractText(new Uint8Array(arrayBuffer), {
        mergePages: true,
      });
      return {
        fileName: file.name,
        rawText: normalizeResumeText(text),
        parseMethod: "unpdf",
      };
    } catch (unpdfErr) {
      console.warn("unpdf failed, falling back to pdf-parse:", unpdfErr);
    }

    // Fallback: pdf-parse
    try {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const pdfParseModule = await import("pdf-parse");
      const pdfParse = (pdfParseModule as any).default || pdfParseModule;
      const result = await pdfParse(buffer);
      return {
        fileName: file.name,
        rawText: normalizeResumeText(result.text),
        parseMethod: "pdf-parse-fallback",
      };
    } catch {
      return {
        fileName: file.name,
        rawText: "[PDF parse failed - scanned or encrypted]",
        parseMethod: "ai-fallback",
      };
    }
  }

  if (name.endsWith(".docx")) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      return {
        fileName: file.name,
        rawText: normalizeResumeText(result.value),
        parseMethod: "mammoth",
      };
    } catch {
      return {
        fileName: file.name,
        rawText: "[DOCX parse failed]",
        parseMethod: "ai-fallback",
      };
    }
  }

  return { fileName: file.name, rawText: "", parseMethod: "ai-fallback" };
}
export default parseAgent;