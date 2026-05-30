-- Phase G4-follow-up Stage 2: signup capture + initial consent-email plumbing
-- + single-source-of-truth consent-required helper.
--
-- HIGH-STAKES / child-safety. Builds on 20260530000001 (gate + immutable audit
-- + RPCs). This migration:
--   0. extracts the consent-required rule into ONE helper, requires_consent_base
--      (so the booking gate, signup token-mint, email trigger, and future
--      messaging/video gates all share one definition);
--   1. refactors the booking gate to call the helper (behaviour-preserving:
--      fail-closed kept by wrapping `requires_consent_base(dob,grade) OR dob IS NULL`);
--   2. extends handle_new_user to read date_of_birth / parent_email / parent_phone
--      from signup metadata, persist them, and mint parental_consent_token for a
--      consent-required student (helper as-is: NULL DOB → false → no token);
--   3. adds an AFTER INSERT trigger on students that fires the initial parent
--      verification email once (consent-required + parent_email + no consent),
--      non-fatally, via notify_event_email('parental_consent_request').
--
-- ── EXACT SIGNUP METADATA KEYS (the Stage 3 form MUST send these) ──────────
--   role, full_name, email, phone, school, grade, countries[]   (existing)
--   date_of_birth : text ISO 'YYYY-MM-DD'   (NEW — student)
--   parent_email  : text                     (NEW — form-required only when consent-required)
--   parent_phone  : text                     (NEW — same)
--
-- ── Consent-required rule (the helper) ─────────────────────────────────────
--   requires_consent_base(dob, grade) :=
--     (dob IS NOT NULL AND dob > (now_IST - 18y)) OR grade IN (9,10,11)
--   Booking gate = requires_consent_base(dob,grade) OR (dob IS NULL)  ← fail-closed.
--   Signup token-mint + email trigger = requires_consent_base(dob,grade) as-is
--     (a NULL-DOB signup has no parent_email anyway; the gate still blocks them).
--
-- DOB is NOT required at the DB layer (read-if-present): missing/malformed → NULL
-- (defensively parsed, never a 500) → booking gate fails closed. Stage-3 form
-- enforces DOB as required. Email-fire is NON-FATAL to signup (guarded + WARNING).
-- LEGAL COPY: none here (Stage 3, TODO-LEGAL).
--
-- Idempotent: CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS + CREATE.
-- Verification: supabase/dev-seeds/parental-consent-signup-verification.sql

