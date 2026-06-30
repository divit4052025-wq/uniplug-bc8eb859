-- ============================================================================
-- A1 — Server-side parental-consent integrity (additive, reversible, LOCAL-only).
-- ============================================================================
-- Closes two child-safety holes that a React/form check cannot enforce:
--   (1) A minor entering their OWN email/phone as the "parent" contact — at
--       signup (handle_new_user INSERT) AND via a later self-UPDATE. Closed by a
--       BEFORE INSERT OR UPDATE trigger on public.students (parent != self), plus
--       removing parental_consent_email / parent_phone from the authenticated
--       UPDATE allowlist (the consent destination becomes non-student-mutable).
--   (2) Consent self-approval / replay where the token's parent_email equals the
--       student's own email, or where the token is stale. Closed by two guards in
--       record_parental_consent (defense-in-depth alongside the trigger) + a 30-day
--       token TTL. The mint time is recorded in a new column
--       parental_consent_token_issued_at, set at signup, on resend, and backfilled
--       for outstanding tokens from created_at so live parent links keep working.
--
-- Reconstructed effective final state before editing (chronologically-last bodies):
--   • record_parental_consent  -> 20260604000060_consent_column_lock.sql:63-109
--   • handle_new_user          -> 20260621000000_coc_legal_acceptance.sql:21-247
--   • request_parental_consent -> 20260530000001_parental_consent_system.sql:146-176
--   • authenticated UPDATE allowlist -> 20260604000060_consent_column_lock.sql:40-44
-- Each function below is its verbatim current body with ONLY the marked A1 lines
-- added; every other path (adults, mentors, audit rows, the column lock) is
-- preserved. The trigger fires during the legitimate signup INSERT too — adults
-- (parental_consent_email NULL) and distinct-parent minors pass; only self-routed
-- rows are rejected.
--
-- Residual risk (an alias inbox / a second SIM the minor also controls) is NOT
-- closeable in SQL — it needs a KYC/identity vendor and is owner-owned.
-- ============================================================================

-- ── 0. Mint-time column for the consent token (drives the TTL) ───────────────
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS parental_consent_token_issued_at timestamptz;
-- Backfill outstanding tokens so existing live parent links keep working.
UPDATE public.students
   SET parental_consent_token_issued_at = COALESCE(parental_consent_token_issued_at, created_at)
 WHERE parental_consent_token IS NOT NULL;

-- ── 1. parent != self — enforced for the signup INSERT AND any later UPDATE ──
CREATE OR REPLACE FUNCTION public.enforce_parent_not_self()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $$
BEGIN
  -- Only bites when a parent EMAIL is actually supplied (adults: NULL -> skip).
  IF NEW.parental_consent_email IS NOT NULL
     AND lower(btrim(NEW.parental_consent_email)) = lower(btrim(NEW.email)) THEN
    RAISE EXCEPTION 'parent_email_must_differ_from_student'
      USING ERRCODE = 'check_violation';
  END IF;
  -- Phone arm: only when BOTH digit-strings are non-empty.
  IF NEW.parent_phone IS NOT NULL AND NEW.phone IS NOT NULL
     AND regexp_replace(NEW.parent_phone, '\D', '', 'g') <> ''
     AND regexp_replace(NEW.parent_phone, '\D', '', 'g') = regexp_replace(NEW.phone, '\D', '', 'g') THEN
    RAISE EXCEPTION 'parent_phone_must_differ_from_student'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS students_parent_not_self ON public.students;
CREATE TRIGGER students_parent_not_self
  BEFORE INSERT OR UPDATE OF parental_consent_email, parent_phone, email, phone
  ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.enforce_parent_not_self();

COMMENT ON FUNCTION public.enforce_parent_not_self() IS
  'A1 (2026-06-30): rejects a students row whose parental_consent_email == own email (case-insensitive) or whose parent_phone == own phone (digits-only). Fires on the signup INSERT (via handle_new_user) and on any UPDATE touching those columns. Adults (consent_email NULL) pass.';

-- ── 2. Make the consent destination NON-student-mutable ─────────────────────
-- Re-scope the authenticated UPDATE allowlist (20260604000060:40-44) to drop
-- parental_consent_email + parent_phone. Every OTHER granted column is preserved
-- verbatim (cross-checked against profileEdit.ts: full_name/phone/school/
-- countries/board/bio/photo_url all remain editable). The new TTL column is
-- deliberately NOT granted — only the DEFINER consent functions write it.
REVOKE UPDATE ON public.students FROM authenticated, anon;
GRANT UPDATE (
  id, full_name, email, phone, school, grade, countries, created_at,
  first_session_used, code_of_conduct_accepted_at, date_of_birth,
  board, bio, photo_url
) ON public.students TO authenticated;
-- anon never legitimately UPDATEs students (RLS blocked it) — no UPDATE re-granted.

