-- ════════════════════════════════════════════════════════════════════════════
-- Payments Stage 2 dev-seed: book_session → pending_payment + zero-price branch,
--                            and fail_booking_order.
-- ════════════════════════════════════════════════════════════════════════════
--
-- WHAT THIS FILE IS
--   Runnable rejection + happy-path tests for migration
--     20260531120004_payments_2_book_session_pending.sql
--   Everything ROLLBACKs at the end — DB state unchanged.
--
-- PASS CRITERIA  Each test row ends with status = 'PASS'.
--   P2.1 (happy)  a normal (priced) booking via book_session is pending_payment
--                 (NOT confirmed), paid_at NULL — the behaviour switch.
--   P2.2 (happy)  the held slot blocks a second booking (unique_violation →
--                 'slot already booked'), proving the slot is held while unpaid.
--   P2.3 (happy)  a sub-₹1 mentor price (price_inr=0) is inserted confirmed
--                 immediately (no order path), and fires the mentor notification.
--   P2.4 (reject) all the Phase-A1 gates still hold — booking an unapproved
--                 mentor is rejected (regression guard that the rewrite kept them).
--   P2.5 (happy)  fail_booking_order flips a pending_payment booking to
--                 payment_failed, writes an order_create_failed ledger row, frees
--                 the slot (a re-book of the same slot now succeeds), and is a
--                 no-op on a non-pending booking (idempotent / can't stomp).
--
-- Students are seeded as ADULTS (DOB 30y ago) so the minor-consent BEFORE-INSERT
-- gate does not require parental consent; callers act under their own JWT.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

DO $$
DECLARE
  m_a constant uuid := '11111111-1111-1111-1111-1111110201a1';  -- approved, priced
  m_z constant uuid := '11111111-1111-1111-1111-1111110201a2';  -- approved, price 0
  s_x constant uuid := '22222222-2222-2222-2222-2222220201a1';  -- adult student
  v_future date := ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date + 7);
BEGIN
  INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
     raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token,
     email_change, email_change_token_new, created_at, updated_at, instance_id) VALUES
    (m_a,'authenticated','authenticated','m_a@p2.local',crypt('pw',gen_salt('bf')),now(),
     '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','mentor','full_name','Mentor Priced','university','T','course','T','year','2nd Year','date_of_birth','2000-01-01'),
     '','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
    (m_z,'authenticated','authenticated','m_z@p2.local',crypt('pw',gen_salt('bf')),now(),
     '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','mentor','full_name','Mentor Free','university','T','course','T','year','2nd Year','date_of_birth','2000-01-01'),
     '','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
    (s_x,'authenticated','authenticated','s_x@p2.local',crypt('pw',gen_salt('bf')),now(),
     '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','student','full_name','Adult Student','phone','+91-0','school','T','grade','Undergraduate'),
     '','','','',now(),now(),'00000000-0000-0000-0000-000000000000');

  UPDATE public.mentors SET status='approved', price_inr=2000 WHERE id=m_a;
  UPDATE public.mentors SET status='approved', price_inr=0    WHERE id=m_z;
  -- Adult DOB so the minor-consent gate is satisfied without parental consent.
  UPDATE public.students SET date_of_birth = (CURRENT_DATE - interval '30 years')::date WHERE id=s_x;

  -- Availability for the slots we book/probe.
  INSERT INTO public.mentor_availability (mentor_id, day_of_week, start_hour) VALUES
    (m_a, EXTRACT(ISODOW FROM v_future)::smallint, 14),
    (m_z, EXTRACT(ISODOW FROM v_future)::smallint, 15)
  ON CONFLICT DO NOTHING;
END $$;

CREATE TEMP TABLE _p2 (test_id text PRIMARY KEY, status text NOT NULL, detail text NOT NULL);

