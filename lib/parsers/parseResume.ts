import type { ParsedResume } from "@/types";
import normalizeResumeText from "./normalizeText";
import crypto from "crypto";

function hashContent(text: string): string {
  return crypto.createHash("sha256").update(text.trim().toLowerCase()).digest("hex").slice(0, 16);
}

async function parseAgent(file: File): Promise<ParsedResume> {
  const name = file.name.toLowerCase();

  if (name.endsWith(".txt")) {
    const text = await file.text();
    const normalized = normalizeResumeText(text);
    return {
      fileName: file.name,
      rawText: normalized,
      parseMethod: "plain-text",
      contentHash: hashContent(normalized),
    };
  }

  if (name.endsWith(".pdf")) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const { extractText } = await import("unpdf");
      const { text } = await extractText(new Uint8Array(arrayBuffer), { mergePages: true });
      const normalized = normalizeResumeText(text);
      return {
        fileName: file.name,
        rawText: normalized,
        parseMethod: "unpdf",
        contentHash: hashContent(normalized),
      };
      } catch (unpdfErr) {
      console.warn("unpdf failed, falling back to pdf-parse:", unpdfErr);
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const pdfParseModule = await import("pdf-parse");
      const pdfParse = (pdfParseModule as any).default || pdfParseModule;
      const result = await pdfParse(buffer);
      const normalized = normalizeResumeText(result.text);
      return {
        fileName: file.name,
        rawText: normalized,
        parseMethod: "pdf-parse-fallback",
        contentHash: hashContent(normalized),
      };
    } catch {
      return {
        fileName: file.name,
        rawText: "[PDF parse failed - scanned or encrypted]",
        parseMethod: "failed",
        contentHash: hashContent(file.name),
      };
    }
  }

  if (name.endsWith(".docx")) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      const normalized = normalizeResumeText(result.value);
      return {
        fileName: file.name,
        rawText: normalized,
        parseMethod: "mammoth",
        contentHash: hashContent(normalized),
      };
    } catch {
      return {
        fileName: file.name,
        rawText: "[DOCX parse failed]",
        parseMethod: "failed",
        contentHash: hashContent(file.name),
      };
    }
  }

  return {
    fileName: file.name,
    rawText: "",
    parseMethod: "unsupported",
    contentHash: hashContent(file.name),
  };
}

export default parseAgent;