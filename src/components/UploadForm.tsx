"use client";

import { useState } from "react";
import type {
  OutputLanguage,
  TeachingManual,
  TextbookImage,
} from "@/lib/manual-schema";

interface Props {
  onGenerated: (manual: TeachingManual, textbookImages: TextbookImage[]) => void;
}

export default function UploadForm({ onGenerated }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setStatus("Preparing upload...");
    setBusy(true);
    try {
      const formData = new FormData(e.currentTarget);
      setStatus("Uploading PDFs and generating manual...");
      const res = await fetch("/api/generate-manual", {
        method: "POST",
        body: formData,
      });
      setStatus("Reading generated manual...");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generation failed.");
      onGenerated(
        data.manual as TeachingManual,
        (data.textbookImages ?? []) as TextbookImage[]
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setStatus(null);
      setBusy(false);
    }
  }

  const field =
    "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500";
  const label = "block text-sm font-medium text-zinc-700 mb-1";

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-xl space-y-4">
      <div className="grid grid-cols-2 gap-4">
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

      <div className="grid grid-cols-2 gap-4">
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
        <label className={label}>Textbook PDF / പാഠപുസ്തകം</label>
        <input type="file" name="textbook" accept="application/pdf" className={field} required />
      </div>

      <div>
        <label className={label}>Teacher Handbook PDF / അധ്യാപക സഹായി</label>
        <input type="file" name="handbook" accept="application/pdf" className={field} required />
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
        className="w-full rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
      >
        {busy ? "Generating manual... this can take a minute or two" : "Generate Teaching Manual"}
      </button>
    </form>
  );
}
