import { PDFParse, type PageTextResult } from "pdf-parse";

export interface ExtractedPdf {
  /** Full document text (all pages concatenated). */
  text: string;
  /** Per-page text, 1-indexed page numbers. */
  pages: PageTextResult[];
}

/**
 * Extract text from an uploaded PDF.
 *
 * Works for born-digital, Unicode-encoded PDFs (all recent SCERT
 * textbooks/handbooks). Two known failure modes to handle later:
 *  - Scanned/image-only PDFs → needs OCR (e.g. Tesseract with `mal` traineddata).
 *  - Legacy ASCII-mapped Malayalam fonts (pre-Unicode DTP) → text extracts as
 *    mojibake; needs a font-encoding converter.
 * If extraction yields almost no text, we surface that to the caller instead
 * of silently sending garbage to the LLM.
 */
export async function extractPdfText(buffer: Buffer): Promise<ExtractedPdf> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    const text = result.text ?? "";
    if (text.replace(/\s/g, "").length < 50) {
      throw new Error(
        "The PDF contains almost no extractable text. It may be a scanned document (needs OCR) or use a legacy non-Unicode Malayalam font."
      );
    }
    return { text, pages: result.pages };
  } finally {
    await parser.destroy();
  }
}
