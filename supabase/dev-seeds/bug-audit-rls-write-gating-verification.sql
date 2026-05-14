-- ════════════════════════════════════════════════════════════════════════════
-- Bug audit dev-seed: RLS write-gating verification
-- ════════════════════════════════════════════════════════════════════════════
--
-- WHAT THIS FILE IS
--   Runnable rejection + happy-path tests for the policies and trigger added
--   in supabase/migrations/20260514100001_rls_write_gating_hardening.sql.
--   This is NOT a migration.
--
-- HOW IT WORKS
--   The single outer transaction sets up two test mentors and two test
--   students, with a single booking pair (m_a × s_a). Each test DO block
--   switches SET LOCAL ROLE to `authenticated` and sets request.jwt.claims
--   so that auth.uid() returns the test caller. RLS therefore evaluates
--   exactly as for a real signed-in user. After the test, the role is reset
--   to postgres so the result is recorded in a TEMP results table.
--
-- HOW TO RUN
--   Paste into Supabase SQL Editor (or pipe via MCP execute_sql). All
--   changes ROLLBACK at the end — DB state unchanged.
--
-- PASS CRITERIA
--   The final SELECT returns one row per test with status = 'PASS' and a
--   human-readable detail. Any 'FAIL' row means the policy/trigger contract
--   is broken — investigate before merging.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- Setup: 2 mentors, 2 students, 1 booking-pair across two bookings (one
-- confirmed for note tests, one completed for review tests).
-- ─────────────────────────────────────────────────────────────────────────

-- Set jwt role to service_role so any UPDATE in setup bypasses the new
-- self-approval trigger.
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- Stable UUIDs for predictable test wiring
-- m_a / m_b: mentors; s_a / s_b: students
DO $$
DECLARE
  m_a constant uuid := '11111111-1111-1111-1111-1111111100a1';
  m_b constant uuid := '11111111-1111-1111-1111-1111111100b1';
  s_a constant uuid := '22222222-2222-2222-2222-2222222200a1';
  s_b constant uuid := '22222222-2222-2222-2222-2222222200b1';
BEGIN
  -- Create the four auth.users rows. raw_user_meta_data is shaped so the
  -- handle_new_user trigger (Bug 6.2) creates the matching mentors/students rows.
  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    created_at, updated_at, instance_id
  ) VALUES
    (m_a, 'authenticated', 'authenticated', 'm_a@uniplug-rls.local',
     crypt('pw', gen_salt('bf')), now(),
     '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','mentor','full_name','Mentor A','university','Test U','course','Test','year','2nd Year'),
     '', '', '', '', now(), now(), '00000000-0000-0000-0000-000000000000'),
    (m_b, 'authenticated', 'authenticated', 'm_b@uniplug-rls.local',
     crypt('pw', gen_salt('bf')), now(),
     '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','mentor','full_name','Mentor B','university','Test U','course','Test','year','2nd Year'),
     '', '', '', '', now(), now(), '00000000-0000-0000-0000-000000000000'),
    (s_a, 'authenticated', 'authenticated', 's_a@uniplug-rls.local',
     crypt('pw', gen_salt('bf')), now(),
     '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','student','full_name','Student A','phone','+91-0','school','Test School','grade','Grade 11'),
     '', '', '', '', now(), now(), '00000000-0000-0000-0000-000000000000'),
    (s_b, 'authenticated', 'authenticated', 's_b@uniplug-rls.local',
     crypt('pw', gen_salt('bf')), now(),
     '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','student','full_name','Student B','phone','+91-0','school','Test School','grade','Grade 11'),
     '', '', '', '', now(), now(), '00000000-0000-0000-0000-000000000000');

  -- Approve both mentors (service_role bypass already set above).
  UPDATE public.mentors SET status = 'approved' WHERE id IN (m_a, m_b);

  -- Two bookings between m_a × s_a: one confirmed (for note tests),
  -- one completed (for review tests).
  INSERT INTO public.bookings (mentor_id, student_id, date, time_slot, status, price)
  VALUES
    (m_a, s_a, '2026-05-14', '14:00', 'confirmed', 500),
    (m_a, s_a, '2026-05-13', '14:00', 'completed', 500);

  -- Pre-create one session_note authored by m_a for s_a (used by
  -- action_point_completions tests).
  INSERT INTO public.session_notes (id, mentor_id, student_id, summary)
  VALUES ('33333333-3333-3333-3333-333333330001', m_a, s_a, 'seed note');
