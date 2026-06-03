-- ════════════════════════════════════════════════════════════════════════════
-- Phase 4b: reserve-a-slot holds (mentor reserves a slot for a regular mentee;
-- the student claims + pays to confirm). Morph-in-place (docs/plans/
-- phase-4-scheduling-remodel.md, F2 / Option 5A).
-- ════════════════════════════════════════════════════════════════════════════
--
-- A hold IS a bookings row in a new 'reserved' state. It occupies the SAME slot
-- collision guard as confirmed/pending (so it blocks double-booking) and shows
-- as taken on the calendar. The held student claims it: an IN-PLACE flip
-- reserved → pending_payment on the SAME booking.id (so the slot is never
-- released mid-transition → no double-book), resetting created_at so the
-- standard 30-min payment window starts fresh. The DB lifecycle from there is
-- the standard one — webhook → mark_booking_paid (flips pending_payment →
-- confirmed, dedupes on 'captured:'||payment_id) → one booking, one capture,
-- no double-charge (proven by the dev-seed).
--
-- FOLLOW-UP (frontend, NOT in this DB phase): a claim-aware order server fn is
-- needed to drive payment for a CLAIMED hold. Today's createBookingOrder
-- (src/lib/payments/order.functions.ts) calls book_session (a fresh INSERT),
-- which would collide with the now-pending claimed row ("slot already booked").
-- The order fn must instead create the Razorpay order against the EXISTING
-- pending_payment booking.id (receipt/notes.booking_id = claimed id). The DB
-- side is ready; only that order-creation wiring is outstanding.
--
-- NOTE: reserve_slot's INSERT inherits the BEFORE-INSERT minor-consent gate
-- (bookings_minor_consent_gate) — a mentor cannot reserve for an un-consented
-- minor (fail-closed; proven by the dev-seed). The status-CHECK + index DDL
-- below run in ONE migration transaction (the DROP INDEX/CREATE pair must not be
-- split, or the collision guard would briefly lapse).
--
-- ADDITIVE: adds 'reserved' to the status CHECK + the partial unique index + the
-- calendar booked-set; adds reserve_slot / claim_reserved_booking /
-- release_reserved_booking RPCs; adds the expire_reserved_holds cron. The
-- existing book_session / mark_booking_paid / payment_ledger / payout path is
-- NOT touched.
--
-- PAYMENT SAFETY: a hold is unpaid (paid_at IS NULL) so it never accrues payout;
-- the claim flips status only (no payment fields set); mark_booking_paid still
-- flips ONLY pending_payment → confirmed and dedupes on 'captured:'||payment_id,
-- so a claimed-then-paid hold yields exactly one confirmed booking + one
-- payment_captured ledger row. No payment_ledger schema change.
--
-- COUPLING NOTE: collision is enforced by the SAME partial unique index
-- book_session relies on (bookings_confirmed_slot_unique). reserve_slot INSERTs
-- and catches its unique_violation, identical to book_session. When 30-min
-- sessions later swap that index for a range EXCLUDE, this moves with it — only
-- the exception handlers widen (unique_violation → also exclusion_violation).
--
-- Idempotent (DROP CONSTRAINT/INDEX IF EXISTS + recreate, CREATE OR REPLACE,
-- guarded cron.unschedule + cron.schedule, REVOKE/GRANT restated).
--
-- Verification: supabase/dev-seeds/p4b-holds-verification.sql
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. status CHECK: add 'reserved' ────────────────────────────────────────
ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_status_valid;
ALTER TABLE public.bookings ADD CONSTRAINT bookings_status_valid
  CHECK (status = ANY (ARRAY[
    'pending_payment','confirmed','completed','cancelled','payment_failed','expired','reserved'
  ]));

-- ─── 2. collision guard: a 'reserved' hold occupies the slot ────────────────
DROP INDEX IF EXISTS public.bookings_confirmed_slot_unique;
CREATE UNIQUE INDEX bookings_confirmed_slot_unique
  ON public.bookings (mentor_id, date, time_slot)
  WHERE status = ANY (ARRAY['confirmed','pending_payment','reserved']);

