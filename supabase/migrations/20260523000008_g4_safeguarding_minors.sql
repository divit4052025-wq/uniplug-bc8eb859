-- Phase G4 (amended): safeguarding for minors.
--
-- HIGH-STAKES migration. Per the plan's G4 amendment, this requires
-- security-reviewer to pass TWICE: once on the migration + RPC, then
-- again on the parental-consent token flow + email + frontend wiring.
-- This migration covers the migration + RPC pass; the frontend +
-- consent email lands in a follow-up that triggers the second pass.
--
-- Background: Uniplug's user base is school students applying to global
-- universities — many are minors (under 18). Today nothing prevents a
-- minor from booking a paid mentorship session without parental
-- knowledge. The safeguarding constraint is "load-bearing, not a
-- footnote" (CLAUDE.md). This migration installs the data shape +
-- gates:
--
-- Columns on public.students (all NULL-permitting; existing rows are
-- grandfathered as if DOB unknown — booking gates fail-open for them
-- so the migration doesn't break the live UI, and the signup-form
-- update in the follow-up makes DOB required for NEW students):
--   date_of_birth             date
--   parental_consent_at       timestamptz
--   parental_consent_email    text   (parent's email for the consent link)
--   parental_consent_token    uuid   UNIQUE
--
-- RPCs (both SECURITY DEFINER, owned by postgres, search_path locked):
--   record_parental_consent(_token uuid)
--     - Looks up student by parental_consent_token (UNIQUE).
--     - Sets parental_consent_at = now() if not already set.
--     - Returns the student's id on success, NULL on token-not-found
--       (no exception — the consent page renders a friendly "this link
--       isn't valid" rather than a 500).
--     - Idempotent: parent clicking twice = second call no-op-returns
--       the same id.
--     - GRANT EXECUTE TO anon — the parent isn't authenticated; the
--       token IS the auth.
--
--   mark_consent_revoked(_student_id uuid)
--     - Admin-only via is_admin().
--     - NULLs out parental_consent_at + parental_consent_token (forces
--       a fresh consent flow on next attempt).
--
-- Trigger: prevent_booking_minor_no_consent (BEFORE INSERT on bookings)
--   - If the student row has date_of_birth set AND the student is < 18
--     today AND parental_consent_at IS NULL → RAISE P0001.
--   - Service-role bypass (seeds + admin operations).
--   - The book_session RPC's SECURITY DEFINER wrapping does NOT bypass
--     triggers — they fire on the row write regardless. So all booking
--     paths (today only book_session) are gated.
--
-- Out of scope for THIS migration (lands in the follow-up that requires
-- the second security-reviewer pass):
--   - Frontend signup-form DOB field + conditional parental_consent_email
--   - The /parental-consent/<token> route + form
--   - The email template + dispatch wiring for the parental consent link
--
-- Idempotent (ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE FUNCTION,
-- DROP TRIGGER IF EXISTS).
--
-- Verification: supabase/dev-seeds/g4-safeguarding-verification.sql

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS date_of_birth          date,
  ADD COLUMN IF NOT EXISTS parental_consent_at    timestamptz,
  ADD COLUMN IF NOT EXISTS parental_consent_email text,
  ADD COLUMN IF NOT EXISTS parental_consent_token uuid UNIQUE;

CREATE INDEX IF NOT EXISTS students_parental_consent_token_idx
  ON public.students (parental_consent_token)
  WHERE parental_consent_token IS NOT NULL;

-- ─── record_parental_consent: parent-clicks-link endpoint ──────────────────
CREATE OR REPLACE FUNCTION public.record_parental_consent(_token uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_student_id uuid;
BEGIN
  IF _token IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_student_id
    FROM public.students
   WHERE parental_consent_token = _token
   LIMIT 1;
  IF v_student_id IS NULL THEN
    -- Friendly fail: token unknown / revoked / typo. No exception so
    -- the consent page renders a clean "this link isn't valid" message
    -- rather than a Postgres error.
    RETURN NULL;
  END IF;

  -- Idempotent: a parent clicking the link twice doesn't re-stamp the
  -- timestamp; we only set it if it's NULL.
  UPDATE public.students
     SET parental_consent_at = COALESCE(parental_consent_at, now())
   WHERE id = v_student_id;

  RETURN v_student_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_parental_consent(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.record_parental_consent(uuid) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.record_parental_consent(uuid) IS
  'Phase G4 (2026-05-23): records parental consent given by a parent clicking the unique consent token in their email. anon-callable (the parent is not signed in). Idempotent. Returns the student id on success, NULL on token-not-found.';

-- ─── mark_consent_revoked: admin-only revoke ───────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_consent_revoked(_student_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.students
     SET parental_consent_at    = NULL,
         parental_consent_token = NULL
   WHERE id = _student_id;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_consent_revoked(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_consent_revoked(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.mark_consent_revoked(uuid) TO authenticated;

COMMENT ON FUNCTION public.mark_consent_revoked(uuid) IS
  'Phase G4 (2026-05-23): admin-only — NULL out parental_consent_at and parental_consent_token to force a fresh consent flow on the next booking attempt. Calls is_admin() at entry.';

-- ─── Trigger: prevent_booking_minor_no_consent ─────────────────────────────
CREATE OR REPLACE FUNCTION public.prevent_booking_minor_no_consent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_dob              date;
  v_consent_at       timestamptz;
  v_eighteen_ago_ist date := ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata') - interval '18 years')::date;
BEGIN
  -- Service-role bypass (seeds, admin operations).
  IF coalesce(auth.jwt() ->> 'role', '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  SELECT date_of_birth, parental_consent_at
    INTO v_dob, v_consent_at
    FROM public.students
   WHERE id = NEW.student_id;

  -- Grandfather: students with no DOB on file slip through. The
  -- signup-form change in the follow-up makes DOB required for NEW
  -- accounts; existing accounts get prompted to complete their profile
  -- before booking (a separate UI gate). Without grandfathering the
  -- migration would break booking for every existing student.
  IF v_dob IS NULL THEN
    RETURN NEW;
  END IF;

  -- Under 18 (the date_of_birth must be strictly newer than 18-years-
  -- ago for the student to be under 18, i.e. the student is under 18
  -- iff dob > today - 18y).
  IF v_dob > v_eighteen_ago_ist AND v_consent_at IS NULL THEN
    RAISE EXCEPTION 'parental consent required for under-18 student'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bookings_minor_consent_gate ON public.bookings;
CREATE TRIGGER bookings_minor_consent_gate
  BEFORE INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_booking_minor_no_consent();

COMMENT ON FUNCTION public.prevent_booking_minor_no_consent() IS
  'Phase G4 (2026-05-23): BEFORE INSERT on public.bookings. Blocks booking attempts by students under 18 (IST) who do not yet have parental consent on file. Service-role bypass. Grandfathers existing students whose date_of_birth is NULL (the follow-up signup-form change makes DOB required for new accounts).';
