// Downloads the Unicode Malayalam fonts embedded into exported PDFs.
// Run once after cloning: node scripts/download-fonts.mjs
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const FONTS = [
  {
    file: "NotoSansMalayalam-Regular.ttf",
    url: "https://raw.githubusercontent.com/notofonts/notofonts.github.io/main/fonts/NotoSansMalayalam/hinted/ttf/NotoSansMalayalam-Regular.ttf",
  },
  {
    file: "NotoSansMalayalam-Bold.ttf",
    url: "https://raw.githubusercontent.com/notofonts/notofonts.github.io/main/fonts/NotoSansMalayalam/hinted/ttf/NotoSansMalayalam-Bold.ttf",
  },
];

const outDir = path.join(process.cwd(), "fonts");
await mkdir(outDir, { recursive: true });

for (const { file, url } of FONTS) {
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`FAILED ${file}: HTTP ${res.status} from ${url}`);
    process.exitCode = 1;
    continue;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(path.join(outDir, file), buf);
  console.log(`OK ${file} (${(buf.length / 1024).toFixed(0)} KB)`);
}
