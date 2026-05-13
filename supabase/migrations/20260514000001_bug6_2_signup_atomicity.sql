-- Bug 6.2: Signup race-condition fix — atomic profile creation via trigger.
--
-- Before this migration, signup was two sequential client-side mutations:
--   (1) supabase.auth.signUp creates the auth.users row
--   (2) a client INSERT into public.students / public.mentors creates the profile
-- If (2) failed, the auth.users row from (1) was orphaned — the email was
-- permanently taken and only an admin could recover the account.
--
-- This migration makes profile creation atomic with auth user creation by
-- moving (2) into an AFTER INSERT trigger on auth.users. Because the trigger
-- runs in the same transaction as the auth.users INSERT, any error inside the
-- trigger rolls back the auth.users INSERT as well — orphans cannot occur.
--
-- Required metadata on auth.signUp (passed via options.data on the client):
--   role:        'student' | 'mentor'                (both)
--   full_name:   text                                (both)
--   phone, school, grade: text                       (student)
--   university, course, year: text                   (mentor)
--   countries:   text[]                              (both, optional — defaults to {})
--
-- Email comes from NEW.email (the top-level email arg of auth.signUp); the
-- metadata 'email' key is read as a fallback only.
--
-- Verification: see supabase/dev-seeds/bug6_2-signup-atomicity-verification.sql
-- for runnable rejection and happy-path tests.

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
BEGIN
  -- 1. Role: required and must be one of the supported values.
  v_role := NULLIF(trim(NEW.raw_user_meta_data ->> 'role'), '');
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Account type is required. Please use the student or mentor signup page.'
      USING ERRCODE = 'P0001';
  END IF;
  IF v_role NOT IN ('student', 'mentor') THEN
    RAISE EXCEPTION 'Unsupported account type. Please contact support.'
      USING ERRCODE = 'P0001';
  END IF;

  -- 2. Common required fields.
  v_full_name := NULLIF(trim(NEW.raw_user_meta_data ->> 'full_name'), '');
  IF v_full_name IS NULL THEN
    RAISE EXCEPTION 'Full name is required. Please complete the signup form and try again.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Email: prefer metadata 'email', fall back to NEW.email (the auth user's own email).
  v_email := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data ->> 'email'), ''),
    NULLIF(trim(NEW.email), '')
  );
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'Email is required to create your account.'
      USING ERRCODE = 'P0001';
  END IF;

  -- 3. Countries: best-effort. Default to empty array if missing or wrong shape.
  IF NEW.raw_user_meta_data ? 'countries'
     AND jsonb_typeof(NEW.raw_user_meta_data -> 'countries') = 'array'
  THEN
    v_countries := ARRAY(
      SELECT jsonb_array_elements_text(NEW.raw_user_meta_data -> 'countries')
    );
  ELSE
    v_countries := ARRAY[]::text[];
  END IF;

  -- 4. Role-specific required fields + insert.
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

    INSERT INTO public.students (id, full_name, email, phone, school, grade, countries)
    VALUES (NEW.id, v_full_name, v_email, v_phone, v_school, v_grade, v_countries);

  ELSE
    -- v_role = 'mentor' (NOT IN guard above ensures this is the only remaining case)
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

    -- status omitted on purpose — column default ('pending') applies.
    INSERT INTO public.mentors (id, full_name, email, university, course, year, countries)
    VALUES (NEW.id, v_full_name, v_email, v_university, v_course, v_year, v_countries);
  END IF;

  RETURN NEW;
END;
$$;

-- Function permissions: Supabase default GRANTs on new public functions include
-- anon; revoke explicitly. The trigger context invokes the function, so direct
-- EXECUTE is not required by callers — we mirror the convention used by
-- public.create_booking_notification for consistency.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticated, service_role;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

COMMENT ON FUNCTION public.handle_new_user() IS
  'AFTER INSERT trigger on auth.users. Reads raw_user_meta_data and inserts into public.students or public.mentors based on the "role" key. Runs in the same transaction as the auth.users INSERT, so a failure here rolls back the auth user — preventing orphaned auth accounts. Required metadata: role (student|mentor), full_name; student additionally needs phone/school/grade, mentor additionally needs university/course/year. Countries are best-effort and default to {}.';
