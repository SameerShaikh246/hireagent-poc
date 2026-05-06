import {
  PDFDocument,
  PDFFont,
  PDFPage,
  rgb,
  RGB,
  StandardFonts,
  PageSizes,
} from "pdf-lib";
import type { ParsedCV } from "@/types";

// SP brand constants (measured from reference PDF)
const PAGE_W = 612; // US Letter width in pts (matches reference PDF)
const PAGE_H = 792; // US Letter height in pts

const MARGIN_L = 70.824;
const MARGIN_R = 70.824;
const MARGIN_T = 50;
const MARGIN_B = 50;

const CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R; // ~470 pts

// Colors from pdfplumber extraction of reference PDF
const COLOR_TAN = rgb(0.988, 0.898, 0.804); // section header background
const COLOR_BLUE = rgb(0.0196, 0.388, 0.757); // email address
const COLOR_BLACK = rgb(0, 0, 0);
const COLOR_GRAY = rgb(0.8, 0.8, 0.8); // inner grid lines

// Col widths for 2-column project table
// "Project Name" label col + content col
const COL1_W = 90;
const COL2_W = CONTENT_W - COL1_W;

// Font sizes
const SIZE_NAME = 18;
const SIZE_CONTACT = 11;
const SIZE_SECTION = 10;
const SIZE_BODY = 10;

// Line heights
const LH_NAME = 26;
const LH_CONTACT = 16;
const LH_BODY = 14;

// SP logo (loaded via setLogoPng from route handler)
let LOGO_BYTES: Uint8Array | null = null;

export function setLogoPng(bytes: Uint8Array) {
  LOGO_BYTES = bytes;
}

