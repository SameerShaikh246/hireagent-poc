import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  AlignmentType,
  BorderStyle,
  WidthType,
  ShadingType,
  LevelFormat,
  HeadingLevel,
  Header,
  ImageRun,
  VerticalAlign,
  PageNumber,
  Footer,
} from "docx";
import type { ParsedCV } from "@/types";

// SP brand colors (as hex)
const TAN_HEX = "FCE5CD"; // section header background
const BLUE_HEX = "0563C1"; // email hyperlink
const BLACK_HEX = "000000";
const GRAY_HEX = "CCCCCC";

// Page layout (US Letter, matching the PDF)
const PAGE_W_DXA = 12240; // 8.5 inches
const PAGE_H_DXA = 15840; // 11 inches
const MARGIN_DXA = 1013; // ~0.7 inches (matching PDF ~70.824pt)
const CONTENT_W_DXA = PAGE_W_DXA - MARGIN_DXA * 2; // ~10214

// Column widths for project table (mirror PDF: COL1_W=90pt → ~1800 DXA)
const COL1_DXA = 1800;
const COL2_DXA = CONTENT_W_DXA - COL1_DXA;

const BORDER_THIN = { style: BorderStyle.SINGLE, size: 4, color: BLACK_HEX };
const BORDER_GRAY = { style: BorderStyle.SINGLE, size: 3, color: GRAY_HEX };
const BORDER_NONE = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };

function sectionHeaderRow(label: string): TableRow {
  return new TableRow({
    children: [
      new TableCell({
        columnSpan: 2,
        shading: { fill: TAN_HEX, type: ShadingType.CLEAR },
        borders: {
          top: BORDER_THIN,
          bottom: BORDER_THIN,
          left: BORDER_THIN,
          right: BORDER_THIN,
        },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        width: { size: CONTENT_W_DXA, type: WidthType.DXA },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: label, bold: true, size: 20, font: "Helvetica" }),
            ],
          }),
        ],
      }),
    ],
  });
}

function bulletParagraph(text: string, numbRef: string): Paragraph {
  return new Paragraph({
    numbering: { reference: numbRef, level: 0 },
    children: [new TextRun({ text, size: 20, font: "Helvetica" })],
    spacing: { after: 40 },
  });
}

function projectTableRows(project: {
  name: string;
  responsibilities: string[];
}): TableRow[] {
  const rows: TableRow[] = [];

  // Header row: Project Name | <name>
  rows.push(
    new TableRow({
      children: [
        new TableCell({
          shading: { fill: TAN_HEX, type: ShadingType.CLEAR },
          borders: {
            top: BORDER_THIN,
            bottom: BORDER_THIN,
            left: BORDER_THIN,
            right: BORDER_THIN,
          },
          margins: { top: 60, bottom: 60, left: 100, right: 100 },
          width: { size: COL1_DXA, type: WidthType.DXA },
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: "Project Name", bold: true, size: 20, font: "Helvetica" }),
              ],
            }),
          ],
        }),
        new TableCell({
          shading: { fill: TAN_HEX, type: ShadingType.CLEAR },
          borders: {
            top: BORDER_THIN,
            bottom: BORDER_THIN,
            left: BORDER_THIN,
            right: BORDER_THIN,
          },
          margins: { top: 60, bottom: 60, left: 100, right: 100 },
          width: { size: COL2_DXA, type: WidthType.DXA },
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: project.name, bold: true, size: 20, font: "Helvetica" }),
              ],
            }),
          ],
        }),
      ],
    })
  );

  // Responsibility rows
  project.responsibilities.forEach((resp, idx) => {
    const isLast = idx === project.responsibilities.length - 1;

    rows.push(
      new TableRow({
        children: [
          new TableCell({
            borders: {
              top: BORDER_NONE,
              bottom: isLast ? BORDER_THIN : BORDER_NONE,
              left: BORDER_THIN,
              right: BORDER_GRAY,
            },
            margins: { top: 60, bottom: 60, left: 100, right: 100 },
            width: { size: COL1_DXA, type: WidthType.DXA },
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: idx === 0 ? "Role" : "",
                    size: 20,
                    font: "Helvetica",
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            borders: {
              top: BORDER_NONE,
              bottom: isLast ? BORDER_THIN : BORDER_NONE,
              left: BORDER_GRAY,
              right: BORDER_THIN,
            },
            margins: { top: 60, bottom: 60, left: 100, right: 100 },
            width: { size: COL2_DXA, type: WidthType.DXA },
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: `\u2022 ${resp}`, size: 20, font: "Helvetica" }),
                ],
              }),
            ],
          }),
        ],
      })
    );
  });

  // Bottom border row (empty, just to draw the bottom line)
  // Handled by last row's bottom border — patch last row
  return rows;
}

