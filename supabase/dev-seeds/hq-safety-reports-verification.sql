-- ════════════════════════════════════════════════════════════════════════════
-- Child-safety reporting dev-seed — pairs with
--   supabase/migrations/20260627000001_child_safety_reporting.sql
-- Everything ROLLBACKs at the end — DB state unchanged.
--
-- PASS CRITERIA  Each row ends status = 'PASS'.
--   S.01 (reject)  a non-admin calling admin_list_safety_reports() is 'forbidden'.
--   S.02 (reject)  a normal user's DIRECT SELECT on public.safety_reports exposes
--                  NOTHING (REVOKE ALL → permission denied, or 0 rows).
--   S.03 (happy)   a normal user submit_safety_report() → returns an id and a row
--                  exists (reporter_id=caller, status=open, fields stored; the
--                  subject_user_id is a NON-existent uuid, proving no FK / "from
--                  anywhere").
--   S.04 (happy)   the admin sees that exact row via admin_list_safety_reports().
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- admin (is_admin() matches this email) + a normal student reporter.
DO $$
DECLARE
  adm constant uuid := '5a000000-0000-0000-0000-0000000000a0';
  rep constant uuid := '5a000000-0000-0000-0000-0000000000b0';
BEGIN
  INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
     raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token,
     email_change, email_change_token_new, created_at, updated_at, instance_id) VALUES
    (adm,'authenticated','authenticated','divitfatehpuria7@gmail.com',crypt('x',gen_salt('bf')),now(),
     '{"provider":"email"}'::jsonb,
     '{"role":"student","full_name":"Admin","phone":"+91","school":"S","grade":"Grade 12","date_of_birth":"1990-01-01"}'::jsonb,
     '','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
    (rep,'authenticated','authenticated','reporter@cs.local',crypt('x',gen_salt('bf')),now(),
     '{"provider":"email"}'::jsonb,
     '{"role":"student","full_name":"Reporter","phone":"+91","school":"S","grade":"Grade 9","date_of_birth":"2010-01-01"}'::jsonb,
     '','','','',now(),now(),'00000000-0000-0000-0000-000000000000')
  ON CONFLICT (id) DO NOTHING;
END $$;

CREATE TEMP TABLE _cs (test_id text PRIMARY KEY, status text NOT NULL, detail text NOT NULL);

-- ─── S.01 (reject): non-admin calls admin_list_safety_reports() → forbidden ──
DO $$
DECLARE v_blocked bool := false;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"5a000000-0000-0000-0000-0000000000b0","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.admin_list_safety_reports();
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE '%forbidden%' THEN v_blocked := true; END IF;
  END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _cs VALUES ('S.01_nonadmin_list_forbidden',
    CASE WHEN v_blocked THEN 'PASS' ELSE 'FAIL' END,
    'non-admin admin_list_safety_reports blocked='||v_blocked||' (expect true)');
END $$;

-- ─── S.02 (reject): normal user direct SELECT exposes nothing ───────────────
DO $$
DECLARE v_blocked bool := false; v_exposed int := -1;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"5a000000-0000-0000-0000-0000000000b0","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    SELECT count(*) INTO v_exposed FROM public.safety_reports;
  EXCEPTION WHEN insufficient_privilege THEN
    v_blocked := true;
  END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _cs VALUES ('S.02_direct_select_exposes_nothing',
    CASE WHEN v_blocked OR v_exposed = 0 THEN 'PASS' ELSE 'FAIL' END,
    'blocked='||v_blocked||' rows_visible='||v_exposed||' (expect blocked=true or rows=0)');
END $$;

-- ─── S.03 (happy): user submit_safety_report() → returns id, row exists ─────
DO $$
DECLARE
  rep     constant uuid := '5a000000-0000-0000-0000-0000000000b0';
  subj    constant uuid := '5a000000-0000-0000-0000-0000000000c0'; -- NOT a real user (proves no FK)
  v_id    uuid;
  r       public.safety_reports%ROWTYPE;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"5a000000-0000-0000-0000-0000000000b0","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_id := public.submit_safety_report('grooming', '  he asked me to move to another app  ', subj, NULL);
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);

  SELECT * INTO r FROM public.safety_reports WHERE id = v_id;
  INSERT INTO _cs VALUES ('S.03_submit_creates_row',
    CASE WHEN v_id IS NOT NULL
          AND r.reporter_id = rep
          AND r.subject_user_id = subj
          AND r.category = 'grooming'
          AND r.status = 'open'
          AND r.body = 'he asked me to move to another app'  -- trimmed
         THEN 'PASS' ELSE 'FAIL' END,
    'id='||coalesce(v_id::text,'NULL')||' reporter_ok='||(r.reporter_id = rep)::text||
    ' subject_stored='||(r.subject_user_id = subj)::text||' status='||coalesce(r.status,'∅')||
    ' body_trimmed='||(r.body = 'he asked me to move to another app')::text);
END $$;

-- ─── S.04 (happy): admin sees that row via admin_list_safety_reports() ──────
DO $$
DECLARE v_seen int;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"5a000000-0000-0000-0000-0000000000a0","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO v_seen
  FROM public.admin_list_safety_reports()
  WHERE reporter_id = '5a000000-0000-0000-0000-0000000000b0' AND category = 'grooming';
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _cs VALUES ('S.04_admin_lists_report',
    CASE WHEN v_seen = 1 THEN 'PASS' ELSE 'FAIL' END,
    'admin sees submitted report count='||v_seen||' (expect 1)');
END $$;

SELECT test_id, status, detail FROM _cs ORDER BY test_id;

ROLLBACK;
