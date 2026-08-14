import { createHash } from "node:crypto";
import { PDFParse } from "pdf-parse";
import sharp from "sharp";
import type { TextbookImage } from "./manual-schema";

/**
 * Extract the figures embedded in the textbook's chapter pages.
 *
 * This is the feature a chapter-name-only competitor can't match: the images
 * are the actual diagrams/photos from the child's textbook, so a teacher can
 * drop the exact figure into the right part of the manual.
 *
 * Robustness/cost notes (this runs on a 1 GB VM and must never break
 * generation):
 *  - Best-effort: the caller wraps this in try/catch; any failure returns [].
 *  - Only the chapter's pages are scanned (not the whole book), in small
 *    batches so we stop decoding once `max` figures are in hand.
 *  - A wall-clock budget caps the worst case on a huge/scanned chapter.
 *  - `imageThreshold` drops tiny decorative/bullet images.
 *  - Each image is downscaled + re-encoded to JPEG so the payload (and GCP
 *    egress) stays small; images sharp can't decode are skipped.
 *  - Deduped by content hash so repeated logos/headers appear once.
 */
export async function extractChapterImages(
  buffer: Buffer,
  pageNumbers: number[],
  opts: {
    max?: number;
    minPx?: number;
    maxWidth?: number;
    batchSize?: number;
    budgetMs?: number;
  } = {}
): Promise<TextbookImage[]> {
  const {
    max = 12,
    minPx = 120,
    maxWidth = 900,
    batchSize = 6,
    budgetMs = 20_000,
  } = opts;
  if (pageNumbers.length === 0) return [];

  const startedAt = Date.now();
  const out: TextbookImage[] = [];
  const seen = new Set<string>();

  // Decode in small page batches rather than all chapter pages at once. A single
  // getImage() over ~36 pages rasterises *every* figure before we cap at `max`,
  // which on a 1 GB / 0.25-vCPU VM is both the slowest and the most memory-hungry
  // step in the request. Batching lets us stop as soon as we have enough.
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    for (let i = 0; i < pageNumbers.length; i += batchSize) {
      if (out.length >= max) break;
      if (Date.now() - startedAt > budgetMs) {
        console.warn(
          `image extraction: ${budgetMs}ms budget hit after ${i}/${pageNumbers.length} pages; returning ${out.length} figure(s)`
        );
        break;
      }

      const batch = pageNumbers.slice(i, i + batchSize);
      const result = await parser.getImage({
        partial: batch,
        imageThreshold: minPx,
        imageBuffer: true,
        imageDataUrl: false,
      });

      for (const page of result.pages) {
        for (const img of page.images) {
          if (out.length >= max) break;
          try {
            const pipeline = sharp(Buffer.from(img.data)).rotate();
            const meta = await pipeline.metadata();
            const targetWidth = Math.min(maxWidth, meta.width ?? maxWidth);
            const jpeg = await pipeline
              .resize({ width: targetWidth, withoutEnlargement: true })
              .jpeg({ quality: 72 })
              .toBuffer();

            const hash = createHash("sha1").update(jpeg).digest("hex");
            if (seen.has(hash)) continue;
            seen.add(hash);

            out.push({
              src: `data:image/jpeg;base64,${jpeg.toString("base64")}`,
              page: page.pageNumber,
              width: meta.width ?? targetWidth,
              height: meta.height ?? 0,
            });
          } catch {
            // Unsupported pixel format / decode error — skip this one image.
          }
        }
      }
    }
    return out;
  } finally {
    await parser.destroy();
  }
}
