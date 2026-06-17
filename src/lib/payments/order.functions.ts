import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendBookingEmails } from "@/lib/email/booking.functions";

/**
 * Payments Stage 2: create a Razorpay order for a session booking.
 *
 * Flow:
 *  1. Call book_session with the CALLER's authenticated client (so all RLS /
 *     consent / availability / server-side-price gates apply) → bookingId. The
 *     booking is born 'pending_payment' (or 'confirmed' for a sub-₹1 price).
 *  2. Read the booking's server-side price + status via supabaseAdmin (never
 *     trust a client-supplied amount).
 *     - ZERO-PRICE SHORT-CIRCUIT: if the booking came back already 'confirmed'
 *       (the sub-₹1 branch in book_session), there is no payable order — send the
 *       booking emails and return { confirmed: true }. The client skips Checkout.
 *  3. Otherwise create a Razorpay order (amount = price * 100 paise), write an
 *     order_created ledger row, and return { orderId, keyId, amount } to the
 *     client to open Checkout.
 *  4. ORDER-CREATION FAILURE PATH: book_session has already taken the slot
 *     (pending_payment) before the Razorpay call. If the order call throws, we
 *     immediately free the slot via fail_booking_order (flip → payment_failed
 *     only if still pending) so it does not sit locked for the full 30-min expiry
 *     window, and return { ok:false, reason:'order_failed' } for a clean retry.
 *
 * keyId is returned from the server (not a VITE_ build var) so a test→live key
 * swap is a server-secret rotation with no rebuild.
 */

const RAZORPAY_ORDERS_URL = "https://api.razorpay.com/v1/orders";

type CreateOrderInput = { mentorId: string; date: string; timeSlot: string; duration: 30 | 60 };

async function createRazorpayOrder(
  keyId: string,
  keySecret: string,
  amountPaise: number,
  bookingId: string,
): Promise<{ id: string }> {
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const res = await fetch(RAZORPAY_ORDERS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify({
      amount: amountPaise,
      currency: "INR",
      receipt: bookingId,
      notes: { booking_id: bookingId },
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Razorpay orders ${res.status}: ${text}`);
  }
  return JSON.parse(text) as { id: string };
}

export const createBookingOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: CreateOrderInput) => {
    // Reject anything that isn't exactly 30 or 60 (book_session also re-validates
    // _duration IN (30,60) and computes the authoritative scaled price — the
    // client never supplies an amount).
    if (input.duration !== 30 && input.duration !== 60) {
      throw new Error("duration must be 30 or 60");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    // 1. Book through the caller's RLS-enforced client (all gates apply). The
    // server computes the duration-scaled price; the client never supplies it.
    const { data: bookingId, error: rpcErr } = await context.supabase.rpc("book_session", {
      _mentor_id: data.mentorId,
      _date: data.date,
      _time_slot: data.timeSlot,
      _duration: data.duration,
    });
    if (rpcErr || !bookingId) {
      // book_session raises friendly messages (slot already booked, past slot,
      // consent required, …). Surface as a clean failure; nothing to clean up
      // because no booking row was created.
      return { ok: false as const, reason: rpcErr?.message ?? "book_failed" };
    }

    // 2. Server-side price + status (admin client; never trust the client).
    const { data: booking, error: bErr } = await supabaseAdmin
      .from("bookings")
      .select("id, price, status")
      .eq("id", bookingId)
      .maybeSingle();
    if (bErr || !booking) {
      return { ok: false as const, reason: "booking_readback_failed", bookingId };
    }

    // Zero-price short-circuit: already confirmed, no order needed.
    if (booking.status === "confirmed") {
      try {
        await sendBookingEmails({ data: { bookingId } });
      } catch (e) {
        console.error("[payments-order] zero-price email dispatch failed", e);
      }
      return { ok: true as const, confirmed: true as const, bookingId };
    }

    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
      console.error("[payments-order] RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not set");
      // Free the slot we just took — no order can be created without keys.
      await supabaseAdmin.rpc("fail_booking_order", { _booking_id: bookingId });
      return { ok: false as const, reason: "missing_keys", bookingId };
    }

    const amountPaise = booking.price * 100;

    // 3/4. Create order; on failure free the held slot.
    let order: { id: string };
    try {
      order = await createRazorpayOrder(keyId, keySecret, amountPaise, bookingId);
    } catch (err) {
      console.error("[payments-order] order creation failed; freeing slot", {
        booking_id: bookingId,
        error: err instanceof Error ? err.message : String(err),
      });
      await supabaseAdmin.rpc("fail_booking_order", { _booking_id: bookingId });
      return { ok: false as const, reason: "order_failed", bookingId };
    }

    // order_created ledger row (idempotent on the order id).
    const { error: ledgerErr } = await supabaseAdmin.from("payment_ledger").insert({
      booking_id: bookingId,
      event_type: "order_created",
      idempotency_key: `order:${order.id}`,
      razorpay_order_id: order.id,
      amount_inr: booking.price,
    });
    if (ledgerErr && ledgerErr.code !== "23505") {
      // A non-conflict ledger failure is unexpected but the order already exists;
      // log and continue — the webhook will reconcile on capture.
      console.error("[payments-order] order_created ledger insert failed", ledgerErr);
    }

    return {
      ok: true as const,
      confirmed: false as const,
      bookingId,
      orderId: order.id,
      keyId,
      amount: amountPaise,
    };
  });
