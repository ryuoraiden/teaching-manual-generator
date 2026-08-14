import { NextRequest, NextResponse } from "next/server";
import { generateManual } from "@/lib/llm";
import { extractPdfText } from "@/lib/pdf-extract";
import { extractChapterImages } from "@/lib/pdf-images";
import {
  selectHandbookExcerpts,
  sliceChapter,
  type PageRange,
} from "@/lib/retrieval";
import { getSourceContext } from "@/lib/source-context";
import type { OutputLanguage, TextbookImage } from "@/lib/manual-schema";

export const runtime = "nodejs";
// Generation of a full bilingual manual can take a couple of minutes.
export const maxDuration = 300;

/**
 * Parse a teacher-entered PDF page range: "24-33", "24 to 33", "24–33" (en
 * dash), or a single "24". Returns undefined for anything unparseable, so a
 * typo silently falls back to automatic detection rather than erroring.
 */
function parsePageRange(raw: string): PageRange | undefined {
  const s = raw.trim();
  if (!s) return undefined;
  const m = s.match(/^(\d{1,4})\s*(?:[-–—]|to)\s*(\d{1,4})$/iu);
  if (m) {
    const from = Number(m[1]);
    const to = Number(m[2]);
    return from > 0 && to > 0 ? { from, to } : undefined;
  }
  const single = s.match(/^(\d{1,4})$/u);
  if (single) {
    const n = Number(single[1]);
    return n > 0 ? { from: n, to: n } : undefined;
  }
  return undefined;
}

/**
 * POST /api/generate-manual  (multipart/form-data)
 *
 * Fields:
 *  - textbook:      PDF file (student textbook)
 *  - handbook:      PDF file (government teacher handbook)
 *  - workbook:      optional PDF file (pupil workbook, where the subject has one)
 *  - standard:      e.g. "IV"
 *  - subject:       e.g. "Basic Science"
 *  - chapterNumber: e.g. "3"
 *  - chapterName:   optional, improves chapter slicing
 *  - pageRange:     optional, e.g. "24-33" — overrides chapter auto-detection
 *  - language:      "ml" | "en" | "both"
 *
 * Pipeline: extract -> retrieve -> add source-index context -> generate,
 * with figure extraction running in parallel with the model call.
 */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    const textbookFile = form.get("textbook");
    const handbookFile = form.get("handbook");
    if (!(textbookFile instanceof File) || !(handbookFile instanceof File)) {
      return NextResponse.json(
        { error: "Both 'textbook' and 'handbook' PDF files are required." },
        { status: 400 }
      );
    }

    const standard = String(form.get("standard") ?? "").trim();
    const subject = String(form.get("subject") ?? "").trim();
    const chapterNumber = String(form.get("chapterNumber") ?? "").trim();
    const chapterName =
      String(form.get("chapterName") ?? "").trim() || undefined;
    const language = (String(form.get("language") ?? "both") ||
      "both") as OutputLanguage;

    if (!standard || !subject || !chapterNumber) {
      return NextResponse.json(
        { error: "standard, subject and chapterNumber are required." },
        { status: 400 }
      );
    }

    // Optional explicit page range, for books whose chapter headings we can't
    // detect. "24-33" / "24 to 33" / "24".
    const pageRange = parsePageRange(String(form.get("pageRange") ?? ""));

    const t0 = Date.now();
    let textbookBuffer: Buffer | null = Buffer.from(
      await textbookFile.arrayBuffer()
    );
    const [textbook, handbook] = await Promise.all([
      extractPdfText(textbookBuffer),
      extractPdfText(Buffer.from(await handbookFile.arrayBuffer())),
    ]);
    const tExtract = Date.now() - t0;

    const chapter = sliceChapter(
      textbook.pages,
      chapterNumber,
      chapterName,
      pageRange
    );
    const queryTerms = [
      chapterName ?? "",
      subject,
      `പാഠം ${chapterNumber}`,
      `Unit ${chapterNumber}`,
    ];
    const handbookExcerpt = selectHandbookExcerpts(handbook.pages, queryTerms);

    // Optional pupil workbook. Workbooks follow the textbook's chapter order,
    // so try chapter slicing first and fall back to lexical selection when the
    // chapter heading isn't found. Failures here must not block generation.
    let workbookExcerpt: string | undefined;
    const workbookFile = form.get("workbook");
    if (workbookFile instanceof File && workbookFile.size > 0) {
      try {
        const workbook = await extractPdfText(
          Buffer.from(await workbookFile.arrayBuffer())
        );
        const wbChapter = sliceChapter(
          workbook.pages,
          chapterNumber,
          chapterName
        );
        workbookExcerpt =
          wbChapter.strategy === "fallback-full"
            ? selectHandbookExcerpts(workbook.pages, queryTerms, 8)
            : wbChapter.text;
      } catch (wbErr) {
        console.error("workbook extraction failed (continuing):", wbErr);
      }
    }
    const sourceContext = getSourceContext({
      standard,
      subject,
      chapterNumber,
      chapterName,
    });

    // Figure extraction doesn't depend on the manual, so it runs *alongside* the
    // model call rather than after it. On an image-heavy chapter this used to
    // add its full duration to every request as pure dead time.
    const tGen = Date.now();
    let imagesMs = 0;
    const imagesPromise = (async (): Promise<TextbookImage[]> => {
      const started = Date.now();
      try {
        return await extractChapterImages(textbookBuffer!, chapter.pageNumbers);
      } catch (imgErr) {
        console.error("chapter image extraction failed:", imgErr);
        return [];
      } finally {
        imagesMs = Date.now() - started;
        // Release the textbook (tens of MB) as soon as extraction is done,
        // instead of pinning it for the rest of the model call on a 1 GB VM.
        textbookBuffer = null;
      }
    })();

    const [manual, textbookImages] = await Promise.all([
      generateManual({
        standard,
        subject,
        chapterNumber,
        chapterName,
        language,
        textbookExcerpt: chapter.text,
        handbookExcerpt,
        workbookExcerpt,
        sourceContext,
      }),
      imagesPromise,
    ]);
    const generateMs = Date.now() - tGen;

    const timings = {
      pdfExtractMs: tExtract,
      // Wall time of the parallel phase, plus what each part cost inside it.
      generatePhaseMs: generateMs,
      imagesMs,
      totalMs: Date.now() - t0,
    };
    console.log("generate-manual timings:", JSON.stringify(timings));

    return NextResponse.json({
      manual,
      textbookImages,
      meta: {
        chapterSliceStrategy: chapter.strategy,
        chapterPageCount: chapter.pageNumbers.length,
        imagesFound: textbookImages.length,
        workbookUsed: Boolean(workbookExcerpt),
        sourceContext: "TextbooksAll / SCERT / Samagra index hints applied",
        timings,
      },
    });
  } catch (err) {
    console.error("generate-manual failed:", err);
    const message = err instanceof Error ? err.message : "Generation failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
