-- ════════════════════════════════════════════════════════════════════════════
-- Phase 7 dev-seed: finalize_student_profile() + profile_completed_at verification
-- ════════════════════════════════════════════════════════════════════════════
--
-- WHAT THIS FILE IS
--   Runnable rejection + happy-path tests for the column + RPC added in
--   supabase/migrations/20260604000100_p7_student_profile_finalize.sql. NOT a
--   migration.
--
-- HOW IT WORKS
--   Single outer BEGIN..ROLLBACK. Setup (service_role claims, RLS-bypassing)
--   creates three student auth users (A, B, C) + one mentor (M) — the
--   on_auth_user_created → handle_new_user trigger cascades their public rows.
--   Each test switches SET LOCAL ROLE + request.jwt.claims so auth.uid()
--   evaluates as a real signed-in user. Results accumulate in a TEMP table;
--   everything ROLLBACKs.
--
-- HOW TO RUN
--   docker exec -i supabase_db_<ref> psql \
--     "postgresql://postgres:postgres@localhost:5432/postgres" \
--     -v ON_ERROR_STOP=1 < this-file.sql
--
-- PASS CRITERIA
--   Final SELECT returns one row per test, status = 'PASS'. Any '| FAIL |' row
--   fails CI.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- A/B/C students (Grade 12 + no DOB → adult path, no consent side effects) and
-- M mentor (to prove the "no student row" rejection). handle_new_user cascades
-- the public.students / public.mentors rows.
INSERT INTO auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  created_at, updated_at, instance_id
) VALUES
(
  'a7000000-0000-0000-0000-0000000000aa'::uuid,
  'authenticated', 'authenticated', 'p7-student-a@example.com',
  crypt('p7-fixture-pw', gen_salt('bf')), now(),
  '{"provider":"email"}'::jsonb,
  jsonb_build_object('role','student','full_name','Phase7 Student A','phone','+91-700',
    'school','P7 School A','grade','Grade 12'),
  '', '', '', '', now(), now(), '00000000-0000-0000-0000-000000000000'
),
(
  'a7000000-0000-0000-0000-0000000000bb'::uuid,
  'authenticated', 'authenticated', 'p7-student-b@example.com',
  crypt('p7-fixture-pw', gen_salt('bf')), now(),
  '{"provider":"email"}'::jsonb,
  jsonb_build_object('role','student','full_name','Phase7 Student B','phone','+91-701',
    'school','P7 School B','grade','Grade 12'),
  '', '', '', '', now(), now(), '00000000-0000-0000-0000-000000000000'
),
(
  'a7000000-0000-0000-0000-0000000000cc'::uuid,
  'authenticated', 'authenticated', 'p7-student-c@example.com',
  crypt('p7-fixture-pw', gen_salt('bf')), now(),
  '{"provider":"email"}'::jsonb,
  jsonb_build_object('role','student','full_name','Phase7 Student C','phone','+91-702',
    'school','P7 School C','grade','Grade 12'),
  '', '', '', '', now(), now(), '00000000-0000-0000-0000-000000000000'
),
(
  'a7000000-0000-0000-0000-0000000000dd'::uuid,
  'authenticated', 'authenticated', 'p7-mentor-m@example.com',
  crypt('p7-fixture-pw', gen_salt('bf')), now(),
  '{"provider":"email"}'::jsonb,
  jsonb_build_object('role','mentor','full_name','Phase7 Mentor M',
    'university','P7 University','course','CS','year','2','date_of_birth','2000-01-01'),
  '', '', '', '', now(), now(), '00000000-0000-0000-0000-000000000000'
)
ON CONFLICT (id) DO NOTHING;

CREATE TEMP TABLE _p7 (test_id text PRIMARY KEY, status text NOT NULL, detail text NOT NULL);

