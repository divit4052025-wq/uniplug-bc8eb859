-- ════════════════════════════════════════════════════════════════════════════
-- V1 video calls dev-seed: authorize_video_join + RLS-locked video tables
-- ════════════════════════════════════════════════════════════════════════════
--
-- WHAT THIS FILE IS
--   Runnable rejection + happy-path tests for the join-authorization gate
--   public.authorize_video_join() and the RLS posture of public.video_rooms /
--   public.video_join_audit, introduced in migration
--     20260530000003_video_calls.sql
--
--   Everything ROLLBACKs at the end — DB state unchanged.
--
-- PASS CRITERIA
--   Each test row ends with status = 'PASS'. A 'FAIL' means a real caller could
--   obtain a Daily meeting token they should not — i.e. a non-participant could
--   join a minor's 1:1 call, or a call could be joined outside its booked
--   window / when cancelled, or the RLS-locked tables leak to clients.
--
-- COVERAGE
--   V.1  student participant            → role='student'      (happy)
--   V.2  mentor participant             → role='mentor'       (happy)
--   V.3  third-party (other student)    → not_a_participant   (the 403 gate)
--   V.4  cancelled booking              → not_joinable_status
--   V.5  outside the time window        → outside_window
--   V.6  unknown booking id             → booking_not_found
--   V.7  anon EXECUTE on the RPC        → revoked
--   V.8  authenticated SELECT video_rooms      → denied (RLS-locked)
--   V.9  authenticated INSERT video_rooms      → denied (RLS-locked)
--   V.10 authenticated SELECT video_join_audit → denied (RLS-locked)
--   V.11 completed booking              → not_joinable_status
--   V.12 authenticated caller, no sub   → authentication required (401)
--   V.13 service_role caller (no sub)   → authentication required (401)
--   V.14 authenticated UPDATE video_rooms      → denied (RLS-locked)
--   V.15 authenticated DELETE video_join_audit → denied (immutable)
--   V.16 pathological duration          → window_end CLAMPED (bounded token)
--   V.17 orphan booking (NULL student)  → not_a_participant  (null-safety)
--   V.18 audit row vs booking+user delete → survives (FK-less durable ledger)
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