END $$;

-- Results table
CREATE TEMP TABLE _rls_results (
  test_id text PRIMARY KEY,
  status  text NOT NULL,
  detail  text NOT NULL
);

-- ─────────────────────────────────────────────────────────────────────────
-- R1.1: Mentor A inserts session_note for Student B (no booking) → reject
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_pass boolean := false;
  v_msg  text    := '';
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-1111111100a1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  BEGIN
    INSERT INTO public.session_notes (mentor_id, student_id, summary)
    VALUES ('11111111-1111-1111-1111-1111111100a1', '22222222-2222-2222-2222-2222222200b1', 'forbidden');
    v_msg := 'insert without booking was ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE IN ('42501', 'P0001') THEN
      v_pass := true; v_msg := 'denied [' || SQLSTATE || ']: ' || SQLERRM;
    ELSE
      v_msg := 'unexpected SQLSTATE ' || SQLSTATE || ': ' || SQLERRM;
    END IF;
  END;

  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _rls_results VALUES ('R1.1_note_insert_no_booking',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- R1.2: Mentor A inserts session_note for Student A (has booking) → succeed
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_pass boolean := false;
  v_msg  text    := '';
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-1111111100a1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  BEGIN
    INSERT INTO public.session_notes (mentor_id, student_id, summary)
    VALUES ('11111111-1111-1111-1111-1111111100a1', '22222222-2222-2222-2222-2222222200a1', 'legit');
    v_pass := true; v_msg := 'insert with booking succeeded';
  EXCEPTION WHEN OTHERS THEN
    v_msg := 'unexpected denial [' || SQLSTATE || ']: ' || SQLERRM;
  END;

  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _rls_results VALUES ('R1.2_note_insert_with_booking',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- R1.3: Mentor A updates seed note's student_id to s_b (no booking) → reject
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_pass boolean := false;
  v_msg  text    := '';
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-1111111100a1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  BEGIN
    UPDATE public.session_notes
    SET    student_id = '22222222-2222-2222-2222-2222222200b1'
    WHERE  id = '33333333-3333-3333-3333-333333330001';
    -- If WITH CHECK is correct, this UPDATE raises insufficient_privilege.
    -- If it succeeds, the policy let an unbookable student_id slip through.
    IF FOUND THEN
      v_msg := 'UPDATE to unbookable student_id was ACCEPTED';
    ELSE
      v_msg := 'UPDATE matched 0 rows — USING failed unexpectedly';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE IN ('42501', 'P0001') THEN
      v_pass := true; v_msg := 'denied [' || SQLSTATE || ']: ' || SQLERRM;
    ELSE
      v_msg := 'unexpected SQLSTATE ' || SQLSTATE || ': ' || SQLERRM;
    END IF;
  END;

  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _rls_results VALUES ('R1.3_note_update_no_booking',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- R2.1: Mentor A inserts session_action_point for Student B (no booking) → reject
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_pass boolean := false;
  v_msg  text    := '';
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-1111111100a1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  BEGIN
    INSERT INTO public.session_action_points (note_id, mentor_id, student_id, content)
    VALUES ('33333333-3333-3333-3333-333333330001',
            '11111111-1111-1111-1111-1111111100a1',
            '22222222-2222-2222-2222-2222222200b1',
            'forbidden');
    v_msg := 'insert without booking was ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE IN ('42501', 'P0001') THEN
      v_pass := true; v_msg := 'denied [' || SQLSTATE || ']: ' || SQLERRM;
    ELSE
      v_msg := 'unexpected SQLSTATE ' || SQLSTATE || ': ' || SQLERRM;
    END IF;
  END;

  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _rls_results VALUES ('R2.1_action_point_insert_no_booking',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- R3.1: Student B inserts completion for session_note owned by Student A → reject
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_pass boolean := false;
  v_msg  text    := '';
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"22222222-2222-2222-2222-2222222200b1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  BEGIN
    INSERT INTO public.action_point_completions (session_note_id, action_point_index, completed, student_id)
    VALUES ('33333333-3333-3333-3333-333333330001', 0, true,
            '22222222-2222-2222-2222-2222222200b1');
    v_msg := 'insert for other student''s note was ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE IN ('42501', 'P0001') THEN
      v_pass := true; v_msg := 'denied [' || SQLSTATE || ']: ' || SQLERRM;
    ELSE
      v_msg := 'unexpected SQLSTATE ' || SQLSTATE || ': ' || SQLERRM;
    END IF;
  END;

  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _rls_results VALUES ('R3.1_completion_for_other_students_note',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- R3.2: Student A inserts completion for own session_note → succeed
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_pass boolean := false;
  v_msg  text    := '';
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"22222222-2222-2222-2222-2222222200a1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  BEGIN
    INSERT INTO public.action_point_completions (session_note_id, action_point_index, completed, student_id)
    VALUES ('33333333-3333-3333-3333-333333330001', 0, true,
            '22222222-2222-2222-2222-2222222200a1');
    v_pass := true; v_msg := 'insert for own note succeeded';
  EXCEPTION WHEN OTHERS THEN
    v_msg := 'unexpected denial [' || SQLSTATE || ']: ' || SQLERRM;
  END;

  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _rls_results VALUES ('R3.2_completion_for_own_note',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- R5.1: Student B inserts review for Mentor A (no completed booking) → reject
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_pass boolean := false;
  v_msg  text    := '';
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"22222222-2222-2222-2222-2222222200b1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  BEGIN
    INSERT INTO public.reviews (mentor_id, student_id, rating, review)
    VALUES ('11111111-1111-1111-1111-1111111100a1',
            '22222222-2222-2222-2222-2222222200b1', 5, 'fake');
    v_msg := 'insert without completed booking was ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE IN ('42501', 'P0001') THEN
      v_pass := true; v_msg := 'denied [' || SQLSTATE || ']: ' || SQLERRM;
    ELSE
      v_msg := 'unexpected SQLSTATE ' || SQLSTATE || ': ' || SQLERRM;
    END IF;
  END;

  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _rls_results VALUES ('R5.1_review_no_completed_booking',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- R5.2: Student A inserts review for Mentor A (has completed booking) → succeed
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_pass boolean := false;
  v_msg  text    := '';
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"22222222-2222-2222-2222-2222222200a1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  BEGIN
    INSERT INTO public.reviews (mentor_id, student_id, rating, review)
    VALUES ('11111111-1111-1111-1111-1111111100a1',
            '22222222-2222-2222-2222-2222222200a1', 5, 'legit');
    v_pass := true; v_msg := 'insert with completed booking succeeded';
  EXCEPTION WHEN OTHERS THEN
    v_msg := 'unexpected denial [' || SQLSTATE || ']: ' || SQLERRM;
  END;

  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _rls_results VALUES ('R5.2_review_with_completed_booking',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- M.1: Non-admin mentor changes own status from 'approved' to 'approved'
--      via a status-changing UPDATE → reject. (We flip via pending→approved.)
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_pass boolean := false;
  v_msg  text    := '';
BEGIN
  -- First, demote m_a to pending under service_role so we have something to flip.
  UPDATE public.mentors SET status = 'pending' WHERE id = '11111111-1111-1111-1111-1111111100a1';

  PERFORM set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-1111111100a1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  BEGIN
    UPDATE public.mentors SET status = 'approved' WHERE id = '11111111-1111-1111-1111-1111111100a1';
    v_msg := 'self-approval was ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = 'P0001' AND SQLERRM LIKE '%administrator%' THEN
      v_pass := true; v_msg := 'denied: ' || SQLERRM;
    ELSE
      v_msg := 'unexpected error [' || SQLSTATE || ']: ' || SQLERRM;
    END IF;
  END;

  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _rls_results VALUES ('M.1_mentor_self_approval',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- M.2: Mentor updates non-status field (no-op for status) → succeed
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_pass boolean := false;
  v_msg  text    := '';
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-1111111100a1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  BEGIN
    UPDATE public.mentors
    SET    bio = 'Updated bio — should pass'
    WHERE  id = '11111111-1111-1111-1111-1111111100a1';
    v_pass := true; v_msg := 'non-status update succeeded';
  EXCEPTION WHEN OTHERS THEN
    v_msg := 'unexpected denial [' || SQLSTATE || ']: ' || SQLERRM;
  END;

  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _rls_results VALUES ('M.2_mentor_update_non_status',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- Final report
-- ─────────────────────────────────────────────────────────────────────────
SELECT test_id, status, detail FROM _rls_results ORDER BY test_id;

ROLLBACK;
