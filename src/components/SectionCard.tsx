"use client";

import type { MediaItem, Section } from "@/lib/manual-schema";
import {
  classifyManualLines,
  sectionNumberLabel,
} from "@/lib/manual-presentation";
import { CURATED_PORTALS } from "@/lib/resource-links";

interface Props {
  section: Section;
  index: number;
  total: number;
  onChange: (section: Section) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
}

const LINK_ICONS: Record<MediaItem["linkType"], string> = {
  video: "▶",
  resource: "🔗",
  simulation: "⚙",
};

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
  const media = section.media ?? [];

  function setMedia(next: MediaItem[]) {
    onChange({ ...section, media: next });
  }

  function updateLink(linkIndex: number, patch: Partial<MediaItem>) {
    setMedia(
      media.map((item, i) => (i === linkIndex ? { ...item, ...patch } : item))
    );
  }

  function removeLink(linkIndex: number) {
    setMedia(media.filter((_, i) => i !== linkIndex));
  }

  function addLink(item?: MediaItem) {
    setMedia([
      ...media,
      item ?? { kind: "link", label: "", url: "https://", linkType: "resource" },
    ]);
  }

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

          {media.length > 0 && (
            <div className="manual-links">
              <p className="manual-links-title">
                Digital resources / ഡിജിറ്റൽ വിഭവങ്ങൾ
              </p>
              {media.map((item, i) => (
                <div key={i} className="manual-link-row">
                  <span className="manual-link-icon" aria-hidden="true">
                    {LINK_ICONS[item.linkType]}
                  </span>
                  <div className="min-w-0">
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="manual-link-label"
                    >
                      {item.label || item.url}
                    </a>
                    <p className="manual-link-url">{item.url}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <details className="manual-edit-panel">
          <summary>Edit section text &amp; links</summary>
          <textarea
            value={section.content}
            onChange={(e) => onChange({ ...section, content: e.target.value })}
            rows={Math.min(18, Math.max(5, section.content.split("\n").length + 1))}
            className="mt-3 w-full resize-y rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />

          <div className="mt-3 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">
              Links (get a QR code in the exported PDF)
            </p>
            {media.map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <select
                  value={item.linkType}
                  onChange={(e) =>
                    updateLink(i, {
                      linkType: e.target.value as MediaItem["linkType"],
                    })
                  }
                  className="h-8 rounded border border-zinc-300 bg-white px-1 text-xs"
                  aria-label="Link type"
                >
                  <option value="video">Video</option>
                  <option value="resource">Resource</option>
                  <option value="simulation">Simulation</option>
                </select>
                <input
                  value={item.label}
                  onChange={(e) => updateLink(i, { label: e.target.value })}
                  placeholder="Label"
                  className="h-8 w-2/5 rounded border border-zinc-300 bg-white px-2 text-sm"
                />
                <input
                  value={item.url}
                  onChange={(e) => updateLink(i, { url: e.target.value })}
                  placeholder="https://…"
                  className="h-8 flex-1 rounded border border-zinc-300 bg-white px-2 text-sm"
                />
                <button
                  onClick={() => removeLink(i)}
                  className="h-8 rounded border border-red-200 bg-white px-2 text-xs text-red-600 hover:bg-red-50"
                  title="Remove link"
                >
                  ✕
                </button>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => addLink()}
                className="h-8 rounded border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-600 hover:border-emerald-500 hover:text-emerald-700"
              >
                + Add link
              </button>
              <select
                value=""
                onChange={(e) => {
                  const portal = CURATED_PORTALS[Number(e.target.value)];
                  if (portal) addLink({ ...portal });
                }}
                className="h-8 rounded border border-zinc-300 bg-white px-1 text-xs text-zinc-600"
                aria-label="Add a Kerala portal link"
              >
                <option value="" disabled>
                  Add Kerala portal…
                </option>
                {CURATED_PORTALS.map((portal, i) => (
                  <option key={portal.url} value={i}>
                    {portal.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </details>
      </div>
    </section>
  );
}