-- ─── F.01 (REJECTION): anon (no auth.uid()) cannot finalize ───
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_ts timestamptz;
BEGIN
  PERFORM set_config('request.jwt.claims','{"role":"anon"}', true);
  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN
    v_ts := public.finalize_student_profile();
    v_msg := 'anon finalize ACCEPTED (returned '||coalesce(v_ts::text,'<null>')||')';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE IN ('42501','P0001') THEN v_pass := true; v_msg := 'denied ['||SQLSTATE||']';
    ELSE v_msg := 'unexpected ['||SQLSTATE||']: '||SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p7 VALUES ('F.01_anon_finalize_denied', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── F.02 (HAPPY): student A finalizes own NULL profile → stamped non-null ───
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_ts timestamptz; v_stored timestamptz;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"a7000000-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    v_ts := public.finalize_student_profile();
    SELECT profile_completed_at INTO v_stored FROM public.students WHERE id = 'a7000000-0000-0000-0000-0000000000aa';
    v_pass := (v_ts IS NOT NULL AND v_stored IS NOT NULL AND v_stored = v_ts);
    v_msg := 'returned='||coalesce(v_ts::text,'<null>')||' stored='||coalesce(v_stored::text,'<null>')||' (expect equal + non-null)';
  EXCEPTION WHEN OTHERS THEN
    v_msg := 'unexpected ['||SQLSTATE||']: '||SQLERRM;
  END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p7 VALUES ('F.02_student_finalize_happy', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── F.03 (IDEMPOTENT): a pre-set stamp is NEVER overwritten ───
-- Pre-seed B with a known PAST timestamp (service_role), then B finalizes:
-- must return + retain the past value, not now() — proves the no-overwrite guard.
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_ret timestamptz; v_stored timestamptz;
  v_preset timestamptz := '2020-01-01 00:00:00+00';
BEGIN
  UPDATE public.students SET profile_completed_at = v_preset WHERE id = 'a7000000-0000-0000-0000-0000000000bb';
  PERFORM set_config('request.jwt.claims','{"sub":"a7000000-0000-0000-0000-0000000000bb","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    v_ret := public.finalize_student_profile();
    SELECT profile_completed_at INTO v_stored FROM public.students WHERE id = 'a7000000-0000-0000-0000-0000000000bb';
    v_pass := (v_ret = v_preset AND v_stored = v_preset);
    v_msg := 'preset='||v_preset::text||' returned='||coalesce(v_ret::text,'<null>')||' stored='||coalesce(v_stored::text,'<null>')||' (expect all equal — no overwrite)';
  EXCEPTION WHEN OTHERS THEN
    v_msg := 'unexpected ['||SQLSTATE||']: '||SQLERRM;
  END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p7 VALUES ('F.03_finalize_idempotent_no_overwrite', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── F.04 (ISOLATION): finalize touches ONLY the caller's row ───
-- After A + B finalized above, untouched student C must still read NULL.
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_c timestamptz;
BEGIN
  SELECT profile_completed_at INTO v_c FROM public.students WHERE id = 'a7000000-0000-0000-0000-0000000000cc';
  v_pass := (v_c IS NULL);
  v_msg := 'untouched student C profile_completed_at='||coalesce(v_c::text,'<null>')||' (expect <null>)';
  INSERT INTO _p7 VALUES ('F.04_finalize_isolation_own_row_only', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── F.05 (REJECTION): a non-student (mentor M) has no student row → P0001 ───
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_ts timestamptz;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"a7000000-0000-0000-0000-0000000000dd","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    v_ts := public.finalize_student_profile();
    v_msg := 'mentor finalize ACCEPTED (returned '||coalesce(v_ts::text,'<null>')||')';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = 'P0001' THEN v_pass := true; v_msg := 'denied [P0001] no student row';
    ELSE v_msg := 'unexpected ['||SQLSTATE||']: '||SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p7 VALUES ('F.05_non_student_no_row_denied', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── F.06 (REJECTION): in-body NULL-uid guard (distinct from F.01's grant-layer
-- revoke). Call as `authenticated` but with sub-less claims so auth.uid() is
-- NULL → the function's own 'authentication required' guard fires (42501). ───
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_ts timestamptz;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated"}', true); -- no "sub"
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    v_ts := public.finalize_student_profile();
    v_msg := 'sub-less authenticated finalize ACCEPTED (returned ' || coalesce(v_ts::text, '<null>') || ')';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = '42501' THEN v_pass := true; v_msg := 'in-body guard fired [42501] authentication required';
    ELSE v_msg := 'unexpected [' || SQLSTATE || ']: ' || SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _p7 VALUES ('F.06_in_body_null_uid_guard', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

SELECT test_id, status, detail FROM _p7 ORDER BY test_id;

ROLLBACK;
