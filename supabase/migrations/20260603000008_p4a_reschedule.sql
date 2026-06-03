-- ════════════════════════════════════════════════════════════════════════════
-- Phase 4a: student-initiated reschedule (free; payment carries in place).
-- ════════════════════════════════════════════════════════════════════════════
--
-- The legal copy promises a free reschedule but none exists. This adds the
-- lowest-risk slice of the Phase 4 scheduling remodel (see
-- docs/plans/phase-4-scheduling-remodel.md, F3 / Option A / Option L0):
--
-- A booking's owning student can move a CONFIRMED (paid) booking to a new slot.
-- The payment CARRIES IN PLACE — this is a scheduling event, NOT a financial
-- one: status, paid_at, razorpay_*, price_inr, payout_id and the payment_ledger
-- FK are all left UNTOUCHED, and NO payment_ledger row is written. Because
-- status does not change, none of the AFTER-UPDATE status triggers
-- (booking-confirmed notification, cancelled email, session-completed) fire.
--
-- ADDITIVE: + bookings.reschedule_count, + reschedule_booking() RPC. Nothing is
-- dropped/renamed/altered.
--
-- GUARDS (all in the RPC body): caller is the booking's own student; status =
-- 'confirmed'; payout_id IS NULL (pre-settlement only — invariant I-c);
-- reschedule_count < 2; the EXISTING session start is ≥ 12h in the future (IST).
-- The NEW slot is validated exactly as book_session validates a new booking:
-- HH:00 format, IST past-slot guard, mentor_availability EXISTS for that
-- weekday/hour, and — CRITICALLY — collision is enforced by the SAME partial
-- unique index book_session relies on (bookings_confirmed_slot_unique), via an
-- in-place UPDATE that catches its violation. When 30-min sessions later swap
-- that index for a range-based EXCLUDE constraint, reschedule moves with it —
-- only the exception handler needs widening (unique_violation → also
-- exclusion_violation). No app-level overlap check that could diverge.
--
-- Idempotent (ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE FUNCTION, REVOKE/GRANT
-- restated).
--
-- Verification: supabase/dev-seeds/p4a-reschedule-verification.sql
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS reschedule_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.bookings.reschedule_count IS
  'Phase 4a (2026-06-03): number of times the student has rescheduled this booking. Capped at 2 by reschedule_booking(). Incremented only by that RPC.';

