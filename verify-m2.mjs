// M2 verification: measures the editor at phone/tablet/desktop widths using a
// real touch-emulated context (so the (hover:none) rules actually apply) and
// writes screenshots.
import { chromium, devices } from "playwright";

const OUT =
  "C:/Users/imhan/AppData/Local/Temp/claude/D--Projects/405745be-20ef-4c0e-9b67-8568cb777f03/scratchpad";

const CASES = [
  { name: "phone-375", viewport: { width: 375, height: 812 }, touch: true },
  { name: "phone-414", viewport: { width: 414, height: 896 }, touch: true },
  { name: "tablet-768", viewport: { width: 768, height: 1024 }, touch: true },
  { name: "desktop-1280", viewport: { width: 1280, height: 900 }, touch: false },
];

const browser = await chromium.launch();
let failures = 0;

for (const c of CASES) {
  const ctx = await browser.newContext({
    viewport: c.viewport,
    hasTouch: c.touch,
    isMobile: c.touch,
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  await page.goto("http://localhost:3000/demo", { waitUntil: "networkidle" });
  // Open every edit panel so the controls are laid out and measurable.
  await page.evaluate(() =>
    document.querySelectorAll("details.manual-edit-panel").forEach((d) => (d.open = true))
  );
  await page.waitForTimeout(300);

  const m = await page.evaluate(() => {
    const vw = window.innerWidth;
    const urls = [...document.querySelectorAll('input[placeholder^="https"]')].map((el) =>
      Math.round(el.getBoundingClientRect().width)
    );
    const smallControls = [];
    document.querySelectorAll("button, select, input, textarea").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      // Inline title inputs inside the paper are document text, not controls.
      if (el.classList.contains("manual-title-input")) return;
      if (el.classList.contains("manual-subtitle-input")) return;
      if (r.height < 44) {
        smallControls.push({
          t: el.tagName.toLowerCase(),
          l: (el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.textContent || "").trim().slice(0, 22),
          h: Math.round(r.height),
        });
      }
    });
    const wide = [];
    document.querySelectorAll("*").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width > vw + 1 && r.height > 0) wide.push(el.tagName.toLowerCase());
    });
    const paper = document.querySelector(".manual-paper");
    const touchMatch = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
    return {
      vw,
      overflow: document.documentElement.scrollWidth > vw + 1,
      wideCount: wide.length,
      minUrl: urls.length ? Math.min(...urls) : null,
      smallCount: smallControls.length,
      smallSample: smallControls.slice(0, 5),
      paperMinHeight: paper ? getComputedStyle(paper).minHeight : null,
      touchMatch,
      inputFontSize: getComputedStyle(document.querySelector('input[placeholder^="https"]')).fontSize,
    };
  });

  await page.screenshot({ path: `${OUT}/m2-${c.name}.png`, fullPage: false });

  const checks = [
    ["no horizontal overflow", m.overflow === false],
    ["no element wider than viewport", m.wideCount === 0],
    ["url input >= 200px", (m.minUrl ?? 0) >= 200],
  ];
  if (c.touch) {
    // 44px is a touch-target guideline; desktop keeps its denser layout.
    checks.push(["all controls >= 44px tall", m.smallCount === 0]);
    checks.push(["touch media query matched", m.touchMatch === true]);
    checks.push(["inputs 16px (no iOS zoom)", m.inputFontSize === "16px"]);
  }
  if (c.viewport.width < 760) {
    checks.push(["paper min-height released", m.paperMinHeight === "0px"]);
  }

  console.log(`\n=== ${c.name} (${m.vw}px, touch=${c.touch}) ===`);
  console.log(`    urlInput=${m.minUrl}px  controlsUnder44=${m.smallCount}  paperMinH=${m.paperMinHeight}  inputFont=${m.inputFontSize}`);
  for (const [label, pass] of checks) {
    console.log(`  ${pass ? "PASS" : "FAIL"}  ${label}`);
    if (!pass) failures++;
  }
  if (m.smallCount) console.log("    small:", JSON.stringify(m.smallSample));

  await ctx.close();
}

await browser.close();
console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