export async function generateSPDocx(
  parsed: ParsedCV,
  options: {
    includeName: boolean;
    includePhone: boolean;
    includeEmail: boolean;
    maxProjects: number;
  },
  logoPngBytes?: Uint8Array | null
): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [];

  // ── Name ────────────────────────────────────────────────────────────
  const name = options.includeName ? (parsed.name ?? "") : "";
  if (name) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: name, bold: true, size: 36, font: "Helvetica" })],
        spacing: { after: 60 },
      })
    );
  }

  // ── Contact line ────────────────────────────────────────────────────
  const phone = options.includePhone ? (parsed.phone ?? "") : "";
  const email = options.includeEmail ? (parsed.email ?? "") : "";
  if (phone || email) {
    const runs: TextRun[] = [];
    if (phone) runs.push(new TextRun({ text: phone, size: 22, font: "Helvetica" }));
    if (phone && email) runs.push(new TextRun({ text: " | ", size: 22, font: "Helvetica" }));
    if (email)
      runs.push(
        new TextRun({ text: email, size: 22, color: BLUE_HEX, font: "Helvetica" })
      );
    children.push(
      new Paragraph({ children: runs, spacing: { after: 120 } })
    );
  }

  // ── Professional Summary ─────────────────────────────────────────────
  const summary = parsed.summary ?? [];
  if (summary.length > 0) {
    const summaryTable = new Table({
      width: { size: CONTENT_W_DXA, type: WidthType.DXA },
      columnWidths: [CONTENT_W_DXA],
      rows: [
        sectionHeaderRow("Professional Summary"),
        ...summary
          .filter((s) => s.trim())
          .map(
            (s) =>
              new TableRow({
                children: [
                  new TableCell({
                    columnSpan: 2,
                    borders: {
                      top: BORDER_NONE,
                      bottom: BORDER_NONE,
                      left: BORDER_THIN,
                      right: BORDER_THIN,
                    },
                    margins: { top: 40, bottom: 40, left: 120, right: 120 },
                    width: { size: CONTENT_W_DXA, type: WidthType.DXA },
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({ text: `\u2022 ${s.trim()}`, size: 20, font: "Helvetica" }),
                        ],
                        spacing: { after: 20 },
                      }),
                    ],
                  }),
                ],
              })
          ),
        // bottom border row
        new TableRow({
          children: [
            new TableCell({
              columnSpan: 2,
              borders: {
                top: BORDER_THIN,
                bottom: BORDER_NONE,
                left: BORDER_NONE,
                right: BORDER_NONE,
              },
              width: { size: CONTENT_W_DXA, type: WidthType.DXA },
              children: [new Paragraph({ children: [] })],
            }),
          ],
        }),
      ],
    });
    children.push(summaryTable);
    children.push(new Paragraph({ children: [], spacing: { after: 120 } }));
  }

  // ── Education ────────────────────────────────────────────────────────
  const education = parsed.education?.trim() ?? "";
  if (education) {
    const eduTable = new Table({
      width: { size: CONTENT_W_DXA, type: WidthType.DXA },
      columnWidths: [CONTENT_W_DXA],
      rows: [
        sectionHeaderRow("Education"),
        new TableRow({
          children: [
            new TableCell({
              columnSpan: 2,
              borders: {
                top: BORDER_NONE,
                bottom: BORDER_THIN,
                left: BORDER_THIN,
                right: BORDER_THIN,
              },
              margins: { top: 60, bottom: 60, left: 120, right: 120 },
              width: { size: CONTENT_W_DXA, type: WidthType.DXA },
              children: [
                new Paragraph({
                  children: [
                    new TextRun({ text: education, size: 20, font: "Helvetica" }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    });
    children.push(eduTable);
    children.push(new Paragraph({ children: [], spacing: { after: 120 } }));
  }

  // ── Projects ─────────────────────────────────────────────────────────
  const projects = (parsed.projects ?? []).slice(0, options.maxProjects);
  for (const project of projects) {
    const projRows = projectTableRows(project);
    // patch last data row to have bottom border
    const lastRow = projRows[projRows.length - 1];

    const projectTable = new Table({
      width: { size: CONTENT_W_DXA, type: WidthType.DXA },
      columnWidths: [COL1_DXA, COL2_DXA],
      rows: [sectionHeaderRow("Projects Undertaken"), ...projRows],
    });
    children.push(projectTable);
    children.push(new Paragraph({ children: [], spacing: { after: 120 } }));
  }

  // ── Certifications ────────────────────────────────────────────────────
  const certs = parsed.certifications ?? [];
  if (certs.length > 0) {
    const certTable = new Table({
      width: { size: CONTENT_W_DXA, type: WidthType.DXA },
      columnWidths: [CONTENT_W_DXA],
      rows: [
        sectionHeaderRow("Certifications"),
        ...certs
          .filter((c) => c.trim())
          .map(
            (c) =>
              new TableRow({
                children: [
                  new TableCell({
                    columnSpan: 2,
                    borders: {
                      top: BORDER_NONE,
                      bottom: BORDER_NONE,
                      left: BORDER_THIN,
                      right: BORDER_THIN,
                    },
                    margins: { top: 40, bottom: 40, left: 120, right: 120 },
                    width: { size: CONTENT_W_DXA, type: WidthType.DXA },
                    children: [
                      new Paragraph({
                        children: [
                          new TextRun({ text: `\u2022 ${c.trim()}`, size: 20, font: "Helvetica" }),
                        ],
                        spacing: { after: 20 },
                      }),
                    ],
                  }),
                ],
              })
          ),
        new TableRow({
          children: [
            new TableCell({
              columnSpan: 2,
              borders: {
                top: BORDER_THIN,
                bottom: BORDER_NONE,
                left: BORDER_NONE,
                right: BORDER_NONE,
              },
              width: { size: CONTENT_W_DXA, type: WidthType.DXA },
              children: [new Paragraph({ children: [] })],
            }),
          ],
        }),
      ],
    });
    children.push(certTable);
  }

  // ── Build document ────────────────────────────────────────────────────
  const headerChildren: (Paragraph | Table)[] = [];

  if (logoPngBytes) {
    headerChildren.push(
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [
          new ImageRun({
            data: logoPngBytes,
            transformation: { width: 138, height: 26 },
            type: "png",
          }),
        ],
        spacing: { after: 60 },
      })
    );
  } else {
    headerChildren.push(
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [new TextRun({ text: "SoftProdigy", bold: true, size: 24, font: "Helvetica" })],
      })
    );
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE_W_DXA, height: PAGE_H_DXA },
            margin: { top: MARGIN_DXA, bottom: MARGIN_DXA, left: MARGIN_DXA, right: MARGIN_DXA },
          },
        },
        headers: {
          default: new Header({ children: headerChildren }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ children: [PageNumber.CURRENT], size: 22, font: "Helvetica" }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}