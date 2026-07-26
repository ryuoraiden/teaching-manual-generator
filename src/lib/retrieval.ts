import type { PageTextResult } from "pdf-parse";

/**
 * Retrieval layer (v0): grounds the LLM prompt in the *relevant* parts of the
 * uploaded PDFs instead of dumping whole books into the prompt.
 *
 *  - Textbook: chapter slicing — find the pages belonging to the requested
 *    chapter using heading heuristics (chapter number / name patterns).
 *  - Handbook: lexical chunk scoring — split into overlapping chunks and rank
 *    them by overlap with the chapter name/subject terms.
 *
 * Upgrade path (kept behind these two function signatures so nothing else
 * changes): replace lexical scoring with embedding-based vector search
 * (e.g. Voyage AI multilingual embeddings + a pgvector/SQLite-vec index),
 * and pre-ingest the reference corpus instead of re-parsing per request.
 */

const MAX_TEXTBOOK_CHARS = 60_000;
const MAX_HANDBOOK_CHARS = 40_000;

/** Patterns that mark a chapter heading on a page, in Malayalam and English. */
function chapterHeadingPatterns(chapterNumber: string): RegExp[] {
  const n = escapeRegExp(chapterNumber.trim());
  return [
    new RegExp(`(പാഠം|യൂണിറ്റ്|അധ്യായം)\\s*[-:.]?\\s*${n}(?!\\d)`, "u"),
    new RegExp(`(chapter|unit|lesson)\\s*[-:.]?\\s*${n}(?!\\d)`, "iu"),
    new RegExp(`^\\s*${n}\\s*$`, "mu"), // bare chapter number on its own line
  ];
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Slice the textbook down to the requested chapter.
 * Falls back to the whole (truncated) book if no heading is found, and tells
 * the caller which strategy was used so the UI/prompt can reflect it.
 */
export interface ChapterSlice {
  text: string;
  strategy: "heading-match" | "name-match" | "fallback-full";
  /**
   * 1-based PDF page numbers belonging to the chapter — used to extract only
   * the chapter's images. Empty on fallback (we didn't locate the chapter, so
   * we don't scrape the whole book's images).
   */
  pageNumbers: number[];
}

export function sliceChapter(
  pages: PageTextResult[],
  chapterNumber: string,
  chapterName?: string
): ChapterSlice {
  const numPatterns = chapterHeadingPatterns(chapterNumber);
  const nextNumPatterns = chapterHeadingPatterns(String(Number(chapterNumber) + 1));

  let start = pages.findIndex((p) => numPatterns.some((re) => re.test(p.text)));
  let strategy: "heading-match" | "name-match" | "fallback-full" = "heading-match";

  if (start === -1 && chapterName) {
    const name = chapterName.trim();
    start = pages.findIndex((p) => p.text.includes(name));
    strategy = "name-match";
  }

  if (start === -1) {
    return {
      text: joinPages(pages).slice(0, MAX_TEXTBOOK_CHARS),
      strategy: "fallback-full",
      pageNumbers: [],
    };
  }

  // End of chapter = next chapter's heading, capped at 35 pages.
  let end = pages.length;
  for (let i = start + 1; i < Math.min(pages.length, start + 36); i++) {
    if (nextNumPatterns.some((re) => re.test(pages[i].text))) {
      end = i;
      break;
    }
  }
  end = Math.min(end, start + 36);

  const slice = pages.slice(start, end);
  return {
    text: joinPages(slice).slice(0, MAX_TEXTBOOK_CHARS),
    strategy,
    pageNumbers: slice.map((p) => p.num),
  };
}

/**
 * Rank handbook chunks by lexical overlap with the chapter/subject terms and
 * return the top-k, in document order, as one grounding string.
 */
export function selectHandbookExcerpts(
  pages: PageTextResult[],
  queryTerms: string[],
  topK = 12
): string {
  const chunks = chunkPages(pages, 1800, 200);
  const terms = queryTerms
    .flatMap((t) => t.split(/\s+/u))
    .map((t) => t.trim())
    .filter((t) => t.length >= 3);

  const scored = chunks.map((chunk, index) => {
    let score = 0;
    for (const term of terms) {
      if (chunk.text.includes(term)) score += 2;
    }
    return { index, chunk, score };
  });

  const anyHits = scored.some((s) => s.score > 0);
  const picked = anyHits
    ? scored
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, topK)
        .sort((a, b) => a.index - b.index)
    : // No lexical hits (e.g. handbook is general pedagogy): take the first
      // chunks, which typically describe the overall teaching approach.
      scored.slice(0, topK);

  return picked
    .map((s) => `[p.${s.chunk.page}] ${s.chunk.text}`)
    .join("\n\n---\n\n")
    .slice(0, MAX_HANDBOOK_CHARS);
}

interface Chunk {
  page: number;
  text: string;
}

function chunkPages(pages: PageTextResult[], size: number, overlap: number): Chunk[] {
  const chunks: Chunk[] = [];
  for (const page of pages) {
    const text = page.text.replace(/\s+/g, " ").trim();
    if (!text) continue;
    for (let i = 0; i < text.length; i += size - overlap) {
      chunks.push({ page: page.num, text: text.slice(i, i + size) });
      if (i + size >= text.length) break;
    }
  }
  return chunks;
}

function joinPages(pages: PageTextResult[]): string {
  return pages.map((p) => `[page ${p.num}]\n${p.text}`).join("\n\n");
}
