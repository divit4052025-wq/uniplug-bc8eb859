// POST /api/public/waitlist/submit — join the launch waitlist.
//
// Body: { name, email, kind: "school" | "college" }. Server-side validation is
// authoritative (name/email length caps, email format, kind whitelist). UPSERTs
// by lowercased email so a repeat submission never inflates the count, and
// returns the person's REAL, stable position among their side.
//
// Writes ONLY to the waitlist D1 store — never Supabase, never the consent/auth
// machinery. In waitlist launch mode this is one of the few allowlisted routes.

import { createFileRoute } from "@tanstack/react-router";

import { joinWaitlist } from "@/lib/waitlist/store.server";
import { WaitlistValidationError } from "@/lib/waitlist/validate";
import { log } from "@/lib/log";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export const Route = createFileRoute("/api/public/waitlist/submit")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        let body: Record<string, unknown>;
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return json({ ok: false, error: "Invalid request." }, 400);
        }

        try {
          const { position, kind } = await joinWaitlist({
            name: body?.name,
            email: body?.email,
            kind: body?.kind,
          });
          return json({ ok: true, position, kind });
        } catch (err) {
          if (err instanceof WaitlistValidationError) {
            return json({ ok: false, error: err.message, field: err.field }, 400);
          }
          // Unexpected (e.g. D1 unreachable). Honest failure — nothing was sent.
          // No PII in the log (no name/email), per the logger contract.
          log.error({ surface: "worker", event: "waitlist_submit_failed", alert: true });
          return json({ ok: false, error: "Something went wrong. Please try again." }, 500);
        }
      },
    },
  },
});