-- ─── 3. calendar: a 'reserved' slot shows as taken ──────────────────────────
CREATE OR REPLACE FUNCTION public.get_mentor_calendar(
  _mentor_id uuid,
  _from_date date DEFAULT ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata'::text))::date,
  _days_ahead integer DEFAULT 30
)
RETURNS TABLE(date date, time_slot text, state text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_ist_today date := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.mentors m
    WHERE m.id = _mentor_id AND m.status = 'approved'::public.mentor_status
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH date_series AS (
    SELECT d::date AS date, EXTRACT(ISODOW FROM d)::smallint AS iso_dow
    FROM generate_series(_from_date, _from_date + (_days_ahead - 1), interval '1 day') AS d
  ),
  slots AS (
    SELECT ds.date, lpad(ma.start_hour::text, 2, '0') || ':00' AS time_slot
    FROM date_series ds
    JOIN public.mentor_availability ma
      ON ma.mentor_id = _mentor_id AND ma.day_of_week = ds.iso_dow
  )
  SELECT
    s.date,
    s.time_slot,
    CASE WHEN b.id IS NULL THEN 'available' ELSE 'booked' END AS state
  FROM slots s
  LEFT JOIN public.bookings b
    ON b.mentor_id = _mentor_id
   AND b.date      = s.date
   AND b.time_slot = s.time_slot
   AND b.status   IN ('confirmed', 'completed', 'pending_payment', 'reserved')
  WHERE (
    s.date > v_ist_today
    OR (s.date = v_ist_today AND s.time_slot > to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata', 'HH24:00'))
  )
  ORDER BY s.date ASC, s.time_slot ASC;
END;
$$;

-- ─── 4. reserve_slot — mentor reserves a slot for a regular mentee ──────────
CREATE OR REPLACE FUNCTION public.reserve_slot(
  _student_id  uuid,
  _date        date,
  _time_slot   text
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller     uuid := auth.uid();
  v_price      integer;
  v_hour       smallint;
  v_iso_dow    smallint;
  v_ist_today  date := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date;
  v_ist_hh     text := to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata', 'HH24:00');
  v_booking_id uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  -- Caller must be an APPROVED mentor; snapshot the server-side price in one read.
  SELECT m.price_inr INTO v_price
    FROM public.mentors m
   WHERE m.id = v_caller AND m.status = 'approved'::public.mentor_status;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'only an approved mentor can reserve a slot' USING ERRCODE = '42501';
  END IF;

  IF _student_id = v_caller THEN
    RAISE EXCEPTION 'cannot reserve a slot for yourself' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.students WHERE id = _student_id) THEN
    RAISE EXCEPTION 'student not found' USING ERRCODE = 'P0001';
  END IF;

  -- ELIGIBILITY (safety rule): the student must be a "regular" — at least one
  -- prior confirmed OR completed booking with THIS mentor. This also blocks
  -- reserving slots for students the mentor has no relationship with.
  IF NOT EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.mentor_id  = v_caller
      AND b.student_id = _student_id
      AND b.status IN ('confirmed', 'completed')
  ) THEN
    RAISE EXCEPTION 'you can only reserve a slot for a student you have already mentored'
      USING ERRCODE = 'P0001';
  END IF;

  -- Slot validation — identical to book_session.
  IF _time_slot !~ '^([01][0-9]|2[0-3]):00$' THEN
    RAISE EXCEPTION 'time_slot must be HH:00 (e.g. 14:00), got %', _time_slot USING ERRCODE = 'P0001';
  END IF;
  v_hour    := substring(_time_slot, 1, 2)::smallint;
  v_iso_dow := EXTRACT(ISODOW FROM _date)::smallint;

  IF _date < v_ist_today OR (_date = v_ist_today AND _time_slot <= v_ist_hh) THEN
    RAISE EXCEPTION 'cannot reserve a past time slot' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.mentor_availability ma
    WHERE ma.mentor_id = v_caller AND ma.day_of_week = v_iso_dow AND ma.start_hour = v_hour
  ) THEN
    RAISE EXCEPTION 'you are not available at this time' USING ERRCODE = 'P0001';
  END IF;

  -- Create the hold. Collision via the SAME partial unique index (now incl.
  -- 'reserved') → a slot already held/booked raises unique_violation, race-safe.
  BEGIN
    INSERT INTO public.bookings (
      mentor_id, student_id, date, time_slot, duration, price, status, reschedule_count
    )
    VALUES (v_caller, _student_id, _date, _time_slot, 60, v_price, 'reserved', 0)
    RETURNING id INTO v_booking_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'slot already booked';
  END;

  RETURN v_booking_id;
END;
$$;

