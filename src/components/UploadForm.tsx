"use client";

import { useState } from "react";
import type { OutputLanguage } from "@/lib/manual-schema";
import { requestNotificationPermission } from "@/lib/job-client";

/**
 * Turn a raw fetch failure into something a teacher can act on.
 *
 * The browser reports every dropped connection as the bare string
 * "Failed to fetch" — which is what teachers were seeing. At this point it can
 * only mean the *upload* was interrupted, since generation no longer holds the
 * connection open.
 */
function describeError(err: unknown): string {
  if (err instanceof DOMException && err.name === "AbortError") {
    return "The upload timed out. A very large textbook on a slow connection can exceed this — try again, or enter the chapter's page range so less of the book is sent.";
  }
  if (err instanceof TypeError) {
    return "The upload was interrupted before it finished. Check your internet and try again — and keep the app open until it says generating has started.";
  }
  if (err instanceof Error) return err.message;
  return "Something went wrong.";
}

interface Props {
  /** Called once the upload lands and the server hands back a job ticket. */
  onJobStarted: (jobId: string, label?: string) => void;
}

/**
 * Upload timeout. This now covers only the upload itself, not generation, so
 * it can be much tighter than the old whole-request timeout.
 */
const UPLOAD_TIMEOUT_MS = 3 * 60 * 1000;

export default function UploadForm({ onJobStarted }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setStatus("Preparing upload…");
    setBusy(true);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

    // Asked here because a submit is a genuine user gesture (browsers require
    // one) and because it's the moment the teacher has expressed intent to wait.
    void requestNotificationPermission();

    try {
      const formData = new FormData(e.currentTarget);
      setStatus("Uploading PDFs — keep the app open…");
      const res = await fetch("/api/generate-manual", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      // A crashed/restarted server can return HTML or an empty body, which makes
      // res.json() throw a confusing parse error instead of something useful.
      let data: { jobId?: string; label?: string; error?: string };
      try {
        data = await res.json();
      } catch {
        throw new Error(
          res.ok
            ? "The server sent a response we couldn't read. Please try again."
            : `The server returned an error (${res.status}). Please try again in a moment.`
        );
      }

      if (!res.ok) throw new Error(data.error ?? "Generation failed.");
      if (!data.jobId) throw new Error("The server didn't start the generation.");

      // Handing the ticket up ends this form's involvement; the page owns the
      // job from here, which is what lets it survive a reload.
      onJobStarted(data.jobId, data.label);
    } catch (err) {
      setError(describeError(err));
      setStatus(null);
      setBusy(false);
    } finally {
      clearTimeout(timeout);
    }
  }

  const field =
    "w-full min-h-11 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500";
  const label = "block text-sm font-medium text-zinc-700 mb-1";

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-xl space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={label}>Standard / ക്ലാസ്</label>
          <select name="standard" className={field} required defaultValue="">
            <option value="" disabled>
              Select…
            </option>
            {["I", "II", "III", "IV", "V", "VI", "VII"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>Subject / വിഷയം</label>
          <input
            name="subject"
            className={field}
            placeholder="e.g. പരിസരപഠനം"
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={label}>Chapter number / പാഠം നമ്പർ</label>
          <input name="chapterNumber" className={field} placeholder="e.g. 3" required />
        </div>
        <div>
          <label className={label}>Chapter name (optional)</label>
          <input name="chapterName" className={field} placeholder="e.g. നമ്മുടെ ചുറ്റുപാട്" />
        </div>
      </div>

      <div>
        <label className={label}>
          Textbook page range{" "}
          <span className="font-normal text-zinc-500">
            (optional — e.g. 24-33)
          </span>
        </label>
        <input name="pageRange" className={field} placeholder="24-33" inputMode="numeric" />
        <p className="mt-1 text-xs text-zinc-500">
          Use this if the chapter&apos;s figures don&apos;t come through. It tells us
          exactly which PDF pages the chapter covers, which also makes generation
          faster.
        </p>
      </div>

      <div>
        <label className={label}>Textbook PDF / പാഠപുസ്തകം</label>
        <input type="file" name="textbook" accept="application/pdf" className={field} required />
      </div>

      <div>
        <label className={label}>Teacher Handbook PDF / അധ്യാപക സഹായി</label>
        <input type="file" name="handbook" accept="application/pdf" className={field} required />
      </div>

      <div>
        <label className={label}>
          Workbook PDF / വർക്ക്ബുക്ക്{" "}
          <span className="font-normal text-zinc-500">
            (optional, if the subject has one)
          </span>
        </label>
        <input type="file" name="workbook" accept="application/pdf" className={field} />
      </div>

      <div>
        <label className={label}>Manual language</label>
        <select name="language" className={field} defaultValue={"both" satisfies OutputLanguage}>
          <option value="ml">Malayalam</option>
          <option value="en">English</option>
          <option value="both">Bilingual (Malayalam + English)</option>
        </select>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {status && !error && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {status}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="min-h-12 w-full rounded-md bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
      >
        {busy ? "Generating manual... this can take a minute or two" : "Generate Teaching Manual"}
      </button>
    </form>
  );
}
