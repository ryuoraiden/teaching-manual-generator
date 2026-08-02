"use client";

import { useState } from "react";
import {
  SECTION_TITLES,
  type BasicInfo,
  type Section,
  type TeachingManual,
  type TextbookImage,
} from "@/lib/manual-schema";
import SectionCard from "./SectionCard";

interface Props {
  manual: TeachingManual;
  textbookImages: TextbookImage[];
  onChange: (manual: TeachingManual) => void;
  onStartOver: () => void;
}

export default function ManualEditor({
  manual,
  textbookImages,
  onChange,
  onStartOver,
}: Props) {
  const [exporting, setExporting] = useState<"pdf" | "docx" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

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
        <button
          onClick={onStartOver}
          className="h-11 shrink-0 px-1 text-sm font-medium text-zinc-500 hover:text-zinc-800"
        >
          ← <span className="hidden sm:inline">Start over</span>
          <span className="sm:hidden">New</span>
        </button>
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
