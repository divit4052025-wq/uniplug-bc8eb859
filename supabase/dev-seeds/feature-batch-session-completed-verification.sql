-- ════════════════════════════════════════════════════════════════════════════
-- Feature batch dev-seed: session_completed notification trigger
-- ════════════════════════════════════════════════════════════════════════════
--
-- WHAT THIS FILE IS
--   Runnable verification for migration
--     supabase/migrations/20260517000001_session_completed_notification.sql
--   covering:
--     - kind CHECK widened to include 'session_completed'
--     - mentor_name column present
--     - trigger fires on confirmed → completed and inserts the right row
--     - trigger does NOT fire on confirmed → cancelled
--     - trigger does NOT fire on INSERT of a new booking
--     - re-running the UPDATE does not duplicate notifications
--
-- HOW TO RUN
--   Paste into Supabase SQL Editor (or pipe via MCP execute_sql). All
--   changes ROLLBACK at the end — DB state unchanged.
--
-- PASS CRITERIA
--   Every test row in the final SELECT has status = 'PASS'.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ─── Setup: 1 approved mentor + 1 student + bookings used by the tests ────
DO $$
DECLARE
  m_a constant uuid := '11111111-1111-1111-1111-1111111107a1';
  s_x constant uuid := '22222222-2222-2222-2222-2222222207a1';
  v_today date := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    created_at, updated_at, instance_id
  ) VALUES
    (m_a, 'authenticated', 'authenticated', 'm_sc@uniplug-fb.local',
     crypt('pw', gen_salt('bf')), now(),
     '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','mentor','full_name','Mentor SC',
                        'university','Test U','course','Test','year','2nd Year'),
     '', '', '', '', now(), now(), '00000000-0000-0000-0000-000000000000'),
    (s_x, 'authenticated', 'authenticated', 's_sc@uniplug-fb.local',
     crypt('pw', gen_salt('bf')), now(),
     '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','student','full_name','Student SC',
                        'phone','+91-0','school','Test','grade','Grade 11'),
     '', '', '', '', now(), now(), '00000000-0000-0000-0000-000000000000');

  UPDATE public.mentors SET status = 'approved' WHERE id = m_a;

  -- Four bookings to drive the four test cases:
  --   #1 confirmed past — flipped to completed in T(a), should create notif
  --   #2 confirmed past — flipped to cancelled in T(b), should NOT create notif
  --   #3 used in T(c)  — fresh INSERT below, status = 'pending', then status = 'confirmed'
  --   #4 already completed — UPDATE no-op in T(d), should NOT duplicate
  INSERT INTO public.bookings (id, mentor_id, student_id, date, time_slot, status, price) VALUES
    ('cccccccc-0000-0000-0000-0000000000a1', m_a, s_x, v_today - 1, '14:00', 'confirmed', 500),
    ('cccccccc-0000-0000-0000-0000000000b1', m_a, s_x, v_today - 1, '15:00', 'confirmed', 500),
    ('cccccccc-0000-0000-0000-0000000000d1', m_a, s_x, v_today - 2, '14:00', 'completed', 500);
END $$;

CREATE TEMP TABLE _sc_results (
  test_id text PRIMARY KEY,
  status  text NOT NULL,
  detail  text NOT NULL
);

-- ─── T(a): confirmed → completed creates exactly one session_completed row ─
DO $$
DECLARE
  v_pass boolean := false;
  v_msg  text    := '';
  v_count int;
  v_recipient uuid;
  v_mentor_name text;
