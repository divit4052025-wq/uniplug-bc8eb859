-- ════════════════════════════════════════════════════════════════════════════
-- Dev-seed: mentor_availability full-24h (start_hour 0..23) verification.
-- ════════════════════════════════════════════════════════════════════════════
--
-- WHAT THIS FILE IS
--   Runnable proof for migration 20260617000001_relax_mentor_availability_hours.sql.
--   Everything ROLLBACKs at the end — DB state unchanged.
--
-- PASS CRITERIA — every row 'PASS'. A 'FAIL' means either the widening didn't take
--   (hours 0/23 still rejected, or the booking pipeline doesn't project/cover the
--   new hours) OR it went too far (24/-1 now wrongly accepted).
--
-- Run: docker exec -i <supabase_db_container> psql -U postgres -d postgres \
--        < supabase/dev-seeds/relax-mentor-availability-hours-verification.sql
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

CREATE TEMP TABLE _cfg AS
  SELECT (current_date + 3)::date AS test_date,
         EXTRACT(ISODOW FROM (current_date + 3))::smallint AS dow;

DO $$
DECLARE
  m constant uuid := '11111111-1111-1111-1111-1111111199a1';  -- mentor
  s constant uuid := '22222222-2222-2222-2222-2222222299a1';  -- student
BEGIN
  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    created_at, updated_at, instance_id
  ) VALUES
    (m, 'authenticated','authenticated','m@uniplug-24h.local',crypt('pw',gen_salt('bf')),now(),
     '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','mentor','full_name','Mentor 24h','university','T','course','T','year','2nd Year'),
     '','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
    (s, 'authenticated','authenticated','s@uniplug-24h.local',crypt('pw',gen_salt('bf')),now(),
     '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','student','full_name','Student 24h','phone','+91-0','school','T','grade','Grade 11'),
     '','','','',now(),now(),'00000000-0000-0000-0000-000000000000');

  UPDATE public.mentors  SET status = 'approved'        WHERE id = m;
  -- Adult-equivalent: give the student consent so book_session's minor gate is a
  -- clean no-op (book_session runs as the student, not service_role).
  UPDATE public.students SET parental_consent_at = now() WHERE id = s;
END $$;

CREATE TEMP TABLE _r (test_id text PRIMARY KEY, status text NOT NULL, detail text NOT NULL);

