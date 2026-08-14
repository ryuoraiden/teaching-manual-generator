"use client";

import { useState } from "react";
import {
  SECTION_TITLES,
  type BasicInfo,
  type GenerationMeta,
  type Section,
  type TeachingManual,
  type TextbookImage,
} from "@/lib/manual-schema";
import SectionCard from "./SectionCard";

interface Props {
  manual: TeachingManual;
  textbookImages: TextbookImage[];
  /** Timestamp of the last successful local autosave, if any. */
  savedAt?: number | null;
  /** Diagnostics from generation; null for a reopened draft. */
  meta?: GenerationMeta | null;
  onChange: (manual: TeachingManual) => void;
  onStartOver: () => void;
}

/**
 * Explain an empty figure gallery. Silence here was being read as "the image
 * feature is broken", when the real cause is almost always that we couldn't
 * work out which pages the chapter occupies.
 */
interface Notice {
  text: string;
  tone: "good" | "warn";
}

function figureNotice(meta: GenerationMeta): Notice | null {
  if (meta.imagesFound > 0) {
    const placed = meta.figuresPlaced ?? 0;
    if (placed > 0) {
      return {
        tone: "good",
        text: `${placed} textbook ${
          placed === 1 ? "figure was" : "figures were"
        } placed into sections automatically — check they're where you'd want them, and add more from each section's gallery.`,
      };
    }
    // Figures were found but none matched a section well enough to place.
    return {
      tone: "warn",
      text: `${meta.imagesFound} textbook ${
        meta.imagesFound === 1 ? "figure is" : "figures are"
      } available in each section's gallery, but none clearly matched a section, so nothing was placed automatically. Add the ones you want.`,
    };
  }
  if (meta.chapterSliceStrategy === "fallback-full") {
    return {
      tone: "warn",
      text: "We couldn't tell which pages this chapter covers, so no textbook figures were extracted. Start over and enter the chapter's page range (e.g. 24-33) to get them.",
    };
  }
  return {
    tone: "warn",
    text: "No figures were found on this chapter's pages. The textbook may store them in a form we can't extract (for example, scanned pages). You can still add your own images to any section.",
  };
}

