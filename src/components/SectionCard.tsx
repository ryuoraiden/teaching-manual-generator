"use client";

import type { Section } from "@/lib/manual-schema";
import {
  classifyManualLines,
  sectionNumberLabel,
} from "@/lib/manual-presentation";

interface Props {
  section: Section;
  index: number;
  total: number;
  onChange: (section: Section) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
}

export default function SectionCard({
  section,
  index,
  total,
  onChange,
  onRemove,
  onMove,
}: Props) {
  const iconBtn =
    "h-8 w-8 rounded border border-zinc-300 bg-white text-sm text-zinc-600 hover:bg-zinc-100 disabled:opacity-30";
  const lines = classifyManualLines(section.content);

  return (
    <section className="manual-section">
      <div className="manual-section-head">
        <div className="min-w-0 flex-1">
          <div className="mb-1 text-[11px] font-semibold uppercase text-zinc-500">
            {sectionNumberLabel(index)}
          </div>
          <div className="grid gap-1">
            <input
              value={section.titleMl}
              onChange={(e) => onChange({ ...section, titleMl: e.target.value })}
              className="manual-title-input"
              aria-label="Section title (Malayalam)"
            />
            <input
              value={section.titleEn}
              onChange={(e) => onChange({ ...section, titleEn: e.target.value })}
              className="manual-subtitle-input"
              aria-label="Section title (English)"
            />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            className={iconBtn}
            onClick={() => onMove(-1)}
            disabled={index === 0}
            title="Move up"
          >
            ↑
          </button>
          <button
            className={iconBtn}
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            title="Move down"
          >
            ↓
          </button>
          <button
            className="h-8 rounded border border-red-200 bg-white px-2 text-xs font-medium text-red-600 hover:bg-red-50"
            onClick={onRemove}
            title="Remove section"
          >
            Remove
          </button>
        </div>
      </div>

      <div className="manual-section-body">
        <div className="manual-preview" aria-label="Formatted section preview">
          {lines.map((line, lineIndex) => {
            if (line.kind === "blank") {
              return <div key={lineIndex} className="h-2" />;
            }
            return (
              <p key={lineIndex} className={`manual-line ${line.kind}`}>
                {line.kind === "bullet" && <span className="manual-bullet" />}
                {line.text}
              </p>
            );
          })}
        </div>

        <details className="manual-edit-panel">
          <summary>Edit section text</summary>
          <textarea
            value={section.content}
            onChange={(e) => onChange({ ...section, content: e.target.value })}
            rows={Math.min(18, Math.max(5, section.content.split("\n").length + 1))}
            className="mt-3 w-full resize-y rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </details>
      </div>
    </section>
  );
}
