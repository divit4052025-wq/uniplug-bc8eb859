-- ════════════════════════════════════════════════════════════════════════════
-- Phase A2 dev-seed: mentors column lock (status + price_inr)
-- ════════════════════════════════════════════════════════════════════════════
--
-- WHAT THIS FILE IS
--   Runnable rejection + happy-path tests for the extended
--   prevent_mentor_self_approval trigger in migration
--     20260523000002_mentors_column_lock.sql
--   which now locks BOTH `status` AND `price_inr` against non-admin /
--   non-service_role mentor self-writes, while keeping the display-field
--   path (bio, topics, photo_url) open.
--
--   Everything ROLLBACKs at the end — DB state unchanged.
--
-- PASS CRITERIA
--   Each test row ends with status = 'PASS'. Any 'FAIL' means a real
--   attacker could still mutate an admin-controlled column from a non-
--   admin client (price spoofing, self-approval) or A2 has accidentally
--   broken the mentor Settings UI display-field path.
--
-- OPERATOR NOTE
--   A2.4 looks up the canonical admin's auth.users.id at runtime instead
--   of inserting a second admin row, because auth.users has a partial
--   unique index on email (users_email_partial_key). The lookup expects
--   the admin user (email pinned by is_admin()) to already exist in
--   auth.users — true on the live DB and on any restore-from-prod env.
--   On a fresh dev DB with no admin user present, A2.4 will FAIL with
--   "admin user not found", which is the correct signal: the lock's
--   admin-bypass cannot be verified without an admin.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

DO $$
DECLARE
  m_a constant uuid := '11111111-1111-1111-1111-1111111102a1';  -- approved mentor
  m_b constant uuid := '11111111-1111-1111-1111-1111111102a2';  -- approved mentor (admin-status target)
BEGIN
  -- Two mentors. handle_new_user cascades a public.mentors row from each.
  -- The admin user is NOT inserted here — A2.4 looks up the existing
  -- admin row at runtime (auth.users.email has a partial unique index).
  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    created_at, updated_at, instance_id
  ) VALUES
    (m_a, 'authenticated', 'authenticated', 'm_a@a2-lock.local',
     crypt('pw', gen_salt('bf')), now(), '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','mentor','full_name','Approved M','university','T','course','T','year','2nd Year'),
     '', '', '', '', now(), now(), '00000000-0000-0000-0000-000000000000'),
    (m_b, 'authenticated', 'authenticated', 'm_b@a2-lock.local',
     crypt('pw', gen_salt('bf')), now(), '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','mentor','full_name','Approved M2','university','T','course','T','year','2nd Year'),
     '', '', '', '', now(), now(), '00000000-0000-0000-0000-000000000000');

  -- Promote both mentors to approved via service_role (bypasses trigger).
  UPDATE public.mentors SET status = 'approved' WHERE id IN (m_a, m_b);
END $$;

CREATE TEMP TABLE _a2_results (
  test_id text PRIMARY KEY,
  status  text NOT NULL,
  detail  text NOT NULL
);

