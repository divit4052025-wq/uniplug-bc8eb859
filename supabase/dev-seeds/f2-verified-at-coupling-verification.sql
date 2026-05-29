-- ════════════════════════════════════════════════════════════════════════════
-- Phase F2 dev-seed: verified_at coupling + display-RPC exposure
-- ════════════════════════════════════════════════════════════════════════════
--
-- Proves migration 20260529000001_f2_verified_at_coupling.sql:
--   F2.1  admin approve  → verified_at set + verified_by = admin uid   (happy)
--   F2.2  admin reject   → verified_at + verified_by cleared           (happy)
--   F2.3  non-admin call → 'forbidden'                                 (reject)
--   F2.4  list_approved_mentor_profiles() returns verified_at (non-null
--         for the approved mentor)                                     (wiring)
--   F2.5  get_mentor_public_profile() returns verified_at (non-null)   (wiring)
--
-- Everything ROLLBACKs at the end — DB state unchanged.
--
-- PASS CRITERIA: each row status='PASS'. A FAIL on F2.1/F2.2 means an
-- approved mentor could be live without a recorded verification (or vice
-- versa), breaking the verified_at<=>approved invariant. A FAIL on F2.3
-- means a non-admin can drive verification. F2.4/F2.5 FAIL means the badge
-- can't read a real signal.
--
-- OPERATOR NOTE: like the A2 dev-seed, F2.1/F2.2 look up the canonical
-- admin's auth.users.id at runtime (email pinned by is_admin()). On a fresh
-- dev DB with no admin user, those rows FAIL with "admin user not found",
-- which is the correct signal — the admin-bypass can't be verified without
-- an admin. CI applies scripts/ci/admin-fixture.sql first.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- Throwaway mentor; handle_new_user cascades a public.mentors row (pending).
DO $$
DECLARE m_f2 constant uuid := '22222222-2222-2222-2222-2222220000f2';
BEGIN
  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    created_at, updated_at, instance_id
  ) VALUES (
    m_f2, 'authenticated', 'authenticated', 'f2-mentor@f2-verify.local',
    crypt('pw', gen_salt('bf')), now(), '{"provider":"email"}'::jsonb,
    jsonb_build_object('role','mentor','full_name','F2 Mentor','university','T','course','T','year','2nd Year'),
    '', '', '', '', now(), now(), '00000000-0000-0000-0000-000000000000'
  );
END $$;

CREATE TEMP TABLE _f2_results (
  test_id text PRIMARY KEY,
  status  text NOT NULL,
  detail  text NOT NULL
);

-- ─── F2.1: admin approve sets verified_at + verified_by ─────────────────────
DO $$
DECLARE
  v_pass boolean := false; v_msg text := '';
  v_admin_id uuid; v_va timestamptz; v_vb uuid;
