import type { TeachingManual, TextbookImage } from "./manual-schema";

/**
 * Local draft storage for generated manuals.
 *
 * IndexedDB, not localStorage: a manual embeds its images as base64 data URIs,
 * so a single record can be several megabytes and would blow localStorage's
 * ~5 MB total budget. IndexedDB also stores structured objects directly, so
 * there is no JSON stringify/parse cost on every autosave.
 *
 * Hand-rolled (no dependency) because the surface we need is tiny: put, get,
 * list, delete. Everything here is browser-only and returns safe fallbacks
 * when IndexedDB is unavailable (private mode, old browser), so the app keeps
 * working without persistence rather than crashing.
 */

const DB_NAME = "teaching-manual-generator";
const DB_VERSION = 1;
const STORE = "manuals";

export interface SavedManual {
  id: string;
  title: string;
  manual: TeachingManual;
  /** The chapter figure pool, so reopening a draft keeps the gallery usable. */
  textbookImages: TextbookImage[];
  createdAt: number;
  updatedAt: number;
}

/** Summary shown in the "My manuals" list (no heavy payload). */
export type SavedManualSummary = Omit<
  SavedManual,
  "manual" | "textbookImages"
> & { sectionCount: number };

function hasIndexedDb(): boolean {
  return typeof window !== "undefined" && "indexedDB" in window;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      })
  );
}

/** Human label for the list, derived from what the teacher actually filled in. */
export function manualTitle(manual: TeachingManual): string {
  const { subject, unitName, chapterNumber, standard } = manual.basicInfo;
  const name = unitName?.trim() || `Chapter ${chapterNumber || "?"}`;
  const subj = subject?.trim();
  return [subj, name, standard ? `Std ${standard}` : ""]
    .filter(Boolean)
    .join(" · ");
}

export function newManualId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `m-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function saveManual(
  record: Omit<SavedManual, "title" | "createdAt" | "updatedAt"> & {
    createdAt?: number;
  }
): Promise<void> {
  if (!hasIndexedDb()) return;
  const now = Date.now();
  const full: SavedManual = {
    ...record,
    title: manualTitle(record.manual),
    createdAt: record.createdAt ?? now,
    updatedAt: now,
  };
  try {
    await tx("readwrite", (s) => s.put(full));
  } catch (err) {
    // Quota exceeded or storage blocked: keep the app usable, just unsaved.
    console.error("Could not save the manual locally:", err);
  }
}

export async function loadManual(id: string): Promise<SavedManual | null> {
  if (!hasIndexedDb()) return null;
  try {
    return (await tx<SavedManual | undefined>("readonly", (s) => s.get(id))) ?? null;
  } catch {
    return null;
  }
}

export async function listManuals(): Promise<SavedManualSummary[]> {
  if (!hasIndexedDb()) return [];
  try {
    const all = await tx<SavedManual[]>("readonly", (s) => s.getAll());
    return all
      .map(({ manual, textbookImages: _images, ...rest }) => ({
        ...rest,
        sectionCount: manual.sections.length,
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export async function deleteManual(id: string): Promise<void> {
  if (!hasIndexedDb()) return;
  try {
    await tx("readwrite", (s) => s.delete(id));
  } catch (err) {
    console.error("Could not delete the manual:", err);
  }
}
