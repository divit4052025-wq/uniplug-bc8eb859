import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Payments Stage 6: admin-triggered Razorpay refund.
 *
 * Disputes are admin-only in V1 (no student self-serve form). This server fn is
 * gated on the CALLER's is_admin() (the same email-allowlist gate the other admin
 * RPCs use), then:
 *   1. looks up the booking's razorpay_payment_id (server-side);
 *   2. calls the Razorpay refund API (Basic auth) for the chosen amount
 *      (amount decision is the admin's — legal-source/05: ≥24h full / <24h none /
 *      mentor-no-show full; passed in as amountInr, or full if omitted);
 *   3. writes a refund_created ledger row (idempotent on the refund id);
 *   4. calls apply_refund() — cancels the booking + claws back the mentor accrual
 *      in one transaction.
 *
 * The refund.processed webhook later records the terminal refund_processed ledger
 * row. Never derives money state from the mutable booking row — the ledger is the
 * audit truth.
 */

const RAZORPAY_API = "https://api.razorpay.com/v1";

type RefundInput = { bookingId: string; amountInr?: number; reason?: string };

export const refundBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: RefundInput) => input)
  .handler(
    async ({
      data,
      context,
    }): Promise<{ ok: true; refundId: string; clawback: string } | { ok: false; reason: string }> => {
      // 1. Admin gate (caller's JWT).
      const { data: isAdmin, error: adminErr } = await context.supabase.rpc("is_admin");
      if (adminErr || !isAdmin) {
        return { ok: false, reason: "forbidden" };
      }

      const keyId = process.env.RAZORPAY_KEY_ID;
      const keySecret = process.env.RAZORPAY_KEY_SECRET;
      if (!keyId || !keySecret) {
        console.error("[payments-refund] RAZORPAY keys not set");
        return { ok: false, reason: "missing_keys" };
      }

      // 2. Server-side lookup of the payment to refund.
      const { data: booking, error: bErr } = await supabaseAdmin
        .from("bookings")
        .select("id, price, razorpay_payment_id, status")
        .eq("id", data.bookingId)
        .maybeSingle();
      if (bErr || !booking) {
        return { ok: false, reason: "booking_not_found" };
      }
      if (!booking.razorpay_payment_id) {
        return { ok: false, reason: "no_payment_to_refund" };
      }

      const amountInr = data.amountInr ?? booking.price;
      const amountPaise = amountInr * 100;

      // 3. Razorpay refund API.
      const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
      let refundId: string;
      try {
        const res = await fetch(
          `${RAZORPAY_API}/payments/${booking.razorpay_payment_id}/refund`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
            body: JSON.stringify({
              amount: amountPaise,
              notes: { booking_id: booking.id, reason: data.reason ?? "admin_refund" },
            }),
          },
        );
        const text = await res.text();
        if (!res.ok) {
          console.error("[payments-refund] Razorpay refund failed", res.status, text);
          return { ok: false, reason: `razorpay_${res.status}` };
        }
        refundId = (JSON.parse(text) as { id: string }).id;
      } catch (err) {
        console.error("[payments-refund] refund call threw", err);
        return { ok: false, reason: "refund_call_failed" };
      }

      // refund_created ledger row (idempotent).
      const { error: ledgerErr } = await supabaseAdmin.from("payment_ledger").insert({
        booking_id: booking.id,
        event_type: "refund_created",
        idempotency_key: `refund:${refundId}`,
        razorpay_refund_id: refundId,
        razorpay_payment_id: booking.razorpay_payment_id,
        amount_inr: amountInr,
      });
      if (ledgerErr && ledgerErr.code !== "23505") {
        console.error("[payments-refund] refund_created ledger insert failed", ledgerErr);
      }

      // 4. Cancel booking + clawback (one transaction in the RPC).
      const { data: applied, error: applyErr } = await supabaseAdmin.rpc("apply_refund", {
        _booking_id: booking.id,
        _refund_id: refundId,
        _payload: { source: "admin_refund", reason: data.reason ?? null },
      });
      if (applyErr) {
        console.error("[payments-refund] apply_refund failed", applyErr);
        return { ok: false, reason: "apply_refund_failed" };
      }

      const clawback =
        (applied as { clawback?: string } | null)?.clawback ?? "unknown";
      return { ok: true, refundId, clawback };
    },
  );