-- ── 3. record_parental_consent: + self-routed guard + 30-day TTL ────────────
--    Verbatim body from 20260604000060:63-109 with ONLY the two [A1 guard]
--    blocks and the two extra SELECT targets (v_self_email, v_token_issued_at)
--    added. The same-logged-in-student guard and the COALESCE stamp are kept.
CREATE OR REPLACE FUNCTION public.record_parental_consent(_token uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_student_id   uuid;
  v_already      timestamptz;
  v_parent_email text;
  v_self_email      text;        -- A1: the student's own email (for the self-routed guard)
  v_token_issued_at timestamptz; -- A1: mint time (for the TTL guard)
  c_scope   constant text[] := ARRAY['data_processing','mentorship_sessions','messaging','session_recording'];
  c_version constant text   := 'v1-2026-05-30';
BEGIN
  IF _token IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT id, parental_consent_at, parental_consent_email, email, parental_consent_token_issued_at
    INTO v_student_id, v_already, v_parent_email, v_self_email, v_token_issued_at
    FROM public.students
   WHERE parental_consent_token = _token
   LIMIT 1;
  IF v_student_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- [A1 guard] reject self-routed consent (the token's parent email == the
  -- student's own email — defense-in-depth even with the parent!=self trigger).
  IF v_parent_email IS NOT NULL AND v_self_email IS NOT NULL
     AND lower(btrim(v_parent_email)) = lower(btrim(v_self_email)) THEN
    RETURN NULL;
  END IF;
  -- [A1 guard] reject stale tokens (TTL 30 days from mint/resend).
  IF v_token_issued_at IS NOT NULL AND now() - v_token_issued_at > interval '30 days' THEN
    RETURN NULL;
  END IF;

  -- Consent must come from the parent (anon, via the email token link), never
  -- the student themselves. A logged-in student calling this for their own row
  -- is rejected outright (the token is also unreadable by them, per the grants).
  IF auth.uid() IS NOT NULL AND auth.uid() = v_student_id THEN
    RETURN NULL;
  END IF;

  UPDATE public.students
     SET parental_consent_at = COALESCE(parental_consent_at, now())
   WHERE id = v_student_id;

  IF v_already IS NULL THEN
    INSERT INTO public.parental_consent_records
      (student_id, parent_email, consent_scope, consent_version)
    VALUES
      (v_student_id, v_parent_email, c_scope, c_version);
  END IF;

  RETURN v_student_id;
END;
$function$;

COMMENT ON FUNCTION public.record_parental_consent(uuid) IS
  'Parent-only consent recorder (A1 2026-06-30 hardening over the 2026-06-04 column-lock): writes the privilege-locked parental_consent_at as table owner (DEFINER). Rejects self-routed tokens (parent_email == student email), stale tokens (>30d TTL), and any call where auth.uid() = the student. The token is unreadable by end users so it cannot be replayed.';

-- ── 4. handle_new_user: stamp parental_consent_token_issued_at at mint ───────
--    Verbatim body from 20260621000000:21-247 with ONLY the A1 mint-time stamp
--    added (declare v_token_issued_at; set it beside the gen_random_uuid() mint;
--    write it in the students INSERT). All other logic is unchanged.
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
  'Student-signup v2 (A1 2026-06-30 over the 2026-06-21 CoC build): unchanged except it now stamps parental_consent_token_issued_at = now() when a consent token is minted (drives the consent-token TTL). The new students_parent_not_self BEFORE INSERT trigger rejects a signup whose parent_email/phone equals the student''s own. Backward compatible; trigger not recreated.';

-- ── 5. request_parental_consent: refresh the TTL window on (re)send ──────────
--    Verbatim body from 20260530000001:146-176 with ONLY the A1 issued_at
--    refresh added (so a resent/reused link is valid for a fresh 30 days).
CREATE OR REPLACE FUNCTION public.request_parental_consent(_student_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_token        uuid;
  v_consent_at   timestamptz;
BEGIN
  IF NOT (auth.uid() = _student_id OR public.is_admin()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT parental_consent_token, parental_consent_at
    INTO v_token, v_consent_at
    FROM public.students
   WHERE id = _student_id;

  -- Nothing to do if there's no pending consent token, or consent is already
  -- on file. Silent no-op (not an error) keeps the resend button calm.
  IF v_token IS NULL OR v_consent_at IS NOT NULL THEN
    RETURN;
  END IF;

  -- A1: the token is reused (not rotated), so refresh its mint time on every
  -- (re)send — a parent who clicks a freshly-resent link gets a full 30-day TTL.
  UPDATE public.students
     SET parental_consent_token_issued_at = now()
   WHERE id = _student_id;

  PERFORM public.notify_event_email(jsonb_build_object(
    'type', 'parental_consent_request',
    'student_id', _student_id
  ));
END;
$$;

REVOKE ALL ON FUNCTION public.request_parental_consent(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.request_parental_consent(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.request_parental_consent(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.request_parental_consent(uuid) IS
  'Phase G4-follow-up (A1 2026-06-30): (re)sends the parental-consent verification email via notify_event_email (type=parental_consent_request). Allowed only for the student themselves (auth.uid()=id) or an admin. No-op if no pending token or consent already recorded. Now refreshes parental_consent_token_issued_at on each send so the reused token gets a fresh 30-day TTL.';
