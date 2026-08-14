"use client";

interface Props {
  stage?: string;
  label?: string;
  /** Non-zero once polls start failing, so we can reassure rather than alarm. */
  hiccups: number;
  /** Wall-clock seconds since the job started, for a sense of progress. */
  elapsedSec: number;
  onCancel: () => void;
}

/**
 * Shown while a manual generates on the server.
 *
 * The single most important line here is the reassurance that the teacher can
 * leave. Previously they had to sit and watch, because backgrounding the app
 * killed the request — so saying plainly that it's now safe to switch away is
 * the visible payoff of the whole background-job change.
 */
export default function GeneratingStatus({
  stage,
  label,
  hiccups,
  elapsedSec,
  onCancel,
}: Props) {
  const mins = Math.floor(elapsedSec / 60);
  const secs = elapsedSec % 60;
  const elapsed = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

  return (
    <div className="mx-auto max-w-xl space-y-4 rounded-lg border border-emerald-200 bg-emerald-50 p-5 text-center">
      <div
        className="mx-auto h-8 w-8 animate-spin rounded-full border-3 border-emerald-600 border-t-transparent"
        role="status"
        aria-label="Generating"
      />

      <div>
        <p className="font-semibold text-emerald-900">
          {stage ?? "Generating your manual…"}
        </p>
        {label && <p className="mt-1 text-sm text-emerald-800">{label}</p>}
        <p className="mt-1 text-xs text-emerald-700">{elapsed} elapsed</p>
      </div>

      <p className="rounded-md bg-white/70 px-3 py-2 text-sm text-emerald-900">
        <strong>You can leave this page.</strong> Switch apps, lock your phone,
        or close the tab — the manual keeps generating on the server and will be
        waiting when you come back.
      </p>

      {hiccups > 0 && (
        <p className="text-xs text-amber-800">
          Trouble reaching the server ({hiccups} {hiccups === 1 ? "try" : "tries"}
          ) — still trying. Your manual is unaffected.
        </p>
      )}

      <button
        type="button"
        onClick={onCancel}
        className="min-h-11 w-full rounded-md border border-emerald-300 bg-white px-4 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100"
      >
        Stop waiting and start over
      </button>
    </div>
  );
}
