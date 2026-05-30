-- ════════════════════════════════════════════════════════════════════════════
-- Phase G4-follow-up Stage 2 dev-seed: signup capture + consent-email plumbing
-- ════════════════════════════════════════════════════════════════════════════
--
-- Tests migration 20260530000002_parental_consent_signup_capture.sql by
-- simulating real signups (INSERT auth.users with metadata → handle_new_user
-- cascades the students row). All inside BEGIN..ROLLBACK — live state unchanged.
--
-- COVERAGE (deterministic parts)
--   S2.1  under-18 by DOB (Grade 11) + parent fields → token minted, DOB +
--         parent_email + parent_phone persisted
--   S2.2  gated grade with ADULT DOB (Grade 10, 19y) + parent fields → token
--         minted via the grade arm, parent fields persisted
--   S2.3  adult, non-gated (Grade 12, 25y), NO parent fields → NO token, NO
--         parent_email, NO parent_phone (DOB still persisted)
--   S2.4  email plumbing present: the AFTER INSERT trigger exists and its
--         function enqueues notify_event_email('parental_consent_request')
--
-- NOTE ON THE EMAIL FIRE: the actual HTTP enqueue (notify_event_email →
-- net.http_post) cannot be asserted from SQL in-transaction — same limitation
-- the C2 dev-seed documents ("the HTTP layer cannot be tested from SQL"). So
-- S2.4 verifies the trigger + function-body plumbing (the C2.6 pattern), not a
-- live POST. The S2.1/S2.2 inserts DO exercise the trigger at runtime; it is
-- guarded (failure → WARNING, never rolls back the signup), so these inserts
-- succeed regardless of whether pg_net is functional in this environment.
--
-- PASS CRITERIA: every row status='PASS'.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

DO $$
DECLARE
  s_under18     constant uuid := '22222222-2222-2222-2222-222222220601';  -- Grade 11, DOB 16y, parent fields
  s_grade_adult constant uuid := '22222222-2222-2222-2222-222222220602';  -- Grade 10, DOB 19y, parent fields
  s_adult       constant uuid := '22222222-2222-2222-2222-222222220603';  -- Grade 12, DOB 25y, no parent fields
  s_baddate     constant uuid := '22222222-2222-2222-2222-222222220604';  -- Grade 12, malformed DOB → NULL
BEGIN
  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    created_at, updated_at, instance_id
  ) VALUES
    (s_under18, 'authenticated', 'authenticated', 's_u18@s2.local',
     crypt('pw', gen_salt('bf')), now(), '{"provider":"email"}'::jsonb,
     jsonb_build_object(
       'role','student','full_name','Under18 S','phone','+91-0','school','T','grade','Grade 11',
       'date_of_birth', (current_date - interval '16 years')::date::text,
       'parent_email','parent.u18@s2.local','parent_phone','+91-11'),
     '', '', '', '', now(), now(), '00000000-0000-0000-0000-000000000000'),
    (s_grade_adult, 'authenticated', 'authenticated', 's_ga@s2.local',
     crypt('pw', gen_salt('bf')), now(), '{"provider":"email"}'::jsonb,
     jsonb_build_object(
       'role','student','full_name','Grade10 Adult S','phone','+91-0','school','T','grade','Grade 10',
       'date_of_birth', (current_date - interval '19 years')::date::text,
       'parent_email','parent.ga@s2.local','parent_phone','+91-12'),
     '', '', '', '', now(), now(), '00000000-0000-0000-0000-000000000000'),
    (s_adult, 'authenticated', 'authenticated', 's_ad@s2.local',
     crypt('pw', gen_salt('bf')), now(), '{"provider":"email"}'::jsonb,
     jsonb_build_object(
       'role','student','full_name','Adult S','phone','+91-0','school','T','grade','Grade 12',
       'date_of_birth', (current_date - interval '25 years')::date::text),
     '', '', '', '', now(), now(), '00000000-0000-0000-0000-000000000000'),
    (s_baddate, 'authenticated', 'authenticated', 's_bd@s2.local',
     crypt('pw', gen_salt('bf')), now(), '{"provider":"email"}'::jsonb,
     jsonb_build_object(
       'role','student','full_name','Bad Date S','phone','+91-0','school','T','grade','Grade 12',
       'date_of_birth','not-a-real-date'),
     '', '', '', '', now(), now(), '00000000-0000-0000-0000-000000000000');
END $$;

CREATE TEMP TABLE _s2_results (test_id text PRIMARY KEY, status text NOT NULL, detail text NOT NULL);

