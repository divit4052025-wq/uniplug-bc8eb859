-- ════════════════════════════════════════════════════════════════════════════
-- G6 dispute RPCs dev-seed: open_dispute (party gate) + admin_list_disputes.
-- ════════════════════════════════════════════════════════════════════════════
--
-- WHAT THIS FILE IS
--   Runnable rejection + happy-path tests for the additive LOCAL functions
--   public.open_dispute(uuid,text) and public.admin_list_disputes(), drafted
--   against the existing public.disputes table
--   (supabase/migrations/20260523000007_g_schema_bulk.sql:235). Everything
--   ROLLBACKs at the end — DB state unchanged.
--
-- PASS CRITERIA  Each test row ends with status = 'PASS'.
--   D1 (reject)  a NON-party (uninvolved student) calls open_dispute → raises.
--   D2 (happy)   the booking's STUDENT calls open_dispute → returns an id; a
--                disputes row exists with status='open', opened_by=student,
--                booking_id set, reason trimmed; admin_list_disputes() returns it.
--   D3 (reject)  the MENTOR party opens a SECOND dispute on the same booking
--                while the first is still open → raises (duplicate-active guard).
--   D4 (reject)  a NON-admin (the party student) calls admin_list_disputes →
--                raises 'forbidden'.
--   D5 (revoke)  anon has no EXECUTE on either function.
--
-- Per-test callers are switched via SET LOCAL ROLE authenticated +
-- set_config('request.jwt.claims', {sub,role}) so auth.uid()/is_admin() resolve
-- exactly as for a signed-in user. Admin identity = is_admin()'s email
-- (divitfatehpuria7@gmail.com), set on the adm user below.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

DO $$
DECLARE
  m_a constant uuid := '11111111-1111-1111-1111-1111110d06a1';  -- mentor (party)
  s_a constant uuid := '22222222-2222-2222-2222-2222220d06a1';  -- student (party)
  s_b constant uuid := '22222222-2222-2222-2222-2222220d06b1';  -- student (NON-party)
  adm constant uuid := '22222222-2222-2222-2222-2222220d06ad';  -- admin (is_admin email)
  bk  constant uuid := '33333333-3333-3333-3333-3333330d06a1';  -- the booking
  v_future date := ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date + 7);
BEGIN
  INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
     raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token,
     email_change, email_change_token_new, created_at, updated_at, instance_id) VALUES
    (m_a,'authenticated','authenticated','m_a@g6d.local',crypt('pw',gen_salt('bf')),now(),
     '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','mentor','full_name','Mentor G6','university','T','course','T','year','2nd Year','date_of_birth','2000-01-01'),
     '','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
    (s_a,'authenticated','authenticated','s_a@g6d.local',crypt('pw',gen_salt('bf')),now(),
     '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','student','full_name','Student A G6','phone','+91-0','school','T','grade','Undergraduate'),
     '','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
    (s_b,'authenticated','authenticated','s_b@g6d.local',crypt('pw',gen_salt('bf')),now(),
     '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','student','full_name','Student B G6','phone','+91-0','school','T','grade','Undergraduate'),
     '','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
    (adm,'authenticated','authenticated','divitfatehpuria7@gmail.com',crypt('pw',gen_salt('bf')),now(),
     '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','student','full_name','Admin G6','phone','+91-0','school','T','grade','Undergraduate'),
     '','','','',now(),now(),'00000000-0000-0000-0000-000000000000');

  UPDATE public.mentors SET status='approved', price_inr=2000 WHERE id=m_a;

  -- The booking under dispute: student s_a with mentor m_a.
  INSERT INTO public.bookings (id, mentor_id, student_id, date, time_slot, duration, price, status)
  VALUES (bk, m_a, s_a, v_future, '10:00', 60, 2000, 'confirmed');
END $$;

CREATE TEMP TABLE _d (
  test_id text PRIMARY KEY,
  status  text NOT NULL CHECK (status IN ('PASS','FAIL')),
  detail  text NOT NULL
);

-- ─── D1: NON-party calls open_dispute → rejected ────────────────────────────
DO $$
DECLARE
  s_b constant uuid := '22222222-2222-2222-2222-2222220d06b1';
  bk  constant uuid := '33333333-3333-3333-3333-3333330d06a1';
  v_blocked boolean := false;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', s_b, 'role','authenticated')::text, true);
  BEGIN
    PERFORM public.open_dispute(bk, 'mentor never showed up');
  EXCEPTION WHEN insufficient_privilege OR raise_exception OR unique_violation OR check_violation THEN
    v_blocked := true;
  END;
  RESET ROLE;
  INSERT INTO _d VALUES ('D1_nonparty_open_rejected',
    CASE WHEN v_blocked THEN 'PASS' ELSE 'FAIL' END,
    'non-party open_dispute blocked='||v_blocked::text);
