-- ════════════════════════════════════════════════════════════════════════════
-- Bug audit dev-seed: time / completion (Bugs 6.1, 6.5 backend)
-- ════════════════════════════════════════════════════════════════════════════
--
-- WHAT THIS FILE IS
--   Runnable verification for:
--     - Bug 6.1 — auto-complete past confirmed bookings (runs the same
--       UPDATE the cron schedules, immediately, against seeded fixtures).
--     - Bug 6.5 — get_mentor_calendar uses IST dates (smoke test: function
--       definition contains 'Asia/Kolkata' AND a future-availability slot
--       shows up in the result set).
--     - pg_cron — verifies the auto_complete_past_bookings job is
--       scheduled with the 15-minute interval.
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

-- ─── Setup: 1 approved mentor + 1 student + bookings in past/future/cancelled
DO $$
DECLARE
  m_a constant uuid := '11111111-1111-1111-1111-111111110501';
  s_x constant uuid := '22222222-2222-2222-2222-222222220501';
  v_today date := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    created_at, updated_at, instance_id
  ) VALUES
    (m_a, 'authenticated', 'authenticated', 'm_a@uniplug-tc.local', crypt('pw', gen_salt('bf')), now(),
     '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','mentor','full_name','Mentor TC','university','T','course','T','year','2nd Year'),
     '', '', '', '', now(), now(), '00000000-0000-0000-0000-000000000000'),
    (s_x, 'authenticated', 'authenticated', 's_x@uniplug-tc.local', crypt('pw', gen_salt('bf')), now(),
     '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','student','full_name','Student TC','phone','+91-0','school','T','grade','Grade 11'),
     '', '', '', '', now(), now(), '00000000-0000-0000-0000-000000000000');

  UPDATE public.mentors SET status = 'approved' WHERE id = m_a;

  -- Three bookings:
  --   #1 yesterday 14:00 IST  — confirmed, well past end → should auto-complete
  --   #2 a week from now 14:00 — confirmed, future → should stay confirmed
  --   #3 yesterday 14:00 IST  — cancelled → should stay cancelled
  INSERT INTO public.bookings (id, mentor_id, student_id, date, time_slot, status, price) VALUES
    ('aaaaaaaa-0000-0000-0000-000000000001', m_a, s_x, v_today - 1, '14:00', 'confirmed', 500),
    ('aaaaaaaa-0000-0000-0000-000000000002', m_a, s_x, v_today + 7, '14:00', 'confirmed', 500),
    ('aaaaaaaa-0000-0000-0000-000000000003', m_a, s_x, v_today - 1, '15:00', 'cancelled', 500);

  -- Mentor availability for a week from today (IST) so get_mentor_calendar
  -- returns a known slot in T4.
  INSERT INTO public.mentor_availability (mentor_id, day_of_week, start_hour)
  VALUES (m_a, EXTRACT(ISODOW FROM (v_today + 7))::smallint, 14);
END $$;

CREATE TEMP TABLE _tc_results (
  test_id text PRIMARY KEY,
  status  text NOT NULL,
  detail  text NOT NULL
);

-- ─── T1 (Bug 6.1): past confirmed → completed after running cron SQL ──────
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_status text;
BEGIN
  UPDATE public.bookings
  SET    status = 'completed'
  WHERE  status = 'confirmed'
    AND  ((date::timestamp + time_slot::time + interval '1 hour')
            AT TIME ZONE 'Asia/Kolkata') <= now();

  SELECT status::text INTO v_status FROM public.bookings
   WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
  IF v_status = 'completed' THEN
    v_pass := true; v_msg := 'past confirmed flipped to completed';
  ELSE
    v_msg := 'expected completed, got ' || coalesce(v_status, 'NULL');
  END IF;

  INSERT INTO _tc_results VALUES ('T1_past_confirmed_auto_completes',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── T2 (Bug 6.1): future confirmed → unchanged ────────────────────────────
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_status text;
BEGIN
  SELECT status::text INTO v_status FROM public.bookings
   WHERE id = 'aaaaaaaa-0000-0000-0000-000000000002';
  IF v_status = 'confirmed' THEN
    v_pass := true; v_msg := 'future confirmed stayed confirmed';
  ELSE
    v_msg := 'expected confirmed, got ' || coalesce(v_status, 'NULL');
  END IF;

  INSERT INTO _tc_results VALUES ('T2_future_confirmed_unchanged',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── T3 (Bug 6.1): past cancelled → unchanged ──────────────────────────────
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_status text;
BEGIN
  SELECT status::text INTO v_status FROM public.bookings
   WHERE id = 'aaaaaaaa-0000-0000-0000-000000000003';
  IF v_status = 'cancelled' THEN
    v_pass := true; v_msg := 'past cancelled stayed cancelled';
  ELSE
    v_msg := 'expected cancelled, got ' || coalesce(v_status, 'NULL');
  END IF;

  INSERT INTO _tc_results VALUES ('T3_past_cancelled_unchanged',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── T4 (Bug 6.5): get_mentor_calendar default returns IST-future slot ────
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.get_mentor_calendar(
    '11111111-1111-1111-1111-111111110501'::uuid
  );
  IF v_count >= 1 THEN
    v_pass := true; v_msg := 'function returned ' || v_count || ' future slot(s)';
  ELSE
    v_msg := 'function returned no slots (expected at least 1)';
  END IF;

  INSERT INTO _tc_results VALUES ('T4_calendar_returns_future_slots',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── T5 (Bug 6.5): function definition contains Asia/Kolkata (smoke check) ─
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public' AND p.proname = 'get_mentor_calendar';

  IF v_def LIKE '%Asia/Kolkata%' AND v_def NOT LIKE '%date > CURRENT_DATE%' THEN
    v_pass := true; v_msg := 'function body references Asia/Kolkata and no longer uses CURRENT_DATE comparisons';
  ELSE
    v_msg := 'function body did not contain expected IST migration';
  END IF;

  INSERT INTO _tc_results VALUES ('T5_calendar_ist_in_definition',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── T6: cron job scheduled with 15-minute interval ───────────────────────
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_sched text; v_active boolean;
BEGIN
  SELECT schedule, active INTO v_sched, v_active
  FROM cron.job
  WHERE jobname = 'auto_complete_past_bookings';

  IF v_sched IS NULL THEN
    v_msg := 'cron job auto_complete_past_bookings not found';
  ELSIF v_sched <> '*/15 * * * *' THEN
    v_msg := 'cron job present but schedule is ' || v_sched || ' (expected */15 * * * *)';
  ELSIF NOT v_active THEN
    v_msg := 'cron job present with correct schedule but is inactive';
  ELSE
    v_pass := true; v_msg := 'cron job scheduled */15 * * * * and active';
  END IF;

  INSERT INTO _tc_results VALUES ('T6_cron_job_scheduled',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

SELECT test_id, status, detail FROM _tc_results ORDER BY test_id;

ROLLBACK;
