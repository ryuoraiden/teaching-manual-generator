import { NextResponse } from "next/server";
import { getJob } from "@/lib/job-store";

export const runtime = "nodejs";

/**
 * GET /api/generate-manual/[jobId]
 *
 * Poll a background generation job. Responses are deliberately small and cheap
 * so a phone can retry freely on a flaky connection:
 *  - 200 { status: "pending", stage }          — still working
 *  - 200 { status: "done", manual, ... }       — finished; the payload
 *  - 200 { status: "error", error }            — generation failed, with why
 *  - 404 { status: "expired" }                 — unknown or evicted job
 *
 * A 404 is normal, not a bug: jobs are held in memory, so a container restart
 * (a deploy) or the 30-minute TTL drops them. The client turns that into
 * "please generate again" rather than hanging forever.
 */
export async function GET(
  _req: Request,
  ctx: RouteContext<"/api/generate-manual/[jobId]">
) {
  const { jobId } = await ctx.params;
  const job = getJob(jobId);

  if (!job) {
    return NextResponse.json(
      {
        status: "expired",
        error:
          "This generation is no longer available — the server may have restarted. Please generate the manual again.",
      },
      { status: 404 }
    );
  }

  // Never cache a poll: the whole point is observing a value that changes.
  const headers = { "Cache-Control": "no-store" };

  if (job.status === "pending") {
    return NextResponse.json(
      { status: "pending", stage: job.stage, label: job.label },
      { headers }
    );
  }

  if (job.status === "error") {
    return NextResponse.json(
      { status: "error", error: job.error ?? "Generation failed." },
      { headers }
    );
  }

  return NextResponse.json(
    {
      status: "done",
      manual: job.result?.manual,
      textbookImages: job.result?.textbookImages ?? [],
      meta: job.result?.meta,
    },
    { headers }
  );
}
