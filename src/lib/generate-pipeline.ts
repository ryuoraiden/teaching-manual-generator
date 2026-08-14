import { generateManual } from "./llm";
import { placeFigures } from "./figure-placement";
import { extractPdfText } from "./pdf-extract";
import { extractChapterImages } from "./pdf-images";
import {
  selectHandbookExcerpts,
  sliceChapter,
  type PageRange,
} from "./retrieval";
import { getSourceContext } from "./source-context";
import { setStage } from "./job-store";
import type { JobResult } from "./job-store";
import type { OutputLanguage, TextbookImage } from "./manual-schema";

/**
 * The generation pipeline, extracted from the route so it can run *after* the
 * HTTP response has been sent (see the job store for why). Everything here is
 * pure server work on buffers already read from the upload — it never touches
 * the request, so it is safe to run detached.
 */
export interface GenerateInput {
  textbookBuffer: Buffer;
  handbookBuffer: Buffer;
  workbookBuffer?: Buffer;
  standard: string;
  subject: string;
  chapterNumber: string;
  chapterName?: string;
  pageRange?: PageRange;
  language: OutputLanguage;
}

export async function runGeneration(
  jobId: string,
  input: GenerateInput
): Promise<JobResult> {
  const {
    standard,
    subject,
    chapterNumber,
    chapterName,
    pageRange,
    language,
  } = input;

  // Mutable so the (potentially tens of MB) textbook can be released the moment
  // figure extraction is done, rather than pinned for the whole model call.
  let textbookBuffer: Buffer | null = input.textbookBuffer;

  const t0 = Date.now();
  setStage(jobId, "Reading the PDFs…");
  const [textbook, handbook] = await Promise.all([
    extractPdfText(textbookBuffer),
    extractPdfText(input.handbookBuffer),
  ]);
  const pdfExtractMs = Date.now() - t0;

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

  // Optional pupil workbook. Workbooks follow the textbook's chapter order, so
  // try chapter slicing first and fall back to lexical selection when the
  // chapter heading isn't found. Failures here must not block generation.
  let workbookExcerpt: string | undefined;
  if (input.workbookBuffer) {
    try {
      const workbook = await extractPdfText(input.workbookBuffer);
      const wbChapter = sliceChapter(
        workbook.pages,
        chapterNumber,
        chapterName,
        pageRange
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
  // model call rather than after it. On an image-heavy chapter this used to add
  // its full duration to every request as pure dead time.
  setStage(jobId, "Writing the manual…");
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
      textbookBuffer = null;
    }
  })();

  const [generated, textbookImages] = await Promise.all([
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
  const generatePhaseMs = Date.now() - tGen;

  // Phase 4: let the model see the figures and drop them into the sections they
  // support. This needs both halves above, so it's the one step that can't be
  // parallelised — affordable only because generation is a background job.
  // Best-effort: a failure here must never cost the teacher their manual.
  let manual = generated;
  let figuresPlaced = 0;
  let placementMs = 0;
  if (textbookImages.length > 0) {
    setStage(jobId, "Placing the textbook figures…");
    const tPlace = Date.now();
    try {
      const result = await placeFigures({
        manual: generated,
        images: textbookImages,
        language,
      });
      manual = result.manual;
      figuresPlaced = result.placed;
    } catch (placeErr) {
      console.error("figure placement failed (continuing):", placeErr);
    }
    placementMs = Date.now() - tPlace;
  }

  const timings = {
    pdfExtractMs,
    generatePhaseMs,
    imagesMs,
    placementMs,
    totalMs: Date.now() - t0,
  };
  console.log(`generate-manual timings [${jobId}]:`, JSON.stringify(timings));

  return {
    manual,
    textbookImages,
    meta: {
      chapterSliceStrategy: chapter.strategy,
      chapterPageCount: chapter.pageNumbers.length,
      imagesFound: textbookImages.length,
      figuresPlaced,
      workbookUsed: Boolean(workbookExcerpt),
      sourceContext: "TextbooksAll / SCERT / Samagra index hints applied",
      timings,
    },
  };
}