DO $$
DECLARE
  m_a constant uuid := '11111111-1111-1111-1111-1111110c0001';  -- matched mentor
  m_b constant uuid := '11111111-1111-1111-1111-1111110c0002';  -- 2nd mentor (clamp-test booking)
  s_a constant uuid := '22222222-2222-2222-2222-2222220c0001';  -- booked student (participant)
  s_b constant uuid := '22222222-2222-2222-2222-2222220c0002';  -- other student (NON-participant)
  b_join      constant uuid := '33333333-3333-3333-3333-3333330c0001';  -- confirmed, in-window
  b_cancelled constant uuid := '33333333-3333-3333-3333-3333330c0002';  -- cancelled
  b_past      constant uuid := '33333333-3333-3333-3333-3333330c0003';  -- confirmed, past (outside window)
  b_completed constant uuid := '33333333-3333-3333-3333-3333330c0004';  -- completed
  b_huge      constant uuid := '33333333-3333-3333-3333-3333330c0005';  -- confirmed, in-window, pathological duration
  b_orphan    constant uuid := '33333333-3333-3333-3333-3333330c0006';  -- confirmed, in-window, NULL student_id
  v_today date := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date;
  v_yest  date := ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date - 1);
  v_now_hh   text := to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata', 'HH24:00');
  v_other_hh text := to_char((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata') + interval '3 hours', 'HH24:00');
  v_third_hh text := to_char((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata') + interval '5 hours', 'HH24:00');
BEGIN
  -- NOTE: bookings.student_id / mentor_id are NULLABLE in the live schema (FK
  -- ON DELETE SET NULL), so a participant deletion can ORPHAN a booking. V.17
  -- proves the gate's null-safety: SQL "v_caller = NULL" is never true, so a
  -- NULL participant id can never be matched and the caller gets not_a_participant.
  --
  -- Two mentors + two students. handle_new_user cascades public.mentors /
  -- public.students rows from raw_user_meta_data.role.
  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    created_at, updated_at, instance_id
  ) VALUES
    (m_a, 'authenticated', 'authenticated', 'm_a@vid.local',
     crypt('pw', gen_salt('bf')), now(), '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','mentor','full_name','Matched M','university','T','course','T','year','2nd Year'),
     '', '', '', '', now(), now(), '00000000-0000-0000-0000-000000000000'),
    (m_b, 'authenticated', 'authenticated', 'm_b@vid.local',
     crypt('pw', gen_salt('bf')), now(), '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','mentor','full_name','Second M','university','T','course','T','year','2nd Year'),
     '', '', '', '', now(), now(), '00000000-0000-0000-0000-000000000000'),
    (s_a, 'authenticated', 'authenticated', 's_a@vid.local',
     crypt('pw', gen_salt('bf')), now(), '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','student','full_name','Booked S','phone','+91-0','school','T','grade','Grade 11'),
     '', '', '', '', now(), now(), '00000000-0000-0000-0000-000000000000'),
    (s_b, 'authenticated', 'authenticated', 's_b@vid.local',
     crypt('pw', gen_salt('bf')), now(), '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','student','full_name','Other S','phone','+91-0','school','T','grade','Grade 11'),
     '', '', '', '', now(), now(), '00000000-0000-0000-0000-000000000000');

  -- Bookings inserted directly as service_role (bypasses the consent gate and
  -- book_session availability checks — we are testing the JOIN gate, not the
  -- booking gate). All for student s_a with mentor m_a.
  --   * b_join: today at the current IST hour → now() is inside [start−10m, end+15m].
  --   * b_cancelled: today, a different hour, status cancelled.
  --   * b_past: yesterday → window long closed.
  --   * b_completed: today, status completed → not_joinable_status.
  --   * b_huge: mentor m_b (so it does not collide with b_join's slot), today at
  --     the current hour, pathological duration → window_end must be CLAMPED.
  INSERT INTO public.bookings (id, mentor_id, student_id, date, time_slot, duration, price, status) VALUES
    (b_join,      m_a, s_a, v_today, v_now_hh,   60,     0, 'confirmed'),
    (b_cancelled, m_a, s_a, v_today, v_other_hh, 60,     0, 'cancelled'),
    (b_past,      m_a, s_a, v_yest,  '14:00',    60,     0, 'confirmed'),
    (b_completed, m_a, s_a, v_today, v_third_hh, 60,     0, 'completed'),
    (b_huge,      m_b, s_a, v_today, v_now_hh,   100000, 0, 'confirmed');

  -- b_orphan: confirmed, in-window, but student_id NULL (simulates a deleted
  -- student). Inserted separately so the NULL is explicit. m_b avoids colliding
  -- with b_huge's slot in the partial unique index.
  INSERT INTO public.bookings (id, mentor_id, student_id, date, time_slot, duration, price, status)
  VALUES (b_orphan, m_b, NULL, v_today, v_other_hh, 60, 0, 'confirmed');
END $$;

CREATE TEMP TABLE _vid_results (
  test_id text PRIMARY KEY,
  status  text NOT NULL,
  detail  text NOT NULL
);

-- ─── V.1: student participant → role='student' (HAPPY) ──────────────────────
DO $$
DECLARE
  v_pass boolean := false; v_msg text := '';
  v_role text; v_we timestamptz;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"22222222-2222-2222-2222-2222220c0001","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    SELECT av.role, av.window_end INTO v_role, v_we
      FROM public.authorize_video_join('33333333-3333-3333-3333-3333330c0001'::uuid) av;
    IF v_role = 'student' AND v_we IS NOT NULL THEN
      v_pass := true; v_msg := 'role=student, window_end='||v_we;
    ELSE
      v_msg := 'returned but wrong: role='||coalesce(v_role,'NULL');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_msg := 'unexpected denial ['||SQLSTATE||']: '||SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _vid_results VALUES ('V.1_student_participant_allow',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── V.2: mentor participant → role='mentor' (HAPPY) ────────────────────────
DO $$
DECLARE
  v_pass boolean := false; v_msg text := '';
  v_role text; v_we timestamptz;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-1111110c0001","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    SELECT av.role, av.window_end INTO v_role, v_we
      FROM public.authorize_video_join('33333333-3333-3333-3333-3333330c0001'::uuid) av;
    IF v_role = 'mentor' AND v_we IS NOT NULL THEN
      v_pass := true; v_msg := 'role=mentor, window_end='||v_we;
    ELSE
      v_msg := 'returned but wrong: role='||coalesce(v_role,'NULL');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_msg := 'unexpected denial ['||SQLSTATE||']: '||SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _vid_results VALUES ('V.2_mentor_participant_allow',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── V.3: third party (other student) → not_a_participant (THE 403 GATE) ────
DO $$
DECLARE
  v_pass boolean := false; v_msg text := '';
  v_role text; v_we timestamptz;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"22222222-2222-2222-2222-2222220c0002","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    SELECT av.role, av.window_end INTO v_role, v_we
      FROM public.authorize_video_join('33333333-3333-3333-3333-3333330c0001'::uuid) av;
    v_msg := 'NON-PARTICIPANT AUTHORIZED as role='||coalesce(v_role,'NULL');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE '%not_a_participant%' THEN
      v_pass := true; v_msg := 'rejected ['||SQLSTATE||']: '||SQLERRM;
    ELSE
      v_msg := 'wrong reject ['||SQLSTATE||']: '||SQLERRM;
    END IF;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _vid_results VALUES ('V.3_non_participant_reject',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── V.4: cancelled booking → not_joinable_status ───────────────────────────
DO $$
DECLARE
  v_pass boolean := false; v_msg text := '';
  v_role text; v_we timestamptz;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"22222222-2222-2222-2222-2222220c0001","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    SELECT av.role, av.window_end INTO v_role, v_we
      FROM public.authorize_video_join('33333333-3333-3333-3333-3333330c0002'::uuid) av;
    v_msg := 'cancelled booking AUTHORIZED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE '%not_joinable_status%' THEN
      v_pass := true; v_msg := 'rejected ['||SQLSTATE||']: '||SQLERRM;
    ELSE
      v_msg := 'wrong reject ['||SQLSTATE||']: '||SQLERRM;
    END IF;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _vid_results VALUES ('V.4_cancelled_reject',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── V.5: outside the time window (past booking) → outside_window ───────────
DO $$
DECLARE
  v_pass boolean := false; v_msg text := '';
  v_role text; v_we timestamptz;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"22222222-2222-2222-2222-2222220c0001","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    SELECT av.role, av.window_end INTO v_role, v_we
      FROM public.authorize_video_join('33333333-3333-3333-3333-3333330c0003'::uuid) av;
    v_msg := 'past booking AUTHORIZED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE '%outside_window%' THEN
      v_pass := true; v_msg := 'rejected ['||SQLSTATE||']: '||SQLERRM;
    ELSE
      v_msg := 'wrong reject ['||SQLSTATE||']: '||SQLERRM;
    END IF;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _vid_results VALUES ('V.5_outside_window_reject',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── V.6: unknown booking id → booking_not_found ────────────────────────────
DO $$
DECLARE
  v_pass boolean := false; v_msg text := '';
  v_role text; v_we timestamptz;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"22222222-2222-2222-2222-2222220c0001","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    SELECT av.role, av.window_end INTO v_role, v_we
      FROM public.authorize_video_join('00000000-0000-0000-0000-0000000000ff'::uuid) av;
    v_msg := 'unknown booking AUTHORIZED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE '%booking_not_found%' THEN
      v_pass := true; v_msg := 'rejected ['||SQLSTATE||']: '||SQLERRM;
    ELSE
      v_msg := 'wrong reject ['||SQLSTATE||']: '||SQLERRM;
    END IF;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _vid_results VALUES ('V.6_booking_not_found_reject',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── V.7: anon EXECUTE on authorize_video_join → revoked ────────────────────
--          Privilege-table check (same approach as book-session A1.6; avoids a
--          hard role-switch connection drop on the local-dev Postgres image).
DO $$
DECLARE
  v_pass boolean := false; v_msg text := '';
  v_anon_can_exec boolean;
BEGIN
  v_anon_can_exec := has_function_privilege(
    'anon', 'public.authorize_video_join(uuid)', 'execute');
  IF v_anon_can_exec THEN
    v_msg := 'anon has EXECUTE on authorize_video_join — should be revoked';
  ELSE
    v_pass := true; v_msg := 'anon has no EXECUTE (REVOKE in effect)';
  END IF;
  INSERT INTO _vid_results VALUES ('V.7_anon_execute_revoked',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── V.8: authenticated SELECT on video_rooms → denied (RLS-locked) ─────────
DO $$
DECLARE
  v_pass boolean := false; v_msg text := '';
  v_n int;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"22222222-2222-2222-2222-2222220c0001","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    SELECT count(*) INTO v_n FROM public.video_rooms;
    v_msg := 'authenticated SELECT on video_rooms ALLOWED (count='||v_n||')';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = '42501' THEN
      v_pass := true; v_msg := 'denied ['||SQLSTATE||']: '||SQLERRM;
    ELSE
      v_msg := 'unexpected ['||SQLSTATE||']: '||SQLERRM;
    END IF;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _vid_results VALUES ('V.8_video_rooms_select_denied',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── V.9: authenticated INSERT into video_rooms → denied (RLS-locked) ───────
DO $$
DECLARE
  v_pass boolean := false; v_msg text := '';
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"22222222-2222-2222-2222-2222220c0001","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    INSERT INTO public.video_rooms (booking_id, daily_room_name, daily_room_url)
    VALUES ('33333333-3333-3333-3333-3333330c0001'::uuid, 'sneaky-room', 'https://x.daily.co/sneaky');
    v_msg := 'authenticated INSERT into video_rooms ALLOWED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = '42501' THEN
      v_pass := true; v_msg := 'denied ['||SQLSTATE||']: '||SQLERRM;
    ELSE
      v_msg := 'unexpected ['||SQLSTATE||']: '||SQLERRM;
    END IF;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _vid_results VALUES ('V.9_video_rooms_insert_denied',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── V.10: authenticated SELECT on video_join_audit → denied (RLS-locked) ───
DO $$
DECLARE
  v_pass boolean := false; v_msg text := '';
  v_n int;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"22222222-2222-2222-2222-2222220c0001","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    SELECT count(*) INTO v_n FROM public.video_join_audit;
    v_msg := 'authenticated SELECT on video_join_audit ALLOWED (count='||v_n||')';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = '42501' THEN
      v_pass := true; v_msg := 'denied ['||SQLSTATE||']: '||SQLERRM;
    ELSE
      v_msg := 'unexpected ['||SQLSTATE||']: '||SQLERRM;
    END IF;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _vid_results VALUES ('V.10_video_join_audit_select_denied',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── V.11: completed booking → not_joinable_status ──────────────────────────
DO $$
DECLARE
  v_pass boolean := false; v_msg text := '';
  v_role text; v_we timestamptz;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"22222222-2222-2222-2222-2222220c0001","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    SELECT av.role, av.window_end INTO v_role, v_we
      FROM public.authorize_video_join('33333333-3333-3333-3333-3333330c0004'::uuid) av;
    v_msg := 'completed booking AUTHORIZED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE '%not_joinable_status%' THEN
      v_pass := true; v_msg := 'rejected ['||SQLSTATE||']: '||SQLERRM;
    ELSE
      v_msg := 'wrong reject ['||SQLSTATE||']: '||SQLERRM;
    END IF;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _vid_results VALUES ('V.11_completed_reject',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── V.12: authenticated caller with NO sub (auth.uid() NULL) → 401 ──────────
DO $$
DECLARE
  v_pass boolean := false; v_msg text := '';
  v_role text; v_we timestamptz;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"authenticated"}', true);  -- no sub
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    SELECT av.role, av.window_end INTO v_role, v_we
      FROM public.authorize_video_join('33333333-3333-3333-3333-3333330c0001'::uuid) av;
    v_msg := 'null-caller AUTHORIZED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE '%authentication required%' OR SQLSTATE = '42501' THEN
      v_pass := true; v_msg := 'rejected ['||SQLSTATE||']: '||SQLERRM;
    ELSE
      v_msg := 'wrong reject ['||SQLSTATE||']: '||SQLERRM;
    END IF;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _vid_results VALUES ('V.12_null_caller_reject',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── V.13: service_role caller (no sub) → 401 (cannot be a participant) ──────
--          The server calls the gate via the USER's JWT client, never as
--          service_role. This proves a service_role context (auth.uid() NULL)
--          is not silently authorized as a participant.
DO $$
DECLARE
  v_pass boolean := false; v_msg text := '';
  v_role text; v_we timestamptz;
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);  -- no sub
  BEGIN
    SELECT av.role, av.window_end INTO v_role, v_we
      FROM public.authorize_video_join('33333333-3333-3333-3333-3333330c0001'::uuid) av;
    v_msg := 'service_role caller AUTHORIZED as '||coalesce(v_role,'NULL');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE '%authentication required%' OR SQLSTATE = '42501' THEN
      v_pass := true; v_msg := 'rejected ['||SQLSTATE||']: '||SQLERRM;
    ELSE
      v_msg := 'wrong reject ['||SQLSTATE||']: '||SQLERRM;
    END IF;
  END;
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _vid_results VALUES ('V.13_service_role_caller_reject',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── V.14: authenticated UPDATE on video_rooms → denied (RLS-locked) ─────────
DO $$
DECLARE
  v_pass boolean := false; v_msg text := '';
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"22222222-2222-2222-2222-2222220c0001","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    UPDATE public.video_rooms SET daily_room_url = 'https://x.daily.co/tamper';
    v_msg := 'authenticated UPDATE on video_rooms ALLOWED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = '42501' THEN
      v_pass := true; v_msg := 'denied ['||SQLSTATE||']: '||SQLERRM;
    ELSE
      v_msg := 'unexpected ['||SQLSTATE||']: '||SQLERRM;
    END IF;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _vid_results VALUES ('V.14_video_rooms_update_denied',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── V.15: authenticated DELETE on video_join_audit → denied (immutable) ─────
DO $$
DECLARE
  v_pass boolean := false; v_msg text := '';
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"22222222-2222-2222-2222-2222220c0001","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    DELETE FROM public.video_join_audit;
    v_msg := 'authenticated DELETE on video_join_audit ALLOWED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = '42501' THEN
      v_pass := true; v_msg := 'denied ['||SQLSTATE||']: '||SQLERRM;
    ELSE
      v_msg := 'unexpected ['||SQLSTATE||']: '||SQLERRM;
    END IF;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _vid_results VALUES ('V.15_video_join_audit_delete_denied',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── V.16: pathological duration → window_end is CLAMPED (bounded token) ─────
--          b_huge has duration 100000 min. Without the gate's LEAST(...,120)
--          clamp, window_end would be ~69 days out (a token valid for weeks).
--          With the clamp it must be within ~2h15m of now.
DO $$
DECLARE
  v_pass boolean := false; v_msg text := '';
  v_role text; v_we timestamptz;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"22222222-2222-2222-2222-2222220c0001","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    SELECT av.role, av.window_end INTO v_role, v_we
      FROM public.authorize_video_join('33333333-3333-3333-3333-3333330c0005'::uuid) av;
    IF v_role = 'student' AND v_we > now() AND v_we <= now() + interval '3 hours' THEN
      v_pass := true; v_msg := 'clamped: window_end='||v_we||' (<= now()+3h)';
    ELSE
      v_msg := 'window_end NOT clamped: '||coalesce(v_we::text,'NULL');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_msg := 'unexpected denial ['||SQLSTATE||']: '||SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _vid_results VALUES ('V.16_duration_clamp_bounds_window',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── V.17: orphan booking (NULL student_id) → not_a_participant ─────────────
--          Proves the gate's null-safety: a NULL participant id can never equal
--          auth.uid(). (Participation is checked before the window, so the null
--          student is the operative rejection here.)
DO $$
DECLARE
  v_pass boolean := false; v_msg text := '';
  v_role text; v_we timestamptz;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"22222222-2222-2222-2222-2222220c0001","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    SELECT av.role, av.window_end INTO v_role, v_we
      FROM public.authorize_video_join('33333333-3333-3333-3333-3333330c0006'::uuid) av;
    v_msg := 'orphan (NULL student) booking AUTHORIZED as '||coalesce(v_role,'NULL');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE '%not_a_participant%' THEN
      v_pass := true; v_msg := 'rejected ['||SQLSTATE||']: '||SQLERRM;
    ELSE
      v_msg := 'wrong reject ['||SQLSTATE||']: '||SQLERRM;
    END IF;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _vid_results VALUES ('V.17_orphan_null_student_reject',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── V.18: audit row SURVIVES deletion of its booking + user (durable ledger) ─
--          The FK-less design means deleting the booking and the user account
--          must NOT cascade-delete the safeguarding record. Runs in service_role
--          context (RLS bypassed) to write the row and perform the deletions.
DO $$
DECLARE
  v_pass boolean := false; v_msg text := '';
  v_cnt int;
BEGIN
  BEGIN
    INSERT INTO public.video_join_audit (booking_id, user_id, role, token_exp)
    VALUES ('33333333-3333-3333-3333-3333330c0001'::uuid,
            '22222222-2222-2222-2222-2222220c0001'::uuid,
            'student', now() + interval '1 hour');

    DELETE FROM public.bookings WHERE id = '33333333-3333-3333-3333-3333330c0001'::uuid;
    DELETE FROM auth.users      WHERE id = '22222222-2222-2222-2222-2222220c0001'::uuid;

    SELECT count(*) INTO v_cnt
      FROM public.video_join_audit
     WHERE booking_id = '33333333-3333-3333-3333-3333330c0001'::uuid
       AND user_id    = '22222222-2222-2222-2222-2222220c0001'::uuid;

    IF v_cnt = 1 THEN
      v_pass := true; v_msg := 'audit row survived booking + user deletion (no FK cascade)';
    ELSE
      v_msg := 'audit row LOST after deletion (count='||v_cnt||') — FK cascade?';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Isolated so a deletion-privilege/FK hiccup can't abort the whole suite.
    v_msg := 'durability check errored ['||SQLSTATE||']: '||SQLERRM;
  END;
  INSERT INTO _vid_results VALUES ('V.18_audit_survives_deletion',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

SELECT test_id, status, detail FROM _vid_results ORDER BY test_id;

ROLLBACK;
