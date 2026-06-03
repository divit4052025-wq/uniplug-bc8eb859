-- ════════════════════════════════════════════════════════════════════════════
-- Phase 0 dev-seed: reference / taxonomy layer verification
-- ════════════════════════════════════════════════════════════════════════════
--
-- WHAT THIS FILE IS
--   Runnable rejection + happy-path tests for the tables, RLS policies and RPCs
--   added in supabase/migrations/20260603000001_p0_ref_taxonomy.sql (and the
--   seed in 20260603000002_p0_ref_seed.sql). This is NOT a migration.
--
-- HOW IT WORKS
--   A single outer transaction. Setup runs as the bootstrap role (which, like
--   service_role, bypasses RLS) to ensure the canonical admin user exists and
--   to plant deterministic sentinel rows. Each test DO block switches
--   SET LOCAL ROLE and sets request.jwt.claims so auth.uid() returns the test
--   caller and RLS / is_admin() evaluate exactly as for a real signed-in user.
--   Results accumulate in a TEMP table; everything ROLLBACKs at the end.
--
--   The admin tests impersonate the canonical admin (the same uuid + email the
--   CI admin-fixture and is_admin() are pinned to). We also insert that
--   auth.users row here (ON CONFLICT DO NOTHING) so the seed is self-contained
--   whether or not scripts/ci/admin-fixture.sql ran first.
--
-- HOW TO RUN
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f this-file.sql
--   (or paste into the Supabase SQL editor). All changes ROLLBACK — DB state
--   unchanged.
--
-- PASS CRITERIA
--   The final SELECT returns one row per test with status = 'PASS'. Any 'FAIL'
--   row means a policy / RPC / seed contract is broken — investigate before
--   merging.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- Run setup with RLS bypassed (mirrors the production service-role writer).
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- Canonical admin user (same id/email is_admin() + the CI fixture are pinned to).
-- Inserting fires handle_new_user (cascades a students row) — harmless, rolled
-- back. ON CONFLICT skips if the CI fixture already created it.
INSERT INTO auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  created_at, updated_at, instance_id
) VALUES (
  'db74f8e5-5511-4aec-a9a4-79ae2b535b9f'::uuid,
  'authenticated', 'authenticated',
  'divitfatehpuria7@gmail.com',
  crypt('ci-fixture-password', gen_salt('bf')),
  now(),
  '{"provider":"email"}'::jsonb,
  jsonb_build_object('role','student','full_name','Admin User','phone','+91-0','school','T','grade','Grade 11'),
  '', '', '', '',
  now(), now(),
  '00000000-0000-0000-0000-000000000000'
)
ON CONFLICT (id) DO NOTHING;

-- Deterministic sentinel rows for the search tests (unique names + a unique alias).
INSERT INTO public.ref_universities (name, country, aliases, source)
VALUES ('Zzz Sentinel University', 'Testland', ARRAY['ZsuAliasXyz'], 'devseed')
ON CONFLICT (name) DO NOTHING;

CREATE TEMP TABLE _p0 (test_id text PRIMARY KEY, status text NOT NULL, detail text NOT NULL);

