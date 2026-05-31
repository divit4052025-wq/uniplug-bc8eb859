-- ════════════════════════════════════════════════════════════════════════════
-- Payments Stage 3: atomic payment confirmation/failure RPCs + on-confirm trigger.
-- ════════════════════════════════════════════════════════════════════════════
--
-- WHY: the Razorpay webhook (HMAC-verified, src/routes/api/public/hooks/
-- razorpay-webhook.ts) calls these on every delivery. The CRITICAL property is
-- ATOMICITY: the ledger insert and the booking status flip happen in ONE
-- transaction (the function body is the transaction). A worker crash can never
-- leave "ledger written but booking still pending" or vice-versa — both commit or
-- neither does, and Razorpay's retry re-runs cleanly. The RPC returns
-- newly_confirmed: TRUE only on the single delivery that actually flipped the row,
-- so the non-idempotent side effect (confirmation emails) fires exactly once and
-- is kept OUTSIDE the DB transaction, AFTER commit, by the worker.
--
--   mark_booking_paid(booking_id, order_id, payment_id, amount_inr, payload)
--     1. INSERT payment_captured ledger row (idempotency_key 'captured:'||payment)
--        ON CONFLICT DO NOTHING — the dedupe spine.
--     2. UPDATE bookings → confirmed, paid_at=now(), razorpay_* … WHERE id=… AND
--        status='pending_payment'. ROW_COUNT=1 ⇒ this call confirmed it.
--     3. RETURN (newly_confirmed, booking_status). The worker sends emails only
--        when newly_confirmed. If newly_confirmed=false but the captured ledger
--        row was freshly inserted AND the booking is not 'confirmed' (already
--        expired/payment_failed), that is an ORPHAN CAPTURE — money was taken for
--        a slot that is gone. The function still records the money (ledger), the
--        worker alerts + enqueues the Stage-6 auto-refund. Money is never silently
--        kept.
--
--   mark_booking_failed(booking_id, payment_id, payload)
--     same atomic shape for payment.failed: ledger 'failed:'||payment + flip
--     pending_payment → payment_failed only if still pending.
--
-- Plus create_booking_notification_on_confirm: the existing notification trigger
-- is AFTER INSERT guarded on status='confirmed', so a webhook-driven UPDATE
-- (pending_payment → confirmed) never fires it. This sibling AFTER UPDATE trigger
-- closes that gap, mirroring create_booking_notification and swallowing the
-- (booking_id, kind) unique_violation so a re-delivered webhook can't double-notify.
--
-- mark_booking_paid returns the booking's current status so the worker can tell a
-- benign duplicate (status already 'confirmed') from an orphan capture
-- (status 'expired'/'payment_failed').
--
-- Verification: supabase/dev-seeds/payments-3-confirm-verification.sql
-- ════════════════════════════════════════════════════════════════════════════