BEGIN
  SELECT id INTO v_admin_id FROM auth.users
   WHERE lower(email) = lower('divitfatehpuria7@gmail.com') LIMIT 1;
  IF v_admin_id IS NULL THEN
    INSERT INTO _f2_results VALUES ('F2.1_approve_sets_verified',
      'FAIL', 'admin user not found in auth.users; cannot verify admin path');
    RETURN;
  END IF;

  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', v_admin_id::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.admin_set_mentor_status('22222222-2222-2222-2222-2222220000f2'::uuid, 'approved');
  EXCEPTION WHEN OTHERS THEN
    v_msg := 'unexpected denial ['||SQLSTATE||']: '||SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  IF v_msg = '' THEN
    SELECT verified_at, verified_by INTO v_va, v_vb FROM public.mentors
     WHERE id = '22222222-2222-2222-2222-2222220000f2'::uuid;
    IF v_va IS NOT NULL AND v_vb = v_admin_id THEN
      v_pass := true; v_msg := 'verified_at set, verified_by = admin uid';
    ELSE
      v_msg := 'verified_at='||coalesce(v_va::text,'NULL')
               ||' verified_by='||coalesce(v_vb::text,'NULL')||' (expected set + admin uid)';
    END IF;
  END IF;
  INSERT INTO _f2_results VALUES ('F2.1_approve_sets_verified',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── F2.4: list_approved_mentor_profiles exposes verified_at (approved) ──────
--          Runs while the mentor is still approved (before F2.2 rejects).
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_va timestamptz; v_found boolean;
BEGIN
  SELECT verified_at, true INTO v_va, v_found
    FROM public.list_approved_mentor_profiles()
   WHERE id = '22222222-2222-2222-2222-2222220000f2'::uuid;
  IF NOT coalesce(v_found, false) THEN
    v_msg := 'approved mentor not returned by list_approved_mentor_profiles()';
  ELSIF v_va IS NULL THEN
    v_msg := 'mentor returned but verified_at is NULL (column not wired / not set)';
  ELSE
    v_pass := true; v_msg := 'list_approved returns verified_at='||v_va::text;
  END IF;
  INSERT INTO _f2_results VALUES ('F2.4_list_approved_exposes_verified_at',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── F2.5: get_mentor_public_profile exposes verified_at (approved) ─────────
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_va timestamptz; v_found boolean;
BEGIN
  SELECT verified_at, true INTO v_va, v_found
    FROM public.get_mentor_public_profile('22222222-2222-2222-2222-2222220000f2'::uuid)
   LIMIT 1;
  IF NOT coalesce(v_found, false) THEN
    v_msg := 'approved mentor not returned by get_mentor_public_profile()';
  ELSIF v_va IS NULL THEN
    v_msg := 'mentor returned but verified_at is NULL';
  ELSE
    v_pass := true; v_msg := 'get_mentor_public_profile returns verified_at='||v_va::text;
  END IF;
  INSERT INTO _f2_results VALUES ('F2.5_public_profile_exposes_verified_at',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── F2.2: admin reject clears verified_at + verified_by ────────────────────
DO $$
DECLARE
  v_pass boolean := false; v_msg text := '';
  v_admin_id uuid; v_va timestamptz; v_vb uuid;
BEGIN
  SELECT id INTO v_admin_id FROM auth.users
   WHERE lower(email) = lower('divitfatehpuria7@gmail.com') LIMIT 1;
  IF v_admin_id IS NULL THEN
    INSERT INTO _f2_results VALUES ('F2.2_reject_clears_verified',
      'FAIL', 'admin user not found in auth.users; cannot verify admin path');
    RETURN;
  END IF;

  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', v_admin_id::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.admin_set_mentor_status('22222222-2222-2222-2222-2222220000f2'::uuid, 'rejected');
  EXCEPTION WHEN OTHERS THEN
    v_msg := 'unexpected denial ['||SQLSTATE||']: '||SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  IF v_msg = '' THEN
    SELECT verified_at, verified_by INTO v_va, v_vb FROM public.mentors
     WHERE id = '22222222-2222-2222-2222-2222220000f2'::uuid;
    IF v_va IS NULL AND v_vb IS NULL THEN
      v_pass := true; v_msg := 'verified_at + verified_by cleared on reject';
    ELSE
      v_msg := 'expected both NULL, got verified_at='||coalesce(v_va::text,'NULL')
               ||' verified_by='||coalesce(v_vb::text,'NULL');
    END IF;
  END IF;
  INSERT INTO _f2_results VALUES ('F2.2_reject_clears_verified',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── F2.3: non-admin call to admin_set_mentor_status → forbidden ────────────
DO $$
DECLARE v_pass boolean := false; v_msg text := '';
BEGIN
  -- The mentor's own (non-admin) JWT.
  PERFORM set_config('request.jwt.claims',
    '{"sub":"22222222-2222-2222-2222-2222220000f2","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.admin_set_mentor_status('22222222-2222-2222-2222-2222220000f2'::uuid, 'approved');
    v_msg := 'non-admin call ACCEPTED (should be forbidden)';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE '%forbidden%' THEN
      v_pass := true; v_msg := 'rejected ['||SQLSTATE||']: '||SQLERRM;
    ELSE
      v_msg := 'wrong reject ['||SQLSTATE||']: '||SQLERRM;
    END IF;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _f2_results VALUES ('F2.3_non_admin_forbidden',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

SELECT test_id, status, detail FROM _f2_results ORDER BY test_id;

ROLLBACK;
