import { readFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser } from "playwright";
import QRCode from "qrcode";
import type { MediaItem, TeachingManual } from "../manual-schema";
import {
  classifyManualLines,
  sectionNumberLabel,
} from "../manual-presentation";

/**
 * PDF export = HTML template + headless-Chromium print-to-PDF.
 *
 * Browser rendering gives Malayalam the OpenType shaping it needs. The export
 * intentionally avoids decorative placeholder art; if real source images are
 * not available, the PDF stays as a clean black-and-white teaching manual.
 */

const fontDir = path.join(process.cwd(), "fonts");

function fontDataUri(file: string): string {
  const data = readFileSync(path.join(fontDir, file)).toString("base64");
  return `url(data:font/ttf;base64,${data}) format('truetype')`;
}

const FONT_CSS = `
  @font-face {
    font-family: 'Noto Sans Malayalam';
    font-weight: 400;
    src: ${fontDataUri("NotoSansMalayalam-Regular.ttf")};
  }
  @font-face {
    font-family: 'Noto Sans Malayalam';
    font-weight: 700;
    src: ${fontDataUri("NotoSansMalayalam-Bold.ttf")};
  }
`;

let browserPromise: Promise<Browser> | null = null;
function getBrowser(): Promise<Browser> {
  browserPromise ??= chromium.launch();
  return browserPromise;
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function contentHtml(content: string): string {
  return classifyManualLines(content)
    .map((line) => {
      if (line.kind === "blank") return `<div class="spacer"></div>`;
      const bullet = line.kind === "bullet" ? `<span class="dot"></span>` : "";
      return `<p class="line ${line.kind}">${bullet}<span>${escapeHtml(line.text)}</span></p>`;
    })
    .join("\n");
}

const LINK_TYPE_LABEL: Record<MediaItem["linkType"], string> = {
  video: "VIDEO",
  resource: "RESOURCE",
  simulation: "SIMULATION",
};

/**
 * Render a section's links as print-friendly rows: QR code (scannable from
 * the printed page) + label + full URL. QR PNGs are inlined as data URIs.
 */
async function linksHtml(media: MediaItem[] | undefined): Promise<string> {
  if (!media?.length) return "";

  const rows = await Promise.all(
    media.map(async (item) => {
      const qr = await QRCode.toDataURL(item.url, { margin: 1, width: 160 });
      return `
        <div class="link-row">
          <img class="link-qr" src="${qr}" alt="QR code">
          <div class="link-body">
            <p class="link-label">${escapeHtml(item.label || item.url)}
              <span class="link-tag">${LINK_TYPE_LABEL[item.linkType]}</span></p>
            <p class="link-url">${escapeHtml(item.url)}</p>
          </div>
        </div>`;
    })
  );

  return `
    <div class="links">
      <p class="links-title">Digital resources / ഡിജിറ്റൽ വിഭവങ്ങൾ — scan to open</p>
      ${rows.join("\n")}
    </div>`;
}

export async function manualToHtml(manual: TeachingManual): Promise<string> {
  const { basicInfo, sections } = manual;

  const sectionHtml = (
    await Promise.all(
      sections.map(
        async (s, index) => `
      <section>
        <div class="module-label">${sectionNumberLabel(index)}</div>
        <h2>${escapeHtml(s.titleMl)} <span>${escapeHtml(s.titleEn)}</span></h2>
        ${contentHtml(s.content)}
        ${await linksHtml(s.media)}
      </section>`
      )
    )
  ).join("\n");

  return `<!DOCTYPE html>
<html lang="ml">
<head>
<meta charset="utf-8">
<style>
  ${FONT_CSS}
  @page { size: A4; margin: 8mm; }
  * { box-sizing: border-box; }
  body {
    color: #111111;
    font-family: 'Noto Sans Malayalam', sans-serif;
    font-size: 11.2pt;
    line-height: 1.62;
    margin: 0;
    border: 1.25px solid #111111;
    box-decoration-break: clone;
    min-height: 281mm;
    padding: 9mm 8mm 10mm;
    -webkit-box-decoration-break: clone;
  }
  .manual {
    position: relative;
  }
  .header {
    margin-bottom: 8mm;
    text-align: center;
  }
  .kicker {
    font-size: 12.2pt;
    margin: 0 0 1.5mm;
  }
  .meta {
    font-size: 11.8pt;
    font-weight: 700;
    line-height: 1.8;
    margin: 0 0 3mm;
  }
  h1 {
    display: inline-block;
    font-size: 16.8pt;
    line-height: 1.25;
    margin: 0 0 6mm;
    text-decoration: underline;
    text-decoration-thickness: 1.2pt;
    text-underline-offset: 4pt;
  }
  .summary {
    border-collapse: collapse;
    margin: 0 auto 2mm;
    max-width: 132mm;
    width: 100%;
  }
  .summary th,
  .summary td {
    border: 1px solid #111111;
    padding: 3.5pt 6pt;
    text-align: left;
    vertical-align: top;
  }
  .summary th {
    font-size: 9.2pt;
    font-weight: 700;
    width: 36%;
  }
  .summary td {
    font-weight: 700;
  }
  section {
    margin: 0 0 7mm;
    padding: 0;
  }
  .module-label {
    color: #222222;
    font-size: 9.4pt;
    font-weight: 700;
    margin: 0 0 1mm;
  }
  h2 {
    display: inline-block;
    font-size: 13.4pt;
    line-height: 1.3;
    margin: 0 0 3mm;
    text-decoration: underline;
    text-decoration-thickness: 1pt;
    text-underline-offset: 3pt;
  }
  h2 span {
    font-size: 8.8pt;
    font-weight: 400;
    text-decoration: none;
  }
  .line {
    margin: 0 0 3.4pt;
    orphans: 2;
    widows: 2;
  }
  .line.activity {
    display: inline-block;
    font-size: 12pt;
    font-weight: 700;
    margin: 4pt 0 3pt;
    text-decoration: underline;
    text-underline-offset: 3pt;
  }
  .line.reference,
  .line.worksheet,
  .line.consolidation {
    font-weight: 700;
  }
  .line.bullet {
    align-items: baseline;
    display: flex;
    gap: 5pt;
  }
  .dot {
    background: #111111;
    border-radius: 999px;
    flex: 0 0 auto;
    height: 4.2pt;
    margin-top: 5.5pt;
    width: 4.2pt;
  }
  .spacer { height: 4pt; }
  .links {
    border: 1px solid #111111;
    border-left: 3px solid #111111;
    break-inside: avoid;
    margin: 4pt 0 2pt;
    padding: 6pt 8pt;
  }
  .links-title {
    font-size: 8.6pt;
    font-weight: 700;
    letter-spacing: 0.04em;
    margin: 0 0 4pt;
    text-transform: uppercase;
  }
  .link-row {
    align-items: center;
    break-inside: avoid;
    display: flex;
    gap: 8pt;
    margin: 0 0 5pt;
  }
  .link-row:last-child { margin-bottom: 0; }
  .link-qr {
    flex: 0 0 auto;
    height: 16mm;
    width: 16mm;
  }
  .link-body { min-width: 0; }
  .link-label {
    font-size: 10.6pt;
    font-weight: 700;
    margin: 0 0 1pt;
  }
  .link-tag {
    border: 1px solid #111111;
    font-size: 6.8pt;
    font-weight: 700;
    letter-spacing: 0.05em;
    margin-left: 4pt;
    padding: 0.5pt 3pt;
    vertical-align: 1.5pt;
  }
  .link-url {
    font-size: 8.2pt;
    margin: 0;
    overflow-wrap: anywhere;
  }
</style>
</head>
<body>
  <main class="manual">
    <header class="header">
      <p class="kicker">Teaching Manual / അധ്യാപന സഹായി</p>
      <p class="meta">Class : ${escapeHtml(basicInfo.standard)}<br>Unit : ${escapeHtml(basicInfo.chapterNumber)}</p>
      <h1>${escapeHtml(basicInfo.unitName)}</h1>
      <table class="summary">
        <tr><th>Subject / വിഷയം</th><td>${escapeHtml(basicInfo.subject)}</td></tr>
        <tr><th>Chapter / പാഠം</th><td>${escapeHtml(basicInfo.chapterNumber)}</td></tr>
        <tr><th>Time / സമയം</th><td>${escapeHtml(basicInfo.estimatedTime)}</td></tr>
      </table>
    </header>
    ${sectionHtml}
  </main>
</body>
</html>`;
}

export async function manualToPdf(manual: TeachingManual): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(await manualToHtml(manual), { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    const pdf = await page.pdf({
      format: "A4",
      margin: { top: "0", bottom: "0", left: "0", right: "0" },
      preferCSSPageSize: true,
      printBackground: true,
    });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}