-- ─── P0.1 (REJECTION): a non-admin authenticated user cannot INSERT a ref row ───
DO $$
DECLARE v_pass boolean := false; v_msg text := '';
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"c0c0c0c0-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    INSERT INTO public.ref_universities (name, source) VALUES ('Hacker University', 'attack');
    v_msg := 'non-admin INSERT was ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE IN ('42501','P0001') THEN
      v_pass := true; v_msg := 'denied [' || SQLSTATE || ']: ' || SQLERRM;
    ELSE
      v_msg := 'unexpected SQLSTATE ' || SQLSTATE || ': ' || SQLERRM;
    END IF;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _p0 VALUES ('P0.1_non_admin_ref_insert_denied',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P0.2 (REJECTION): a non-admin cannot call admin_promote_ref_add_request ───
DO $$
DECLARE v_pass boolean := false; v_msg text := '';
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"c0c0c0c0-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.admin_promote_ref_add_request('00000000-0000-0000-0000-0000000000ff'::uuid);
    v_msg := 'non-admin admin_promote was ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = 'P0001' AND SQLERRM ILIKE '%forbidden%' THEN
      v_pass := true; v_msg := 'denied: ' || SQLERRM;
    ELSE
      v_msg := 'unexpected SQLSTATE ' || SQLSTATE || ': ' || SQLERRM;
    END IF;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _p0 VALUES ('P0.2_non_admin_promote_denied',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P0.3 (HAPPY): search_reference returns the sentinel for a name query ───
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_cnt int;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"c0c0c0c0-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    SELECT count(*) INTO v_cnt
    FROM public.search_reference('university', 'Zzz Sentinel') r
    WHERE r.name = 'Zzz Sentinel University';
    v_pass := (v_cnt >= 1);
    v_msg := 'name-query hits for sentinel = ' || v_cnt;
  EXCEPTION WHEN OTHERS THEN
    v_msg := 'unexpected error [' || SQLSTATE || ']: ' || SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _p0 VALUES ('P0.3_search_reference_name_hit',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P0.4 (HAPPY): search_reference resolves a university via its alias ───
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_cnt int;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"c0c0c0c0-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    SELECT count(*) INTO v_cnt
    FROM public.search_reference('university', 'ZsuAliasXyz') r
    WHERE r.name = 'Zzz Sentinel University';
    v_pass := (v_cnt >= 1);
    v_msg := 'alias-query hits for sentinel = ' || v_cnt;
  EXCEPTION WHEN OTHERS THEN
    v_msg := 'unexpected error [' || SQLSTATE || ']: ' || SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _p0 VALUES ('P0.4_search_reference_alias_hit',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P0.5 (HAPPY): create_ref_add_request inserts a pending row, stamped caller ───
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_id uuid; v_status text; v_by uuid; v_acted boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"db74f8e5-5511-4aec-a9a4-79ae2b535b9f","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    v_id := public.create_ref_add_request('course', 'Zzz Sentinel Course');
    v_acted := true;
  EXCEPTION WHEN OTHERS THEN
    v_msg := 'create_ref_add_request errored [' || SQLSTATE || ']: ' || SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  IF v_acted THEN
    SELECT status, requested_by INTO v_status, v_by FROM public.ref_add_requests WHERE id = v_id;
    v_pass := (v_status = 'pending'
               AND v_by = 'db74f8e5-5511-4aec-a9a4-79ae2b535b9f'::uuid);
    v_msg := 'request status=' || coalesce(v_status,'<null>')
             || ' requested_by=' || coalesce(v_by::text,'<null>');
  END IF;
  INSERT INTO _p0 VALUES ('P0.5_create_ref_add_request',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P0.6 (HAPPY): admin_promote inserts into the target table + marks approved ─
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_id uuid; v_status text; v_in_table int; v_acted boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"db74f8e5-5511-4aec-a9a4-79ae2b535b9f","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    SELECT id INTO v_id FROM public.ref_add_requests
      WHERE kind = 'course' AND proposed_name = 'Zzz Sentinel Course'
      ORDER BY created_at DESC LIMIT 1;
    PERFORM public.admin_promote_ref_add_request(v_id);
    v_acted := true;
  EXCEPTION WHEN OTHERS THEN
    v_msg := 'admin_promote errored [' || SQLSTATE || ']: ' || SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  IF v_acted THEN
    SELECT count(*) INTO v_in_table FROM public.ref_courses WHERE name = 'Zzz Sentinel Course';
    SELECT status INTO v_status FROM public.ref_add_requests WHERE id = v_id;
    v_pass := (v_in_table = 1 AND v_status = 'approved');
    v_msg := 'ref_courses match=' || v_in_table || ' request status=' || coalesce(v_status,'<null>');
  END IF;
  INSERT INTO _p0 VALUES ('P0.6_admin_promote',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P0.7 (HAPPY): admin_reject marks rejected + records reason; no promotion ──
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_id uuid; v_status text; v_reason text; v_in_table int; v_acted boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"db74f8e5-5511-4aec-a9a4-79ae2b535b9f","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    v_id := public.create_ref_add_request('subject', 'Zzz Reject Subject');
    PERFORM public.admin_reject_ref_add_request(v_id, 'not a real subject');
    v_acted := true;
  EXCEPTION WHEN OTHERS THEN
    v_msg := 'create/reject errored [' || SQLSTATE || ']: ' || SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  IF v_acted THEN
    SELECT status, decision_reason INTO v_status, v_reason FROM public.ref_add_requests WHERE id = v_id;
    SELECT count(*) INTO v_in_table FROM public.ref_subjects WHERE name = 'Zzz Reject Subject';
    v_pass := (v_status = 'rejected' AND v_reason = 'not a real subject' AND v_in_table = 0);
    v_msg := 'status=' || coalesce(v_status,'<null>') || ' reason=' || coalesce(v_reason,'<null>')
             || ' promoted_into_table=' || v_in_table || ' (expect 0)';
  END IF;
  INSERT INTO _p0 VALUES ('P0.7_admin_reject',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P0.8 (SANITY): the seed migration planted exactly the six specialties ────
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_n int;
BEGIN
  SELECT count(*) INTO v_n FROM public.ref_specialties;
  v_pass := (v_n = 6);
  v_msg := 'ref_specialties row count = ' || v_n || ' (expect 6)';
  INSERT INTO _p0 VALUES ('P0.8_specialties_seeded',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

SELECT test_id, status, detail FROM _p0 ORDER BY test_id;

ROLLBACK;
