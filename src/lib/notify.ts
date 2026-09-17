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
    /** The model that wrote the manual. */
    model?: string;
  };
  /** Present on failure. */
  error?: string;
  /**
   * Model attempts that failed, e.g. "gemini-flash-latest: overloaded". On a
   * success this shows the fallback earning its keep; on a failure it shows
   * what was tried before giving up.
   */
  modelFailures?: string[];
}

/**
 * Classify a failure so the channel is scannable at a glance. The two that
 * actually happen in production are free-tier quota and free-tier overload,
 * and they call for completely different responses (wait a day vs retry now).
 */
function classify(error: string): string {
  // Verdicts from the model fallback come first: they summarise every attempt,
  // whereas the raw patterns below only describe a single one.
  if (/not configured correctly/i.test(error)) return "CONFIG ERROR";
  if (/allowance for today/i.test(error)) return "QUOTA EXHAUSTED";
  if (/overloaded right now/i.test(error)) return "MODEL OVERLOADED";
  if (/429|quota|RESOURCE_EXHAUSTED/i.test(error)) return "QUOTA EXHAUSTED";
  if (/503|UNAVAILABLE|high demand/i.test(error)) return "MODEL OVERLOADED";
  // Upload truncation is the one a teacher can actually fix by retrying, so it
  // is worth separating from a genuinely broken or wrong file.
  if (/did not finish uploading/i.test(error)) return "UPLOAD INCOMPLETE";
  if (/does not look like a PDF|file is empty/i.test(error)) return "WRONG FILE TYPE";
  if (/no extractable text|scanned/i.test(error)) return "SCANNED PDF, NEEDS OCR";
  if (/appears to be damaged/i.test(error)) return "DAMAGED PDF";
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
        r.stats?.model ? `model: ${r.stats.model}` : "",
        r.modelFailures?.length
          ? `🔁 rescued by fallback after: ${r.modelFailures.join(", ")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n")
    : [
        `❌ **${classify(r.error ?? "")}** — ${who}`,
        r.modelFailures?.length ? `tried: ${r.modelFailures.join(" > ")}` : "",
        `\`\`\`${(r.error ?? "unknown").slice(0, 300)}\`\`\``,
      ]
        .filter(Boolean)
        .join("\n");

  await postWebhook(process.env.USAGE_WEBHOOK_URL, content, "usage webhook");
}