-- ─── A2.1: non-admin mentor flips own price_inr → reject (P0001) ────────────
DO $$
DECLARE
  v_pass boolean := false; v_msg text := '';
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-1111111102a1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    UPDATE public.mentors SET price_inr = 1
     WHERE id = '11111111-1111-1111-1111-1111111102a1'::uuid;
    v_msg := 'mentor self-write of price_inr ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = 'P0001'
       AND SQLERRM ILIKE '%can only be changed by an administrator%' THEN
      v_pass := true; v_msg := 'rejected ['||SQLSTATE||']: '||SQLERRM;
    ELSE
      v_msg := 'wrong reject ['||SQLSTATE||']: '||SQLERRM;
    END IF;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _a2_results VALUES ('A2.1_mentor_self_price_reject',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── A2.2: non-admin mentor flips own status → reject (regression) ─────────
DO $$
DECLARE
  v_pass boolean := false; v_msg text := '';
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-1111111102a1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    UPDATE public.mentors SET status = 'rejected'
     WHERE id = '11111111-1111-1111-1111-1111111102a1'::uuid;
    v_msg := 'mentor self-write of status ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = 'P0001' THEN
      v_pass := true; v_msg := 'rejected ['||SQLSTATE||']: '||SQLERRM;
    ELSE
      v_msg := 'wrong reject ['||SQLSTATE||']: '||SQLERRM;
    END IF;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _a2_results VALUES ('A2.2_mentor_self_status_reject',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── A2.3: non-admin mentor flips own display field (bio) → accept ──────────
--          (mentor Settings UI must continue to work)
DO $$
DECLARE
  v_pass boolean := false; v_msg text := '';
  v_bio text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-1111111102a1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    UPDATE public.mentors SET bio = 'A2 test bio'
     WHERE id = '11111111-1111-1111-1111-1111111102a1'::uuid;
    SELECT bio INTO v_bio FROM public.mentors
     WHERE id = '11111111-1111-1111-1111-1111111102a1'::uuid;
    IF v_bio = 'A2 test bio' THEN
      v_pass := true; v_msg := 'display-field accepted, read-back ok';
    ELSE
      v_msg := 'display-field write returned no error but read-back mismatch: '
               ||coalesce(v_bio, 'NULL');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_msg := 'unexpected denial ['||SQLSTATE||']: '||SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _a2_results VALUES ('A2.3_mentor_self_bio_accept',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── A2.4: admin via admin_set_mentor_status flips status → accept ──────────
--          (regression — the admin RPC's transitive is_admin() bypass must
--          still satisfy the extended trigger. Admin uuid is looked up at
--          runtime because auth.users has a partial unique index on email
--          so we can't insert a second admin row.)
DO $$
DECLARE
  v_pass boolean := false; v_msg text := '';
  v_status text;
  v_admin_id uuid;
BEGIN
  SELECT id INTO v_admin_id FROM auth.users
   WHERE lower(email) = lower('divitfatehpuria7@gmail.com')
   LIMIT 1;
  IF v_admin_id IS NULL THEN
    INSERT INTO _a2_results VALUES ('A2.4_admin_rpc_status_accept',
      'FAIL', 'admin user not found in auth.users; cannot verify admin bypass');
    RETURN;
  END IF;

  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', v_admin_id::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.admin_set_mentor_status(
      '11111111-1111-1111-1111-1111111102a2'::uuid, 'rejected');
  EXCEPTION WHEN OTHERS THEN
    v_msg := 'unexpected denial ['||SQLSTATE||']: '||SQLERRM;
  END;
  -- Reset to service_role for the read-back: the admin's auth.uid() does
  -- not match any mentor id, so the mentors SELECT policy (auth.uid()=id)
  -- would return zero rows under the admin's JWT.
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  IF v_msg = '' THEN
    SELECT status::text INTO v_status FROM public.mentors
     WHERE id = '11111111-1111-1111-1111-1111111102a2'::uuid;
    IF v_status = 'rejected' THEN
      v_pass := true; v_msg := 'admin RPC accepted, status='||v_status||' (admin uid='||v_admin_id||')';
    ELSE
      v_msg := 'admin RPC returned no error but status mismatch: '
               ||coalesce(v_status, 'NULL');
    END IF;
  END IF;
  INSERT INTO _a2_results VALUES ('A2.4_admin_rpc_status_accept',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── A2.5: service_role direct UPDATE of price_inr → accept (seed path) ─────
DO $$
DECLARE
  v_pass boolean := false; v_msg text := '';
  v_price integer;
BEGIN
  -- already in service_role context (outer setup)
  BEGIN
    UPDATE public.mentors SET price_inr = 2200
     WHERE id = '11111111-1111-1111-1111-1111111102a1'::uuid;
    SELECT price_inr INTO v_price FROM public.mentors
     WHERE id = '11111111-1111-1111-1111-1111111102a1'::uuid;
    IF v_price = 2200 THEN
      v_pass := true; v_msg := 'service_role price write accepted, price='||v_price;
    ELSE
      v_msg := 'service_role wrote but read-back mismatch: '
               ||coalesce(v_price::text, 'NULL');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_msg := 'unexpected denial ['||SQLSTATE||']: '||SQLERRM;
  END;
  INSERT INTO _a2_results VALUES ('A2.5_service_role_price_accept',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── A2.6: non-admin mentor flips price_inr + bio in same UPDATE → reject ──
--          The locked-column short-circuit must NOT be defeated by piggy-
--          backing a display-field change on the same statement.
DO $$
DECLARE
  v_pass boolean := false; v_msg text := '';
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-1111111102a1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    UPDATE public.mentors
       SET price_inr = 5, bio = 'piggyback'
     WHERE id = '11111111-1111-1111-1111-1111111102a1'::uuid;
    v_msg := 'piggyback (price+bio) ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = 'P0001' THEN
      v_pass := true; v_msg := 'rejected ['||SQLSTATE||']: '||SQLERRM;
    ELSE
      v_msg := 'wrong reject ['||SQLSTATE||']: '||SQLERRM;
    END IF;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _a2_results VALUES ('A2.6_mentor_piggyback_reject',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── A2.7: cross-row attack — mentor flips OTHER mentor's price_inr ────────
--          RLS UPDATE policy ("Mentors can update own row") restricts to
--          own row, so this should be rejected by RLS *before* the trigger
--          fires. The test pins SQLSTATE 42501 (RLS deny) — it's a
--          regression for the underlying policy, complementing the
--          trigger lock.
DO $$
DECLARE
  v_pass boolean := false; v_msg text := '';
  v_rowcount integer;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-1111111102a1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    UPDATE public.mentors SET price_inr = 1
     WHERE id = '11111111-1111-1111-1111-1111111102a2'::uuid;
    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount = 0 THEN
      -- RLS silently filters the row out — no row matches the policy.
      v_pass := true; v_msg := 'cross-row write silently filtered by RLS (rowcount=0)';
    ELSE
      v_msg := 'cross-row write affected '||v_rowcount||' rows';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = '42501' THEN
      v_pass := true; v_msg := 'rejected by RLS ['||SQLSTATE||']: '||SQLERRM;
    ELSE
      v_msg := 'unexpected ['||SQLSTATE||']: '||SQLERRM;
    END IF;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _a2_results VALUES ('A2.7_cross_row_price_filtered',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

SELECT test_id, status, detail FROM _a2_results ORDER BY test_id;

ROLLBACK;