-- ─── A1: open hour 0 (00:00) now INSERTs (was rejected by 8..22) ────────────
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_dow smallint;
BEGIN
  SELECT dow INTO v_dow FROM _cfg;
  BEGIN
    INSERT INTO public.mentor_availability (mentor_id, day_of_week, start_hour)
    VALUES ('11111111-1111-1111-1111-1111111199a1', v_dow, 0);
    v_pass := true; v_msg := 'start_hour=0 accepted';
  EXCEPTION WHEN OTHERS THEN v_msg := 'start_hour=0 rejected ['||SQLSTATE||']: '||SQLERRM; END;
  INSERT INTO _r VALUES ('A1_hour_0_inserts', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── A2: open hour 23 (23:00) now INSERTs ───────────────────────────────────
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_dow smallint;
BEGIN
  SELECT dow INTO v_dow FROM _cfg;
  BEGIN
    INSERT INTO public.mentor_availability (mentor_id, day_of_week, start_hour)
    VALUES ('11111111-1111-1111-1111-1111111199a1', v_dow, 23);
    v_pass := true; v_msg := 'start_hour=23 accepted';
  EXCEPTION WHEN OTHERS THEN v_msg := 'start_hour=23 rejected ['||SQLSTATE||']: '||SQLERRM; END;
  INSERT INTO _r VALUES ('A2_hour_23_inserts', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── B: an existing in-range hour (14) still INSERTs (non-regression) ────────
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_dow smallint;
BEGIN
  SELECT dow INTO v_dow FROM _cfg;
  BEGIN
    INSERT INTO public.mentor_availability (mentor_id, day_of_week, start_hour)
    VALUES ('11111111-1111-1111-1111-1111111199a1', v_dow, 14);
    v_pass := true; v_msg := 'start_hour=14 accepted';
  EXCEPTION WHEN OTHERS THEN v_msg := 'start_hour=14 rejected ['||SQLSTATE||']: '||SQLERRM; END;
  INSERT INTO _r VALUES ('B_hour_14_inserts', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── C: get_mentor_calendar projects 00:00/00:30 + 23:00/23:30 for the open day
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_n integer; v_date date;
BEGIN
  SELECT test_date INTO v_date FROM _cfg;
  SELECT count(*) INTO v_n
  FROM public.get_mentor_calendar('11111111-1111-1111-1111-1111111199a1', current_date, 7) c
  WHERE c.date = v_date AND c.time_slot IN ('00:00','00:30','23:00','23:30');
  IF v_n = 4 THEN v_pass := true; v_msg := 'all 4 edge sub-slots projected (00:00/00:30/23:00/23:30)';
  ELSE v_msg := 'projected '||v_n||'/4 edge sub-slots'; END IF;
  INSERT INTO _r VALUES ('C_calendar_projects_edges', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── D1: student books a 30-min session at 00:00 ────────────────────────────
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_id uuid; v_date date;
BEGIN
  SELECT test_date INTO v_date FROM _cfg;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"22222222-2222-2222-2222-2222222299a1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    SELECT public.book_session('11111111-1111-1111-1111-1111111199a1', v_date, '00:00', NULL, NULL, 30)
      INTO v_id;
    IF v_id IS NOT NULL THEN v_pass := true; v_msg := 'booked 00:00 / 30-min → '||v_id::text; END IF;
  EXCEPTION WHEN OTHERS THEN v_msg := 'book 00:00/30 failed ['||SQLSTATE||']: '||SQLERRM; END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _r VALUES ('D1_book_30min_at_0000', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── D2: student books a 30-min session at 23:30 (coverable: spans hour 23 only)
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_id uuid; v_date date;
BEGIN
  SELECT test_date INTO v_date FROM _cfg;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"22222222-2222-2222-2222-2222222299a1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    SELECT public.book_session('11111111-1111-1111-1111-1111111199a1', v_date, '23:30', NULL, NULL, 30)
      INTO v_id;
    IF v_id IS NOT NULL THEN v_pass := true; v_msg := 'booked 23:30 / 30-min → '||v_id::text; END IF;
  EXCEPTION WHEN OTHERS THEN v_msg := 'book 23:30/30 failed ['||SQLSTATE||']: '||SQLERRM; END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _r VALUES ('D2_book_30min_at_2330', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── E1: start_hour=24 STILL REJECTED (CHECK upper bound) ────────────────────
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_dow smallint;
BEGIN
  SELECT dow INTO v_dow FROM _cfg;
  BEGIN
    INSERT INTO public.mentor_availability (mentor_id, day_of_week, start_hour)
    VALUES ('11111111-1111-1111-1111-1111111199a1', v_dow, 24);
    v_msg := 'start_hour=24 was ACCEPTED (bound too wide)';
  EXCEPTION WHEN check_violation THEN v_pass := true; v_msg := 'denied [23514]: '||SQLERRM;
           WHEN OTHERS THEN v_msg := 'unexpected ['||SQLSTATE||']: '||SQLERRM; END;
  INSERT INTO _r VALUES ('E1_hour_24_rejected', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── E2: start_hour=-1 STILL REJECTED (CHECK lower bound) ────────────────────
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_dow smallint;
BEGIN
  SELECT dow INTO v_dow FROM _cfg;
  BEGIN
    INSERT INTO public.mentor_availability (mentor_id, day_of_week, start_hour)
    VALUES ('11111111-1111-1111-1111-1111111199a1', v_dow, -1);
    v_msg := 'start_hour=-1 was ACCEPTED (bound too wide)';
  EXCEPTION WHEN check_violation THEN v_pass := true; v_msg := 'denied [23514]: '||SQLERRM;
           WHEN OTHERS THEN v_msg := 'unexpected ['||SQLSTATE||']: '||SQLERRM; END;
  INSERT INTO _r VALUES ('E2_hour_neg1_rejected', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

SELECT test_id, status, detail FROM _r ORDER BY test_id;

ROLLBACK;
