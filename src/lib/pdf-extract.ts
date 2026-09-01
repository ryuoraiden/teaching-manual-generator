import { PDFParse, type PageTextResult } from "pdf-parse";

export interface ExtractedPdf {
  /** Full document text (all pages concatenated). */
  text: string;
  /** Per-page text, 1-indexed page numbers. */
  pages: PageTextResult[];
}

/**
 * Work out why a file is not usable, before handing it to the parser.
 *
 * pdf-parse reports almost every problem as the single message "Invalid PDF
 * structure", which tells a teacher nothing. The two real causes need opposite
 * responses, and they are easy to tell apart:
 *
 *  - No "%PDF-" header: the file is not a PDF at all. Teachers commonly pick a
 *    photo or a Word document, since both are "the document" in everyday use.
 *  - Header present but no "%%EOF" trailer: the file is a PDF whose bytes were
 *    cut short. A PDF stores its cross reference table at the very end, so even
 *    losing the last one percent makes it unreadable. In practice this means the
 *    upload was interrupted, which is common on mobile data or when the app is
 *    backgrounded mid upload.
 */
function describePdfProblem(buffer: Buffer, label: string): string | null {
  if (buffer.length === 0) {
    return `The ${label} file is empty. Please pick the file again and re-upload it.`;
  }

  const header = buffer.subarray(0, 8).toString("latin1");
  if (!header.startsWith("%PDF-")) {
    return `The ${label} does not look like a PDF file. Please check you picked the PDF and not a photo or a Word document.`;
  }

  // The trailer is usually the last bytes, but some writers pad after it.
  const tail = buffer.subarray(Math.max(0, buffer.length - 2048)).toString("latin1");
  if (!tail.includes("%%EOF")) {
    return `The ${label} did not finish uploading, so only part of the file arrived. Please try again, and keep the app open until it says generating has started. A stronger connection helps for large textbooks.`;
  }

  return null;
}

/**
 * Extract text from an uploaded PDF.
 *
 * Works for born-digital, Unicode-encoded PDFs (all recent SCERT
 * textbooks/handbooks). Two known failure modes to handle later:
 *  - Scanned/image-only PDFs, which need OCR (e.g. Tesseract with `mal`).
 *  - Legacy ASCII-mapped Malayalam fonts (pre-Unicode DTP), which extract as
 *    mojibake and need a font-encoding converter.
 * If extraction yields almost no text, we surface that to the caller instead
 * of silently sending garbage to the LLM.
 *
 * `label` names the file in every error, because a teacher uploads two or three
 * PDFs and otherwise cannot tell which one the app is complaining about.
 */
export async function extractPdfText(
  buffer: Buffer,
  label = "PDF"
): Promise<ExtractedPdf> {
  const problem = describePdfProblem(buffer, label);
  if (problem) throw new Error(problem);

  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    const text = result.text ?? "";
    if (text.replace(/\s/g, "").length < 50) {
      throw new Error(
        `The ${label} contains almost no extractable text. It may be a scanned document, which needs OCR, or it may use a legacy non-Unicode Malayalam font.`
      );
    }
    return { text, pages: result.pages };
  } catch (err) {
    // The header and trailer looked right, so the damage is inside the file.
    if (err instanceof Error && /invalid pdf structure/i.test(err.message)) {
      throw new Error(
        `The ${label} could not be read. The file appears to be damaged. Try opening it on your device to confirm it works, or download a fresh copy and upload again.`
      );
    }
    throw err;
  } finally {
    await parser.destroy();
  }
}
