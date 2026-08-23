/**
 * Outbound notifications to a Discord webhook.
 *
 * This project has no database, no analytics service and no budget, but it does
 * need to know two things: what teachers are saying, and whether generation is
 * actually working in production. A Discord webhook covers both for free — it
 * keeps a searchable history and pushes to a phone.
 *
 * Every function here is best-effort and never throws: a notification failing
 * must never affect a teacher's manual.
 */

const TIMEOUT_MS = 8000;
/** Discord rejects messages over 2000 characters. */
const MAX_CONTENT = 1990;

export async function postWebhook(
  url: string | undefined,
  content: string,
  label = "webhook"
): Promise<boolean> {
  if (!url) return false;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: content.slice(0, MAX_CONTENT) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) console.error(`${label} rejected: HTTP ${res.status}`);
    return res.ok;
  } catch (err) {
    console.error(`${label} failed:`, err);
    return false;
  }
}

export interface GenerationReport {
  standard: string;
  subject: string;
  chapterNumber: string;
  chapterName?: string;
  language: string;
  ok: boolean;
  /** Present on success. */
  stats?: {
    sections: number;
    imagesFound: number;
    figuresPlaced: number;
    workbookUsed: boolean;
    chapterSliceStrategy: string;
    totalMs: number;
  };
  /** Present on failure. */
  error?: string;
}

/**
 * Classify a failure so the channel is scannable at a glance. The two that
 * actually happen in production are free-tier quota and free-tier overload,
 * and they call for completely different responses (wait a day vs retry now).
 */
function classify(error: string): string {
  if (/429|quota|RESOURCE_EXHAUSTED/i.test(error)) return "QUOTA EXHAUSTED";
  if (/503|UNAVAILABLE|high demand/i.test(error)) return "MODEL OVERLOADED";
  if (/no extractable text|scanned/i.test(error)) return "UNREADABLE PDF";
  return "ERROR";
}

/**
 * Report one generation to the usage channel.
 *
 * Deliberately excludes the manual text, the uploaded PDFs and any request
 * metadata that could identify the teacher — a teacher's lesson plan is their
 * work, not telemetry. What's sent is curriculum context plus technical stats.
 */
export async function reportGeneration(r: GenerationReport): Promise<void> {
  const who = `Std ${r.standard} · ${r.subject} · Ch ${r.chapterNumber}${
    r.chapterName ? ` (${r.chapterName})` : ""
  }`;

  const content = r.ok
    ? [
        `✅ **Manual generated** — ${who}`,
        `\`${r.stats?.sections ?? 0} sections · ${r.stats?.imagesFound ?? 0} figures found · ` +
          `${r.stats?.figuresPlaced ?? 0} placed · ${((r.stats?.totalMs ?? 0) / 1000).toFixed(1)}s\``,
        r.stats?.chapterSliceStrategy === "fallback-full"
          ? "⚠️ chapter pages not detected — this teacher got no figures"
          : "",
        r.stats?.workbookUsed ? "📘 workbook used" : "",
      ]
        .filter(Boolean)
        .join("\n")
    : [
        `❌ **${classify(r.error ?? "")}** — ${who}`,
        `\`\`\`${(r.error ?? "unknown").slice(0, 300)}\`\`\``,
      ].join("\n");

  await postWebhook(process.env.USAGE_WEBHOOK_URL, content, "usage webhook");
}