REVOKE ALL    ON FUNCTION public.reserve_slot(uuid, date, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reserve_slot(uuid, date, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.reserve_slot(uuid, date, text) TO authenticated;

COMMENT ON FUNCTION public.reserve_slot(uuid, date, text) IS
  'Phase 4b (2026-06-03): an approved mentor reserves a future slot (status=reserved, duration 60, price snapshotted at the mentor rate) for a REGULAR student (≥1 prior confirmed/completed booking together — also the safety gate against reserving for unrelated students). Same slot validation + collision guard as book_session. SECURITY DEFINER; anon revoked.';

-- ─── 5. claim_reserved_booking — the held student converts the hold ─────────
CREATE OR REPLACE FUNCTION public.claim_reserved_booking(_booking_id uuid)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller  uuid := auth.uid();
  v_student uuid;
  v_status  text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT student_id, status INTO v_student, v_status
    FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'hold not found' USING ERRCODE = 'P0001';
  END IF;
  IF v_student IS DISTINCT FROM v_caller THEN
    RAISE EXCEPTION 'this hold is not reserved for you' USING ERRCODE = '42501';
  END IF;
  IF v_status <> 'reserved' THEN
    RAISE EXCEPTION 'this booking is not a reservable hold (status = %)', v_status USING ERRCODE = 'P0001';
  END IF;

  -- In-place flip reserved → pending_payment on the SAME booking.id (the slot is
  -- held continuously across the transition — both states are in the collision
  -- guard → no double-book). Reset created_at so the standard 30-min payment
  -- window starts now (the expire_unpaid_bookings cron measures from created_at).
  UPDATE public.bookings
     SET status = 'pending_payment', created_at = now()
   WHERE id = _booking_id AND status = 'reserved';

  RETURN _booking_id;
END;
$$;

REVOKE ALL    ON FUNCTION public.claim_reserved_booking(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_reserved_booking(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.claim_reserved_booking(uuid) TO authenticated;

COMMENT ON FUNCTION public.claim_reserved_booking(uuid) IS
  'Phase 4b (2026-06-03): the held student converts their reserved hold to pending_payment IN PLACE (same booking.id, continuously in the collision guard → no double-book), resetting created_at so the standard 30-min payment window starts fresh. From there the standard webhook → mark_booking_paid flip (pending_payment → confirmed) confirms it: one booking, one capture, no double-charge. (Driving payment for a claimed hold needs a claim-aware order fn — a frontend follow-up; createBookingOrder today calls book_session, which would collide with the claimed row.) Caller must be the hold''s student.';

-- ─── 6. release_reserved_booking — mentor OR student releases the hold ──────
CREATE OR REPLACE FUNCTION public.release_reserved_booking(_booking_id uuid)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller  uuid := auth.uid();
  v_student uuid;
  v_mentor  uuid;
  v_status  text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT student_id, mentor_id, status INTO v_student, v_mentor, v_status
    FROM public.bookings WHERE id = _booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'hold not found' USING ERRCODE = 'P0001';
  END IF;

  -- Either party to the hold may release it.
  IF v_caller IS DISTINCT FROM v_student AND v_caller IS DISTINCT FROM v_mentor THEN
    RAISE EXCEPTION 'you cannot release this hold' USING ERRCODE = '42501';
  END IF;
  IF v_status <> 'reserved' THEN
    RAISE EXCEPTION 'only a reserved hold can be released (status = %)', v_status USING ERRCODE = 'P0001';
  END IF;

  -- → 'expired' frees the slot (drops out of the collision guard + calendar).
  -- Not 'cancelled' on purpose: a hold never became a paid booking, so the
  -- cancelled-email trigger must not fire.
  UPDATE public.bookings SET status = 'expired'
   WHERE id = _booking_id AND status = 'reserved';

  RETURN _booking_id;
END;
$$;

REVOKE ALL    ON FUNCTION public.release_reserved_booking(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.release_reserved_booking(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.release_reserved_booking(uuid) TO authenticated;

COMMENT ON FUNCTION public.release_reserved_booking(uuid) IS
  'Phase 4b (2026-06-03): either party (the hold''s mentor or its student) releases a reserved hold → status=expired, freeing the slot. Only valid on a reserved hold. SECURITY DEFINER; anon revoked. Uses ''expired'' (not ''cancelled'') so no cancellation email fires for a hold that never confirmed.';

-- ─── 7. auto-release: a reserved hold older than 48h expires ────────────────
-- Independent of the 30-min pending_payment expiry. 48h measured from created_at
-- (= reservation time; the claim resets created_at, after which the row is no
-- longer 'reserved' so this cron no longer matches it).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire_reserved_holds') THEN
    PERFORM cron.unschedule('expire_reserved_holds');
  END IF;
END $$;

SELECT cron.schedule(
  'expire_reserved_holds',
  '*/15 * * * *',
  $job$
    UPDATE public.bookings
       SET status = 'expired'
     WHERE status = 'reserved'
       AND created_at < now() - interval '48 hours';
  $job$
);