-- ─── P2.1: priced booking → pending_payment, paid_at NULL ───────────────────
DO $$
DECLARE
  v_pass boolean := false; v_msg text := '';
  v_future date := ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date + 7);
  v_id uuid; v_status text; v_paid timestamptz;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"22222222-2222-2222-2222-2222220201a1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_id := public.book_session('11111111-1111-1111-1111-1111110201a1'::uuid, v_future, '14:00');
  SELECT status, paid_at INTO v_status, v_paid FROM public.bookings WHERE id = v_id;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  v_pass := (v_status = 'pending_payment' AND v_paid IS NULL);
  v_msg  := 'status='||coalesce(v_status,'NULL')||' paid_at='||coalesce(v_paid::text,'NULL');
  INSERT INTO _p2 VALUES ('P2.1_priced_is_pending', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P2.2: held pending slot blocks a second booking ────────────────────────
DO $$
DECLARE
  v_pass boolean := false; v_msg text := '';
  v_future date := ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date + 7);
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"22222222-2222-2222-2222-2222220201a1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.book_session('11111111-1111-1111-1111-1111110201a1'::uuid, v_future, '14:00');
    v_msg := 'second booking on held slot ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE '%slot already booked%' THEN
      v_pass := true; v_msg := 'rejected: '||SQLERRM;
    ELSE
      v_msg := 'wrong reject ['||SQLSTATE||']: '||SQLERRM;
    END IF;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _p2 VALUES ('P2.2_pending_holds_slot', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P2.3: zero-price mentor → confirmed immediately + notification fired ────
DO $$
DECLARE
  v_pass boolean := false; v_msg text := '';
  v_future date := ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date + 7);
  v_id uuid; v_status text; v_paid timestamptz; v_notifs int;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"22222222-2222-2222-2222-2222220201a1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_id := public.book_session('11111111-1111-1111-1111-1111110201a2'::uuid, v_future, '15:00');
  SELECT status, paid_at INTO v_status, v_paid FROM public.bookings WHERE id = v_id;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  SELECT count(*) INTO v_notifs FROM public.notifications WHERE booking_id = v_id AND kind='booking_confirmed';
  v_pass := (v_status = 'confirmed' AND v_paid IS NULL AND v_notifs = 1);
  v_msg  := 'status='||coalesce(v_status,'NULL')||' paid_at='||coalesce(v_paid::text,'NULL')||' notifs='||v_notifs;
  INSERT INTO _p2 VALUES ('P2.3_zeroprice_confirmed', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P2.4: Phase-A1 gates preserved — unapproved mentor rejected ────────────
DO $$
DECLARE
  v_pass boolean := false; v_msg text := '';
  v_future date := ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date + 7);
  m_pending uuid := gen_random_uuid();
BEGIN
  -- seed a pending (unapproved) mentor with availability
  INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
     raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token,
     email_change, email_change_token_new, created_at, updated_at, instance_id)
  VALUES (m_pending,'authenticated','authenticated','m_pend@p2.local',crypt('pw',gen_salt('bf')),now(),
     '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','mentor','full_name','Pending M','university','T','course','T','year','2nd Year','date_of_birth','2000-01-01'),
     '','','','',now(),now(),'00000000-0000-0000-0000-000000000000');
  INSERT INTO public.mentor_availability (mentor_id, day_of_week, start_hour)
  VALUES (m_pending, EXTRACT(ISODOW FROM v_future)::smallint, 16) ON CONFLICT DO NOTHING;

  PERFORM set_config('request.jwt.claims',
    '{"sub":"22222222-2222-2222-2222-2222220201a1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.book_session(m_pending, v_future, '16:00');
    v_msg := 'unapproved-mentor booking ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE '%not available for booking%' THEN
      v_pass := true; v_msg := 'rejected: '||SQLERRM;
    ELSE
      v_msg := 'wrong reject ['||SQLSTATE||']: '||SQLERRM;
    END IF;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _p2 VALUES ('P2.4_gates_preserved_unapproved', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P2.5: fail_booking_order frees the slot + is idempotent / no-stomp ──────
DO $$
DECLARE
  v_pass boolean := false; v_msg text := '';
  v_future date := ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date + 8);
  v_id uuid; v_status text; v_first boolean; v_second boolean;
  v_ledger int; v_rebook uuid;
BEGIN
  -- Book a fresh slot (priced → pending_payment) as the student.
  PERFORM set_config('request.jwt.claims',
    '{"sub":"22222222-2222-2222-2222-2222220201a1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  -- give m_a availability on the new day
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO public.mentor_availability (mentor_id, day_of_week, start_hour)
  VALUES ('11111111-1111-1111-1111-1111110201a1', EXTRACT(ISODOW FROM v_future)::smallint, 14)
  ON CONFLICT DO NOTHING;

  PERFORM set_config('request.jwt.claims',
    '{"sub":"22222222-2222-2222-2222-2222220201a1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_id := public.book_session('11111111-1111-1111-1111-1111110201a1'::uuid, v_future, '14:00');
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  -- service_role calls fail_booking_order: first flips, second is no-op.
  v_first  := public.fail_booking_order(v_id);
  v_second := public.fail_booking_order(v_id);
  SELECT status INTO v_status FROM public.bookings WHERE id = v_id;
  SELECT count(*) INTO v_ledger FROM public.payment_ledger
    WHERE booking_id = v_id AND event_type = 'order_create_failed';

  -- The freed slot is now re-bookable.
  PERFORM set_config('request.jwt.claims',
    '{"sub":"22222222-2222-2222-2222-2222220201a1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    v_rebook := public.book_session('11111111-1111-1111-1111-1111110201a1'::uuid, v_future, '14:00');
  EXCEPTION WHEN OTHERS THEN
    v_rebook := NULL;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  v_pass := (v_first AND NOT v_second AND v_status = 'payment_failed' AND v_ledger = 1 AND v_rebook IS NOT NULL);
  v_msg  := 'first='||v_first||' second='||v_second||' status='||v_status||
            ' ledger='||v_ledger||' rebook='||coalesce(v_rebook::text,'NULL');
  INSERT INTO _p2 VALUES ('P2.5_fail_order_frees_slot', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

SELECT test_id, status, detail FROM _p2 ORDER BY test_id;

ROLLBACK;
