import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * POST /api/feedback  (application/json)
 *
 * Teacher feedback and suggestions.
 *
 * Delivery is deliberately infrastructure-free: this project has no database
 * and no budget. If FEEDBACK_WEBHOOK_URL is set (a Discord webhook works well —
 * free, keeps a searchable history, and notifies a phone), the message is
 * forwarded there. Either way it is written to the server log, so feedback is
 * never silently dropped just because delivery is misconfigured.
 *
 * Body:
 *  - message:  required, what the teacher wants to say
 *  - role:     optional, e.g. "Std IV teacher, Malappuram"
 *  - contact:  optional, only if they want a reply
 *  - context:  optional diagnostics from the last generation, so a report like
 *              "no pictures came" arrives with the slice strategy attached
 */

const MAX_MESSAGE = 2000;
const MAX_FIELD = 200;

/** Per-IP submissions, to keep a public endpoint from becoming a spam relay. */
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  // Opportunistic cleanup so the map can't grow without bound.
  if (hits.size > 500) {
    for (const [k, v] of hits) {
      if (v.every((t) => now - t >= RATE_WINDOW_MS)) hits.delete(k);
    }
  }
  return false;
}

function clean(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function POST(req: NextRequest) {
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";

    if (rateLimited(ip)) {
      return NextResponse.json(
        {
          error:
            "You've sent several messages already — thank you. Please try again a little later.",
        },
        { status: 429 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const message = clean(body.message, MAX_MESSAGE);
    if (message.length < 4) {
      return NextResponse.json(
        { error: "Please write a little more so we can act on it." },
        { status: 400 }
      );
    }

    const role = clean(body.role, MAX_FIELD);
    const contact = clean(body.contact, MAX_FIELD);
    // Guard the object branch: JSON.stringify(undefined ?? "") yields the
    // literal string '""', which would show up as noise on every report.
    const context = clean(
      typeof body.context === "string"
        ? body.context
        : body.context && typeof body.context === "object"
          ? JSON.stringify(body.context)
          : "",
      MAX_FIELD
    );

    // Logged regardless of webhook configuration: `docker logs manual` is the
    // fallback way to read feedback.
    console.log(
      "FEEDBACK:",
      JSON.stringify({ message, role, contact, context, at: new Date().toISOString() })
    );

    const webhook = process.env.FEEDBACK_WEBHOOK_URL;
    let delivered = false;
    if (webhook) {
      const lines = [
        "**New feedback**",
        message,
        role ? `\n_Role:_ ${role}` : "",
        contact ? `\n_Contact:_ ${contact}` : "",
        context ? `\n_Context:_ \`${context}\`` : "",
      ]
        .filter(Boolean)
        .join("\n");
      try {
        const res = await fetch(webhook, {
          method: "POST",
          headers: { "content-type": "application/json" },
          // Discord caps content at 2000 chars; trim rather than get rejected.
          body: JSON.stringify({ content: lines.slice(0, 1990) }),
          signal: AbortSignal.timeout(8000),
        });
        delivered = res.ok;
        if (!res.ok) {
          console.error("feedback webhook rejected:", res.status);
        }
      } catch (err) {
        // Never fail the teacher's submission because our relay is down — it's
        // already in the log above.
        console.error("feedback webhook failed:", err);
      }
    }

    return NextResponse.json({ ok: true, delivered });
  } catch (err) {
    console.error("feedback failed:", err);
    return NextResponse.json(
      { error: "Could not send your message. Please try again." },
      { status: 500 }
    );
  }
}