// Text wrapping
function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    const w = font.widthOfTextAtSize(test, size);
    if (w > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// Canvas state
type Ctx = {
  doc: PDFDocument;
  pages: PDFPage[];
  page: PDFPage;
  y: number; // current Y cursor (descends)
  fontN: PDFFont; // normal
  fontB: PDFFont; // bold
};

function newPage(ctx: Ctx): void {
  const page = ctx.doc.addPage([PAGE_W, PAGE_H]);
  ctx.pages.push(page);
  ctx.page = page;
  ctx.y = PAGE_H - MARGIN_T;
}

function ensureSpace(ctx: Ctx, needed: number): void {
  if (ctx.y - needed < MARGIN_B + 20) {
    newPage(ctx);
  }
}

// Draw logo top-right
async function drawLogo(ctx: Ctx, page: PDFPage): Promise<void> {
  if (!LOGO_BYTES) return;
  try {
    const img = await ctx.doc.embedPng(LOGO_BYTES);
    const logoW = 138;
    const logoH = 26; // aspect ratio ~5.4:1 for 382x71 source
    const x = PAGE_W - MARGIN_R - logoW;
    // Position near top — reference shows logo at very top of page
    const y = PAGE_H - 30;
    page.drawImage(img, { x, y, width: logoW, height: logoH });
  } catch (e) {
    // Fallback: text placeholder
    page.drawText("SoftProdigy", {
      x: PAGE_W - MARGIN_R - 80,
      y: PAGE_H - 28,
      size: 12,
      font: ctx.fontB,
      color: COLOR_BLACK,
    });
  }
}

// Draw page number bottom-left
function drawPageNumber(page: PDFPage, num: number, font: PDFFont): void {
  page.drawText(String(num), {
    x: MARGIN_L,
    y: 22,
    size: 11,
    font,
    color: COLOR_BLACK,
  });
}

// Section header: tan box + centered bold text + black border
function drawSectionHeader(ctx: Ctx, label: string): void {
  const h = 22;
  ensureSpace(ctx, h + 8);
  const y = ctx.y - h;

  ctx.page.drawRectangle({
    x: MARGIN_L,
    y,
    width: CONTENT_W,
    height: h,
    color: COLOR_TAN,
  });
  ctx.page.drawRectangle({
    x: MARGIN_L,
    y,
    width: CONTENT_W,
    height: h,
    borderColor: COLOR_BLACK,
    borderWidth: 0.5,
  });

  const tw = ctx.fontB.widthOfTextAtSize(label, SIZE_SECTION);
  ctx.page.drawText(label, {
    x: MARGIN_L + (CONTENT_W - tw) / 2,
    y: y + (h - SIZE_SECTION) / 2,
    size: SIZE_SECTION,
    font: ctx.fontB,
    color: COLOR_BLACK,
  });

  ctx.y = y - 6;
}

// Bullet paragraph
function drawBullet(ctx: Ctx, text: string): void {
  const indent = 18;
  const bulletW = CONTENT_W - indent;
  const lines = wrapText(text, ctx.fontN, SIZE_BODY, bulletW);
  const totalH = lines.length * LH_BODY + 2;

  ensureSpace(ctx, totalH);

  ctx.page.drawText("\u2022", {
    x: MARGIN_L + 6,
    y: ctx.y - SIZE_BODY,
    size: SIZE_BODY,
    font: ctx.fontN,
    color: COLOR_BLACK,
  });

  lines.forEach((line, i) => {
    ctx.page.drawText(line, {
      x: MARGIN_L + indent,
      y: ctx.y - SIZE_BODY - i * LH_BODY,
      size: SIZE_BODY,
      font: ctx.fontN,
      color: COLOR_BLACK,
    });
  });

  ctx.y -= totalH;
}

// Project table
// Layout matches the reference PDF:

async function drawProjectTable(
  ctx: Ctx,
  project: { name: string; responsibilities: string[] },
): Promise<void> {
  const PAD_H = 5;
  const PAD_V = 3;

  type Row = {
    leftLabel: string;
    leftBold: boolean;
    rightText: string;
    rightBold: boolean;
    isBullet: boolean;
    isHeader: boolean; // tan background row
  };

  // Build all rows
  const rows: Row[] = [];

  // Header row: Project Name | <name>
  rows.push({
    leftLabel: "Project Name",
    leftBold: true,
    rightText: project.name,
    rightBold: true,
    isBullet: false,
    isHeader: true,
  });

  // Role row: "Role" label on first responsibility, blank on subsequent
  project.responsibilities.forEach((resp, idx) => {
    rows.push({
      leftLabel: idx === 0 ? "Role" : "",
      leftBold: false,
      rightText: resp,
      rightBold: false,
      isBullet: true,
      isHeader: false,
    });
  });

  // Measure row heights
  const rowHeights = rows.map((row) => {
    const leftFont = row.leftBold ? ctx.fontB : ctx.fontN;
    const rightFont = row.rightBold ? ctx.fontB : ctx.fontN;
    const leftLines = wrapText(
      row.leftLabel,
      leftFont,
      SIZE_BODY,
      COL1_W - PAD_H * 2,
    );
    const bulletPad = row.isBullet ? 10 : 0;
    const rightLines = wrapText(
      row.rightText,
      rightFont,
      SIZE_BODY,
      COL2_W - PAD_H * 2 - bulletPad,
    );
    const maxLines = Math.max(leftLines.length, rightLines.length);
    return maxLines * LH_BODY + PAD_V * 2;
  });

  // Keep header + first role row together if possible
  ensureSpace(ctx, rowHeights[0] + (rowHeights[1] ?? 0));

  let rowY = ctx.y;

  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];
    const rh = rowHeights[ri];

    // Page break mid-table (but not on very first row)
    if (ri > 0 && rowY - rh < MARGIN_B + 10) {
      newPage(ctx);
      rowY = ctx.y;
    }

    const cellBottom = rowY - rh;

    // Tan background for header row
    if (row.isHeader) {
      ctx.page.drawRectangle({
        x: MARGIN_L,
        y: cellBottom,
        width: CONTENT_W,
        height: rh,
        color: COLOR_TAN,
      });
    }

    // Outer left border
    ctx.page.drawLine({
      start: { x: MARGIN_L, y: cellBottom },
      end: { x: MARGIN_L, y: rowY },
      thickness: 0.5,
      color: COLOR_BLACK,
    });

    // Outer right border
    ctx.page.drawLine({
      start: { x: MARGIN_L + CONTENT_W, y: cellBottom },
      end: { x: MARGIN_L + CONTENT_W, y: rowY },
      thickness: 0.5,
      color: COLOR_BLACK,
    });

    // Column divider
    ctx.page.drawLine({
      start: { x: MARGIN_L + COL1_W, y: cellBottom },
      end: { x: MARGIN_L + COL1_W, y: rowY },
      thickness: row.isHeader ? 0.5 : 0.3,
      color: row.isHeader ? COLOR_BLACK : COLOR_GRAY,
    });

    // Only draw top border for header
    if (ri === 0) {
      ctx.page.drawLine({
        start: { x: MARGIN_L, y: rowY },
        end: { x: MARGIN_L + CONTENT_W, y: rowY },
        thickness: 0.5,
        color: COLOR_BLACK,
      });
    }

    // Left cell text
    if (row.leftLabel) {
      const lFont = row.leftBold ? ctx.fontB : ctx.fontN;
      const lines = wrapText(
        row.leftLabel,
        lFont,
        SIZE_BODY,
        COL1_W - PAD_H * 2,
      );
      lines.forEach((line, li) => {
        ctx.page.drawText(line, {
          x: MARGIN_L + PAD_H,
          y: rowY - PAD_V - SIZE_BODY - li * LH_BODY,
          size: SIZE_BODY,
          font: lFont,
          color: COLOR_BLACK,
        });
      });
    }

    // Right cell text
    const rFont = row.rightBold ? ctx.fontB : ctx.fontN;
    const bulletPad = row.isBullet ? 10 : 0;
    const rightMaxW = COL2_W - PAD_H * 2 - bulletPad;
    const rLines = wrapText(row.rightText, rFont, SIZE_BODY, rightMaxW);
    const rX = MARGIN_L + COL1_W + PAD_H;

    if (row.isBullet) {
      ctx.page.drawText("\u2022", {
        x: rX,
        y: rowY - PAD_V - SIZE_BODY,
        size: SIZE_BODY,
        font: ctx.fontN,
        color: COLOR_BLACK,
      });
    }

    rLines.forEach((line, li) => {
      ctx.page.drawText(line, {
        x: rX + bulletPad,
        y: rowY - PAD_V - SIZE_BODY - li * LH_BODY,
        size: SIZE_BODY,
        font: rFont,
        color: COLOR_BLACK,
      });
    });

    rowY -= rh;
    ctx.y = rowY;
  }

  // Bottom border
  ctx.page.drawLine({
    start: { x: MARGIN_L, y: rowY },
    end: { x: MARGIN_L + CONTENT_W, y: rowY },
    thickness: 0.5,
    color: COLOR_BLACK,
  });

  ctx.y = rowY - 8;
}

