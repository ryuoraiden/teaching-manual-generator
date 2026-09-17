/**
 * Run a model request against an ordered chain of Gemini models, moving on to
 * the next model when one is overloaded or out of quota.
 *
 * Why this exists: the usage channel showed every production failure over four
 * days was a 503 "high demand", and teachers who retried the same model minutes
 * later still failed. Overload and free-tier quota are both per model, so when
 * one model is unavailable a different one usually is not.
 *
 * Failures are handled asymmetrically, because they mean different things:
 *  - quota (429): that model's daily bucket is gone. Skip it for the rest of
 *    this request, since waiting seconds cannot help.
 *  - not-found (404): the model was retired or renamed. Skip it too.
 *  - auth (invalid key): stop at once. Every model shares the key, so trying
 *    the rest only makes the teacher wait longer for the same answer.
 *  - anything else (503, 5xx, timeouts, unusable output): try the next model,
 *    and allow one more pass over the chain after a short pause.
 *
 * Kept free of SDK imports on purpose, so the branching can be tested without
 * needing Google to be overloaded at test time.
 */

export type FailureKind =
  | "quota"
  | "overloaded"
  | "not-found"
  | "auth"
  | "bad-output"
  | "other";

export interface AttemptRecord {
  model: string;
  kind: FailureKind;
  message: string;
  ms: number;
}

export interface FallbackResult<T> {
  value: T;
  model: string;
  /** Failed attempts before the one that succeeded. Empty when the first model worked. */
  failures: AttemptRecord[];
}

export class AllModelsFailedError extends Error {
  readonly failures: AttemptRecord[];
  /** Compact diagnostic for logs and the usage webhook. `message` is for teachers. */
  readonly detail: string;

  constructor(message: string, failures: AttemptRecord[]) {
    super(message);
    this.name = "AllModelsFailedError";
    this.failures = failures;
    const trail = failures.map((f) => `${f.model}:${f.kind}`).join(", ");
    const last = failures.at(-1)?.message ?? "";
    this.detail = `${trail} | last: ${last}`;
  }
}

export function classifyModelError(err: unknown): FailureKind {
  const status =
    typeof (err as { status?: unknown })?.status === "number"
      ? (err as { status: number }).status
      : undefined;
  const msg = err instanceof Error ? err.message : String(err);

  // Checked first: a bad key can arrive as a 400, which would otherwise look
  // like an ordinary model-specific error and trigger pointless fallbacks.
  if (status === 401 || /API key not valid|API_KEY_INVALID/i.test(msg)) return "auth";
  if (status === 429 || /RESOURCE_EXHAUSTED|exceeded your current quota/i.test(msg)) return "quota";
  if (status === 404 || /NOT_FOUND|no longer available/i.test(msg)) return "not-found";
  if (
    (status !== undefined && status >= 500) ||
    /UNAVAILABLE|high demand|overloaded|DEADLINE_EXCEEDED|aborted|timed out|fetch failed|ECONNRESET|ETIMEDOUT/i.test(msg)
  ) {
    return "overloaded";
  }
  if (/schema|valid JSON|returned no output/i.test(msg)) return "bad-output";
  return "other";
}

export interface FallbackOptions {
  /** How many times to walk the chain. Default 2. */
  passes?: number;
  /** Pause before the second pass, giving a spike a moment to clear. Default 8s. */
  pauseMs?: number;
  /** Total budget. Must sit under the route's maxDuration (300s). Default 240s. */
  deadlineMs?: number;
  /** Do not start an attempt with less time than this left. Default 30s. */
  minAttemptMs?: number;
  /** A single hung call cannot eat the whole budget. Default 120s. */
  attemptTimeoutMs?: number;
  /** Lets the UI tell a waiting teacher that it is retrying, not stuck. */
  onFailure?: (failure: AttemptRecord, willRetry: boolean) => void;
  /** Injectable so tests do not really sleep. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

function teacherMessage(failures: AttemptRecord[]): string {
  const kinds = new Set(failures.map((f) => f.kind));
  if (kinds.has("auth")) {
    return "The site's AI service is not configured correctly. This is a problem on our side, not with your files.";
  }
  if ([...kinds].every((k) => k === "quota" || k === "not-found")) {
    return "The site's free AI allowance for today has been used up. Your files are fine. Please try again in a few hours.";
  }
  const models = new Set(failures.map((f) => f.model)).size;
  return `Google's AI service is overloaded right now. We tried ${failures.length} times across ${models} ${models === 1 ? "model" : "models"}. Your files are fine. Please try again in a few minutes.`;
}

export async function withModelFallback<T>(
  models: string[],
  attempt: (model: string, signal: AbortSignal) => Promise<T>,
  opts: FallbackOptions = {}
): Promise<FallbackResult<T>> {
  const {
    passes = 2,
    pauseMs = 8_000,
    deadlineMs = 240_000,
    minAttemptMs = 30_000,
    attemptTimeoutMs = 120_000,
    onFailure,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
    now = Date.now,
  } = opts;

  const chain = [...new Set(models.map((m) => m.trim()).filter(Boolean))];
  if (chain.length === 0) throw new Error("No Gemini models are configured.");

  const started = now();
  const remaining = () => deadlineMs - (now() - started);
  const failures: AttemptRecord[] = [];
  // Models that cannot succeed again during this request.
  const dead = new Set<string>();

  outer: for (let pass = 0; pass < passes; pass++) {
    if (pass > 0) {
      if (chain.every((m) => dead.has(m))) break;
      if (remaining() < pauseMs + minAttemptMs) break;
      await sleep(pauseMs);
    }

    for (const model of chain) {
      if (dead.has(model)) continue;
      if (remaining() < minAttemptMs) break outer;

      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(),
        Math.min(attemptTimeoutMs, remaining())
      );
      const t0 = now();
      try {
        const value = await attempt(model, controller.signal);
        return { value, model, failures };
      } catch (err) {
        const kind = classifyModelError(err);
        const record: AttemptRecord = {
          model,
          kind,
          message: (err instanceof Error ? err.message : String(err)).slice(0, 300),
          ms: now() - t0,
        };
        failures.push(record);

        if (kind === "auth") {
          onFailure?.(record, false);
          throw new AllModelsFailedError(teacherMessage(failures), failures);
        }
        if (kind === "quota" || kind === "not-found") dead.add(model);

        const willRetry = chain.some((m) => !dead.has(m));
        onFailure?.(record, willRetry);
      } finally {
        clearTimeout(timer);
      }
    }
  }

  throw new AllModelsFailedError(teacherMessage(failures), failures);
}
