import { NextRequest, NextResponse, after } from "next/server";
import { createJob, completeJob, failJob } from "@/lib/job-store";
import { runGeneration } from "@/lib/generate-pipeline";
import type { PageRange } from "@/lib/retrieval";
import type { OutputLanguage } from "@/lib/manual-schema";

export const runtime = "nodejs";
// Generation of a full bilingual manual can take a couple of minutes. This
// bounds the `after()` callback too, not just the request.
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
 * Returns **202 { jobId }** as soon as the upload has been received; generation
 * then continues server-side via `after()`. Poll GET ./[jobId] for the result.
 *
 * This is what makes the app usable on a phone: previously the response was
 * held open for the whole 20-60s+ generation, so backgrounding the app let
 * Android freeze or discard the tab and kill the connection mid-flight. Now the
 * only long-held connection is the upload itself.
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

    const pageRange = parsePageRange(String(form.get("pageRange") ?? ""));

    // Read the uploads into memory *before* responding: once the response is
    // sent the request body is gone, so `after()` can't go back for it.
    const workbookFile = form.get("workbook");
    const [textbookBuffer, handbookBuffer, workbookBuffer] = await Promise.all([
      textbookFile.arrayBuffer().then(Buffer.from),
      handbookFile.arrayBuffer().then(Buffer.from),
      workbookFile instanceof File && workbookFile.size > 0
        ? workbookFile.arrayBuffer().then(Buffer.from)
        : Promise.resolve(undefined),
    ]);

    const job = createJob(
      `${subject} · Standard ${standard} · Chapter ${chapterNumber}`
    );

    after(async () => {
      try {
        const result = await runGeneration(job.id, {
          textbookBuffer,
          handbookBuffer,
          workbookBuffer,
          standard,
          subject,
          chapterNumber,
          chapterName,
          pageRange,
          language,
        });
        completeJob(job.id, result);
      } catch (err) {
        console.error(`generate-manual job ${job.id} failed:`, err);
        failJob(
          job.id,
          err instanceof Error ? err.message : "Generation failed."
        );
      }
    });

    return NextResponse.json(
      { jobId: job.id, label: job.label },
      { status: 202 }
    );
  } catch (err) {
    console.error("generate-manual failed:", err);
    const message = err instanceof Error ? err.message : "Generation failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