// Main generator
export async function generateSPPdf(
  parsed: ParsedCV,
  options: {
    includeName: boolean;
    includePhone: boolean;
    includeEmail: boolean;
    maxProjects: number;
  },
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fontN = await doc.embedFont(StandardFonts.Helvetica);
  const fontB = await doc.embedFont(StandardFonts.HelveticaBold);

  // Use US Letter to match reference PDF (612×792)
  const firstPage = doc.addPage([PAGE_W, PAGE_H]);
  const ctx: Ctx = {
    doc,
    pages: [firstPage],
    page: firstPage,
    y: PAGE_H - MARGIN_T,
    fontN,
    fontB,
  };

  // Name
  const name = options.includeName ? (parsed.name ?? "") : "";
  if (name) {
    ctx.page.drawText(name, {
      x: MARGIN_L,
      y: ctx.y - SIZE_NAME,
      size: SIZE_NAME,
      font: fontB,
      color: COLOR_BLACK,
    });
    ctx.y -= LH_NAME;
  }

  // Contact line
  const phone = options.includePhone ? (parsed.phone ?? "") : "";
  const email = options.includeEmail ? (parsed.email ?? "") : "";

  if (phone || email) {
    let cx = MARGIN_L;
    if (phone) {
      ctx.page.drawText(phone, {
        x: cx,
        y: ctx.y - SIZE_CONTACT,
        size: SIZE_CONTACT,
        font: fontN,
        color: COLOR_BLACK,
      });
      cx += fontN.widthOfTextAtSize(phone, SIZE_CONTACT);
    }
    if (phone && email) {
      const sep = " | ";
      ctx.page.drawText(sep, {
        x: cx,
        y: ctx.y - SIZE_CONTACT,
        size: SIZE_CONTACT,
        font: fontN,
        color: COLOR_BLACK,
      });
      cx += fontN.widthOfTextAtSize(sep, SIZE_CONTACT);
    }
    if (email) {
      ctx.page.drawText(email, {
        x: cx,
        y: ctx.y - SIZE_CONTACT,
        size: SIZE_CONTACT,
        font: fontN,
        color: COLOR_BLUE,
      });
    }
    ctx.y -= LH_CONTACT + 4;
  }

  ctx.y -= 6;

  // Professional Summary
  const summary = parsed.summary ?? [];
  if (summary.length > 0) {
    drawSectionHeader(ctx, "Professional Summary");
    for (const item of summary) {
      if (item.trim()) drawBullet(ctx, item.trim());
    }
    ctx.y -= 8;
  }

  // Education
  const education = parsed.education?.trim() ?? "";
  if (education) {
    drawSectionHeader(ctx, "Education");
    ensureSpace(ctx, LH_BODY + 4);
    ctx.page.drawText(education, {
      x: MARGIN_L,
      y: ctx.y - SIZE_BODY,
      size: SIZE_BODY,
      font: fontN,
      color: COLOR_BLACK,
    });
    ctx.y -= LH_BODY + 8;
  }
  console.log("Total projects from parser:", parsed.projects.length);
  // Projects
  // Each project gets its own "Projects Undertaken" section header + table
  const projects = (parsed.projects ?? []).slice(0, options.maxProjects);
  for (const project of projects) {
    drawSectionHeader(ctx, "Projects Undertaken");
    await drawProjectTable(ctx, project);
  }

  // Certifications
  const certs = parsed.certifications ?? [];
  if (certs.length > 0) {
    drawSectionHeader(ctx, "Certifications");
    for (const cert of certs) {
      if (cert.trim()) drawBullet(ctx, cert.trim());
    }
  }

  // Logo + page numbers
  for (let i = 0; i < ctx.pages.length; i++) {
    await drawLogo(ctx, ctx.pages[i]);
    drawPageNumber(ctx.pages[i], i + 1, fontN);
  }

  return doc.save();
}