export default function ManualEditor({
  manual,
  textbookImages,
  savedAt,
  meta,
  onChange,
  onStartOver,
}: Props) {
  const [exporting, setExporting] = useState<"pdf" | "docx" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  const notice = meta && !noticeDismissed ? figureNotice(meta) : null;

  function updateBasicInfo<K extends keyof BasicInfo>(key: K, value: string) {
    onChange({ ...manual, basicInfo: { ...manual.basicInfo, [key]: value } });
  }

  function updateSection(index: number, section: Section) {
    const sections = [...manual.sections];
    sections[index] = section;
    onChange({ ...manual, sections });
  }

  function removeSection(index: number) {
    onChange({ ...manual, sections: manual.sections.filter((_, i) => i !== index) });
  }

  function moveSection(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= manual.sections.length) return;
    const sections = [...manual.sections];
    [sections[index], sections[target]] = [sections[target], sections[index]];
    onChange({ ...manual, sections });
  }

  function addSection() {
    const custom = SECTION_TITLES.custom;
    onChange({
      ...manual,
      sections: [
        ...manual.sections,
        {
          id: `custom-${Date.now()}`,
          type: "custom",
          titleMl: custom.ml,
          titleEn: custom.en,
          content: "",
        },
      ],
    });
  }

  async function exportAs(kind: "pdf" | "docx") {
    setExportError(null);
    setExporting(kind);
    try {
      const res = await fetch(`/api/export/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(manual),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `Export failed (${res.status}).`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `teaching-manual-std${manual.basicInfo.standard}-ch${manual.basicInfo.chapterNumber}.${kind}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setExporting(null);
    }
  }

  const infoField =
    "w-full border-0 bg-transparent px-1 py-1 text-sm font-medium text-zinc-950 focus:outline-none focus:ring-2 focus:ring-emerald-500";

  const basicInfoFields: { key: keyof BasicInfo; label: string }[] = [
    { key: "standard", label: "Standard / ക്ലാസ്" },
    { key: "subject", label: "Subject / വിഷയം" },
    { key: "unitName", label: "Unit / യൂണിറ്റ്" },
    { key: "chapterNumber", label: "Chapter / പാഠം" },
    { key: "estimatedTime", label: "Time / സമയം" },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="manual-toolbar sticky top-0 z-10 -mx-4 flex items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-50/95 px-4 py-2 backdrop-blur">
        <div className="flex min-w-0 items-center gap-2">
          <button
            onClick={onStartOver}
            className="h-11 shrink-0 px-1 text-sm font-medium text-zinc-500 hover:text-zinc-800"
          >
            ← <span className="hidden sm:inline">Start over</span>
            <span className="sm:hidden">New</span>
          </button>
          {savedAt && (
            <span
              className="truncate text-xs text-emerald-700"
              title="Saved on this device"
            >
              ✓ Saved
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => exportAs("pdf")}
            disabled={exporting !== null}
            className="h-11 rounded-md bg-zinc-950 px-3 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-60 sm:px-4"
          >
            {exporting === "pdf" ? (
              "Exporting..."
            ) : (
              <>
                <span className="hidden sm:inline">Export </span>PDF
              </>
            )}
          </button>
          <button
            onClick={() => exportAs("docx")}
            disabled={exporting !== null}
            className="h-11 rounded-md bg-blue-700 px-3 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60 sm:px-4"
          >
            {exporting === "docx" ? (
              "Exporting..."
            ) : (
              <>
                <span className="hidden sm:inline">Export </span>Word
                <span className="hidden sm:inline"> (.docx)</span>
              </>
            )}
          </button>
        </div>
      </div>

      {exportError && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{exportError}</p>
      )}

      {notice && (
        <div
          className={`flex items-start gap-3 rounded-md px-3 py-2 text-sm ${
            notice.tone === "good"
              ? "bg-emerald-50 text-emerald-900"
              : "bg-amber-50 text-amber-900"
          }`}
        >
          <p className="flex-1">{notice.text}</p>
          <button
            type="button"
            onClick={() => setNoticeDismissed(true)}
            aria-label="Dismiss"
            className={`min-h-11 min-w-11 shrink-0 rounded ${
              notice.tone === "good"
                ? "text-emerald-700 hover:bg-emerald-100"
                : "text-amber-700 hover:bg-amber-100"
            }`}
          >
            ✕
          </button>
        </div>
      )}

      <div className="manual-paper">
        <div className="manual-page-header">
          <div className="manual-seal" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-zinc-700">Teaching Manual</p>
            <h2 className="manual-document-title">
              {manual.basicInfo.subject || "Subject"} - {manual.basicInfo.unitName || "Unit"}
            </h2>
            <p className="text-sm font-semibold text-zinc-700">
              Standard {manual.basicInfo.standard || "-"} | Chapter{" "}
              {manual.basicInfo.chapterNumber || "-"}
            </p>
          </div>
        </div>

        <div className="manual-info-grid">
          {basicInfoFields.map(({ key, label }) => (
            <label key={key} className="manual-info-cell">
              <span>{label}</span>
              <input
                value={manual.basicInfo[key]}
                onChange={(e) => updateBasicInfo(key, e.target.value)}
                className={infoField}
              />
            </label>
          ))}
        </div>

        <div className="manual-section-list">
          {manual.sections.map((section, index) => (
            <SectionCard
              key={section.id}
              section={section}
              index={index}
              total={manual.sections.length}
              textbookImages={textbookImages}
              onChange={(s) => updateSection(index, s)}
              onRemove={() => removeSection(index)}
              onMove={(dir) => moveSection(index, dir)}
            />
          ))}
        </div>

        <button
          onClick={addSection}
          className="mt-6 min-h-11 w-full border border-dashed border-zinc-400 bg-zinc-50 py-3 text-sm font-semibold text-zinc-600 hover:border-emerald-500 hover:text-emerald-700"
        >
          + Add section
        </button>
      </div>
    </div>
  );
}
