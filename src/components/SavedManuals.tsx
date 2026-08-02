"use client";

import { useEffect, useState } from "react";
import { deleteManual, listManuals, type SavedManualSummary } from "@/lib/manual-store";

interface Props {
  onOpen: (id: string) => void;
  /** Bumped by the parent after a save so the list refreshes. */
  refreshKey?: number;
}

function relativeTime(ts: number): string {
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(ts).toLocaleDateString();
}

/**
 * "My manuals": drafts saved on this device. Shown under the upload form so a
 * teacher can pick up where they left off instead of regenerating.
 */
export default function SavedManuals({ onOpen, refreshKey = 0 }: Props) {
  const [items, setItems] = useState<SavedManualSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listManuals().then((list) => {
      if (alive) {
        setItems(list);
        setLoaded(true);
      }
    });
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  async function remove(id: string) {
    await deleteManual(id);
    setItems((prev) => prev.filter((i) => i.id !== id));
    setConfirmId(null);
  }

  if (!loaded || items.length === 0) return null;

  return (
    <section className="mx-auto mt-10 max-w-xl">
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-zinc-500">
        My manuals ({items.length})
      </h2>
      <p className="mb-3 text-xs text-zinc-500">
        Saved on this device. Nothing is uploaded.
      </p>

      <ul className="divide-y divide-zinc-200 overflow-hidden rounded-lg border border-zinc-200 bg-white">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-2 p-3">
            <button
              onClick={() => onOpen(item.id)}
              className="min-h-11 min-w-0 flex-1 text-left"
            >
              <span className="block truncate text-sm font-semibold text-zinc-900">
                {item.title || "Untitled manual"}
              </span>
              <span className="block text-xs text-zinc-500">
                {item.sectionCount} sections · {relativeTime(item.updatedAt)}
              </span>
            </button>

            {confirmId === item.id ? (
              <span className="flex shrink-0 items-center gap-1">
                <button
                  onClick={() => remove(item.id)}
                  className="h-11 rounded border border-red-300 bg-red-50 px-3 text-xs font-semibold text-red-700"
                >
                  Delete
                </button>
                <button
                  onClick={() => setConfirmId(null)}
                  className="h-11 rounded border border-zinc-300 px-3 text-xs text-zinc-600"
                >
                  Cancel
                </button>
              </span>
            ) : (
              <button
                onClick={() => setConfirmId(item.id)}
                className="h-11 w-11 shrink-0 rounded border border-zinc-200 text-sm text-zinc-500 hover:bg-red-50 hover:text-red-600"
                title="Delete manual"
                aria-label={`Delete ${item.title}`}
              >
                ✕
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
