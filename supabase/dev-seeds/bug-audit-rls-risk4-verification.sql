-- ════════════════════════════════════════════════════════════════════════════
-- Bug audit dev-seed: RLS Risk 4 (booking requires approved mentor)
-- ════════════════════════════════════════════════════════════════════════════
--
-- WHAT THIS FILE IS
--   Runnable rejection + happy-path tests for the tightened bookings INSERT
--   policy in migration
--   20260514100002_rls_risk4_bookings_require_approved_mentor.sql.
--   Everything ROLLBACKs at the end — DB state unchanged.
--
-- PASS CRITERIA
--   Each test row ends with status = 'PASS'. Any 'FAIL' means a real
--   attacker could still create bookings against unapproved mentors.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

DO $$
DECLARE
  m_p constant uuid := '11111111-1111-1111-1111-1111111104a1';  -- pending
  m_a constant uuid := '11111111-1111-1111-1111-1111111104a2';  -- approved
  m_r constant uuid := '11111111-1111-1111-1111-1111111104a3';  -- rejected
  s_x constant uuid := '22222222-2222-2222-2222-2222222204a1';
BEGIN
  -- Three mentors (one per status) and one student
  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    created_at, updated_at, instance_id
  ) VALUES
    (m_p, 'authenticated', 'authenticated', 'm_p@uniplug-r4.local',
     crypt('pw', gen_salt('bf')), now(), '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','mentor','full_name','Pending M','university','T','course','T','year','2nd Year'),
     '', '', '', '', now(), now(), '00000000-0000-0000-0000-000000000000'),
    (m_a, 'authenticated', 'authenticated', 'm_a@uniplug-r4.local',
     crypt('pw', gen_salt('bf')), now(), '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','mentor','full_name','Approved M','university','T','course','T','year','2nd Year'),
     '', '', '', '', now(), now(), '00000000-0000-0000-0000-000000000000'),
    (m_r, 'authenticated', 'authenticated', 'm_r@uniplug-r4.local',
     crypt('pw', gen_salt('bf')), now(), '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','mentor','full_name','Rejected M','university','T','course','T','year','2nd Year'),
     '', '', '', '', now(), now(), '00000000-0000-0000-0000-000000000000'),
    (s_x, 'authenticated', 'authenticated', 's_x@uniplug-r4.local',
     crypt('pw', gen_salt('bf')), now(), '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','student','full_name','Student X','phone','+91-0','school','T','grade','Grade 11'),
     '', '', '', '', now(), now(), '00000000-0000-0000-0000-000000000000');

  UPDATE public.mentors SET status = 'approved' WHERE id = m_a;
  UPDATE public.mentors SET status = 'rejected' WHERE id = m_r;
  -- m_p stays at default 'pending'
END $$;

CREATE TEMP TABLE _r4_results (
  test_id text PRIMARY KEY,
  status  text NOT NULL,
  detail  text NOT NULL
);

-- ─── R4.1: book PENDING mentor → reject ───────────────────────────────────
DO $$
DECLARE v_pass boolean := false; v_msg text := '';
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"22222222-2222-2222-2222-2222222204a1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    INSERT INTO public.bookings (mentor_id, student_id, date, time_slot, status, price)
    VALUES ('11111111-1111-1111-1111-1111111104a1',
            '22222222-2222-2222-2222-2222222204a1',
            '2026-05-20', '14:00', 'confirmed', 500);
    v_msg := 'booking of pending mentor was ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE IN ('42501','P0001') THEN v_pass := true; v_msg := 'denied ['||SQLSTATE||']: '||SQLERRM;
    ELSE v_msg := 'unexpected SQLSTATE '||SQLSTATE||': '||SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _r4_results VALUES ('R4.1_booking_pending_mentor',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── R4.2: book REJECTED mentor → reject ──────────────────────────────────
DO $$
DECLARE v_pass boolean := false; v_msg text := '';
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"22222222-2222-2222-2222-2222222204a1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    INSERT INTO public.bookings (mentor_id, student_id, date, time_slot, status, price)
    VALUES ('11111111-1111-1111-1111-1111111104a3',
            '22222222-2222-2222-2222-2222222204a1',
            '2026-05-21', '14:00', 'confirmed', 500);
    v_msg := 'booking of rejected mentor was ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE IN ('42501','P0001') THEN v_pass := true; v_msg := 'denied ['||SQLSTATE||']: '||SQLERRM;
    ELSE v_msg := 'unexpected SQLSTATE '||SQLSTATE||': '||SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _r4_results VALUES ('R4.2_booking_rejected_mentor',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── R4.3: book APPROVED mentor → succeed ─────────────────────────────────
DO $$
DECLARE v_pass boolean := false; v_msg text := '';
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"22222222-2222-2222-2222-2222222204a1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    INSERT INTO public.bookings (mentor_id, student_id, date, time_slot, status, price)
    VALUES ('11111111-1111-1111-1111-1111111104a2',
            '22222222-2222-2222-2222-2222222204a1',
            '2026-05-22', '14:00', 'confirmed', 500);
    v_pass := true; v_msg := 'booking of approved mentor succeeded';
  EXCEPTION WHEN OTHERS THEN
    v_msg := 'unexpected denial ['||SQLSTATE||']: '||SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _r4_results VALUES ('R4.3_booking_approved_mentor',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

SELECT test_id, status, detail FROM _r4_results ORDER BY test_id;

ROLLBACK;