BEGIN
  UPDATE public.bookings
     SET status = 'completed'
   WHERE id = 'cccccccc-0000-0000-0000-0000000000a1';

  SELECT count(*),
         (SELECT recipient_id FROM public.notifications
           WHERE booking_id = 'cccccccc-0000-0000-0000-0000000000a1'
             AND kind = 'session_completed' LIMIT 1),
         (SELECT mentor_name FROM public.notifications
           WHERE booking_id = 'cccccccc-0000-0000-0000-0000000000a1'
             AND kind = 'session_completed' LIMIT 1)
    INTO v_count, v_recipient, v_mentor_name
    FROM public.notifications
   WHERE booking_id = 'cccccccc-0000-0000-0000-0000000000a1'
     AND kind = 'session_completed';

  IF v_count = 1
     AND v_recipient = '22222222-2222-2222-2222-2222222207a1'::uuid
     AND v_mentor_name = 'Mentor SC' THEN
    v_pass := true;
    v_msg  := 'one session_completed row, recipient = student, mentor_name snapshotted';
  ELSE
    v_msg := format('expected 1 row to student with mentor_name=Mentor SC; got count=%s recipient=%s mentor_name=%s',
                    v_count, coalesce(v_recipient::text, 'NULL'), coalesce(v_mentor_name, 'NULL'));
  END IF;

  INSERT INTO _sc_results VALUES ('Ta_completed_creates_one_notification',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── T(b): confirmed → cancelled does NOT create a session_completed row ──
DO $$
DECLARE
  v_pass boolean := false;
  v_msg  text    := '';
  v_count int;
BEGIN
  UPDATE public.bookings
     SET status = 'cancelled'
   WHERE id = 'cccccccc-0000-0000-0000-0000000000b1';

  SELECT count(*) INTO v_count
    FROM public.notifications
   WHERE booking_id = 'cccccccc-0000-0000-0000-0000000000b1'
     AND kind = 'session_completed';

  IF v_count = 0 THEN
    v_pass := true;
    v_msg  := 'cancellation produced no session_completed notification';
  ELSE
    v_msg  := format('expected 0 rows, got %s', v_count);
  END IF;

  INSERT INTO _sc_results VALUES ('Tb_cancelled_creates_no_notification',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── T(c): INSERT of a new booking does NOT fire the trigger ──────────────
-- The booking_confirmed trigger MAY fire on the same INSERT — we only check
-- that no session_completed row is produced.
DO $$
DECLARE
  v_pass boolean := false;
  v_msg  text    := '';
  v_count int;
  v_today date := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  INSERT INTO public.bookings (id, mentor_id, student_id, date, time_slot, status, price) VALUES
    ('cccccccc-0000-0000-0000-0000000000c1',
     '11111111-1111-1111-1111-1111111107a1',
     '22222222-2222-2222-2222-2222222207a1',
     v_today + 7, '14:00', 'confirmed', 500);

  SELECT count(*) INTO v_count
    FROM public.notifications
   WHERE booking_id = 'cccccccc-0000-0000-0000-0000000000c1'
     AND kind = 'session_completed';

  IF v_count = 0 THEN
    v_pass := true;
    v_msg  := 'fresh booking INSERT did not create a session_completed notification';
  ELSE
    v_msg  := format('expected 0 rows, got %s', v_count);
  END IF;

  INSERT INTO _sc_results VALUES ('Tc_insert_does_not_create_notification',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── T(d): re-running UPDATE on an already-completed row does not duplicate ─
DO $$
DECLARE
  v_pass boolean := false;
  v_msg  text    := '';
  v_count_before int;
  v_count_after  int;
BEGIN
  SELECT count(*) INTO v_count_before
    FROM public.notifications
   WHERE booking_id = 'cccccccc-0000-0000-0000-0000000000d1'
     AND kind = 'session_completed';

  -- This UPDATE re-sets status to the same value. The trigger's WHEN clause
  -- (OLD.status IS DISTINCT FROM 'completed') must short-circuit it.
  UPDATE public.bookings
     SET status = 'completed'
   WHERE id = 'cccccccc-0000-0000-0000-0000000000d1';

  SELECT count(*) INTO v_count_after
    FROM public.notifications
   WHERE booking_id = 'cccccccc-0000-0000-0000-0000000000d1'
     AND kind = 'session_completed';

  IF v_count_after = v_count_before THEN
    v_pass := true;
    v_msg  := format('re-running completed UPDATE did not duplicate (count stable at %s)',
                     v_count_after);
  ELSE
    v_msg  := format('expected count unchanged; before=%s after=%s',
                     v_count_before, v_count_after);
  END IF;

  INSERT INTO _sc_results VALUES ('Td_idempotent_on_repeat_update',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── T(e): the CHECK constraint actually allows session_completed ─────────
-- Rejection inverse: would have been blocked by the old constraint.
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_def text;
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO v_def
    FROM pg_constraint c
    JOIN pg_namespace n ON c.connamespace = n.oid
   WHERE n.nspname = 'public'
     AND c.conname = 'notifications_kind_check';

  IF v_def LIKE '%booking_confirmed%' AND v_def LIKE '%session_completed%' THEN
    v_pass := true; v_msg := 'CHECK constraint allows both kinds';
  ELSE
    v_msg := 'CHECK constraint definition unexpected: ' || coalesce(v_def, 'NULL');
  END IF;

  INSERT INTO _sc_results VALUES ('Te_check_constraint_includes_both_kinds',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

SELECT test_id, status, detail FROM _sc_results ORDER BY test_id;

ROLLBACK;