END $$;

-- ─── D2: party STUDENT opens dispute → row open + admin sees it ──────────────
DO $$
DECLARE
  s_a constant uuid := '22222222-2222-2222-2222-2222220d06a1';
  adm constant uuid := '22222222-2222-2222-2222-2222220d06ad';
  bk  constant uuid := '33333333-3333-3333-3333-3333330d06a1';
  v_id uuid;
  v_status text; v_opened_by uuid; v_booking uuid; v_reason text;
  v_row_ok boolean := false; v_admin_sees boolean := false;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', s_a, 'role','authenticated')::text, true);
  v_id := public.open_dispute(bk, '  mentor cancelled last-minute  ');
  RESET ROLE;

  SELECT status, opened_by, booking_id, reason
    INTO v_status, v_opened_by, v_booking, v_reason
    FROM public.disputes WHERE id = v_id;
  v_row_ok := (v_id IS NOT NULL AND v_status='open' AND v_opened_by=s_a
               AND v_booking=bk AND v_reason='mentor cancelled last-minute');

  -- admin lists disputes and should see the new id
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', adm, 'role','authenticated')::text, true);
  SELECT EXISTS (SELECT 1 FROM public.admin_list_disputes() WHERE id = v_id)
    INTO v_admin_sees;
  RESET ROLE;

  INSERT INTO _d VALUES ('D2_party_open_and_admin_sees',
    CASE WHEN v_row_ok AND v_admin_sees THEN 'PASS' ELSE 'FAIL' END,
    'status='||coalesce(v_status,'<null>')||' opened_by_match='||(v_opened_by=s_a)::text||
    ' reason_trimmed='||(v_reason='mentor cancelled last-minute')::text||
    ' admin_sees='||v_admin_sees::text);
END $$;

-- ─── D3: MENTOR party opens a 2nd dispute on same booking → rejected ─────────
DO $$
DECLARE
  m_a constant uuid := '11111111-1111-1111-1111-1111110d06a1';
  bk  constant uuid := '33333333-3333-3333-3333-3333330d06a1';
  v_blocked boolean := false;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', m_a, 'role','authenticated')::text, true);
  BEGIN
    PERFORM public.open_dispute(bk, 'I dispute this session too');
  EXCEPTION WHEN unique_violation OR raise_exception OR insufficient_privilege OR check_violation THEN
    v_blocked := true;
  END;
  RESET ROLE;
  INSERT INTO _d VALUES ('D3_duplicate_active_rejected',
    CASE WHEN v_blocked THEN 'PASS' ELSE 'FAIL' END,
    'second open on same booking blocked='||v_blocked::text);
END $$;

-- ─── D4: NON-admin calls admin_list_disputes → forbidden ────────────────────
DO $$
DECLARE
  s_a constant uuid := '22222222-2222-2222-2222-2222220d06a1';
  v_blocked boolean := false;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', s_a, 'role','authenticated')::text, true);
  BEGIN
    PERFORM count(*) FROM public.admin_list_disputes();
  EXCEPTION WHEN raise_exception OR insufficient_privilege THEN
    v_blocked := true;
  END;
  RESET ROLE;
  INSERT INTO _d VALUES ('D4_nonadmin_list_rejected',
    CASE WHEN v_blocked THEN 'PASS' ELSE 'FAIL' END,
    'non-admin admin_list_disputes blocked='||v_blocked::text);
END $$;

-- ─── D5: anon has no EXECUTE on either function ──────────────────────────────
DO $$
DECLARE v_open boolean; v_list boolean; v_pass boolean;
BEGIN
  v_open := has_function_privilege('anon', 'public.open_dispute(uuid,text)', 'execute');
  v_list := has_function_privilege('anon', 'public.admin_list_disputes()', 'execute');
  v_pass := (NOT v_open AND NOT v_list);
  INSERT INTO _d VALUES ('D5_anon_no_execute',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END,
    'anon open_dispute='||v_open::text||' admin_list_disputes='||v_list::text||' (both expect false)');
END $$;

-- ─── Per-test report ────────────────────────────────────────────────────────
SELECT test_id, status, detail FROM _d ORDER BY test_id;

-- ─── Overall verdict (single PASS/FAIL row) ─────────────────────────────────
SELECT
  CASE WHEN count(*) FILTER (WHERE status='FAIL') = 0 THEN 'PASS' ELSE 'FAIL' END AS overall,
  count(*) FILTER (WHERE status='PASS') AS passed,
  count(*) FILTER (WHERE status='FAIL') AS failed
FROM _d;

ROLLBACK;
