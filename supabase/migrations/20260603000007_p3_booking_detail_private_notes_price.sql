-- ════════════════════════════════════════════════════════════════════════════
-- Phase 3: booking detail (optional subject + description), private mentor notes,
-- and the approved flat price (₹1000).
-- ════════════════════════════════════════════════════════════════════════════
--
-- Additive; extends what exists (per the transactional-layer map). Three parts:
--
-- 1. BOOKINGS DETAIL — bookings += subject_id (nullable FK → ref_subjects) +
--    description (nullable free text). Both OPTIONAL, set by the booking's own
--    student via book_session. book_session gains optional _subject_id /
--    _description params, fully backward-compatible: existing 3-arg calls keep
--    working (the new trailing params default to NULL), and a stale/unknown
--    _subject_id resolves to NULL rather than breaking the booking. Because
--    adding params changes the function's argument list, book_session is
--    DROP+re-CREATEd (a 5-arg overload alongside the old 3-arg would make a
--    3-arg call ambiguous). Body is otherwise preserved verbatim.
--
-- 2. PRIVATE MENTOR NOTES — a NEW SEPARATE table mentor_private_notes. It is
--    physically separate from session_notes ON PURPOSE: students can read
--    session_notes rows, and Postgres RLS cannot hide a single column, so a
--    mentor-private note must live in its own table with no student read path.
--    RLS: ONLY the owning mentor (auth.uid() = mentor_id) can SELECT/INSERT/
--    UPDATE/DELETE. The student the note is about — and every other party — has
--    NO read policy of any kind. No admin SELECT policy either (admin review, if
--    ever needed, is server-side via service_role).
--
-- 3. PRICE — approved flat rate. mentors.price_inr DEFAULT 1800 → 1000, and
--    backfill every existing mentor to 1000 (UniPlug controls pricing; mentors
--    never set their own rate). The platform cut stays 20% — the 80/20 split in
--    mark_booking_paid / run_weekly_payout_batch is NOT touched. The backfill
--    UPDATE must pass prevent_mentor_self_approval (which locks price_inr to
--    admin/service_role), so the migration asserts the service_role JWT claim
--    for the backfill statement only (the trigger's intended programmatic-write
--    bypass) — no trigger is dropped or modified.
--
-- Idempotent (ADD COLUMN IF NOT EXISTS, DROP FUNCTION IF EXISTS + CREATE,
-- CREATE TABLE IF NOT EXISTS, DROP POLICY/TRIGGER IF EXISTS before CREATE,
-- ALTER COLUMN SET DEFAULT, idempotent backfill via IS DISTINCT FROM).
--
-- Verification: supabase/dev-seeds/p3-booking-detail-verification.sql
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1a. bookings detail columns ───────────────────────────────────────────

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS subject_id  uuid REFERENCES public.ref_subjects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS description text;

CREATE INDEX IF NOT EXISTS bookings_subject_idx ON public.bookings (subject_id);

COMMENT ON COLUMN public.bookings.subject_id IS
  'Phase 3 (2026-06-03): optional student-chosen subject for the session → ref_subjects. Nullable; set by the booking owner via book_session. Unknown id resolves to NULL.';
COMMENT ON COLUMN public.bookings.description IS
  'Phase 3 (2026-06-03): optional student-written free-text description of what they need help with (shown to the mentor). Nullable; set by the booking owner via book_session.';

-- ─── 1b. book_session — DROP + re-CREATE with optional _subject_id/_description ─
-- DROP the 3-arg signature (a 5-arg-with-defaults overload would make 3-arg
-- calls ambiguous), then CREATE the extended version. Body preserved verbatim
-- except the Phase 3 subject/description handling + extended INSERT.

DROP FUNCTION IF EXISTS public.book_session(uuid, date, text);

CREATE FUNCTION public.book_session(
  _mentor_id   uuid,
  _date        date,
  _time_slot   text,
  _subject_id  uuid DEFAULT NULL,
  _description text DEFAULT NULL
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
  v_status     text;
  v_booking_id uuid;
  v_subject_id uuid;
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

  -- 4. time_slot must be HH:00, hour 00..23.
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

  -- 7c. Phase 3: optional subject — a stale/unknown id resolves to NULL so it
  --     can NEVER break the booking. description is free text (empty → NULL).
  v_subject_id := _subject_id;
  IF v_subject_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.ref_subjects WHERE id = v_subject_id) THEN
    v_subject_id := NULL;
  END IF;

  -- 7b. Status selection (Stage 2): sub-Razorpay-minimum price → confirm now
  --     (no payable order possible); otherwise hold as pending_payment until the
  --     payment.captured webhook confirms it.
  IF coalesce(v_price_inr, 0) * 100 < 100 THEN
    v_status := 'confirmed';
  ELSE
    v_status := 'pending_payment';
  END IF;

  -- 8. Insert, catching the partial unique index for race-safe double-book.
  --    The widened bookings_confirmed_slot_unique (Stage 1a) holds the slot for
  --    BOTH 'confirmed' and 'pending_payment', so a second student cannot take a
  --    slot already held by an unpaid pending booking.
  BEGIN
    INSERT INTO public.bookings (
      mentor_id, student_id, date, time_slot, duration, price, status, subject_id, description
    )
    VALUES (
      _mentor_id, v_caller, _date, _time_slot, 60, v_price_inr, v_status,
      v_subject_id, NULLIF(btrim(coalesce(_description, '')), '')
    )
    RETURNING id INTO v_booking_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'slot already booked';
  END;

  RETURN v_booking_id;
