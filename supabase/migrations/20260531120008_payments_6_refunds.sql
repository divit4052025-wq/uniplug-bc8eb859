-- ════════════════════════════════════════════════════════════════════════════
-- Payments Stage 6: refunds — apply_refund RPC + clawback + refund.processed.
-- ════════════════════════════════════════════════════════════════════════════
--
-- WHY: refunds are admin-triggered (disputes are admin-only in V1; no student
-- self-serve form). The TS server fn refundBooking() (admin-gated via is_admin())
-- calls the Razorpay refund API, writes a refund_created ledger row, then calls
-- this apply_refund() RPC. apply_refund does, in one transaction:
--   - set booking status='cancelled' (no new 'refunded' status — keeps the many
--     existing status read-paths untouched; the ledger carries the refund truth);
--   - CLAWBACK the mentor accrual:
--       * payout_id IS NULL  → nothing to claw back (booking now cancelled, so
--         naturally excluded from every future Friday batch).
--       * payout_id set AND that mentor_payouts.status='scheduled' (not yet
--         disbursed) → subtract the mentor share from amount_inr and clear the
--         booking's payout_id (cleanly removed from the scheduled batch before
--         money leaves). If the decrement drives amount_inr to 0, the disbursement
--         seam (Stage 5) skips that ₹0 row.
--       * payout already 'paid' → write a clawback_owed ledger row + (worker)
--         admin alert; reconciled out-of-band (no auto-reversal of disbursed money
--         in V1).
--
-- Also confirm_refund_processed(): the refund.processed webhook path records a
-- refund_processed ledger row (idempotent via idempotency_key). This is also the
-- path that records the auto-refund of a capture-after-expiry orphan from Stage 4.
--
-- Verification: supabase/dev-seeds/payments-6-refund-verification.sql
-- ════════════════════════════════════════════════════════════════════════════

-- ─── apply_refund: cancel booking + clawback accrual (one transaction) ──────
CREATE OR REPLACE FUNCTION public.apply_refund(
  _booking_id text,                     -- text so the worker can pass a uuid string
  _refund_id  text DEFAULT NULL,
  _payload    jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_booking_id uuid := _booking_id::uuid;
  v_price        integer;
  v_mentor_share integer;
  v_payout_id   uuid;
  v_payout_status text;
  v_clawback    text := 'none';
BEGIN
  SELECT price, payout_id INTO v_price, v_payout_id
    FROM public.bookings WHERE id = v_booking_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking % not found', v_booking_id;
  END IF;
  v_mentor_share := round(coalesce(v_price, 0) * 0.80);

  -- Cancel the booking (status read-paths already treat cancelled correctly).
  UPDATE public.bookings SET status = 'cancelled' WHERE id = v_booking_id;

  -- Clawback logic.
  IF v_payout_id IS NOT NULL THEN
    SELECT status INTO v_payout_status FROM public.mentor_payouts WHERE id = v_payout_id;
    IF v_payout_status = 'scheduled' THEN
      -- Not yet disbursed: pull this booking's share out of the scheduled accrual.
      UPDATE public.mentor_payouts
         SET amount_inr = amount_inr - v_mentor_share
       WHERE id = v_payout_id;
      UPDATE public.bookings SET payout_id = NULL WHERE id = v_booking_id;
      v_clawback := 'reversed_scheduled';
    ELSE
      -- Already paid (or failed): cannot auto-reverse disbursed money in V1.
      INSERT INTO public.payment_ledger (booking_id, event_type, idempotency_key, amount_inr, mentor_share_inr, payload)
      VALUES (v_booking_id, 'clawback_owed', 'clawback_owed:' || v_booking_id::text,
              v_price, v_mentor_share,
              jsonb_build_object('payout_id', v_payout_id, 'payout_status', v_payout_status))
      ON CONFLICT (idempotency_key) DO NOTHING;
      v_clawback := 'owed_already_paid';
    END IF;
  END IF;

  RETURN jsonb_build_object('booking_id', v_booking_id, 'clawback', v_clawback,
                            'mentor_share_inr', v_mentor_share);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_refund(text, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.apply_refund(text, text, jsonb) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.apply_refund(text, text, jsonb) TO service_role;

COMMENT ON FUNCTION public.apply_refund(text, text, jsonb) IS
  'Payments Stage 6 (2026-05-31): service_role-only, atomic. Cancels a booking and claws back the mentor accrual: if its payout is still scheduled, subtract the 80% share and clear payout_id (removed before money leaves; a ₹0 result is skipped by the disbursement seam); if already paid, write a clawback_owed ledger row for out-of-band reconciliation. Called by the admin refundBooking server fn after the Razorpay refund API + refund_created ledger row.';

-- ─── confirm_refund_processed: idempotent refund.processed ledger record ────
CREATE OR REPLACE FUNCTION public.confirm_refund_processed(
  _booking_id text,
  _refund_id  text,
  _payload    jsonb DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_booking_id uuid := NULLIF(_booking_id, '')::uuid;
  v_rows integer;
BEGIN
  INSERT INTO public.payment_ledger (booking_id, event_type, idempotency_key, razorpay_refund_id, payload)
  VALUES (v_booking_id, 'refund_processed', 'refundproc:' || _refund_id, _refund_id, _payload)
  ON CONFLICT (idempotency_key) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows = 1;  -- true if THIS delivery recorded it (false on redelivery)
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_refund_processed(text, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.confirm_refund_processed(text, text, jsonb) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.confirm_refund_processed(text, text, jsonb) TO service_role;

COMMENT ON FUNCTION public.confirm_refund_processed(text, text, jsonb) IS
  'Payments Stage 6 (2026-05-31): service_role-only. Records a refund_processed ledger row (idempotency_key refundproc:<refund_id>, ON CONFLICT DO NOTHING) for the refund.processed webhook. Returns true only on the delivery that recorded it. Also the recording path for the auto-refund of a capture-after-expiry orphan.';
