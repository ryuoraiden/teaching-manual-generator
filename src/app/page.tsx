"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import GeneratingStatus from "@/components/GeneratingStatus";
import ManualEditor from "@/components/ManualEditor";
import SavedManuals from "@/components/SavedManuals";
import UploadForm from "@/components/UploadForm";
import { notifyManualReady, pollJob } from "@/lib/job-client";
import {
  clearPendingJob,
  loadManual,
  loadPendingJob,
  newManualId,
  savePendingJob,
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

  // In-flight background generation. Held here rather than in UploadForm so it
  // survives the form unmounting, and can be resumed on a fresh page load.
  const [job, setJob] = useState<{ id: string; label?: string } | null>(null);
  const [stage, setStage] = useState<string | undefined>(undefined);
  const [hiccups, setHiccups] = useState(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [jobError, setJobError] = useState<string | null>(null);
  const jobAbort = useRef<AbortController | null>(null);

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

  /** Begin (or resume) watching a background generation job. */
  const watchJob = useCallback(
    (jobId: string, label: string | undefined, startedAt: number) => {
      jobAbort.current?.abort();
      const controller = new AbortController();
      jobAbort.current = controller;

      setJob({ id: jobId, label });
      setJobError(null);
      setHiccups(0);
      setElapsedSec(Math.floor((Date.now() - startedAt) / 1000));

      void pollJob(jobId, {
        signal: controller.signal,
        onStage: setStage,
        onNetworkHiccup: setHiccups,
      })
        .then((outcome) => {
          if (controller.signal.aborted) return;
          clearPendingJob();
          setJob(null);
          setStage(undefined);

          if (outcome.status === "done") {
            handleGenerated(
              outcome.manual,
              outcome.textbookImages,
              outcome.meta
            );
            notifyManualReady(label);
          } else {
            setJobError(outcome.error);
          }
        })
        .catch(() => {
          // Only an abort reaches here; the poller resolves other failures.
        });
    },
    [handleGenerated]
  );

  // Resume an unfinished generation after a reload, an app switch that
  // discarded the tab, or the browser being closed entirely. This is the whole
  // point of persisting the ticket.
  //
  // This is the sanctioned "subscribe to an external system" use of an effect:
  // localStorage can't be read during render (the page is prerendered, so it
  // would mismatch hydration), it runs once on mount, and it only sets state
  // when a ticket actually exists.
  useEffect(() => {
    const pending = loadPendingJob();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see above
    if (pending) watchJob(pending.jobId, pending.label, pending.startedAt);
    return () => jobAbort.current?.abort();
  }, [watchJob]);

  // Elapsed-time ticker, so a long wait still looks alive.
  useEffect(() => {
    if (!job) return;
    const t = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [job]);

  const handleJobStarted = useCallback(
    (jobId: string, label?: string) => {
      const startedAt = Date.now();
      savePendingJob({ jobId, label, startedAt });
      watchJob(jobId, label, startedAt);
    },
    [watchJob]
  );

  const handleCancelJob = useCallback(() => {
    jobAbort.current?.abort();
    clearPendingJob();
    setJob(null);
    setStage(undefined);
    setJobError(null);
  }, []);

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
        job ? (
          <GeneratingStatus
            stage={stage}
            label={job.label}
            hiccups={hiccups}
            elapsedSec={elapsedSec}
            onCancel={handleCancelJob}
          />
        ) : (
          <>
            {jobError && (
              <p className="mx-auto mb-4 max-w-xl rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {jobError}
              </p>
            )}
            <UploadForm onJobStarted={handleJobStarted} />
            <SavedManuals onOpen={handleOpen} refreshKey={listKey} />
          </>
        )
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
