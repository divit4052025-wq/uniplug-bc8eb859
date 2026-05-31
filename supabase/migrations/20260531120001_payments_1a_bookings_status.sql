-- ════════════════════════════════════════════════════════════════════════════
-- Payments Stage 1a: bookings.status widening + slot-hold index + calendar +
--                    payment columns.
-- ════════════════════════════════════════════════════════════════════════════
--
-- WHY: V1 Razorpay payments introduce a "collect-then-confirm" booking flow. A
-- booking is created in a held state (pending_payment) while the student pays,
-- becomes confirmed only on the payment.captured webhook, and can otherwise end
-- as payment_failed or expired. This migration is SCHEMA ONLY — it widens the
-- status domain and holds the slot for the new held state, but does NOT change
-- any write path yet. book_session still inserts 'confirmed' (Stage 2 changes
-- that). No existing row is modified; every change is additive.
--
-- NAME-INDEPENDENT BY CONSTRUCTION: the status-CHECK swap and the slot-index
-- recreate (sections 1 and 2 below) do NOT hard-code the existing object names.
-- Each discovers the real name(s) from the catalog (pg_constraint / pg_indexes)
-- and drops them by their actual name, then re-creates the canonical object. This
-- closes the failure the earlier draft was exposed to: if the live CHECK had been
-- named something other than `bookings_status_valid`, a plain
-- `DROP CONSTRAINT IF EXISTS bookings_status_valid` would have been a silent no-op,
-- leaving the OLD 3-value constraint in force to reject every `pending_payment`
-- INSERT. By dropping ALL status CHECKs (and the drifted-name slot index) the
-- migration converges to the same correct end-state regardless of prior naming.
-- Proven on a deliberately drifted DB (names renamed to *_legacy) — the migration
-- still ends with exactly one 6-value `bookings_status_valid`, the
-- `bookings_confirmed_slot_unique` partial index holding {confirmed,pending_payment},
-- the two non-unique helper indexes untouched, and pending_payment INSERTs accepted.
--
-- The authoritative names (from defining migration 20260425103823_759aec82-…sql)
-- are still `bookings_status_valid` and `bookings_confirmed_slot_unique`; the
-- self-discovery is defence-in-depth, not a substitute for matching names.
--
-- Verification: supabase/dev-seeds/payments-1a-bookings-status-verification.sql
-- Rollback (only while NO new-status rows exist): re-narrow the CHECK to
--   ('confirmed','cancelled','completed') and recreate the index WHERE
--   status = 'confirmed'.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Widen the status domain (additive: adds pending_payment / payment_failed / expired) ───
-- SELF-CORRECTING: instead of DROP CONSTRAINT by a hard-coded name (which, if the
-- live name differed, would silently leave the OLD 3-value constraint in place and
-- reject every pending_payment INSERT), this discovers the actual status CHECK
-- constraint(s) from the catalog and drops them by their real name(s), then adds
-- the canonical widened one. Dropping ALL status CHECKs guarantees no stale
-- constraint survives to shadow the new one.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'public.bookings'::regclass
       AND contype  = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.bookings DROP CONSTRAINT %I', r.conname);
  END LOOP;

  -- Re-add canonically named, widened. (No name collision possible: the loop
  -- above already dropped any constraint named bookings_status_valid.)
  ALTER TABLE public.bookings
    ADD CONSTRAINT bookings_status_valid
    CHECK (status IN ('pending_payment','confirmed','completed','cancelled','payment_failed','expired'));
END $$;

-- ─── 2. Hold the slot for an unpaid pending booking too ──────────────────────
-- Widening the partial index to also cover 'pending_payment' means book_session's
-- existing unique_violation → 'slot already booked' path now also rejects a slot
-- that is merely held by an unpaid pending booking. expired / payment_failed /
-- cancelled / completed all drop OUT of the index, freeing the slot.
-- SELF-CORRECTING (same rationale as the constraint): discover the actual partial
-- UNIQUE slot index from the catalog and drop it by its real name, then recreate
-- canonically. The filter pins it to the (mentor_id, date, time_slot) status-gated
-- UNIQUE index, so the non-unique helper indexes (idx_bookings_student_upcoming,
-- idx_bookings_mentor_date) are never touched.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT indexname
      FROM pg_indexes
     WHERE schemaname = 'public'
       AND tablename  = 'bookings'
       AND indexdef ILIKE '%UNIQUE%'
       AND indexdef ILIKE '%mentor_id%'
       AND indexdef ILIKE '%time_slot%'
       AND indexdef ILIKE '%status%'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS public.%I', r.indexname);
  END LOOP;

  CREATE UNIQUE INDEX IF NOT EXISTS bookings_confirmed_slot_unique
    ON public.bookings (mentor_id, date, time_slot)
    WHERE status IN ('confirmed','pending_payment');
END $$;

-- ─── 3. Payment columns (nullable; set later by the webhook in Stage 3) ──────
-- No read path depends on these; purely additive.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS paid_at             timestamptz,
  ADD COLUMN IF NOT EXISTS razorpay_order_id   text,
  ADD COLUMN IF NOT EXISTS razorpay_payment_id text;

-- ─── 4. Calendar must paint a held slot as taken ─────────────────────────────
-- Faithful CREATE OR REPLACE of the current definition (from
-- 20260514100004_bug_6_5_calendar_ist_dates.sql). The ONLY change is the
-- booked-status predicate on the bookings join: it now also counts
-- 'pending_payment', so a slot held by an unpaid booking shows as 'booked' and
-- the UI cannot offer it to a second student. Signature, IST logic, mentor-
-- approved gate, ordering, STABLE/SECURITY DEFINER, and grants are unchanged.
CREATE OR REPLACE FUNCTION public.get_mentor_calendar(
  _mentor_id uuid,
  _from_date date DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date,
  _days_ahead integer DEFAULT 30
)
RETURNS TABLE(date date, time_slot text, state text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ist_today date := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.mentors m
    WHERE m.id     = _mentor_id
      AND m.status = 'approved'::public.mentor_status
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH date_series AS (
    SELECT
      d::date                              AS date,
      EXTRACT(ISODOW FROM d)::smallint     AS iso_dow
    FROM generate_series(
      _from_date,
      _from_date + (_days_ahead - 1),
      interval '1 day'
    ) AS d
  ),
  slots AS (
    SELECT
      ds.date,
      lpad(ma.start_hour::text, 2, '0') || ':00' AS time_slot
    FROM date_series ds
    JOIN public.mentor_availability ma
      ON ma.mentor_id   = _mentor_id
     AND ma.day_of_week = ds.iso_dow
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
   AND b.status   IN ('confirmed', 'completed', 'pending_payment')
  WHERE (
    s.date > v_ist_today
    OR (
      s.date    = v_ist_today
      AND s.time_slot > to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata', 'HH24:00')
    )
  )
  ORDER BY s.date ASC, s.time_slot ASC;
END;
$$;

COMMENT ON FUNCTION public.get_mentor_calendar(uuid, date, integer) IS
  'Returns the next _days_ahead days of slots for an approved mentor, marking each as available or booked. IST-correct (Bug 6.5). As of Payments Stage 1a (2026-05-31): a slot held by a pending_payment booking is also reported as booked, so an unpaid hold cannot be double-offered while the student pays.';