END;
$$;

REVOKE ALL    ON FUNCTION public.book_session(uuid, date, text, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.book_session(uuid, date, text, uuid, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.book_session(uuid, date, text, uuid, text) TO authenticated;

COMMENT ON FUNCTION public.book_session(uuid, date, text, uuid, text) IS
  'Phase 3 (2026-06-03): books a session (pending_payment, or instant confirmed for sub-₹1). Now accepts optional _subject_id (→ ref_subjects; unknown→NULL) + _description, set by the booking owner (the calling student). 3-arg calls remain valid (params default NULL). Server-side price, approved-mentor gate, IST past-slot guard, recurring-availability check, and race-safe slot hold all unchanged.';

-- ─── 2. mentor_private_notes — separate table, mentor-only (no student read) ──

CREATE TABLE IF NOT EXISTS public.mentor_private_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mentor_id   uuid NOT NULL REFERENCES public.mentors(id)  ON DELETE CASCADE,
  student_id  uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  body        text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mentor_private_notes_mentor_idx
  ON public.mentor_private_notes (mentor_id);
CREATE INDEX IF NOT EXISTS mentor_private_notes_mentor_student_idx
  ON public.mentor_private_notes (mentor_id, student_id);

ALTER TABLE public.mentor_private_notes ENABLE ROW LEVEL SECURITY;

-- ONLY the owning mentor has any access. NO student policy, NO admin policy →
-- the student the note is about (and everyone else) has zero read path.
DROP POLICY IF EXISTS "Mentors view own private notes" ON public.mentor_private_notes;
CREATE POLICY "Mentors view own private notes"
  ON public.mentor_private_notes FOR SELECT TO authenticated
  USING (auth.uid() = mentor_id);

DROP POLICY IF EXISTS "Mentors insert own private notes" ON public.mentor_private_notes;
CREATE POLICY "Mentors insert own private notes"
  ON public.mentor_private_notes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = mentor_id);

DROP POLICY IF EXISTS "Mentors update own private notes" ON public.mentor_private_notes;
CREATE POLICY "Mentors update own private notes"
  ON public.mentor_private_notes FOR UPDATE TO authenticated
  USING (auth.uid() = mentor_id)
  WITH CHECK (auth.uid() = mentor_id);

DROP POLICY IF EXISTS "Mentors delete own private notes" ON public.mentor_private_notes;
CREATE POLICY "Mentors delete own private notes"
  ON public.mentor_private_notes FOR DELETE TO authenticated
  USING (auth.uid() = mentor_id);

CREATE OR REPLACE FUNCTION public.tg_mentor_private_notes_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mentor_private_notes_touch ON public.mentor_private_notes;
CREATE TRIGGER mentor_private_notes_touch
  BEFORE UPDATE ON public.mentor_private_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_mentor_private_notes_touch();

COMMENT ON TABLE public.mentor_private_notes IS
  'Phase 3 (2026-06-03): a mentor''s PRIVATE notes about a student — confidential, never visible to the student or any other party. Physically separate from session_notes (which students can read) because RLS cannot hide a single column. RLS: owner mentor only (auth.uid() = mentor_id) for all four verbs; no student/admin read policy.';

-- ─── 3. mentors flat price (approved): default 1000 + backfill to 1000 ────────
-- Platform cut stays 20% — the 80/20 split is NOT touched here.

ALTER TABLE public.mentors ALTER COLUMN price_inr SET DEFAULT 1000;

-- Backfill to the uniform flat rate. prevent_mentor_self_approval locks price_inr
-- to admin/service_role; assert the service_role JWT claim for this transaction
-- so the backfill passes the trigger's intended programmatic-write bypass. No
-- trigger is dropped or altered; the claim is transaction-local.
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
UPDATE public.mentors SET price_inr = 1000 WHERE price_inr IS DISTINCT FROM 1000;
SELECT set_config('request.jwt.claims', '{}', true);
