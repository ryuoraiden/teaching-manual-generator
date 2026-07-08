import { NextRequest, NextResponse } from "next/server";
import { generateManual } from "@/lib/llm";
import { extractPdfText } from "@/lib/pdf-extract";
import { selectHandbookExcerpts, sliceChapter } from "@/lib/retrieval";
import { getSourceContext } from "@/lib/source-context";
import type { OutputLanguage } from "@/lib/manual-schema";

export const runtime = "nodejs";
// Generation of a full bilingual manual can take a couple of minutes.
export const maxDuration = 300;

/**
 * POST /api/generate-manual  (multipart/form-data)
 *
 * Fields:
 *  - textbook:      PDF file (student textbook)
 *  - handbook:      PDF file (government teacher handbook)
 *  - standard:      e.g. "IV"
 *  - subject:       e.g. "Basic Science"
 *  - chapterNumber: e.g. "3"
 *  - chapterName:   optional, improves chapter slicing
 *  - language:      "ml" | "en" | "both"
 *
 * Pipeline: extract -> retrieve -> add source-index context -> generate.
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

    const [textbook, handbook] = await Promise.all([
      extractPdfText(Buffer.from(await textbookFile.arrayBuffer())),
      extractPdfText(Buffer.from(await handbookFile.arrayBuffer())),
    ]);

    const chapter = sliceChapter(textbook.pages, chapterNumber, chapterName);
    const handbookExcerpt = selectHandbookExcerpts(handbook.pages, [
      chapterName ?? "",
      subject,
      `പാഠം ${chapterNumber}`,
      `Unit ${chapterNumber}`,
    ]);
    const sourceContext = getSourceContext({
      standard,
      subject,
      chapterNumber,
      chapterName,
    });

    const manual = await generateManual({
      standard,
      subject,
      chapterNumber,
      chapterName,
      language,
      textbookExcerpt: chapter.text,
      handbookExcerpt,
      sourceContext,
    });

    return NextResponse.json({
      manual,
      meta: {
        chapterSliceStrategy: chapter.strategy,
        sourceContext: "TextbooksAll / SCERT / Samagra index hints applied",
      },
    });
  } catch (err) {
    console.error("generate-manual failed:", err);
    const message = err instanceof Error ? err.message : "Generation failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
