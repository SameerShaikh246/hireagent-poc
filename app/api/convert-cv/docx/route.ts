import { NextRequest, NextResponse } from "next/server";
import { generateSPDocx } from "@/lib/convert-cv/generateSPDocx";
import type { ParsedCV, CandidateOptions } from "@/types";
import path from "path";
import fs from "fs";

let LOGO_BYTES: Uint8Array | null = null;
(function loadLogo() {
  const logoPath = path.join(process.cwd(), "public", "sp_logo.png");
  if (fs.existsSync(logoPath)) {
    LOGO_BYTES = new Uint8Array(fs.readFileSync(logoPath));
  }
})();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed: ParsedCV = body.parsed;
    const options: CandidateOptions = body.options;

    if (!parsed || !options) {
      return NextResponse.json({ error: "Missing parsed CV or options" }, { status: 400 });
    }

    const docxBuffer = await generateSPDocx(parsed, options, LOGO_BYTES);

    return new NextResponse(new Uint8Array(docxBuffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": 'attachment; filename="cv_SP.docx"',
      },
    });
  } catch (err) {
    console.error("DOCX generation error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `DOCX generation failed: ${msg}` }, { status: 500 });
  }
}