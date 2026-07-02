// GET /api/public/waitlist/counts — the REAL live waitlist tally.
//
// Returns { school, college } straight from D1, grouped by kind. Nothing is
// seeded, padded, or faked: if a side has no signups it returns 0. The public
// meter renders exactly these numbers.

import { createFileRoute } from "@tanstack/react-router";

import { getWaitlistCounts } from "@/lib/waitlist/store.server";
import { log } from "@/lib/log";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export const Route = createFileRoute("/api/public/waitlist/counts")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const counts = await getWaitlistCounts();
          return json({ ok: true, ...counts });
        } catch {
          log.error({ surface: "worker", event: "waitlist_counts_failed", alert: true });
          return json({ ok: false, error: "counts_unavailable" }, 500);
        }
      },
    },
  },
});