CREATE OR REPLACE FUNCTION public.reschedule_booking(
  _booking_id   uuid,
  _new_date     date,
  _new_time_slot text
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller       uuid := auth.uid();
  v_mentor_id    uuid;
  v_student_id   uuid;
  v_status       text;
  v_payout_id    uuid;
  v_count        integer;
  v_cur_date     date;
  v_cur_slot     text;
  v_hour         smallint;
  v_iso_dow      smallint;
  v_ist_today    date := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date;
  v_ist_hh       text := to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata', 'HH24:00');
  v_cur_start    timestamptz;
BEGIN
  -- 1. Authentication required.
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  -- 2. Load + row-lock the booking (serialize concurrent reschedules of it).
  SELECT mentor_id, student_id, status, payout_id, reschedule_count, date, time_slot
    INTO v_mentor_id, v_student_id, v_status, v_payout_id, v_count, v_cur_date, v_cur_slot
    FROM public.bookings
   WHERE id = _booking_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking not found' USING ERRCODE = 'P0001';
  END IF;

  -- 3. Owner-only — a student may reschedule only their own booking.
  IF v_student_id IS DISTINCT FROM v_caller THEN
    RAISE EXCEPTION 'you can only reschedule your own booking' USING ERRCODE = '42501';
  END IF;

  -- 4. Only a confirmed (paid) booking is reschedulable. pending_payment has a
  --    live order + 30-min expiry — cancel & re-book instead (no payment to carry).
  IF v_status <> 'confirmed' THEN
    RAISE EXCEPTION 'only a confirmed booking can be rescheduled (status = %)', v_status
      USING ERRCODE = 'P0001';
  END IF;

  -- 5. Pre-settlement only. Once accrued into a payout batch, the date is frozen
  --    (invariant I-c: a rescheduled booking must never desync from its accrual).
  IF v_payout_id IS NOT NULL THEN
    RAISE EXCEPTION 'this session has already been settled for payout and cannot be rescheduled'
      USING ERRCODE = 'P0001';
  END IF;

  -- 6. Max two reschedules.
  IF v_count >= 2 THEN
    RAISE EXCEPTION 'this booking has already been rescheduled the maximum number of times'
      USING ERRCODE = 'P0001';
  END IF;

  -- 7. The EXISTING session must be at least 12 hours away (IST).
  v_cur_start := (v_cur_date::timestamp + v_cur_slot::time) AT TIME ZONE 'Asia/Kolkata';
  IF v_cur_start <= (now() + interval '12 hours') THEN
    RAISE EXCEPTION 'reschedules must be requested at least 12 hours before the session'
      USING ERRCODE = 'P0001';
  END IF;

  -- 8. Validate the NEW slot exactly as book_session validates a new booking.
  IF _new_time_slot !~ '^([01][0-9]|2[0-3]):00$' THEN
    RAISE EXCEPTION 'time_slot must be HH:00 (e.g. 14:00), got %', _new_time_slot
      USING ERRCODE = 'P0001';
  END IF;
  v_hour    := substring(_new_time_slot, 1, 2)::smallint;
  v_iso_dow := EXTRACT(ISODOW FROM _new_date)::smallint;

  -- 8a. IST past-slot guard on the NEW slot (identical to book_session step 6).
  IF _new_date < v_ist_today
     OR (_new_date = v_ist_today AND _new_time_slot <= v_ist_hh) THEN
    RAISE EXCEPTION 'cannot reschedule to a past time slot' USING ERRCODE = 'P0001';
  END IF;

  -- 8b. Mentor availability EXISTS for the new weekday/hour (same mentor).
  IF NOT EXISTS (
    SELECT 1 FROM public.mentor_availability ma
    WHERE ma.mentor_id   = v_mentor_id
      AND ma.day_of_week = v_iso_dow
      AND ma.start_hour  = v_hour
  ) THEN
    RAISE EXCEPTION 'mentor is not available at this time' USING ERRCODE = 'P0001';
  END IF;

  -- 9. In-place move. Collision is enforced by the SAME partial unique index
  --    book_session relies on (bookings_confirmed_slot_unique over
  --    (mentor_id, date, time_slot) WHERE status IN ('confirmed','pending_payment')):
  --    moving this row's (date, time_slot) re-evaluates the index on the new
  --    values, so a clash with another held/confirmed booking raises
  --    unique_violation, race-free. Payment fields + status are deliberately
  --    NOT in the SET list → the money carries and no status trigger fires.
  --    [Future 30-min note: when the guard becomes a range EXCLUDE, add
  --     'WHEN exclusion_violation' here — nothing else changes.]
  BEGIN
    UPDATE public.bookings
       SET date             = _new_date,
           time_slot        = _new_time_slot,
           reschedule_count = reschedule_count + 1
     WHERE id = _booking_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'slot already booked';
  END;

  RETURN _booking_id;
END;
$$;

REVOKE ALL    ON FUNCTION public.reschedule_booking(uuid, date, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reschedule_booking(uuid, date, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.reschedule_booking(uuid, date, text) TO authenticated;

COMMENT ON FUNCTION public.reschedule_booking(uuid, date, text) IS
  'Phase 4a (2026-06-03): student-only free reschedule of a CONFIRMED booking. Guards: own booking, status=confirmed, payout_id IS NULL, reschedule_count < 2, existing start ≥12h away (IST). Validates the new slot like book_session (HH:00, IST-future, availability EXISTS) and takes it via an in-place UPDATE caught against bookings_confirmed_slot_unique. Payment (status/paid_at/razorpay_*/price_inr/payout_id/ledger) carries UNTOUCHED — no ledger row, no status trigger. SECURITY DEFINER; anon revoked.';
