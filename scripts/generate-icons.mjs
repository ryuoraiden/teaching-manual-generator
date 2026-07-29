// Generates the PWA icon set from an inline SVG mark.
// Run after changing the mark: node scripts/generate-icons.mjs
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const outDir = path.join(process.cwd(), "public", "icons");
await mkdir(outDir, { recursive: true });

const BG = "#047857"; // emerald-700, matches the app's accent
const INK = "#ffffff";

/**
 * The mark: a teaching manual (page with text lines) plus a QR-ish square,
 * nodding to the scannable resources the exported manuals carry.
 * `pad` is the fraction of the canvas kept empty — maskable icons need a
 * generous safe zone (Android crops them to circles/squircles).
 */
function markSvg(size, pad, rounded) {
  const s = size;
  const inset = s * pad;
  const inner = s - inset * 2;
  const radius = rounded ? s * 0.22 : 0;

  // Page geometry inside the safe zone
  const pw = inner * 0.62;
  const ph = inner * 0.78;
  const px = inset + (inner - pw) / 2 - inner * 0.06;
  const py = inset + (inner - ph) / 2;
  const lineX = px + pw * 0.16;
  const lineW = pw * 0.5;
  const lineH = Math.max(2, ph * 0.055);
  const gap = ph * 0.145;
  const lineTop = py + ph * 0.24;

  // QR block, bottom-right, overlapping the page corner
  const q = inner * 0.3;
  const qx = px + pw - q * 0.42;
  const qy = py + ph - q * 0.72;
  const cell = q / 5;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <rect width="${s}" height="${s}" rx="${radius}" fill="${BG}"/>
  <rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="${pw * 0.08}" fill="${INK}"/>
  ${[0, 1, 2]
    .map(
      (i) =>
        `<rect x="${lineX}" y="${lineTop + i * gap}" width="${
          i === 2 ? lineW * 0.62 : lineW
        }" height="${lineH}" rx="${lineH / 2}" fill="${BG}" opacity="0.85"/>`
    )
    .join("\n  ")}
  <rect x="${qx}" y="${qy}" width="${q}" height="${q}" rx="${q * 0.12}" fill="${INK}" stroke="${BG}" stroke-width="${q * 0.1}"/>
  <rect x="${qx + cell}" y="${qy + cell}" width="${cell * 1.4}" height="${cell * 1.4}" fill="${BG}"/>
  <rect x="${qx + q - cell * 2.4}" y="${qy + cell}" width="${cell * 1.4}" height="${cell * 1.4}" fill="${BG}"/>
  <rect x="${qx + cell}" y="${qy + q - cell * 2.4}" width="${cell * 1.4}" height="${cell * 1.4}" fill="${BG}"/>
  <rect x="${qx + q - cell * 2.4}" y="${qy + q - cell * 2.4}" width="${cell * 1.4}" height="${cell * 1.4}" fill="${BG}"/>
</svg>`;
}

const targets = [
  { file: "icon-192.png", size: 192, pad: 0.08, rounded: true },
  { file: "icon-512.png", size: 512, pad: 0.08, rounded: true },
  // Maskable: no rounding (Android applies its own mask) + big safe zone.
  { file: "icon-maskable-512.png", size: 512, pad: 0.2, rounded: false },
  // iOS home-screen icon: iOS rounds it itself, so keep square.
  { file: "apple-touch-icon.png", size: 180, pad: 0.08, rounded: false },
];

for (const t of targets) {
  const svg = markSvg(t.size, t.pad, t.rounded);
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  await writeFile(path.join(outDir, t.file), png);
  console.log(`OK ${t.file} (${t.size}x${t.size}, ${(png.length / 1024).toFixed(1)} KB)`);
}

// Keep a copy of the source mark for future edits/redesigns.
await writeFile(path.join(outDir, "icon.svg"), markSvg(512, 0.08, true));
console.log("OK icon.svg (source mark)");
