import type {
  GenerationMeta,
  TeachingManual,
  TextbookImage,
} from "./manual-schema";

/**
 * Client half of background generation.
 *
 * Polling — rather than one long-held request — is the whole point: each poll
 * is a tiny request that can fail and be retried harmlessly. A phone that
 * sleeps, loses signal, or is backgrounded simply stops asking for a while and
 * picks up where it left off, instead of losing the work.
 */

export interface JobDone {
  status: "done";
  manual: TeachingManual;
  textbookImages: TextbookImage[];
  meta?: GenerationMeta;
}

export type PollOutcome =
  | JobDone
  | { status: "error"; error: string }
  | { status: "expired"; error: string };

/** Poll cadence: quick at first (most manuals finish in well under a minute). */
const FIRST_DELAY_MS = 1500;
const MAX_DELAY_MS = 5000;
/** Give up long after the server's own max duration, not before it. */
const MAX_WAIT_MS = 6 * 60 * 1000;
/**
 * Transient network failures are expected (this is the exact scenario the whole
 * design exists for), so a run of them must not be treated as failure.
 */
const MAX_CONSECUTIVE_NETWORK_ERRORS = 12;

export interface PollOptions {
  onStage?: (stage: string | undefined) => void;
  /** Called when a poll fails to reach the server, so the UI can reassure. */
  onNetworkHiccup?: (consecutive: number) => void;
  signal?: AbortSignal;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true }
    );
  });

export async function pollJob(
  jobId: string,
  opts: PollOptions = {}
): Promise<PollOutcome> {
  const startedAt = Date.now();
  let delay = FIRST_DELAY_MS;
  let networkErrors = 0;

  for (;;) {
    if (Date.now() - startedAt > MAX_WAIT_MS) {
      return {
        status: "error",
        error:
          "This is taking much longer than expected. The manual may still finish — reopen the app shortly to check.",
      };
    }

    try {
      const res = await fetch(
        `/api/generate-manual/${encodeURIComponent(jobId)}`,
        { cache: "no-store", signal: opts.signal }
      );

      if (res.status === 404) {
        const body = await res.json().catch(() => ({}));
        return {
          status: "expired",
          error:
            body.error ??
            "This generation is no longer available. Please generate the manual again.",
        };
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      networkErrors = 0;

      if (data.status === "done") {
        if (!data.manual) {
          return { status: "error", error: "The server returned no manual." };
        }
        return {
          status: "done",
          manual: data.manual as TeachingManual,
          textbookImages: (data.textbookImages ?? []) as TextbookImage[],
          meta: data.meta as GenerationMeta | undefined,
        };
      }

      if (data.status === "error") {
        return {
          status: "error",
          error: data.error ?? "Generation failed.",
        };
      }

      opts.onStage?.(data.stage);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;

      // Couldn't reach the server. Expected on a flaky mobile connection — the
      // job keeps running regardless, so keep trying rather than giving up.
      networkErrors++;
      opts.onNetworkHiccup?.(networkErrors);
      if (networkErrors >= MAX_CONSECUTIVE_NETWORK_ERRORS) {
        return {
          status: "error",
          error:
            "Couldn't reach the server for a while. Your manual may still be generating — reopen the app to check.",
        };
      }
    }

    await sleep(delay, opts.signal);
    delay = Math.min(Math.round(delay * 1.3), MAX_DELAY_MS);
  }
}

/**
 * Ask for notification permission at a moment the user has just acted, which is
 * both required by browsers and less intrusive than prompting on page load.
 * Never throws, and never blocks generation.
 */
export async function requestNotificationPermission(): Promise<void> {
  try {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "default") await Notification.requestPermission();
  } catch {
    // Unsupported or blocked — generation is unaffected.
  }
}

/**
 * Tell the teacher their manual is ready when they're looking at something
 * else. Only fires while the page is hidden: a notification for a tab you're
 * already staring at is just noise.
 *
 * Note the ceiling: if the browser has fully discarded the page, no page code
 * runs at all, so nothing can fire. The manual is still waiting on return —
 * that guarantee comes from the job store, not from this.
 */
export function notifyManualReady(label?: string): void {
  try {
    if (typeof document === "undefined" || !document.hidden) return;
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;
    new Notification("Your teaching manual is ready", {
      body: label ?? "Tap to open it.",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: "tmg-manual-ready",
    });
  } catch {
    // Some browsers throw when constructing Notification outside a SW; ignore.
  }
}
