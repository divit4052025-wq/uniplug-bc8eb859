-- 2026-06-21 — Code of Conduct acceptance (student-signup v2)
-- ADDITIVE + LOCAL-ONLY. Two changes, both backward compatible:
--   1. Widen legal_acceptances.doc_type CHECK to allow 'code_of_conduct'.
--   2. CREATE OR REPLACE handle_new_user to record a 'code_of_conduct' row from a
--      new optional `code_of_conduct_version` signup-metadata key (mirrors the
--      existing terms/privacy capture, role-agnostic). Absent key → no row, so
--      every existing client keeps working unchanged.
-- The function body below is reproduced verbatim from 20260603000005_p2_mentor_schema.sql
-- (the live definition) with ONLY the three CoC additions marked "-- CoC:". The
-- on_auth_user_created trigger is NOT recreated (CREATE OR REPLACE updates in place).
-- NOTE: HOSTED Supabase is FROZEN — apply locally only. Hand-edit types.ts if a
-- generated type shifts (doc_type is already typed `string`, so likely no change).

-- ── 1. Widen the doc_type CHECK (recreate the named constraint) ──────────────
ALTER TABLE public.legal_acceptances DROP CONSTRAINT IF EXISTS legal_acceptances_doc_type_check;
ALTER TABLE public.legal_acceptances
  ADD CONSTRAINT legal_acceptances_doc_type_check
  CHECK (doc_type IN ('terms', 'privacy', 'mentor_agreement', 'code_of_conduct'));

-- ── 2. handle_new_user: also capture code_of_conduct_version ─────────────────
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
  v_board        text;
  v_bio          text;
  v_terms_ver            text;
  v_privacy_ver          text;
  v_coc_ver              text;   -- CoC: new optional code-of-conduct version
  v_mentor_agreement_ver text;
  -- Phase 2 mentor locals
  v_phone_m         text;
  v_college_email   text;
  v_specialty_key   text;
  v_specialty_id    uuid;
  v_ref_university_id uuid;
  v_ref_course_id   uuid;
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

  -- Optional legal-acceptance versions (both roles), recorded after the row insert.
  v_terms_ver   := NULLIF(trim(NEW.raw_user_meta_data ->> 'terms_version'), '');
  v_privacy_ver := NULLIF(trim(NEW.raw_user_meta_data ->> 'privacy_version'), '');
  v_coc_ver     := NULLIF(trim(NEW.raw_user_meta_data ->> 'code_of_conduct_version'), '');  -- CoC

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

    -- Phase 1: optional profile fields (no guard — NULL flows through).
    v_board := NULLIF(trim(NEW.raw_user_meta_data ->> 'board'), '');
    v_bio   := NULLIF(trim(NEW.raw_user_meta_data ->> 'bio'),   '');

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
      date_of_birth, parental_consent_email, parent_phone, parental_consent_token,
      board, bio
    )
    VALUES (
      NEW.id, v_full_name, v_email, v_phone, v_school, v_grade, v_countries,
      v_dob, v_parent_email, v_parent_phone, v_token,
      v_board, v_bio
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

    -- Phase 2: optional mentor profile fields (no guard — NULL flows through,
    -- so existing clients that send only university/course/year still succeed).
    v_phone_m       := NULLIF(trim(NEW.raw_user_meta_data ->> 'phone'), '');
    v_college_email := NULLIF(trim(NEW.raw_user_meta_data ->> 'college_email'), '');
    v_bio           := NULLIF(trim(NEW.raw_user_meta_data ->> 'bio'), '');

    v_specialty_key := NULLIF(trim(NEW.raw_user_meta_data ->> 'specialty'), '');
    IF v_specialty_key IS NOT NULL THEN
      SELECT id INTO v_specialty_id FROM public.ref_specialties WHERE key = v_specialty_key;
    END IF;

    v_dob_raw := NULLIF(trim(NEW.raw_user_meta_data ->> 'date_of_birth'), '');
    IF v_dob_raw IS NOT NULL THEN
      BEGIN
        v_dob := v_dob_raw::date;
      EXCEPTION WHEN OTHERS THEN
        v_dob := NULL;
      END;
    END IF;

    -- Canonical enrolment links: accept a resolved ref id, but never let a bad /
    -- stale id break signup (malformed → NULL; non-existent → NULL).
    BEGIN
      v_ref_university_id := NULLIF(NEW.raw_user_meta_data ->> 'university_id', '')::uuid;
    EXCEPTION WHEN OTHERS THEN
      v_ref_university_id := NULL;
    END;
    IF v_ref_university_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.ref_universities WHERE id = v_ref_university_id) THEN
      v_ref_university_id := NULL;
    END IF;

    BEGIN
      v_ref_course_id := NULLIF(NEW.raw_user_meta_data ->> 'course_id', '')::uuid;
    EXCEPTION WHEN OTHERS THEN
      v_ref_course_id := NULL;
    END;
    IF v_ref_course_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.ref_courses WHERE id = v_ref_course_id) THEN
      v_ref_course_id := NULL;
    END IF;

    INSERT INTO public.mentors (
      id, full_name, email, university, course, year, countries,
      phone, college_email, bio, date_of_birth, specialty_id, ref_university_id, ref_course_id
    )
    VALUES (
      NEW.id, v_full_name, v_email, v_university, v_course, v_year, v_countries,
      v_phone_m, v_college_email, v_bio, v_dob, v_specialty_id, v_ref_university_id, v_ref_course_id
    );
  END IF;

  -- Phase 1: append-only legal acceptances captured at signup (optional keys —
  -- absent → no rows). SECURITY DEFINER bypasses RLS.
  IF v_terms_ver IS NOT NULL THEN
    INSERT INTO public.legal_acceptances (user_id, doc_type, version)
    VALUES (NEW.id, 'terms', v_terms_ver);
  END IF;
  IF v_privacy_ver IS NOT NULL THEN
    INSERT INTO public.legal_acceptances (user_id, doc_type, version)
    VALUES (NEW.id, 'privacy', v_privacy_ver);
  END IF;
  IF v_coc_ver IS NOT NULL THEN  -- CoC: role-agnostic, mirrors terms/privacy
    INSERT INTO public.legal_acceptances (user_id, doc_type, version)
    VALUES (NEW.id, 'code_of_conduct', v_coc_ver);
  END IF;
  IF v_role = 'mentor' THEN
    v_mentor_agreement_ver := NULLIF(trim(NEW.raw_user_meta_data ->> 'mentor_agreement_version'), '');
    IF v_mentor_agreement_ver IS NOT NULL THEN
      INSERT INTO public.legal_acceptances (user_id, doc_type, version)
      VALUES (NEW.id, 'mentor_agreement', v_mentor_agreement_ver);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL    ON FUNCTION public.handle_new_user() FROM public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
GRANT  EXECUTE ON FUNCTION public.handle_new_user() TO authenticated, service_role;

COMMENT ON FUNCTION public.handle_new_user() IS
  'Student-signup v2 (2026-06-21): unchanged from Phase 2 except it now also records a code_of_conduct acceptance into legal_acceptances when a code_of_conduct_version metadata key is present (role-agnostic, mirrors terms/privacy). Backward compatible; absent key → no row. Trigger not recreated.';
