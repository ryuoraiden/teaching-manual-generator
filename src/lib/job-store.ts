import type { GenerationMeta, TeachingManual, TextbookImage } from "./manual-schema";

/**
 * In-memory store for background generation jobs.
 *
 * Generation takes 20-60s+. Holding an HTTP request open for that long is what
 * made mobile use fragile: backgrounding the app lets Android freeze or discard
 * the tab, killing the connection mid-flight (the browser reports this as the
 * bare "Failed to fetch"). So the request now returns a job id immediately and
 * the work continues server-side via `after()`; the client polls with short,
 * cheap requests it can safely retry.
 *
 * Deliberately in-memory rather than a database or disk:
 *  - There is no database in this project by design, and adding one for state
 *    that lives ~60 seconds would be a poor trade.
 *  - The app runs as a single `next start` process in one container, so a
 *    module-level Map is genuinely shared across requests.
 *
 * The accepted cost: a container restart (i.e. a deploy) loses in-flight jobs.
 * The window is ~a minute, and the client surfaces a clear "expired, please
 * regenerate" rather than hanging.
 *
 * Memory safety matters here — results embed base64 figures and this runs on a
 * 1 GB VM — so finished jobs expire and the store is hard-capped.
 */

export type JobStatus = "pending" | "done" | "error";

export interface JobResult {
  manual: TeachingManual;
  textbookImages: TextbookImage[];
  meta: GenerationMeta;
}

export interface Job {
  id: string;
  status: JobStatus;
  createdAt: number;
  updatedAt: number;
  /** Set while pending, so the UI can show progress rather than a blank wait. */
  stage?: string;
  result?: JobResult;
  error?: string;
  /** Short description for the UI when resuming a job after a reload. */
  label?: string;
}

/** How long a finished job stays retrievable. Covers "phone was away a while". */
const TTL_MS = 30 * 60 * 1000;
/** Hard cap on retained jobs; oldest are evicted first. */
const MAX_JOBS = 12;

const jobs = new Map<string, Job>();

function sweep(): void {
  const now = Date.now();
  for (const [id, job] of jobs) {
    // Only expire settled jobs by age — a pending job is still doing real work.
    if (job.status !== "pending" && now - job.updatedAt > TTL_MS) {
      jobs.delete(id);
    }
  }
  if (jobs.size <= MAX_JOBS) return;

  // Evict oldest settled jobs first; never drop work that's still running.
  const settled = [...jobs.values()]
    .filter((j) => j.status !== "pending")
    .sort((a, b) => a.updatedAt - b.updatedAt);
  for (const job of settled) {
    if (jobs.size <= MAX_JOBS) break;
    jobs.delete(job.id);
  }
}

export function createJob(label?: string): Job {
  sweep();
  const job: Job = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    status: "pending",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    stage: "Starting…",
    label,
  };
  jobs.set(job.id, job);
  return job;
}

export function getJob(id: string): Job | undefined {
  sweep();
  return jobs.get(id);
}

export function setStage(id: string, stage: string): void {
  const job = jobs.get(id);
  if (!job || job.status !== "pending") return;
  job.stage = stage;
  job.updatedAt = Date.now();
}

export function completeJob(id: string, result: JobResult): void {
  const job = jobs.get(id);
  if (!job) return; // Evicted while running; nothing to hand back.
  job.status = "done";
  job.result = result;
  job.stage = undefined;
  job.updatedAt = Date.now();
}

export function failJob(id: string, error: string): void {
  const job = jobs.get(id);
  if (!job) return;
  job.status = "error";
  job.error = error;
  job.stage = undefined;
  job.updatedAt = Date.now();
}

/** Test/diagnostic helper: current store size. */
export function jobCount(): number {
  return jobs.size;
}