-- ─── mark_booking_paid ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_booking_paid(
  _booking_id uuid,
  _order_id   text,
  _payment_id text,
  _amount_inr integer,
  _payload    jsonb DEFAULT NULL
)
RETURNS TABLE(newly_confirmed boolean, booking_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_price        integer;
  v_mentor_share integer;
  v_rows         integer;
  v_status       text;
BEGIN
  -- Server-side share snapshot from the booking's stored (server-set) price.
  SELECT price INTO v_price FROM public.bookings WHERE id = _booking_id;
  v_mentor_share := round(coalesce(v_price, _amount_inr) * 0.80);

  -- 1. Append-only money record. Dedupe spine: a redelivered capture conflicts
  --    and inserts nothing.
  INSERT INTO public.payment_ledger (
    booking_id, event_type, idempotency_key,
    razorpay_order_id, razorpay_payment_id,
    amount_inr, mentor_share_inr, platform_fee_inr, payload
  ) VALUES (
    _booking_id, 'payment_captured', 'captured:' || _payment_id,
    _order_id, _payment_id,
    coalesce(v_price, _amount_inr), v_mentor_share,
    coalesce(v_price, _amount_inr) - v_mentor_share, _payload
  )
  ON CONFLICT (idempotency_key) DO NOTHING;

  -- 2. Flip ONLY a still-pending booking. Same transaction as the ledger insert.
  UPDATE public.bookings
     SET status = 'confirmed',
         paid_at = now(),
         razorpay_order_id   = _order_id,
         razorpay_payment_id = _payment_id
   WHERE id = _booking_id
     AND status = 'pending_payment';
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  SELECT status INTO v_status FROM public.bookings WHERE id = _booking_id;

  -- 3. newly_confirmed is true ONLY for the call that flipped the row.
  RETURN QUERY SELECT (v_rows = 1), v_status;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_booking_paid(uuid, text, text, integer, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_booking_paid(uuid, text, text, integer, jsonb) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.mark_booking_paid(uuid, text, text, integer, jsonb) TO service_role;

COMMENT ON FUNCTION public.mark_booking_paid(uuid, text, text, integer, jsonb) IS
  'Payments Stage 3 (2026-05-31): service_role-only, atomic. Inserts the payment_captured ledger row AND flips pending_payment → confirmed in one transaction. Returns (newly_confirmed, booking_status): newly_confirmed is true only on the delivery that actually confirmed the booking (so the worker sends emails exactly once); booking_status lets the worker distinguish a duplicate (confirmed) from an orphan capture (expired/payment_failed → enqueue refund).';

-- ─── mark_booking_failed ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_booking_failed(
  _booking_id uuid,
  _payment_id text,
  _payload    jsonb DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rows integer;
BEGIN
  INSERT INTO public.payment_ledger (
    booking_id, event_type, idempotency_key, razorpay_payment_id, payload
  ) VALUES (
    _booking_id, 'payment_failed', 'failed:' || _payment_id, _payment_id, _payload
  )
  ON CONFLICT (idempotency_key) DO NOTHING;

  UPDATE public.bookings
     SET status = 'payment_failed'
   WHERE id = _booking_id
     AND status = 'pending_payment';
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  RETURN v_rows = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_booking_failed(uuid, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_booking_failed(uuid, text, jsonb) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.mark_booking_failed(uuid, text, jsonb) TO service_role;

COMMENT ON FUNCTION public.mark_booking_failed(uuid, text, jsonb) IS
  'Payments Stage 3 (2026-05-31): service_role-only, atomic. Records a payment_failed ledger row and flips pending_payment → payment_failed only if still pending. Returns true if this call performed the flip.';

-- ─── create_booking_notification_on_confirm ─────────────────────────────────
-- Mirrors create_booking_notification, but fires on the webhook-driven UPDATE
-- pending_payment → confirmed (the AFTER INSERT trigger only fires for rows that
-- are born 'confirmed', i.e. the zero-price branch). Swallows the (booking_id,
-- kind) unique_violation so a redelivered webhook cannot double-notify.
CREATE OR REPLACE FUNCTION public.create_booking_notification_on_confirm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_student_name text;
BEGIN
  IF NEW.mentor_id IS NULL OR NEW.student_id IS NULL THEN
    RAISE WARNING 'create_booking_notification_on_confirm: booking % has null mentor_id or student_id, skipping', NEW.id;
    RETURN NEW;
  END IF;

  SELECT full_name INTO v_student_name FROM public.students WHERE id = NEW.student_id;
  v_student_name := COALESCE(v_student_name, 'Student');

  BEGIN
    INSERT INTO public.notifications (
      recipient_id, booking_id, kind, student_name, booking_date, booking_time_slot
    ) VALUES (
      NEW.mentor_id, NEW.id, 'booking_confirmed', v_student_name, NEW.date, NEW.time_slot
    );
  EXCEPTION
    WHEN unique_violation THEN
      NULL;  -- redelivered webhook already notified
    WHEN OTHERS THEN
      RAISE WARNING 'create_booking_notification_on_confirm: failed for booking %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.create_booking_notification_on_confirm() FROM public;
REVOKE EXECUTE ON FUNCTION public.create_booking_notification_on_confirm() FROM anon;
GRANT EXECUTE ON FUNCTION public.create_booking_notification_on_confirm() TO authenticated, service_role;

DROP TRIGGER IF EXISTS create_booking_notification_on_confirm_trigger ON public.bookings;
CREATE TRIGGER create_booking_notification_on_confirm_trigger
  AFTER UPDATE OF status ON public.bookings
  FOR EACH ROW
  WHEN (OLD.status = 'pending_payment' AND NEW.status = 'confirmed')
  EXECUTE FUNCTION public.create_booking_notification_on_confirm();

COMMENT ON FUNCTION public.create_booking_notification_on_confirm() IS
  'Payments Stage 3 (2026-05-31): AFTER UPDATE(status) trigger firing on pending_payment → confirmed (the webhook confirmation path). Mirrors create_booking_notification; swallows the (booking_id,kind) unique_violation so a redelivered webhook cannot double-notify the mentor.';
