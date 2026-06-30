-- ════════════════════════════════════════════════════════════════════════════
-- Payments Stage 4 dev-seed: 30-minute unpaid-booking expiry.
-- ════════════════════════════════════════════════════════════════════════════
--
-- WHAT THIS FILE IS
--   Runnable rejection + happy-path tests for migration
--     20260531120006_payments_4_expiry_cron.sql
--   Runs the cron's UPDATE directly (no waiting for the interval).
--   Everything ROLLBACKs at the end — DB state unchanged.
--
-- PASS CRITERIA  Each test row ends with status = 'PASS'.
--   P4.1 (reject) a pending_payment booking YOUNGER than 30 min is NOT expired.
--   P4.2 (reject) a CONFIRMED booking is never touched (even if old).
--   P4.3 (happy)  a 31-min-old pending_payment booking flips to 'expired' and its
--                 slot reads 'available' again from get_mentor_calendar.
--
-- The expiry predicate is on created_at, so we backdate created_at to simulate age.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

DO $$
DECLARE
  m_a constant uuid := '11111111-1111-1111-1111-1111110401a1';
  s_x constant uuid := '22222222-2222-2222-2222-2222220401a1';
  v_future date := ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date + 7);
BEGIN
  INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
     raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token,
     email_change, email_change_token_new, created_at, updated_at, instance_id) VALUES
    (m_a,'authenticated','authenticated','m_a@p4.local',crypt('pw',gen_salt('bf')),now(),
     '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','mentor','full_name','Mentor P4','university','T','course','T','year','2nd Year','date_of_birth','2000-01-01'),
     '','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
    (s_x,'authenticated','authenticated','s_x@p4.local',crypt('pw',gen_salt('bf')),now(),
     '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','student','full_name','Student P4','phone','+91-0','school','T','grade','Undergraduate'),
     '','','','',now(),now(),'00000000-0000-0000-0000-000000000000');
  UPDATE public.mentors SET status='approved', price_inr=2000 WHERE id=m_a;
  -- availability at 14:00 so get_mentor_calendar surfaces that slot
  INSERT INTO public.mentor_availability (mentor_id, day_of_week, start_hour)
  VALUES (m_a, EXTRACT(ISODOW FROM v_future)::smallint, 14) ON CONFLICT DO NOTHING;

  -- young pending (just now), old pending (31 min ago), old confirmed (31 min ago)
  INSERT INTO public.bookings (id, mentor_id, student_id, date, time_slot, duration, price, status, created_at) VALUES
    ('33333333-3333-3333-3333-3333330401a1', m_a, s_x, v_future, '09:00', 60, 2000, 'pending_payment', now()),
    ('33333333-3333-3333-3333-3333330401a2', m_a, s_x, v_future, '14:00', 60, 2000, 'pending_payment', now() - interval '31 minutes'),
    ('33333333-3333-3333-3333-3333330401a3', m_a, s_x, v_future, '16:00', 60, 2000, 'confirmed',       now() - interval '31 minutes');
END $$;

CREATE TEMP TABLE _p4 (test_id text PRIMARY KEY, status text NOT NULL, detail text NOT NULL);

-- Run the cron's exact UPDATE once, directly.
UPDATE public.bookings
   SET status = 'expired'
 WHERE status = 'pending_payment'
   AND created_at < now() - interval '30 minutes';

-- ─── P4.1: young pending NOT expired ────────────────────────────────────────
DO $$
DECLARE v_pass boolean; v_status text;
BEGIN
  SELECT status INTO v_status FROM public.bookings WHERE id='33333333-3333-3333-3333-3333330401a1';
  v_pass := (v_status = 'pending_payment');
  INSERT INTO _p4 VALUES ('P4.1_young_not_expired',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, 'young pending status='||v_status);
END $$;

-- ─── P4.2: confirmed never touched ──────────────────────────────────────────
DO $$
DECLARE v_pass boolean; v_status text;
BEGIN
  SELECT status INTO v_status FROM public.bookings WHERE id='33333333-3333-3333-3333-3333330401a3';
  v_pass := (v_status = 'confirmed');
  INSERT INTO _p4 VALUES ('P4.2_confirmed_untouched',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, 'old confirmed status='||v_status);
END $$;

-- ─── P4.3: old pending expired + slot freed in calendar ─────────────────────
DO $$
DECLARE
  v_pass boolean; v_status text; v_state text;
  v_future date := ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date + 7);
BEGIN
  SELECT status INTO v_status FROM public.bookings WHERE id='33333333-3333-3333-3333-3333330401a2';
  SELECT state INTO v_state FROM public.get_mentor_calendar(
    '11111111-1111-1111-1111-1111110401a1'::uuid, v_future, 1)
   WHERE date = v_future AND time_slot = '14:00';
  v_pass := (v_status = 'expired' AND v_state = 'available');
  INSERT INTO _p4 VALUES ('P4.3_old_expired_slot_freed',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END,
    'status='||v_status||' calendar_state='||coalesce(v_state,'(none)'));
END $$;

SELECT test_id, status, detail FROM _p4 ORDER BY test_id;

ROLLBACK;
