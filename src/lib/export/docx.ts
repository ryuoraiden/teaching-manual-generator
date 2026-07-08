import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { TeachingManual } from "../manual-schema";

/**
 * Malayalam font strategy for .docx:
 * DOCX files reference fonts by name; Word does the glyph shaping at render
 * time, so Malayalam conjuncts/chillu render correctly as long as the reader's
 * machine has a Unicode Malayalam font. "Noto Sans Malayalam" is our primary
 * choice; Windows ships "Nirmala UI" (covers Malayalam) as a universal
 * fallback, and Word substitutes automatically if the primary is missing.
 */
const ML_FONT = "Noto Sans Malayalam";

function runsFor(text: string, opts: { bold?: boolean; size?: number } = {}) {
  return new TextRun({
    text,
    font: ML_FONT,
    bold: opts.bold,
    size: opts.size, // half-points
  });
}

function contentParagraphs(content: string): Paragraph[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line, i, arr) => line !== "" || arr[i - 1] !== "") // collapse blank runs
    .map((line) => {
      const bullet = /^[-•]\s+/.test(line);
      const text = bullet ? line.replace(/^[-•]\s+/, "") : line;
      return new Paragraph({
        children: [runsFor(text)],
        bullet: bullet ? { level: 0 } : undefined,
        spacing: { after: 120 },
      });
    });
}

export async function manualToDocx(manual: TeachingManual): Promise<Buffer> {
  const { basicInfo, sections } = manual;

  const infoRow = (label: string, value: string) =>
    new TableRow({
      children: [
        new TableCell({
          width: { size: 30, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ children: [runsFor(label, { bold: true })] })],
        }),
        new TableCell({
          width: { size: 70, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ children: [runsFor(value)] })],
        }),
      ],
    });

  const children: (Paragraph | Table)[] = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      children: [runsFor("Teaching Manual / അധ്യാപന സഹായി", { bold: true })],
      spacing: { after: 240 },
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        infoRow("Standard / ക്ലാസ്", basicInfo.standard),
        infoRow("Subject / വിഷയം", basicInfo.subject),
        infoRow("Unit / യൂണിറ്റ്", basicInfo.unitName),
        infoRow("Chapter / പാഠം", basicInfo.chapterNumber),
        infoRow("Time / സമയം", basicInfo.estimatedTime),
      ],
    }),
    new Paragraph({ children: [], spacing: { after: 240 } }),
  ];

  for (const section of sections) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [
          runsFor(`${section.titleMl} (${section.titleEn})`, {
            bold: true,
            size: 28,
          }),
        ],
        spacing: { before: 240, after: 120 },
      }),
      ...contentParagraphs(section.content)
    );
  }

  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: ML_FONT, size: 22 } }, // 11pt
      },
    },
    sections: [{ children }],
  });

  return Packer.toBuffer(doc);
}
