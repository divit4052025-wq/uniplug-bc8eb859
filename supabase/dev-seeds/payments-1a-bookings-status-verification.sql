-- ════════════════════════════════════════════════════════════════════════════
-- Payments Stage 1a dev-seed: status widening + slot-hold index + calendar.
-- ════════════════════════════════════════════════════════════════════════════
--
-- WHAT THIS FILE IS
--   Runnable rejection + happy-path tests for migration
--     20260531120001_payments_1a_bookings_status.sql
--   Everything ROLLBACKs at the end — DB state unchanged.
--
-- PASS CRITERIA  Each test row ends with status = 'PASS'.
--   P1a.1 (reject) a bogus status value violates bookings_status_valid.
--   P1a.2 (reject) a 2nd pending_payment booking for the same (mentor,date,slot)
--                  raises unique_violation — i.e. the widened slot-hold index
--                  now holds the slot for an unpaid hold too.
--   P1a.3 (happy)  a pending_payment booking is allowed by the widened CHECK.
--   P1a.4 (happy)  get_mentor_calendar reports that held slot as 'booked'.
--   P1a.5 (happy)  flipping the hold to 'expired' frees the slot — calendar
--                  reports 'available' again.
--
-- Seeds one approved mentor + one student via auth.users (handle_new_user
-- cascades the public.mentors / public.students rows), then exercises the schema
-- directly under service_role claims (which also bypasses the minor-consent
-- BEFORE INSERT gate, matching backfills/admin scripts).
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

DO $$
DECLARE
  m_a constant uuid := '11111111-1111-1111-1111-1111110a1a01';  -- approved mentor
  s_x constant uuid := '22222222-2222-2222-2222-2222220a1a01';  -- student
  v_future date := ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date + 7);
BEGIN
  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    created_at, updated_at, instance_id
  ) VALUES
    (m_a, 'authenticated', 'authenticated', 'm_a@p1a.local',
     crypt('pw', gen_salt('bf')), now(), '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','mentor','full_name','Mentor A','university','T','course','T','year','2nd Year','date_of_birth','2000-01-01'),
     '', '', '', '', now(), now(), '00000000-0000-0000-0000-000000000000'),
    (s_x, 'authenticated', 'authenticated', 's_x@p1a.local',
     crypt('pw', gen_salt('bf')), now(), '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','student','full_name','Student X','phone','+91-0','school','T','grade','Grade 11'),
     '', '', '', '', now(), now(), '00000000-0000-0000-0000-000000000000');

  UPDATE public.mentors SET status = 'approved', price_inr = 2000 WHERE id = m_a;
  INSERT INTO public.mentor_availability (mentor_id, day_of_week, start_hour)
  VALUES (m_a, EXTRACT(ISODOW FROM v_future)::smallint, 14)
  ON CONFLICT DO NOTHING;
END $$;

CREATE TEMP TABLE _p1a (test_id text PRIMARY KEY, status text NOT NULL, detail text NOT NULL);

-- ─── P1a.1: bogus status value → reject (CHECK violation 23514) ─────────────
DO $$
DECLARE
  v_pass boolean := false; v_msg text := '';
  v_future date := ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date + 7);
BEGIN
  BEGIN
    INSERT INTO public.bookings (mentor_id, student_id, date, time_slot, duration, price, status)
    VALUES ('11111111-1111-1111-1111-1111110a1a01','22222222-2222-2222-2222-2222220a1a01',
            v_future, '14:00', 60, 2000, 'garbage');
    v_msg := 'bogus status ACCEPTED';
  EXCEPTION WHEN check_violation THEN
    v_pass := true; v_msg := 'rejected ['||SQLSTATE||']';
  WHEN OTHERS THEN
    v_msg := 'wrong reject ['||SQLSTATE||']: '||SQLERRM;
  END;
  INSERT INTO _p1a VALUES ('P1a.1_bogus_status_reject', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P1a.3 (run before P1a.2 so a hold exists): pending_payment allowed ──────
DO $$
DECLARE
  v_pass boolean := false; v_msg text := '';
  v_future date := ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date + 7);
  v_id uuid;
BEGIN
  BEGIN
    INSERT INTO public.bookings (mentor_id, student_id, date, time_slot, duration, price, status)
    VALUES ('11111111-1111-1111-1111-1111110a1a01','22222222-2222-2222-2222-2222220a1a01',
            v_future, '14:00', 60, 2000, 'pending_payment')
    RETURNING id INTO v_id;
    v_pass := v_id IS NOT NULL;
    v_msg := 'pending_payment row created id='||coalesce(v_id::text,'NULL');
  EXCEPTION WHEN OTHERS THEN
    v_msg := 'unexpected ['||SQLSTATE||']: '||SQLERRM;
  END;
  INSERT INTO _p1a VALUES ('P1a.3_pending_allowed', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P1a.2: a 2nd pending_payment for the same slot → unique_violation ───────
DO $$
DECLARE
  v_pass boolean := false; v_msg text := '';
  v_future date := ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date + 7);
BEGIN
  BEGIN
    INSERT INTO public.bookings (mentor_id, student_id, date, time_slot, duration, price, status)
    VALUES ('11111111-1111-1111-1111-1111110a1a01','22222222-2222-2222-2222-2222220a1a01',
            v_future, '14:00', 60, 2000, 'pending_payment');
    v_msg := 'second hold on same slot ACCEPTED (slot not held!)';
  EXCEPTION WHEN unique_violation THEN
    v_pass := true; v_msg := 'rejected ['||SQLSTATE||'] — slot held by the pending hold';
  WHEN OTHERS THEN
    v_msg := 'wrong reject ['||SQLSTATE||']: '||SQLERRM;
  END;
  INSERT INTO _p1a VALUES ('P1a.2_pending_holds_slot', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P1a.4: calendar reports the held slot as 'booked' ──────────────────────
DO $$
DECLARE
  v_pass boolean := false; v_msg text := '';
  v_future date := ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date + 7);
  v_state text;
BEGIN
  SELECT state INTO v_state FROM public.get_mentor_calendar(
    '11111111-1111-1111-1111-1111110a1a01'::uuid, v_future, 1)
   WHERE date = v_future AND time_slot = '14:00';
  v_pass := (v_state = 'booked');
  v_msg  := 'calendar state for held slot = '||coalesce(v_state,'(none)');
  INSERT INTO _p1a VALUES ('P1a.4_calendar_shows_held_booked', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P1a.5: expiring the hold frees the slot (calendar → 'available') ────────
DO $$
DECLARE
  v_pass boolean := false; v_msg text := '';
  v_future date := ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date + 7);
  v_state text;
BEGIN
  UPDATE public.bookings SET status = 'expired'
   WHERE mentor_id = '11111111-1111-1111-1111-1111110a1a01'
     AND date = v_future AND time_slot = '14:00' AND status = 'pending_payment';
  SELECT state INTO v_state FROM public.get_mentor_calendar(
    '11111111-1111-1111-1111-1111110a1a01'::uuid, v_future, 1)
   WHERE date = v_future AND time_slot = '14:00';
  v_pass := (v_state = 'available');
  v_msg  := 'calendar state after expiry = '||coalesce(v_state,'(none)');
  INSERT INTO _p1a VALUES ('P1a.5_expiry_frees_slot', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

SELECT test_id, status, detail FROM _p1a ORDER BY test_id;

ROLLBACK;
