-- Phase A1: book_session SECURITY DEFINER RPC + INSERT-policy retirement.
--
-- Background: audits/2026-05-14/rls-audit.md Risk 4 flagged three holes in
-- the bookings INSERT policy: (a) no mentor approval check, (b) no
-- availability check, (c) client-controlled price. The May 14 migrations
-- (20260514100002 + 20260514100003) shipped the minimal fix for (a).
-- (b) and (c) are addressed here, completing Risk 4.
--
-- The full fix is a SECURITY DEFINER RPC that becomes the only path to
-- create a booking. It validates:
--   - caller is authenticated and has a public.students row (the cascaded
--     row from handle_new_user when raw_user_meta_data.role = 'student');
--   - caller != _mentor_id (you cannot book yourself as mentor);
--   - _time_slot matches the HH:00 shape that mentor_availability stores
--     and that get_mentor_calendar surfaces;
--   - mentor exists with status='approved' AND price_inr is fetched in
--     the same query (no client-controlled price);
--   - (_date, _time_slot) is in the future per Asia/Kolkata, mirroring
--     get_mentor_calendar (otherwise the auto_complete_past_bookings cron
--     would instantly flip the new booking to 'completed');
--   - (mentor, ISODOW(_date), parse-hour(_time_slot)) exists in
--     mentor_availability (the table stores recurring weekly slots, not
--     date-specific rows);
--   - double-booking is the partial unique index
--     bookings_confirmed_slot_unique catching SQLSTATE 23505 inside a
--     savepoint and translating to a friendly 'slot already booked'.
--
-- In the same migration the "Students can create own bookings" INSERT
-- policy is DROPped. With the RPC running SECURITY DEFINER, students no
-- longer need a direct INSERT capability; re-adding one without the same
-- gates would re-open Risk 4 holes (b) and (c). Future contributors who
-- need an admin "force-book" path should write a separate SECURITY DEFINER
-- function that calls the same validation logic, not a new INSERT policy.
--
-- The existing R4 dev-seed (bug-audit-rls-risk4-verification.sql) tests
-- the direct INSERT policy and will start showing FAILs after this lands
-- because the INSERT path is gone. That dev-seed remains as historical
-- documentation of the May 14 minimal fix; the new dev-seed below
-- supersedes it for forward-looking gates.
--
-- Idempotent: re-applies cleanly (CREATE OR REPLACE FUNCTION on the same
-- signature, REVOKE/GRANT against the canonical signature, DROP POLICY
-- IF EXISTS).
--
-- Verification: supabase/dev-seeds/book-session-rpc-verification.sql

CREATE OR REPLACE FUNCTION public.book_session(
  _mentor_id uuid,
  _date      date,
  _time_slot text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller     uuid    := auth.uid();
  v_price_inr  integer;
  v_hour       smallint;
  v_iso_dow    smallint;
  v_ist_today  date    := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date;
  v_ist_hh     text    := to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata', 'HH24:00');
  v_booking_id uuid;
BEGIN
  -- 1. Authentication required.
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Mentor cannot book themselves.
  IF _mentor_id = v_caller THEN
    RAISE EXCEPTION 'mentors cannot book themselves';
  END IF;

  -- 3. Caller must be a student (handle_new_user cascades on signup).
  IF NOT EXISTS (SELECT 1 FROM public.students WHERE id = v_caller) THEN
    RAISE EXCEPTION 'only students may book sessions';
  END IF;

  -- 4. time_slot must be HH:00, hour 00..23 (mirrors mentor_availability
  --    storage and get_mentor_calendar output; matches the hour range of
  --    bookings_time_slot_format). Tighter than [0-2][0-9] so out-of-range
  --    hours fail here with a clear "malformed" message rather than later
  --    with the availability oracle's "not available at this time".
  IF _time_slot !~ '^([01][0-9]|2[0-3]):00$' THEN
    RAISE EXCEPTION 'time_slot must be HH:00 (e.g. 14:00), got %', _time_slot;
  END IF;

  v_hour    := substring(_time_slot, 1, 2)::smallint;
  v_iso_dow := EXTRACT(ISODOW FROM _date)::smallint;

  -- 5. Mentor approval AND price fetch in a single read (server-side price).
  SELECT m.price_inr
    INTO v_price_inr
    FROM public.mentors m
   WHERE m.id     = _mentor_id
     AND m.status = 'approved'::public.mentor_status;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'mentor not available for booking';
  END IF;

  -- 6. IST past-slot guard.
  IF _date < v_ist_today
     OR (_date = v_ist_today AND _time_slot <= v_ist_hh) THEN
    RAISE EXCEPTION 'cannot book a past time slot';
  END IF;

  -- 7. Availability (mentor_availability is recurring weekly).
  IF NOT EXISTS (
    SELECT 1 FROM public.mentor_availability ma
    WHERE ma.mentor_id   = _mentor_id
      AND ma.day_of_week = v_iso_dow
      AND ma.start_hour  = v_hour
  ) THEN
    RAISE EXCEPTION 'mentor is not available at this time';
  END IF;

  -- 8. Insert, catching the partial unique index for race-safe double-book.
  --    The BEGIN/EXCEPTION block opens an implicit subtransaction
  --    (savepoint) so catching unique_violation does not abort the outer
  --    transaction; see Postgres "Trapping Errors" in plpgsql.
  BEGIN
    INSERT INTO public.bookings (
      mentor_id, student_id, date, time_slot, duration, price, status
    )
    VALUES (
      _mentor_id, v_caller, _date, _time_slot, 60, v_price_inr, 'confirmed'
    )
    RETURNING id INTO v_booking_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'slot already booked';
  END;

  RETURN v_booking_id;
END;
$$;

REVOKE ALL ON FUNCTION public.book_session(uuid, date, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.book_session(uuid, date, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.book_session(uuid, date, text) TO authenticated;

COMMENT ON FUNCTION public.book_session(uuid, date, text) IS
  'Phase A1 (2026-05-23): the only INSERT path into public.bookings. SECURITY DEFINER. Validates caller is a student (not the mentor), mentor approval + server-side price, HH:00 time_slot shape, IST past-slot, mentor_availability (day_of_week + start_hour), and translates double-book unique-violation into a friendly error. Returns the new booking id (consumed by the client to dispatch sendBookingEmails).';

-- Retire the direct INSERT policy. The RPC above is the only path now.
-- A re-add here would re-open Risk 4 holes (b) availability and (c) price.
DROP POLICY IF EXISTS "Students can create own bookings" ON public.bookings;

-- Surface the "RPC is the only writer" contract in schema introspection so
-- future contributors see it in \d+ bookings without grepping migrations.
-- The grep-based pre-commit guard against new direct .from("bookings").
-- insert(...) / INSERT INTO public.bookings outside this RPC will land in
-- Phase B3 alongside the rest of the hook wiring.
COMMENT ON TABLE public.bookings IS
  'All writes to this table MUST go through public.book_session(uuid, date, text). There is no INSERT policy by design — see migration 20260523000001_book_session_rpc.sql. Service-role callers can bypass RLS and must be reviewed against the same gates the RPC enforces (mentor approval, server-side price, availability, IST past-slot, double-book).';
