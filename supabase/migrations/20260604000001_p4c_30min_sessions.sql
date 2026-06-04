-- ============================================================================
-- Phase 4c (F1) — Student-selectable 30 / 60-minute sessions
-- ============================================================================
-- Design: docs/plans/phase-4-scheduling-remodel.md §F1 (verified against the
-- as-built P4a reschedule + P4b holds — the guard now already includes
-- 'reserved'). This is the highest-risk scheduling change: it rewrites the
-- race-safe collision guard from string-equality to true time-range OVERLAP so
-- a 60-min @ 10:00 and a 30-min @ 10:30 can no longer both be booked.
--
-- WHAT CHANGES (all additive except the intended guard swap, which is atomic):
--   1. CREATE EXTENSION btree_gist (needed for `mentor_id WITH =` in the GiST
--      EXCLUDE constraint).
--   2. bookings.slot_range tstzrange, maintained by a BEFORE INSERT/UPDATE
--      trigger (IST-pinned; a plain GENERATED column is impossible because the
--      `AT TIME ZONE` conversion is STABLE, not IMMUTABLE).
--   3. Backfill slot_range for existing rows, then in the SAME transaction DROP
--      the partial-unique index `bookings_confirmed_slot_unique` and ADD the
--      EXCLUDE constraint `bookings_no_overlap` — one migration = one
--      transaction = NO guard-lapse window.
--   4. book_session / reserve_slot gain `_duration int DEFAULT 60` (∈{30,60}),
--      a SERVER-DERIVED prorated price (₹500 for 30-min, ₹1000 for 60-min from
--      the mentor's flat price_inr — NEVER client-supplied), a relaxed HH:(00|30)
--      regex, duration-aware availability coverage, and exception handlers
--      widened to also catch exclusion_violation (23P01).
--   5. reschedule_booking: same handler-widen + duration-aware availability for
--      the (possibly 30-min) booking it moves.
--   6. get_mentor_calendar: emits HH:00 + HH:30 per declared hour block and the
--      booked test becomes a range OVERLAP (a 60-min booking marks BOTH sub-slots
--      taken) — the read-side mirror of the guard.
--   7. auto_complete_past_bookings cron: session-end interval '1 hour' →
--      (duration||' minutes')::interval.
--
-- WHAT DELIBERATELY DOES NOT CHANGE:
--   - claim_reserved_booking: an in-place reserved→pending_payment flip that
--     never touches date/time_slot/duration, so slot_range is unchanged and no
--     collision is possible — it rides the range guard via the trigger-maintained
--     column with no body edit.
--   - expire_unpaid_bookings (*/5) and expire_reserved_holds (*/15): both key on
--     created_at, NOT session time, so they are duration-INDEPENDENT and need no
--     change. (A status flip drops the row from the EXCLUDE WHERE-set automatically.)
--   - mark_booking_paid / apply_refund / run_weekly_payout_batch: already
--     duration-aware (interval from duration) or price-derived; no change.
--
-- AVAILABILITY GRANULARITY DECISION (F1 row 1, Option 1A): mentor_availability
--   stays whole-hour blocks; 30-min sub-slots are DERIVED in the read/booking
--   layer (a declared hour H sells H:00 and H:30; a 60-min @ H:30 needs BOTH H
--   and H+1 declared). This is purely in-function logic — NO schema change to
--   mentor_availability and NO migration risk on existing availability rows.
--
-- PROD-APPLY NOTE (the hold stands — not applied here): the EXCLUDE constraint
--   validates existing rows when created. On prod every live booking is 60-min
--   on-the-hour and the old unique index already prevented same-slot collisions,
--   so there are no existing overlaps — the backfill + constraint validate clean.
-- ============================================================================

-- 1. btree_gist — required for the equality operator on mentor_id inside GiST.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ── 2. slot_range column + IST-pinned trigger-maintained range ──────────────
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS slot_range tstzrange;

COMMENT ON COLUMN public.bookings.slot_range IS
  'Phase 4c (2026-06-04): IST-pinned [start,end) range = (date+time_slot) AT TIME ZONE Asia/Kolkata for `duration` minutes. Maintained by bookings_set_slot_range (cannot be GENERATED — the TZ conversion is not IMMUTABLE). Backs the bookings_no_overlap EXCLUDE guard. Half-open so adjacent slots (10:00-10:30, 10:30-11:00) do not overlap.';

CREATE OR REPLACE FUNCTION public.set_booking_slot_range()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_start timestamptz;
BEGIN
  v_start := (NEW.date::timestamp + NEW.time_slot::time) AT TIME ZONE 'Asia/Kolkata';
  NEW.slot_range := tstzrange(
    v_start,
    v_start + (NEW.duration || ' minutes')::interval,
    '[)'
  );
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.set_booking_slot_range() IS
  'Phase 4c: BEFORE INSERT/UPDATE — derives bookings.slot_range from (date,time_slot,duration), IST-pinned. Fires before the EXCLUDE guard checks overlap.';

-- Fires on INSERT (always) and only when a slot-defining column is updated.
DROP TRIGGER IF EXISTS bookings_set_slot_range ON public.bookings;
CREATE TRIGGER bookings_set_slot_range
  BEFORE INSERT OR UPDATE OF date, time_slot, duration
  ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_booking_slot_range();

-- ── 3. Backfill existing rows, then swap the guard in ONE transaction ───────
-- Backfill (locally 0 active rows; on prod all 60-min on-the-hour). This sets
-- slot_range directly (the trigger does not fire on a slot_range-only UPDATE).
UPDATE public.bookings
   SET slot_range = tstzrange(
         (date::timestamp + time_slot::time) AT TIME ZONE 'Asia/Kolkata',
         (date::timestamp + time_slot::time) AT TIME ZONE 'Asia/Kolkata'
           + (duration || ' minutes')::interval,
         '[)')
 WHERE slot_range IS NULL;

-- Drop the string-equality guard and add the range-overlap guard atomically.
-- The EXCLUDE is strictly STRONGER (it catches everything the unique index did,
-- plus variable-length overlaps), over the SAME active-status predicate.
DROP INDEX IF EXISTS public.bookings_confirmed_slot_unique;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING gist (mentor_id WITH =, slot_range WITH &&)
  WHERE (status IN ('confirmed', 'pending_payment', 'reserved'));

COMMENT ON CONSTRAINT bookings_no_overlap ON public.bookings IS
  'Phase 4c: race-safe collision guard — no two active (confirmed/pending_payment/reserved) bookings for the same mentor may have overlapping slot_range. Replaces bookings_confirmed_slot_unique; catches 30/60-min overlaps the string index could not. Violation = SQLSTATE 23P01 (exclusion_violation), caught by book_session/reserve_slot/reschedule_booking.';

-- Defense-in-depth (folded from the P4c adversarial review, finding P4C-PAY-01):
-- a GiST `&&` over a NULL slot_range yields NULL, never TRUE — so an ACTIVE row
-- with a NULL range would be invisible to the EXCLUDE guard and silently
-- double-bookable. Today that is not client-reachable (no INSERT RLS policy; the
-- only student UPDATE policy is WITH CHECK status='cancelled'), but the
-- no-double-book invariant should not rest on RLS + universal trigger coverage
-- alone. This CHECK makes a NULL-range active row impossible regardless of which
-- write path runs (validates clean: the backfill above gives every existing row
-- a range, and the trigger sets it before this CHECK evaluates on every write).
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_active_has_range
  CHECK (status NOT IN ('confirmed', 'pending_payment', 'reserved') OR slot_range IS NOT NULL);

COMMENT ON CONSTRAINT bookings_active_has_range ON public.bookings IS
  'Phase 4c: constraint-level backstop for bookings_no_overlap — an active (confirmed/pending_payment/reserved) booking must have a non-NULL slot_range, so it can never become invisible to the overlap EXCLUDE guard (a NULL range would not participate in GiST &&).';

-- ── 4. Shared availability-coverage helper (Option 1A; one definition) ──────
-- TRUE iff every whole-hour block the [start, start+duration) booking touches is
-- a declared mentor_availability block. A 60-min @ HH:30 touches HH and HH+1.
CREATE OR REPLACE FUNCTION public.mentor_covers_slot(
  _mentor_id uuid,
  _iso_dow   smallint,
  _time_slot text,
  _duration  integer
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $function$
  SELECT NOT EXISTS (
    SELECT 1
    FROM generate_series(
           (substring(_time_slot, 1, 2)::int * 60 + substring(_time_slot, 4, 2)::int) / 60,
           (substring(_time_slot, 1, 2)::int * 60 + substring(_time_slot, 4, 2)::int + _duration - 1) / 60
         ) AS h(hr)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.mentor_availability ma
      WHERE ma.mentor_id   = _mentor_id
        AND ma.day_of_week = _iso_dow
        AND ma.start_hour  = h.hr
    )
  );
$function$;

COMMENT ON FUNCTION public.mentor_covers_slot(uuid, smallint, text, integer) IS
  'Phase 4c: shared availability check — every hour the [start,start+duration) booking spans must be a declared 1-hour block (Option 1A: 60-min @ HH:30 needs HH and HH+1). Used by book_session, reserve_slot, reschedule_booking.';

-- ── 5. book_session — DROP 5-arg, CREATE 6-arg (duration + prorated price) ──
DROP FUNCTION IF EXISTS public.book_session(uuid, date, text, uuid, text);

CREATE FUNCTION public.book_session(
  _mentor_id   uuid,
  _date        date,
  _time_slot   text,
  _subject_id  uuid    DEFAULT NULL,
  _description text    DEFAULT NULL,
  _duration    integer DEFAULT 60
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_caller     uuid    := auth.uid();
  v_price_inr  integer;
  v_price      integer;
  v_hour       smallint;
  v_iso_dow    smallint;
  v_slot_start timestamptz;
  v_status     text;
  v_booking_id uuid;
  v_subject_id uuid;
BEGIN
  -- 1. Authentication required.
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  -- 2. Mentor cannot book themselves.
  IF _mentor_id = v_caller THEN
    RAISE EXCEPTION 'mentors cannot book themselves';
  END IF;

  -- 3. Caller must be a student.
  IF NOT EXISTS (SELECT 1 FROM public.students WHERE id = v_caller) THEN
    RAISE EXCEPTION 'only students may book sessions';
  END IF;

  -- 4. Duration must be 30 or 60.
  IF _duration NOT IN (30, 60) THEN
    RAISE EXCEPTION 'duration must be 30 or 60 minutes, got %', _duration;
  END IF;

  -- 5. time_slot must be HH:00 or HH:30, hour 00..23.
  IF _time_slot !~ '^([01][0-9]|2[0-3]):(00|30)$' THEN
    RAISE EXCEPTION 'time_slot must be HH:00 or HH:30 (e.g. 14:30), got %', _time_slot;
  END IF;

  v_hour    := substring(_time_slot, 1, 2)::smallint;
  v_iso_dow := EXTRACT(ISODOW FROM _date)::smallint;

  -- 6. Mentor approval AND flat price fetch in a single read.
  SELECT m.price_inr
    INTO v_price_inr
    FROM public.mentors m
   WHERE m.id     = _mentor_id
     AND m.status = 'approved'::public.mentor_status;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'mentor not available for booking';
  END IF;

  -- 6b. SERVER-DERIVED price, prorated by duration (never client-supplied).
  --     ₹1000 flat → 60-min ₹1000, 30-min ₹500.
  v_price := round(coalesce(v_price_inr, 0) * _duration / 60.0)::integer;

  -- 7. IST past-slot guard (minute-accurate — required for :30 slots).
  v_slot_start := (_date::timestamp + _time_slot::time) AT TIME ZONE 'Asia/Kolkata';
  IF v_slot_start <= now() THEN
    RAISE EXCEPTION 'cannot book a past time slot';
  END IF;

  -- 8. Availability — every hour the session spans must be declared (Option 1A).
  IF NOT public.mentor_covers_slot(_mentor_id, v_iso_dow, _time_slot, _duration) THEN
    RAISE EXCEPTION 'mentor is not available at this time';
  END IF;

  -- 8c. Optional subject — a stale/unknown id resolves to NULL (never breaks booking).
  v_subject_id := _subject_id;
  IF v_subject_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.ref_subjects WHERE id = v_subject_id) THEN
    v_subject_id := NULL;
  END IF;

  -- 8b. Sub-Razorpay-minimum price → confirm now (no payable order possible);
  --     otherwise pending_payment until the payment.captured webhook confirms.
  IF v_price * 100 < 100 THEN
    v_status := 'confirmed';
  ELSE
    v_status := 'pending_payment';
  END IF;

  -- 9. Insert, catching the range guard for race-safe double-book. The
  --    bookings_no_overlap EXCLUDE holds the slot for confirmed/pending_payment/
  --    reserved, so an OVERLAPPING booking (any 30/60 combination) raises
  --    exclusion_violation. (unique_violation kept defensively.)
  BEGIN
    INSERT INTO public.bookings (
      mentor_id, student_id, date, time_slot, duration, price, status, subject_id, description
    )
    VALUES (
      _mentor_id, v_caller, _date, _time_slot, _duration, v_price, v_status,
      v_subject_id, NULLIF(btrim(coalesce(_description, '')), '')
    )
    RETURNING id INTO v_booking_id;
  EXCEPTION WHEN unique_violation OR exclusion_violation THEN
    RAISE EXCEPTION 'slot already booked';
  END;

  RETURN v_booking_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.book_session(uuid, date, text, uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.book_session(uuid, date, text, uuid, text, integer) TO authenticated, service_role;

-- ── 6. reserve_slot — DROP 3-arg, CREATE 4-arg (duration + prorated price) ──
DROP FUNCTION IF EXISTS public.reserve_slot(uuid, date, text);

CREATE FUNCTION public.reserve_slot(
  _student_id uuid,
  _date       date,
  _time_slot  text,
  _duration   integer DEFAULT 60
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_caller     uuid := auth.uid();
  v_price_inr  integer;
  v_price      integer;
  v_hour       smallint;
  v_iso_dow    smallint;
  v_slot_start timestamptz;
  v_booking_id uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  -- Caller must be an APPROVED mentor; snapshot the flat price in one read.
  SELECT m.price_inr INTO v_price_inr
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

  -- ELIGIBILITY (safety rule): "regular" — a prior confirmed/completed booking
  -- with THIS mentor. Also blocks reserving for unrelated students.
  IF NOT EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.mentor_id  = v_caller
      AND b.student_id = _student_id
      AND b.status IN ('confirmed', 'completed')
  ) THEN
    RAISE EXCEPTION 'you can only reserve a slot for a student you have already mentored'
      USING ERRCODE = 'P0001';
  END IF;

  -- Duration + slot validation (identical to book_session).
  IF _duration NOT IN (30, 60) THEN
    RAISE EXCEPTION 'duration must be 30 or 60 minutes, got %', _duration USING ERRCODE = 'P0001';
  END IF;
  IF _time_slot !~ '^([01][0-9]|2[0-3]):(00|30)$' THEN
    RAISE EXCEPTION 'time_slot must be HH:00 or HH:30 (e.g. 14:30), got %', _time_slot USING ERRCODE = 'P0001';
  END IF;
  v_hour    := substring(_time_slot, 1, 2)::smallint;
  v_iso_dow := EXTRACT(ISODOW FROM _date)::smallint;

  v_price := round(coalesce(v_price_inr, 0) * _duration / 60.0)::integer;

  v_slot_start := (_date::timestamp + _time_slot::time) AT TIME ZONE 'Asia/Kolkata';
  IF v_slot_start <= now() THEN
    RAISE EXCEPTION 'cannot reserve a past time slot' USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.mentor_covers_slot(v_caller, v_iso_dow, _time_slot, _duration) THEN
    RAISE EXCEPTION 'you are not available at this time' USING ERRCODE = 'P0001';
  END IF;

  -- Create the hold. Collision via the SAME range guard (now overlap-aware).
  BEGIN
    INSERT INTO public.bookings (
      mentor_id, student_id, date, time_slot, duration, price, status, reschedule_count
    )
    VALUES (v_caller, _student_id, _date, _time_slot, _duration, v_price, 'reserved', 0)
    RETURNING id INTO v_booking_id;
  EXCEPTION WHEN unique_violation OR exclusion_violation THEN
    RAISE EXCEPTION 'slot already booked';
  END;

  RETURN v_booking_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.reserve_slot(uuid, date, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_slot(uuid, date, text, integer) TO authenticated, service_role;

-- ── 7. reschedule_booking — widen handler + duration-aware availability ─────
CREATE OR REPLACE FUNCTION public.reschedule_booking(
  _booking_id    uuid,
  _new_date      date,
  _new_time_slot text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_caller       uuid := auth.uid();
  v_mentor_id    uuid;
  v_student_id   uuid;
  v_status       text;
  v_payout_id    uuid;
  v_count        integer;
  v_cur_date     date;
  v_cur_slot     text;
  v_duration     integer;
  v_iso_dow      smallint;
  v_slot_start   timestamptz;
  v_cur_start    timestamptz;
BEGIN
  -- 1. Authentication required.
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  -- 2. Load + row-lock the booking (serialize concurrent reschedules of it).
  SELECT mentor_id, student_id, status, payout_id, reschedule_count, date, time_slot, duration
    INTO v_mentor_id, v_student_id, v_status, v_payout_id, v_count, v_cur_date, v_cur_slot, v_duration
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

  -- 4. Only a confirmed (paid) booking is reschedulable.
  IF v_status <> 'confirmed' THEN
    RAISE EXCEPTION 'only a confirmed booking can be rescheduled (status = %)', v_status
      USING ERRCODE = 'P0001';
  END IF;

  -- 5. Pre-settlement only.
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

  -- 8. Validate the NEW slot. Duration carries (a 30-min booking stays 30-min);
  --    the slot format now allows :30 and availability must cover the booking's
  --    own duration on the new day.
  IF _new_time_slot !~ '^([01][0-9]|2[0-3]):(00|30)$' THEN
    RAISE EXCEPTION 'time_slot must be HH:00 or HH:30 (e.g. 14:30), got %', _new_time_slot
      USING ERRCODE = 'P0001';
  END IF;
  v_iso_dow := EXTRACT(ISODOW FROM _new_date)::smallint;

  -- 8a. IST past-slot guard on the NEW slot (minute-accurate).
  v_slot_start := (_new_date::timestamp + _new_time_slot::time) AT TIME ZONE 'Asia/Kolkata';
  IF v_slot_start <= now() THEN
    RAISE EXCEPTION 'cannot reschedule to a past time slot' USING ERRCODE = 'P0001';
  END IF;

  -- 8b. Availability covers the booking's duration on the new weekday.
  IF NOT public.mentor_covers_slot(v_mentor_id, v_iso_dow, _new_time_slot, v_duration) THEN
    RAISE EXCEPTION 'mentor is not available at this time' USING ERRCODE = 'P0001';
  END IF;

  -- 9. In-place move. The bookings_set_slot_range trigger recomputes slot_range
  --    from the new (date,time_slot) with the unchanged duration, and the range
  --    EXCLUDE guard rejects an OVERLAP with another active booking. Payment
  --    fields + status are NOT in the SET list → money carries, no status
  --    trigger fires. (Handler now also catches exclusion_violation — the
  --    range-guard successor to unique_violation, as the P4b note anticipated.)
  BEGIN
    UPDATE public.bookings
       SET date             = _new_date,
           time_slot        = _new_time_slot,
           reschedule_count = reschedule_count + 1
     WHERE id = _booking_id;
  EXCEPTION WHEN unique_violation OR exclusion_violation THEN
    RAISE EXCEPTION 'slot already booked';
  END;

  RETURN _booking_id;
END;
$function$;

-- ── 8. get_mentor_calendar — 30-min sub-slots + range-overlap booked test ───
CREATE OR REPLACE FUNCTION public.get_mentor_calendar(
  _mentor_id   uuid,
  _from_date   date    DEFAULT ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata'::text))::date,
  _days_ahead  integer DEFAULT 30
)
RETURNS TABLE(date date, time_slot text, state text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
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
  -- Each declared hour block yields a :00 and a :30 sub-slot.
  slots AS (
    SELECT
      ds.date,
      lpad(ma.start_hour::text, 2, '0') || ':' || lpad(sub.min::text, 2, '0') AS time_slot,
      ((ds.date::timestamp
          + (lpad(ma.start_hour::text, 2, '0') || ':' || lpad(sub.min::text, 2, '0'))::time)
        AT TIME ZONE 'Asia/Kolkata') AS slot_start
    FROM date_series ds
    JOIN public.mentor_availability ma
      ON ma.mentor_id = _mentor_id AND ma.day_of_week = ds.iso_dow
    CROSS JOIN (VALUES (0), (30)) AS sub(min)
  )
  SELECT
    s.date,
    s.time_slot,
    CASE WHEN EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.mentor_id = _mentor_id
        AND b.status IN ('confirmed', 'completed', 'pending_payment', 'reserved')
        AND b.slot_range && tstzrange(s.slot_start, s.slot_start + interval '30 minutes', '[)')
    ) THEN 'booked' ELSE 'available' END AS state
  FROM slots s
  WHERE s.slot_start > now()           -- future sub-slots only (minute-accurate)
  ORDER BY s.date ASC, s.time_slot ASC;
END;
$function$;

-- ── 9. auto_complete_past_bookings cron — duration-aware session end ────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto_complete_past_bookings') THEN
    PERFORM cron.unschedule('auto_complete_past_bookings');
  END IF;
END $$;

SELECT cron.schedule(
  'auto_complete_past_bookings',
  '*/15 * * * *',
  $job$
    UPDATE public.bookings
    SET    status = 'completed'
    WHERE  status = 'confirmed'
      AND  ((date::timestamp + time_slot::time + (duration || ' minutes')::interval)
              AT TIME ZONE 'Asia/Kolkata') <= now();
  $job$
);

-- expire_unpaid_bookings (*/5) and expire_reserved_holds (*/15) intentionally
-- unchanged: both key on created_at, not session time → duration-independent.
