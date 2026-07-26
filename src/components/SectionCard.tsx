"use client";

import { useRef, useState } from "react";
import type {
  ImageItem,
  MediaItem,
  Section,
  TextbookImage,
} from "@/lib/manual-schema";
import {
  classifyManualLines,
  sectionNumberLabel,
} from "@/lib/manual-presentation";
import { CURATED_PORTALS } from "@/lib/resource-links";
import { fileToImageItem } from "@/lib/image-client";

interface Props {
  section: Section;
  index: number;
  total: number;
  textbookImages: TextbookImage[];
  onChange: (section: Section) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
}

const LINK_ICONS: Record<"video" | "resource" | "simulation", string> = {
  video: "▶",
  resource: "🔗",
  simulation: "⚙",
};

export default function SectionCard({
  section,
  index,
  total,
  textbookImages,
  onChange,
  onRemove,
  onMove,
}: Props) {
  const iconBtn =
    "h-8 w-8 rounded border border-zinc-300 bg-white text-sm text-zinc-600 hover:bg-zinc-100 disabled:opacity-30";
  const lines = classifyManualLines(section.content);
  const media = section.media ?? [];
  const images = media.filter((m) => m.kind === "image");
  const links = media.filter((m) => m.kind === "link");

  const uploadRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  function setMedia(next: MediaItem[]) {
    onChange({ ...section, media: next });
  }
  function updateItem(realIndex: number, patch: Partial<MediaItem>) {
    setMedia(
      media.map((item, i) =>
        i === realIndex ? ({ ...item, ...patch } as MediaItem) : item
      )
    );
  }
  function removeItem(realIndex: number) {
    setMedia(media.filter((_, i) => i !== realIndex));
  }
  function addItem(item: MediaItem) {
    setMedia([...media, item]);
  }

  function addTextbookImage(img: TextbookImage) {
    addItem({
      kind: "image",
      src: img.src,
      caption: "",
      source: `Textbook p.${img.page}`,
      width: img.width,
      height: img.height,
    });
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    try {
      addItem(await fileToImageItem(file));
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      if (uploadRef.current) uploadRef.current.value = "";
    }
  }

  const smallBtn =
    "h-8 rounded border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-600 hover:border-emerald-500 hover:text-emerald-700";

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
          <button className={iconBtn} onClick={() => onMove(-1)} disabled={index === 0} title="Move up">
            ↑
          </button>
          <button className={iconBtn} onClick={() => onMove(1)} disabled={index === total - 1} title="Move down">
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
            if (line.kind === "blank") return <div key={lineIndex} className="h-2" />;
            return (
              <p key={lineIndex} className={`manual-line ${line.kind}`}>
                {line.kind === "bullet" && <span className="manual-bullet" />}
                {line.text}
              </p>
            );
          })}

          {images.length > 0 && (
            <div className="manual-figure-grid">
              {images.map((img, i) => (
                <figure key={i} className="manual-figure">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.src} alt={img.caption ?? ""} />
                  {(img.caption || img.source) && (
                    <figcaption>
                      {[img.caption, img.source].filter(Boolean).join(" · ")}
                    </figcaption>
                  )}
                </figure>
              ))}
            </div>
          )}

          {links.length > 0 && (
            <div className="manual-links">
              <p className="manual-links-title">
                Digital resources / ഡിജിറ്റൽ വിഭവങ്ങൾ
              </p>
              {links.map((item, i) => (
                <div key={i} className="manual-link-row">
                  <span className="manual-link-icon" aria-hidden="true">
                    {LINK_ICONS[item.linkType]}
                  </span>
                  <div className="min-w-0">
                    <a href={item.url} target="_blank" rel="noopener noreferrer" className="manual-link-label">
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
          <summary>Edit text, images &amp; links</summary>

          <textarea
            value={section.content}
            onChange={(e) => onChange({ ...section, content: e.target.value })}
            rows={Math.min(18, Math.max(5, section.content.split("\n").length + 1))}
            className="mt-3 w-full resize-y rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />

          {/* ---- Images ---- */}
          <div className="mt-4 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">
              Images
            </p>

            {media.map((item, i) =>
              item.kind !== "image" ? null : (
                <div key={i} className="flex items-start gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.src}
                    alt=""
                    className="h-14 w-14 shrink-0 rounded border border-zinc-300 object-cover"
                  />
                  <input
                    value={item.caption ?? ""}
                    onChange={(e) => updateItem(i, { caption: e.target.value } as Partial<ImageItem>)}
                    placeholder="Caption (optional)"
                    className="h-8 flex-1 rounded border border-zinc-300 bg-white px-2 text-sm"
                  />
                  <button
                    onClick={() => removeItem(i)}
                    className="h-8 rounded border border-red-200 bg-white px-2 text-xs text-red-600 hover:bg-red-50"
                    title="Remove image"
                  >
                    ✕
                  </button>
                </div>
              )
            )}

            {textbookImages.length > 0 && (
              <div>
                <p className="mb-1 text-[11px] text-zinc-500">
                  From this chapter&apos;s textbook — click to add:
                </p>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {textbookImages.map((img, i) => (
                    <button
                      key={i}
                      onClick={() => addTextbookImage(img)}
                      title={`Add figure from p.${img.page}`}
                      className="shrink-0 rounded border border-zinc-300 p-0.5 hover:border-emerald-500"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.src} alt={`p.${img.page}`} className="h-16 w-16 object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-2">
              <button className={smallBtn} onClick={() => uploadRef.current?.click()}>
                + Upload image
              </button>
              <input
                ref={uploadRef}
                type="file"
                accept="image/*"
                onChange={onUpload}
                className="hidden"
              />
              {uploadError && <span className="text-xs text-red-600">{uploadError}</span>}
            </div>
          </div>

          {/* ---- Links ---- */}
          <div className="mt-4 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">
              Links (get a QR code in the exported PDF)
            </p>
            {media.map((item, i) =>
              item.kind !== "link" ? null : (
                <div key={i} className="flex items-center gap-2">
                  <select
                    value={item.linkType}
                    onChange={(e) =>
                      updateItem(i, { linkType: e.target.value } as Partial<MediaItem>)
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
                    onChange={(e) => updateItem(i, { label: e.target.value } as Partial<MediaItem>)}
                    placeholder="Label"
                    className="h-8 w-2/5 rounded border border-zinc-300 bg-white px-2 text-sm"
                  />
                  <input
                    value={item.url}
                    onChange={(e) => updateItem(i, { url: e.target.value } as Partial<MediaItem>)}
                    placeholder="https://…"
                    className="h-8 flex-1 rounded border border-zinc-300 bg-white px-2 text-sm"
                  />
                  <button
                    onClick={() => removeItem(i)}
                    className="h-8 rounded border border-red-200 bg-white px-2 text-xs text-red-600 hover:bg-red-50"
                    title="Remove link"
                  >
                    ✕
                  </button>
                </div>
              )
            )}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() =>
                  addItem({ kind: "link", label: "", url: "https://", linkType: "resource" })
                }
                className={smallBtn}
              >
                + Add link
              </button>
              <select
                value=""
                onChange={(e) => {
                  const portal = CURATED_PORTALS[Number(e.target.value)];
                  if (portal) addItem({ ...portal });
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
