"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ManualEditor from "@/components/ManualEditor";
import SavedManuals from "@/components/SavedManuals";
import UploadForm from "@/components/UploadForm";
import {
  loadManual,
  newManualId,
  saveManual,
} from "@/lib/manual-store";
import type {
  GenerationMeta,
  TeachingManual,
  TextbookImage,
} from "@/lib/manual-schema";

/**
 * Two phases on one page:
 *  1. "upload" - pick PDFs + chapter, POST /api/generate-manual, plus the list
 *     of manuals already saved on this device.
 *  2. "edit" - the manual is plain client state; every edit is local and
 *     autosaved to IndexedDB, so closing the tab no longer loses the work.
 *     Export posts the current state to /api/export/{pdf,docx}.
 */
export default function Home() {
  const [manual, setManual] = useState<TeachingManual | null>(null);
  const [textbookImages, setTextbookImages] = useState<TextbookImage[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [listKey, setListKey] = useState(0);
  // Only meaningful for a freshly generated manual, so it is deliberately not
  // persisted with the draft — reopening a saved manual shows no notice.
  const [meta, setMeta] = useState<GenerationMeta | null>(null);

  // Autosave is debounced so typing doesn't hit IndexedDB on every keystroke.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const createdAtRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!manual || !currentId) return;

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void saveManual({
        id: currentId,
        manual,
        textbookImages,
        createdAt: createdAtRef.current,
      }).then(() => {
        setSavedAt(Date.now());
        setListKey((k) => k + 1);
      });
    }, 800);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [manual, textbookImages, currentId]);

  const handleGenerated = useCallback(
    (m: TeachingManual, images: TextbookImage[], m2?: GenerationMeta) => {
      createdAtRef.current = Date.now();
      setCurrentId(newManualId());
      setManual(m);
      setTextbookImages(images);
      setMeta(m2 ?? null);
    },
    []
  );

  const handleOpen = useCallback(async (id: string) => {
    const record = await loadManual(id);
    if (!record) return;
    createdAtRef.current = record.createdAt;
    setCurrentId(record.id);
    setManual(record.manual);
    setTextbookImages(record.textbookImages ?? []);
    setSavedAt(record.updatedAt);
    setMeta(null);
  }, []);

  const handleStartOver = useCallback(() => {
    // The draft stays in "My manuals"; this only leaves the editor.
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setManual(null);
    setTextbookImages([]);
    setCurrentId(null);
    setSavedAt(null);
    setMeta(null);
    createdAtRef.current = undefined;
    setListKey((k) => k + 1);
  }, []);

  return (
    <main className="flex-1 px-4 py-10">
      <header className="mx-auto mb-8 max-w-3xl text-center">
        <h1 className="text-2xl font-bold tracking-tight">
          Teaching Manual Generator
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Kerala State Syllabus · Standards I–VII · അധ്യാപന സഹായി
        </p>
      </header>

      {manual === null ? (
        <>
          <UploadForm onGenerated={handleGenerated} />
          <SavedManuals onOpen={handleOpen} refreshKey={listKey} />
        </>
      ) : (
        <ManualEditor
          manual={manual}
          textbookImages={textbookImages}
          savedAt={savedAt}
          meta={meta}
          onChange={setManual}
          onStartOver={handleStartOver}
        />
      )}
    </main>
  );
}
