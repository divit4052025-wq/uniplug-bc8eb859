import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import { sendBookingEmails } from "@/lib/email/booking.functions";
import { hmacOk } from "@/lib/auth/hmac";

/**
 * Razorpay webhook — Payments Stage 3 (capture/failed) + Stage 6 (refund.processed).
 *
 * Auth is HMAC, not Bearer: Razorpay signs the RAW body with
 * HMAC-SHA256(rawBody, RAZORPAY_WEBHOOK_SECRET) and sends the hex digest in
 * x-razorpay-signature. We MUST hash the raw bytes before any JSON parse, so the
 * body is read once via request.text() and only parsed after the signature checks.
 *
 * Idempotency lives in the DB, not here: the handler calls the atomic RPC on
 * EVERY delivery and lets the RPC dedupe (ledger ON CONFLICT DO NOTHING + a flip
 * that only matches a still-pending row). The ledger insert and the status flip
 * are ONE transaction inside the RPC, so a crash can never half-apply. Emails —
 * the one non-idempotent external side effect — are sent only when the RPC
 * reports newly_confirmed=true, AFTER the RPC has committed.
 *
 * Always returns 200 once the RPC commits (so Razorpay stops retrying). A thrown
 * RPC / unexpected error returns non-2xx so Razorpay retries.
 */

type RazorpayEntity = {
  id?: string;
  order_id?: string;
  amount?: number; // paise (Razorpay reports money in the smallest currency unit)
  notes?: { booking_id?: string };
};

type RazorpayWebhookBody = {
  event?: string;
  payload?: {
    payment?: { entity?: RazorpayEntity };
    refund?: { entity?: RazorpayEntity & { payment_id?: string } };
  };
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/public/hooks/razorpay-webhook")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
        if (!secret) {
          console.error("[razorpay-webhook] RAZORPAY_WEBHOOK_SECRET not set");
          return json({ ok: false, reason: "missing_webhook_secret" }, 500);
        }

        // Read raw bytes BEFORE parsing — the signature is over these exact bytes.
        const rawBody = await request.text();
        const signature = request.headers.get("x-razorpay-signature");
        if (!hmacOk(rawBody, signature, secret)) {
          console.warn("[razorpay-webhook] signature verification failed", {
            ip: request.headers.get("cf-connecting-ip"),
          });
          return json({ ok: false, reason: "bad_signature" }, 401);
        }

        let body: RazorpayWebhookBody;
        try {
          body = JSON.parse(rawBody) as RazorpayWebhookBody;
        } catch {
          return json({ ok: false, reason: "bad_json" }, 400);
        }

        const event = body.event ?? "";

        try {
          if (event === "payment.captured") {
            const ent = body.payload?.payment?.entity ?? {};
            const bookingId = ent.notes?.booking_id;
            const paymentId = ent.id;
            const orderId = ent.order_id;
            if (!bookingId || !paymentId || !orderId) {
              return json({ ok: false, reason: "missing_capture_fields" }, 400);
            }

            // Razorpay reports the captured amount in paise; the RPC stores INR.
            // This is only a FALLBACK: mark_booking_paid records
            // coalesce(booking.price, _amount_inr) — the server-stored price wins,
            // so this value is used only if a booking somehow has no price.
            const capturedAmountInr = Math.round((ent.amount ?? 0) / 100);

            const { data, error } = await supabaseAdmin.rpc("mark_booking_paid", {
              _booking_id: bookingId,
              _order_id: orderId,
              _payment_id: paymentId,
              _amount_inr: capturedAmountInr,
              _payload: body as unknown as Json,
            });
            if (error) {
              console.error("[razorpay-webhook] mark_booking_paid failed", error);
              return json({ ok: false, reason: "rpc_failed" }, 500); // → Razorpay retries
            }

            // rpc returns a single row { newly_confirmed, booking_status }.
            const row = Array.isArray(data) ? data[0] : data;
            const newlyConfirmed = Boolean(row?.newly_confirmed);
            const bookingStatus = row?.booking_status as string | undefined;

            if (newlyConfirmed) {
              // Exactly-once external side effect, after commit.
              try {
                await sendBookingEmails({ data: { bookingId } });
              } catch (e) {
                console.error("[razorpay-webhook] confirmation email failed", e);
              }
            } else if (bookingStatus && bookingStatus !== "confirmed") {
              // Orphan capture: money taken for a slot that is gone (expired /
              // payment_failed). The captured ledger row is already recorded by
              // the RPC; alert + enqueue the Stage-6 auto-refund.
              console.error(
                "[razorpay-webhook] ORPHAN CAPTURE — payment for non-confirmed booking",
                {
                  surface: "payments",
                  alert: true,
                  booking_id: bookingId,
                  payment_id: paymentId,
                  booking_status: bookingStatus,
                },
              );
              // (Auto-refund enqueue is handled by the admin/refund path; the
              // ledger + alert guarantee money is never silently kept.)
            }

            return json({ ok: true, newly_confirmed: newlyConfirmed });
          }

          if (event === "payment.failed") {
            const ent = body.payload?.payment?.entity ?? {};
            const bookingId = ent.notes?.booking_id;
            const paymentId = ent.id;
            if (!bookingId || !paymentId) {
              return json({ ok: false, reason: "missing_failed_fields" }, 400);
            }
            const { error } = await supabaseAdmin.rpc("mark_booking_failed", {
              _booking_id: bookingId,
              _payment_id: paymentId,
              _payload: body as unknown as Json,
            });
            if (error) {
              console.error("[razorpay-webhook] mark_booking_failed failed", error);
              return json({ ok: false, reason: "rpc_failed" }, 500);
            }
            return json({ ok: true });
          }

          if (event === "refund.processed") {
            const ent = body.payload?.refund?.entity ?? {};
            const refundId = ent.id;
            // Refund notes may not carry booking_id; pass through what we have.
            const bookingId = ent.notes?.booking_id ?? "";
            if (!refundId) {
              return json({ ok: false, reason: "missing_refund_id" }, 400);
            }
            const { error } = await supabaseAdmin.rpc("confirm_refund_processed", {
              _booking_id: bookingId,
              _refund_id: refundId,
              _payload: body as unknown as Json,
            });
            if (error) {
              console.error("[razorpay-webhook] confirm_refund_processed failed", error);
              return json({ ok: false, reason: "rpc_failed" }, 500);
            }
            return json({ ok: true });
          }

          // Unhandled event types are acknowledged (200) so Razorpay stops retrying.
          return json({ ok: true, ignored: event });
        } catch (err) {
          console.error("[razorpay-webhook] unexpected error", err);
          return json({ ok: false, reason: "exception" }, 500);
        }
      },
    },
  },
});