-- ─── S2.1: under-18 (Grade 11) → token + DOB + parent fields persisted ──────
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_dob date; v_token uuid; v_pe text; v_pp text;
BEGIN
  SELECT date_of_birth, parental_consent_token, parental_consent_email, parent_phone
    INTO v_dob, v_token, v_pe, v_pp
    FROM public.students WHERE id = '22222222-2222-2222-2222-222222220601'::uuid;
  IF v_dob IS NULL THEN v_msg := 'DOB not persisted';
  ELSIF v_token IS NULL THEN v_msg := 'token NOT minted for under-18';
  ELSIF v_pe IS DISTINCT FROM 'parent.u18@s2.local' THEN v_msg := 'parent_email='||coalesce(v_pe,'NULL');
  ELSIF v_pp IS DISTINCT FROM '+91-11' THEN v_msg := 'parent_phone='||coalesce(v_pp,'NULL');
  ELSE v_pass := true; v_msg := 'DOB='||v_dob||' token minted; parent_email/phone persisted'; END IF;
  INSERT INTO _s2_results VALUES ('S2.1_under18_token_and_parent_fields',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── S2.2: gated grade + adult DOB (Grade 10, 19y) → token via grade arm ────
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_dob date; v_token uuid; v_pe text; v_pp text;
BEGIN
  SELECT date_of_birth, parental_consent_token, parental_consent_email, parent_phone
    INTO v_dob, v_token, v_pe, v_pp
    FROM public.students WHERE id = '22222222-2222-2222-2222-222222220602'::uuid;
  IF v_dob IS NULL THEN v_msg := 'DOB not persisted';
  ELSIF v_token IS NULL THEN v_msg := 'token NOT minted for gated grade (grade arm failed)';
  ELSIF v_pe IS DISTINCT FROM 'parent.ga@s2.local' THEN v_msg := 'parent_email='||coalesce(v_pe,'NULL');
  ELSIF v_pp IS DISTINCT FROM '+91-12' THEN v_msg := 'parent_phone='||coalesce(v_pp,'NULL');
  ELSE v_pass := true; v_msg := 'grade-arm token minted; parent fields persisted'; END IF;
  INSERT INTO _s2_results VALUES ('S2.2_grade_arm_token_and_parent_fields',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── S2.3: adult non-gated (Grade 12, 25y, no parent fields) → no token ─────
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_dob date; v_token uuid; v_pe text; v_pp text;
BEGIN
  SELECT date_of_birth, parental_consent_token, parental_consent_email, parent_phone
    INTO v_dob, v_token, v_pe, v_pp
    FROM public.students WHERE id = '22222222-2222-2222-2222-222222220603'::uuid;
  IF v_dob IS NULL THEN v_msg := 'DOB not persisted';
  ELSIF v_token IS NOT NULL THEN v_msg := 'token WRONGLY minted for adult non-gated';
  ELSIF v_pe IS NOT NULL THEN v_msg := 'parent_email wrongly stored: '||v_pe;
  ELSIF v_pp IS NOT NULL THEN v_msg := 'parent_phone wrongly stored: '||v_pp;
  ELSE v_pass := true; v_msg := 'adult: DOB='||v_dob||' persisted; no token, no parent fields'; END IF;
  INSERT INTO _s2_results VALUES ('S2.3_adult_no_token_no_parent_fields',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── S2.4: consent-email plumbing present (trigger + function body) ─────────
--          The live HTTP enqueue cannot be asserted from SQL (see header);
--          this mirrors C2.6 — verify the trigger exists and the function
--          enqueues the parental_consent_request event.
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_trig boolean; v_body text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'students_request_parental_consent_email' AND NOT tgisinternal
  ) INTO v_trig;
  SELECT pg_get_functiondef(p.oid) INTO v_body
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'tg_request_parental_consent_email' LIMIT 1;
  IF NOT v_trig THEN v_msg := 'AFTER INSERT trigger students_request_parental_consent_email missing';
  ELSIF v_body IS NULL THEN v_msg := 'tg_request_parental_consent_email function not found';
  ELSIF v_body NOT ILIKE '%notify_event_email%' THEN v_msg := 'function does not call notify_event_email';
  ELSIF v_body NOT ILIKE '%parental_consent_request%' THEN v_msg := 'function does not enqueue parental_consent_request';
  ELSE v_pass := true; v_msg := 'trigger present; enqueues notify_event_email(parental_consent_request)'; END IF;
  INSERT INTO _s2_results VALUES ('S2.4_consent_email_plumbing',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── S2.5: malformed date string → signup SUCCEEDS, date_of_birth = NULL ────
--          Proves the defensive parse: a bad date is treated as unknown (NULL)
--          rather than throwing and failing the signup (→ fail-closed gate, not
--          a 500). Grade 12 (non-gated) so the row is a clean adult-path insert.
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_exists boolean; v_dob date; v_token uuid;
BEGIN
  SELECT true, date_of_birth, parental_consent_token
    INTO v_exists, v_dob, v_token
    FROM public.students WHERE id = '22222222-2222-2222-2222-222222220604'::uuid;
  IF NOT coalesce(v_exists, false) THEN
    v_msg := 'signup FAILED on malformed date — defensive parse missing (no student row)';
  ELSIF v_dob IS NOT NULL THEN
    v_msg := 'malformed date was NOT nulled: '||v_dob;
  ELSE
    v_pass := true; v_msg := 'signup succeeded; malformed date persisted as NULL (token='||coalesce(v_token::text,'NULL')||')';
  END IF;
  INSERT INTO _s2_results VALUES ('S2.5_malformed_dob_null_signup_ok',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

SELECT test_id, status, detail FROM _s2_results ORDER BY test_id;

ROLLBACK;
