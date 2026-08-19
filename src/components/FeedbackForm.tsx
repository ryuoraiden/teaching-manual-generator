"use client";

import { useState } from "react";

interface Props {
  /**
   * Short diagnostics from the last generation (slice strategy, figures found).
   * Sent so a report like "no pictures came" arrives with the reason attached.
   * Never includes any of the manual's content.
   */
  context?: string;
  /** Collapsed by default on the home screen; open in the editor after use. */
  defaultOpen?: boolean;
}

type State = "idle" | "sending" | "sent" | "error";

/**
 * Teacher feedback. Deliberately asks for as little as possible: no account, no
 * email required, one box. Every extra required field costs replies, and honest
 * reports from real Kerala teachers are the most valuable thing this project
 * can collect right now.
 */
export default function FeedbackForm({ context, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [role, setRole] = useState("");
  const [contact, setContact] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState("sending");
    setError(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, role, contact, context }),
        signal: AbortSignal.timeout(20000),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not send your message.");
      setState("sent");
      setMessage("");
      setRole("");
      setContact("");
    } catch (err) {
      setState("error");
      setError(
        err instanceof Error && err.name !== "TimeoutError"
          ? err.message
          : "Could not reach the server. Please check your connection and try again."
      );
    }
  }

  const field =
    "w-full min-h-11 rounded-md border border-zinc-300 bg-white px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500";
  const label = "block text-sm font-medium text-zinc-700 mb-1";

  if (state === "sent") {
    return (
      <section className="mx-auto mt-8 max-w-xl rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-center">
        <p className="font-semibold text-emerald-900">
          നന്ദി! Thank you — your message reached us.
        </p>
        <p className="mt-1 text-sm text-emerald-800">
          Feedback from real teachers is what decides what gets built next.
        </p>
        <button
          type="button"
          onClick={() => setState("idle")}
          className="mt-3 min-h-11 rounded-md border border-emerald-300 bg-white px-4 text-sm font-medium text-emerald-800 hover:bg-emerald-100"
        >
          Send another
        </button>
      </section>
    );
  }

  return (
    <section className="mx-auto mt-8 max-w-xl">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="min-h-11 w-full rounded-lg border border-dashed border-zinc-300 px-4 py-3 text-sm font-medium text-zinc-600 hover:border-emerald-400 hover:text-emerald-700"
        >
          💬 Feedback &amp; suggestions · അഭിപ്രായങ്ങൾ അറിയിക്കുക
        </button>
      ) : (
        <form
          onSubmit={submit}
          className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4"
        >
          <div>
            <h2 className="text-base font-semibold text-zinc-900">
              Feedback &amp; suggestions
            </h2>
            <p className="mt-0.5 text-sm text-zinc-500">
              അഭിപ്രായങ്ങളും നിർദ്ദേശങ്ങളും അറിയിക്കുക. What went wrong, what was
              missing, what would help you most?
            </p>
          </div>

          <div>
            <label className={label} htmlFor="fb-message">
              Your message · സന്ദേശം
            </label>
            <textarea
              id="fb-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
              minLength={4}
              maxLength={2000}
              rows={5}
              placeholder="e.g. ചിത്രങ്ങൾ വന്നില്ല / The activities were too long for one period / Please add worksheets"
              className={`${field} resize-y`}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={label} htmlFor="fb-role">
                You are{" "}
                <span className="font-normal text-zinc-500">(optional)</span>
              </label>
              <input
                id="fb-role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                maxLength={200}
                placeholder="e.g. Std IV teacher, Malappuram"
                className={field}
              />
            </div>
            <div>
              <label className={label} htmlFor="fb-contact">
                Contact{" "}
                <span className="font-normal text-zinc-500">
                  (only for a reply)
                </span>
              </label>
              <input
                id="fb-contact"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                maxLength={200}
                placeholder="Phone or email"
                className={field}
              />
            </div>
          </div>

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={state === "sending"}
              className="min-h-11 flex-1 rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {state === "sending" ? "Sending…" : "Send"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="min-h-11 rounded-md border border-zinc-300 px-4 text-sm text-zinc-600 hover:bg-zinc-50"
            >
              Cancel
            </button>
          </div>
          <p className="text-xs text-zinc-500">
            Your manual&apos;s content is never sent — only your message and, if a
            manual was just generated, a short technical note about how it went.
          </p>
        </form>
      )}
    </section>
  );
}
