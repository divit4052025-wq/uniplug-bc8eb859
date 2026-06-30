-- ============================================================================
-- A2 — Server-side mentor 18+ gate (additive, reversible, LOCAL-only).
-- ============================================================================
-- UniPlug mentors serve MINORS, so an under-18 (or DOB-null) mentor must never
-- become bookable. "Bookable" requires status='approved', so the authoritative
-- chokepoint is a BEFORE INSERT OR UPDATE trigger on public.mentors that blocks
-- the transition INTO 'approved' for any row that is not a verified adult —
-- independent of which path performs it (approve_mentor / admin_set_mentor_status
-- / a raw service write). Two defense-in-depth layers sit in front of it:
-- handle_new_user rejects an under-18/DOB-null mentor at signup, and
-- submit/resubmit refuse the application. The trigger remains the real gate.
--
-- Helper: mentor_is_adult(_dob) — IMMUTABLE, NULL dob -> false (a missing DOB is
-- treated as NOT an adult, so DOB-null approvals are rejected). 18y measured in
-- Asia/Kolkata (India-only platform).
--
-- The trigger raises ONLY on the transition to approved (INSERT-as-approved, or an
-- UPDATE that moves status into approved). Re-saving an already-approved mentor's
-- other fields (status unchanged) does NOT re-bite, and existing approved rows are
-- never retroactively touched. Creating a 'pending' mentor passes (status<>approved).
--
-- Residual risk: DOB is self-asserted at signup — the admin ID-document review must
-- cross-check it (process control, owner-owned). This SQL closes the automated path.
--
-- Reconstructed effective final state before editing (chronologically-last bodies):
--   • handle_new_user            -> 20260630000001_a1_consent_parent_not_self.sql:159-389 (A1)
--   • submit_mentor_application  -> 20260606000003_p2_mentor_email_gate.sql:174-206
--   • resubmit_mentor_application-> 20260606000003_p2_mentor_email_gate.sql:211-251
-- Each is its verbatim current body with ONLY the marked A2 age guard added; every
-- other path (A1's consent stamp, the enhanced-tier enrollment-proof gate, etc.) is
-- preserved.
-- ============================================================================

-- ── 1. age helper ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mentor_is_adult(_dob date)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT _dob IS NOT NULL
     AND _dob <= ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata') - interval '18 years')::date;
$$;
-- Server-internal only (trigger + DEFINER functions); never client-callable.
REVOKE ALL     ON FUNCTION public.mentor_is_adult(date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mentor_is_adult(date) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.mentor_is_adult(date) TO service_role;
COMMENT ON FUNCTION public.mentor_is_adult(date) IS
  'A2 (2026-06-30): true iff _dob is non-null AND indicates age >= 18 in Asia/Kolkata. NULL DOB -> false (DOB-null is treated as not-an-adult). IMMUTABLE; server-internal (anon/authenticated/PUBLIC revoked).';

-- ── 2. authoritative trigger: no under-18/DOB-null reaches approved ──────────
CREATE OR REPLACE FUNCTION public.enforce_mentor_adult_on_approve()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'approved'
     AND (TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status)
     AND NOT public.mentor_is_adult(NEW.date_of_birth) THEN
    RAISE EXCEPTION 'mentor_must_be_18_plus'
      USING ERRCODE = 'check_violation',
            DETAIL = 'A mentor cannot be approved without a verified DOB indicating age >= 18.';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS mentors_require_adult_on_approve ON public.mentors;
CREATE TRIGGER mentors_require_adult_on_approve
  BEFORE INSERT OR UPDATE OF status, date_of_birth ON public.mentors
  FOR EACH ROW EXECUTE FUNCTION public.enforce_mentor_adult_on_approve();

COMMENT ON FUNCTION public.enforce_mentor_adult_on_approve() IS
  'A2 (2026-06-30): BEFORE INSERT OR UPDATE OF status,date_of_birth on public.mentors. Raises mentor_must_be_18_plus (check_violation) when a row transitions INTO status=approved without a verified adult DOB. Authoritative gate independent of approve_mentor/admin_set_mentor_status/raw writes. Does not re-bite status-unchanged saves or retroactively touch existing approved rows.';

-- ── 3. defense-in-depth: reject under-18/DOB-null at mentor signup ───────────
--    Verbatim A1 body (20260630000001:159-389) with ONLY the A2 creation guard
--    added in the mentor branch immediately before the mentors INSERT. Every A1
--    addition (parental_consent_token_issued_at stamp) and all student/legal logic
--    is preserved unchanged.
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
  v_token_issued_at timestamptz;   -- A1: mint time for the consent-token TTL
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
      v_token_issued_at := now();   -- A1: stamp the mint time for the TTL
    ELSE
      v_token        := NULL;
      v_parent_email := NULL;
      v_parent_phone := NULL;
    END IF;

    INSERT INTO public.students (
      id, full_name, email, phone, school, grade, countries,
      date_of_birth, parental_consent_email, parent_phone, parental_consent_token,
      parental_consent_token_issued_at,
      board, bio
    )
    VALUES (
      NEW.id, v_full_name, v_email, v_phone, v_school, v_grade, v_countries,
      v_dob, v_parent_email, v_parent_phone, v_token,
      v_token_issued_at,
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

    -- [A2 guard] reject an under-18 / DOB-null mentor at signup (defense-in-depth;
    -- the mentors_require_adult_on_approve trigger remains the authoritative gate).
    IF v_dob IS NULL OR NOT public.mentor_is_adult(v_dob) THEN
      RAISE EXCEPTION 'mentor_must_be_18_plus'
        USING ERRCODE = 'check_violation';
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
  'Signup handler (A2 2026-06-30 over the A1 2026-06-30 consent build): unchanged except the mentor branch now rejects an under-18/DOB-null mentor at signup (mentor_must_be_18_plus) before the mentors INSERT — defense-in-depth in front of the authoritative mentors_require_adult_on_approve trigger. All A1 student/consent logic (parental_consent_token_issued_at stamp) is preserved.';

-- ── 4. defense-in-depth: reject under-18/DOB-null on application submit/resubmit ─
--    Verbatim p2 bodies (20260606000003) with ONLY the A2 age guard + the
--    date_of_birth read added; the enhanced-tier enrollment-proof gate is preserved.
CREATE OR REPLACE FUNCTION public.submit_mentor_application()
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_id_doc text;
  v_tier   public.mentor_tier;
  v_enroll text;
  v_dob    date;   -- A2: age guard
  v_ts     timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  SELECT id_document_path, tier, enrollment_letter_path, date_of_birth
    INTO v_id_doc, v_tier, v_enroll, v_dob
  FROM public.mentors WHERE id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no mentor profile for the current user' USING ERRCODE = 'P0001';
  END IF;
  -- A2: an under-18 / DOB-null mentor cannot submit (the trigger blocks approval
  -- regardless; this fails fast at the application step).
  IF v_dob IS NULL OR NOT public.mentor_is_adult(v_dob) THEN
    RAISE EXCEPTION 'mentor_must_be_18_plus' USING ERRCODE = 'check_violation';
  END IF;
  IF v_id_doc IS NULL THEN
    RAISE EXCEPTION 'upload your college ID before submitting your application' USING ERRCODE = 'P0001';
  END IF;
  IF v_tier = 'enhanced'::public.mentor_tier AND coalesce(length(btrim(v_enroll)), 0) = 0 THEN
    RAISE EXCEPTION 'upload your enrollment proof before submitting (enhanced review)' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.mentors SET application_submitted_at = now()
  WHERE id = v_uid RETURNING application_submitted_at INTO v_ts;
  RETURN v_ts;
END;
$$;
REVOKE ALL     ON FUNCTION public.submit_mentor_application() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.submit_mentor_application() FROM anon;
GRANT  EXECUTE ON FUNCTION public.submit_mentor_application() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.resubmit_mentor_application()
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_status public.mentor_status;
  v_id_doc text;
  v_tier   public.mentor_tier;
  v_enroll text;
  v_dob    date;   -- A2: age guard
  v_ts     timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  SELECT status, id_document_path, tier, enrollment_letter_path, date_of_birth
    INTO v_status, v_id_doc, v_tier, v_enroll, v_dob
  FROM public.mentors WHERE id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no mentor profile for the current user' USING ERRCODE = 'P0001';
  END IF;
  IF v_status <> 'rejected'::public.mentor_status THEN
    RAISE EXCEPTION 'only a rejected application can be resubmitted (current status: %)', v_status USING ERRCODE = 'P0001';
  END IF;
  -- A2: an under-18 / DOB-null mentor cannot resubmit.
  IF v_dob IS NULL OR NOT public.mentor_is_adult(v_dob) THEN
    RAISE EXCEPTION 'mentor_must_be_18_plus' USING ERRCODE = 'check_violation';
  END IF;
  IF v_id_doc IS NULL THEN
    RAISE EXCEPTION 'upload your college ID before resubmitting' USING ERRCODE = 'P0001';
  END IF;
  IF v_tier = 'enhanced'::public.mentor_tier AND coalesce(length(btrim(v_enroll)), 0) = 0 THEN
    RAISE EXCEPTION 'upload your enrollment proof before resubmitting (enhanced review)' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.mentors
  SET status = 'pending'::public.mentor_status,
      verification_notes = NULL,
      application_submitted_at = now()
  WHERE id = v_uid AND status = 'rejected'::public.mentor_status
  RETURNING application_submitted_at INTO v_ts;
  RETURN v_ts;
END;
$$;
REVOKE ALL     ON FUNCTION public.resubmit_mentor_application() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.resubmit_mentor_application() FROM anon;
GRANT  EXECUTE ON FUNCTION public.resubmit_mentor_application() TO authenticated, service_role;
