// Verifies local draft persistence end to end in a real browser:
// save -> reload -> list -> reopen -> edit -> delete.
import { chromium } from "playwright";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 850 } });
const page = await ctx.newPage();
const log = [];
const check = (name, pass) => {
  log.push(`${pass ? "PASS" : "FAIL"}  ${name}`);
  return pass;
};
let ok = true;

// The editor needs a manual; /demo gives us one without a generation call.
await page.goto("http://localhost:3000/demo", { waitUntil: "networkidle" });

// Write a record through the app's own store module semantics by driving the
// real UI would need an upload; instead exercise the store directly in-page,
// which is what the app calls.
const saved = await page.evaluate(async () => {
  const DB = "teaching-manual-generator";
  function open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains("manuals")) {
          const s = db.createObjectStore("manuals", { keyPath: "id" });
          s.createIndex("updatedAt", "updatedAt");
        }
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  const db = await open();
  const rec = {
    id: "test-1",
    title: "പരിസരപഠനം · നമ്മുടെ ചുറ്റുപാട് · Std IV",
    manual: {
      basicInfo: {
        standard: "IV",
        subject: "പരിസരപഠനം",
        unitName: "നമ്മുടെ ചുറ്റുപാട്",
        chapterNumber: "3",
        estimatedTime: "6 periods",
      },
      sections: [
        { id: "a", type: "learningOutcomes", titleMl: "പഠനനേട്ടങ്ങൾ", titleEn: "Outcomes", content: "- one" },
        { id: "b", type: "assessment", titleMl: "വിലയിരുത്തൽ", titleEn: "Assessment", content: "- two" },
      ],
    },
    textbookImages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await new Promise((res, rej) => {
    const t = db.transaction("manuals", "readwrite");
    const r = t.objectStore("manuals").put(rec);
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
  db.close();
  return true;
});
ok = check("wrote a draft to IndexedDB", saved) && ok;

// Reload the home page: the saved draft must appear in "My manuals".
await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });
await page.waitForTimeout(600);
const listVisible = await page.locator("text=My manuals").first().isVisible().catch(() => false);
ok = check("'My manuals' list renders after reload", listVisible) && ok;

const titleVisible = await page
  .locator("text=നമ്മുടെ ചുറ്റുപാട്")
  .first()
  .isVisible()
  .catch(() => false);
ok = check("saved manual title shown (Malayalam intact)", titleVisible) && ok;

// Reopen it: the editor should load that manual's content.
await page.locator("button", { hasText: "നമ്മുടെ ചുറ്റുപാട്" }).first().click();
await page.waitForTimeout(800);
const inEditor = await page.locator(".manual-paper").first().isVisible().catch(() => false);
ok = check("clicking a saved manual opens the editor", inEditor) && ok;

const sectionCount = await page.locator(".manual-section").count();
ok = check("restored both sections", sectionCount === 2) && ok;

// Edit a title, wait past the 800ms autosave debounce, reload, confirm persisted.
const titleInput = page.locator(".manual-title-input").first();
await titleInput.fill("എഡിറ്റ് ചെയ്തു");
await page.waitForTimeout(1600);
await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });
await page.waitForTimeout(600);
const editPersisted = await page.evaluate(async () => {
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open("teaching-manual-generator", 1);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  const rec = await new Promise((res, rej) => {
    const t = db.transaction("manuals", "readonly");
    const r = t.objectStore("manuals").get("test-1");
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  db.close();
  return rec?.manual?.sections?.[0]?.titleMl ?? null;
});
ok = check(`edit autosaved (got "${editPersisted}")`, editPersisted === "എഡിറ്റ് ചെയ്തു") && ok;

// Delete flow: ✕ then confirm Delete.
await page.locator('button[aria-label^="Delete"]').first().click();
await page.waitForTimeout(200);
await page.locator("button", { hasText: /^Delete$/ }).first().click();
await page.waitForTimeout(500);
const remaining = await page.evaluate(async () => {
  const db = await new Promise((res) => {
    const r = indexedDB.open("teaching-manual-generator", 1);
    r.onsuccess = () => res(r.result);
  });
  const all = await new Promise((res) => {
    const t = db.transaction("manuals", "readonly");
    const r = t.objectStore("manuals").getAll();
    r.onsuccess = () => res(r.result);
  });
  db.close();
  return all.length;
});
ok = check("delete removes the record", remaining === 0) && ok;

console.log(log.join("\n"));
console.log(ok ? "\nALL PASS" : "\nFAILURES");
await browser.close();
process.exit(ok ? 0 : 1);