-- ─── 0. Single-source-of-truth consent-required helper ─────────────────────
-- Pure computation (no table access) → SECURITY INVOKER (default), STABLE
-- (reads CURRENT_TIMESTAMP). Internal helper: revoked from the public API so
-- it adds no PostgREST/SECURITY-DEFINER surface. The SECURITY DEFINER callers
-- own-execute it as postgres regardless of this REVOKE.
CREATE OR REPLACE FUNCTION public.requires_consent_base(_dob date, _grade text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT (_dob IS NOT NULL
          AND _dob > ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata') - interval '18 years')::date)
         OR (_grade IN ('Grade 9', 'Grade 10', 'Grade 11'));
$$;
REVOKE ALL ON FUNCTION public.requires_consent_base(date, text) FROM PUBLIC;

COMMENT ON FUNCTION public.requires_consent_base(date, text) IS
  'Phase G4-follow-up Stage 2 (2026-05-30): single source of truth for "is this student consent-required" — (DOB present AND under-18 in IST) OR grade IN (9,10,11). Shared by the booking gate (wrapped OR dob IS NULL for fail-closed), handle_new_user token-mint, the consent-email trigger, and future messaging/video gates. Pure/STABLE; internal (revoked from PUBLIC).';

-- ─── 1. Booking gate now calls the helper (behaviour-preserving) ───────────
-- Identical truth table to 20260530000001: block when
-- (requires_consent_base OR dob IS NULL) AND no consent. Trigger already
-- attached in ...0001; only the function body changes.
CREATE OR REPLACE FUNCTION public.prevent_booking_minor_no_consent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_dob        date;
  v_consent_at timestamptz;
  v_grade      text;
BEGIN
  -- Service-role bypass (seeds, admin operations).
  IF coalesce(auth.jwt() ->> 'role', '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  SELECT date_of_birth, parental_consent_at, grade
    INTO v_dob, v_consent_at, v_grade
    FROM public.students
   WHERE id = NEW.student_id;

  -- Fail-closed: the shared rule, OR unknown age (NULL DOB).
  IF (public.requires_consent_base(v_dob, v_grade) OR v_dob IS NULL)
     AND v_consent_at IS NULL
  THEN
    RAISE EXCEPTION 'parental consent required for student'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.prevent_booking_minor_no_consent() IS
  'Phase G4-follow-up (2026-05-30): BEFORE INSERT on bookings. Blocks when (requires_consent_base(dob,grade) OR dob IS NULL) AND parental_consent_at IS NULL. Fail-closed on unknown age. Service-role bypass. Consent rule centralised in requires_consent_base().';

-- ─── 2. handle_new_user: capture DOB + parent fields, mint token ───────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role        text;
  v_full_name   text;
  v_email       text;
  v_phone       text;
  v_school      text;
  v_grade       text;
  v_university  text;
  v_course      text;
  v_year        text;
  v_countries   text[];
  v_dob_raw      text;
  v_dob          date;
  v_parent_email text;
  v_parent_phone text;
  v_needs_consent boolean;
  v_token        uuid;
BEGIN
  v_role := NULLIF(trim(NEW.raw_user_meta_data ->> 'role'), '');
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Account type is required. Please use the student or mentor signup page.'
      USING ERRCODE = 'P0001';
  END IF;
  IF v_role NOT IN ('student', 'mentor') THEN
    RAISE EXCEPTION 'Unsupported account type. Please contact support.'
      USING ERRCODE = 'P0001';
  END IF;

  v_full_name := NULLIF(trim(NEW.raw_user_meta_data ->> 'full_name'), '');
  IF v_full_name IS NULL THEN
    RAISE EXCEPTION 'Full name is required. Please complete the signup form and try again.'
      USING ERRCODE = 'P0001';
  END IF;

  v_email := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data ->> 'email'), ''),
    NULLIF(trim(NEW.email), '')
  );
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'Email is required to create your account.'
      USING ERRCODE = 'P0001';
  END IF;

  IF NEW.raw_user_meta_data ? 'countries'
     AND jsonb_typeof(NEW.raw_user_meta_data -> 'countries') = 'array'
  THEN
    v_countries := ARRAY(
      SELECT jsonb_array_elements_text(NEW.raw_user_meta_data -> 'countries')
    );
  ELSE
    v_countries := ARRAY[]::text[];
  END IF;

  IF v_role = 'student' THEN
    v_phone  := NULLIF(trim(NEW.raw_user_meta_data ->> 'phone'),  '');
    v_school := NULLIF(trim(NEW.raw_user_meta_data ->> 'school'), '');
    v_grade  := NULLIF(trim(NEW.raw_user_meta_data ->> 'grade'),  '');

    IF v_phone IS NULL THEN
      RAISE EXCEPTION 'Phone number is required to create your student account.'
        USING ERRCODE = 'P0001';
    END IF;
    IF v_school IS NULL THEN
      RAISE EXCEPTION 'School is required to create your student account.'
        USING ERRCODE = 'P0001';
    END IF;
    IF v_grade IS NULL THEN
      RAISE EXCEPTION 'Grade is required to create your student account.'
        USING ERRCODE = 'P0001';
    END IF;

    -- DOB: read-if-present, defensively parsed (bad/missing → NULL).
    v_dob_raw := NULLIF(trim(NEW.raw_user_meta_data ->> 'date_of_birth'), '');
    IF v_dob_raw IS NOT NULL THEN
      BEGIN
        v_dob := v_dob_raw::date;
      EXCEPTION WHEN OTHERS THEN
        v_dob := NULL;
      END;
    END IF;
    v_parent_email := NULLIF(trim(NEW.raw_user_meta_data ->> 'parent_email'), '');
    v_parent_phone := NULLIF(trim(NEW.raw_user_meta_data ->> 'parent_phone'), '');

    -- Shared rule (NULL DOB → false → adult path: no token/parent fields).
    v_needs_consent := public.requires_consent_base(v_dob, v_grade);
    IF v_needs_consent THEN
      v_token := gen_random_uuid();
    ELSE
      v_token        := NULL;
      v_parent_email := NULL;
      v_parent_phone := NULL;
    END IF;

    INSERT INTO public.students (
      id, full_name, email, phone, school, grade, countries,
      date_of_birth, parental_consent_email, parent_phone, parental_consent_token
    )
    VALUES (
      NEW.id, v_full_name, v_email, v_phone, v_school, v_grade, v_countries,
      v_dob, v_parent_email, v_parent_phone, v_token
    );

  ELSE
    v_university := NULLIF(trim(NEW.raw_user_meta_data ->> 'university'), '');
    v_course     := NULLIF(trim(NEW.raw_user_meta_data ->> 'course'),     '');
    v_year       := NULLIF(trim(NEW.raw_user_meta_data ->> 'year'),       '');

    IF v_university IS NULL THEN
      RAISE EXCEPTION 'University is required to create your mentor account.'
        USING ERRCODE = 'P0001';
    END IF;
    IF v_course IS NULL THEN
      RAISE EXCEPTION 'Course is required to create your mentor account.'
        USING ERRCODE = 'P0001';
    END IF;
    IF v_year IS NULL THEN
      RAISE EXCEPTION 'Year of study is required to create your mentor account.'
        USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO public.mentors (id, full_name, email, university, course, year, countries)
    VALUES (NEW.id, v_full_name, v_email, v_university, v_course, v_year, v_countries);
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticated, service_role;

COMMENT ON FUNCTION public.handle_new_user() IS
  'AFTER INSERT trigger on auth.users. Inserts public.students/mentors from raw_user_meta_data. Phase G4-follow-up Stage 2 (2026-05-30): for students, reads date_of_birth (defensive parse, NULL on bad/missing) / parent_email / parent_phone; mints parental_consent_token when requires_consent_base(dob,grade); adults get neither. Metadata keys: date_of_birth (YYYY-MM-DD), parent_email, parent_phone.';

-- ─── 3. Initial parent email — AFTER INSERT on students, exactly once ──────
CREATE OR REPLACE FUNCTION public.tg_request_parental_consent_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.requires_consent_base(NEW.date_of_birth, NEW.grade)
     AND NEW.parental_consent_email IS NOT NULL
     AND NEW.parental_consent_at IS NULL
  THEN
    BEGIN
      PERFORM public.notify_event_email(jsonb_build_object(
        'type', 'parental_consent_request',
        'student_id', NEW.id
      ));
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[parental-consent] failed to enqueue consent email for student %: %', NEW.id, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS students_request_parental_consent_email ON public.students;
CREATE TRIGGER students_request_parental_consent_email
  AFTER INSERT ON public.students
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_request_parental_consent_email();

COMMENT ON FUNCTION public.tg_request_parental_consent_email() IS
  'Phase G4-follow-up Stage 2 (2026-05-30): AFTER INSERT on students. Fires the initial parental-consent email once via notify_event_email(parental_consent_request) when requires_consent_base(dob,grade) AND parent_email present AND no consent yet. Non-fatal: a notify failure logs a WARNING, signup still succeeds.';
