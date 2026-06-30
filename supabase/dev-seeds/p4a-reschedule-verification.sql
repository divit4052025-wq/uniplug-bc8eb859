-- ════════════════════════════════════════════════════════════════════════════
-- Phase 4a dev-seed: student reschedule (payment carries in place; no ledger row)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Pairs with supabase/migrations/20260603000008_p4a_reschedule.sql.
-- Setup (bootstrap role, RLS- + consent-gate-bypassing via service_role claim)
-- creates an approved mentor M (+ availability on every weekday at 10/11/12),
-- students S1 (owner) and S2 (other), one mentor_payouts row, eight bookings
-- with explicit ids covering each scenario, and one payment_ledger row for the
-- happy-path booking (to prove no NEW ledger row is created by a reschedule).
--
-- Run: docker exec -i supabase_db_<ref> psql "postgresql://postgres:postgres@localhost:5432/postgres" \
--        -v ON_ERROR_STOP=1 < this-file.sql
-- PASS CRITERIA: every row status = 'PASS'.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- Users. M=mentor, S1=owner student, S2=other student.
INSERT INTO auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  created_at, updated_at, instance_id
) VALUES
('cafe0001-0000-0000-0000-000000000001'::uuid,'authenticated','authenticated','p4a-mentor@example.com',
  crypt('p4a-pw',gen_salt('bf')),now(),'{"provider":"email"}'::jsonb,
  jsonb_build_object('role','mentor','full_name','P4a Mentor','university','IIT Bombay','course','CS','year','3rd Year','date_of_birth','2000-01-01'),
  '','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
('cafe0001-0000-0000-0000-0000000000a1'::uuid,'authenticated','authenticated','p4a-s1@example.com',
  crypt('p4a-pw',gen_salt('bf')),now(),'{"provider":"email"}'::jsonb,
  jsonb_build_object('role','student','full_name','P4a Student One','phone','+91-1','school','Sch','grade','Grade 12'),
  '','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
('cafe0001-0000-0000-0000-0000000000a2'::uuid,'authenticated','authenticated','p4a-s2@example.com',
  crypt('p4a-pw',gen_salt('bf')),now(),'{"provider":"email"}'::jsonb,
  jsonb_build_object('role','student','full_name','P4a Student Two','phone','+91-2','school','Sch','grade','Grade 12'),
  '','','','',now(),now(),'00000000-0000-0000-0000-000000000000')
ON CONFLICT (id) DO NOTHING;

UPDATE public.mentors SET status='approved' WHERE id='cafe0001-0000-0000-0000-000000000001';

-- Availability: every weekday at 10:00, 11:00, 12:00 (covers all target slots).
INSERT INTO public.mentor_availability (mentor_id, day_of_week, start_hour)
SELECT 'cafe0001-0000-0000-0000-000000000001'::uuid, d::smallint, h
FROM generate_series(1,7) d, unnest(ARRAY[10,11,12]::smallint[]) h
ON CONFLICT DO NOTHING;

-- A payout row to attach to the already-settled booking.
INSERT INTO public.mentor_payouts (id, mentor_id, amount_inr, payout_date)
VALUES ('cafe0003-0000-0000-0000-000000000001','cafe0001-0000-0000-0000-000000000001',800,CURRENT_DATE)
ON CONFLICT (id) DO NOTHING;

-- Bookings (explicit ids). Confirmed ones carry paid_at + razorpay ids.
INSERT INTO public.bookings (id, mentor_id, student_id, date, time_slot, duration, price, status, paid_at, razorpay_order_id, razorpay_payment_id, payout_id, reschedule_count) VALUES
-- B_happy: confirmed, paid, not settled, count 0
('cafe0002-0000-0000-0000-0000000000b1','cafe0001-0000-0000-0000-000000000001','cafe0001-0000-0000-0000-0000000000a1', CURRENT_DATE+7,'10:00',60,1000,'confirmed', now(),'order_b1','pay_b1', NULL,0),
-- B_nonowner: S1 owns; S2 will try
('cafe0002-0000-0000-0000-0000000000b2','cafe0001-0000-0000-0000-000000000001','cafe0001-0000-0000-0000-0000000000a1', CURRENT_DATE+7,'11:00',60,1000,'confirmed', now(),'order_b2','pay_b2', NULL,0),
-- B_pending: pending_payment
('cafe0002-0000-0000-0000-0000000000b3','cafe0001-0000-0000-0000-000000000001','cafe0001-0000-0000-0000-0000000000a1', CURRENT_DATE+7,'12:00',60,1000,'pending_payment', NULL,'order_b3',NULL, NULL,0),
-- B_maxed: confirmed, reschedule_count already 2
('cafe0002-0000-0000-0000-0000000000b4','cafe0001-0000-0000-0000-000000000001','cafe0001-0000-0000-0000-0000000000a1', CURRENT_DATE+8,'10:00',60,1000,'confirmed', now(),'order_b4','pay_b4', NULL,2),
-- B_payout: confirmed but already settled (payout_id set)
('cafe0002-0000-0000-0000-0000000000b6','cafe0001-0000-0000-0000-000000000001','cafe0001-0000-0000-0000-0000000000a1', CURRENT_DATE+8,'11:00',60,1000,'confirmed', now(),'order_b6','pay_b6', 'cafe0003-0000-0000-0000-000000000001',0),
-- B_occupant: S2's confirmed booking occupying the collision-target slot
('cafe0002-0000-0000-0000-0000000000b7','cafe0001-0000-0000-0000-000000000001','cafe0001-0000-0000-0000-0000000000a2', CURRENT_DATE+8,'12:00',60,1000,'confirmed', now(),'order_b7','pay_b7', NULL,0),
-- B_collide: S1 confirmed; will try to move onto B_occupant's slot
('cafe0002-0000-0000-0000-0000000000b8','cafe0001-0000-0000-0000-000000000001','cafe0001-0000-0000-0000-0000000000a1', CURRENT_DATE+9,'10:00',60,1000,'confirmed', now(),'order_b8','pay_b8', NULL,0)
ON CONFLICT (id) DO NOTHING;

-- B_soon: confirmed, starts ~3h from now (IST) → <12h away. Computed slot.
INSERT INTO public.bookings (id, mentor_id, student_id, date, time_slot, duration, price, status, paid_at, razorpay_payment_id, reschedule_count)
SELECT 'cafe0002-0000-0000-0000-0000000000b5','cafe0001-0000-0000-0000-000000000001','cafe0001-0000-0000-0000-0000000000a1',
       ((now() AT TIME ZONE 'Asia/Kolkata') + interval '3 hours')::date,
       to_char((now() AT TIME ZONE 'Asia/Kolkata') + interval '3 hours','HH24')||':00',
       60,1000,'confirmed', now(),'pay_b5',0
ON CONFLICT (id) DO NOTHING;

-- One captured-payment ledger row for B_happy (to prove reschedule adds none).
INSERT INTO public.payment_ledger (booking_id, event_type, idempotency_key, razorpay_payment_id, amount_inr, mentor_share_inr, platform_fee_inr)
VALUES ('cafe0002-0000-0000-0000-0000000000b1','payment_captured','captured:pay_b1','pay_b1',1000,800,200)
ON CONFLICT (idempotency_key) DO NOTHING;

CREATE TEMP TABLE _p4a (test_id text PRIMARY KEY, status text NOT NULL, detail text NOT NULL);

-- ─── P4a.1 (HAPPY): reschedule moves the slot; payment fields + ledger + notifications UNTOUCHED ───
DO $$
DECLARE
  v_pass boolean := false; v_msg text := ''; v_acted boolean := false;
  bid uuid := 'cafe0002-0000-0000-0000-0000000000b1';
  o_paid timestamptz; o_ord text; o_pay text; o_price int; o_payout uuid; o_status text; o_cnt int; o_ledger int; o_notif int;
  n_paid timestamptz; n_ord text; n_pay text; n_price int; n_payout uuid; n_status text; n_cnt int; n_ledger int; n_notif int;
  n_date date; n_slot text;
BEGIN
  SELECT paid_at, razorpay_order_id, razorpay_payment_id, price, payout_id, status, reschedule_count
    INTO o_paid, o_ord, o_pay, o_price, o_payout, o_status, o_cnt FROM public.bookings WHERE id=bid;
  SELECT count(*) INTO o_ledger FROM public.payment_ledger WHERE booking_id=bid;
  SELECT count(*) INTO o_notif FROM public.notifications;

  PERFORM set_config('request.jwt.claims','{"sub":"cafe0001-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.reschedule_booking(bid, CURRENT_DATE+14, '10:00');
    v_acted := true;
  EXCEPTION WHEN OTHERS THEN v_msg := 'reschedule errored ['||SQLSTATE||']: '||SQLERRM; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);

  IF v_acted THEN
    SELECT date, time_slot, paid_at, razorpay_order_id, razorpay_payment_id, price, payout_id, status, reschedule_count
      INTO n_date, n_slot, n_paid, n_ord, n_pay, n_price, n_payout, n_status, n_cnt FROM public.bookings WHERE id=bid;
    SELECT count(*) INTO n_ledger FROM public.payment_ledger WHERE booking_id=bid;
    SELECT count(*) INTO n_notif FROM public.notifications;
    v_pass := (
      n_date = CURRENT_DATE+14 AND n_slot = '10:00' AND n_cnt = o_cnt + 1
      AND n_paid IS NOT DISTINCT FROM o_paid
      AND n_ord  IS NOT DISTINCT FROM o_ord
      AND n_pay  IS NOT DISTINCT FROM o_pay
      AND n_price = o_price
      AND n_payout IS NOT DISTINCT FROM o_payout
      AND n_status = 'confirmed' AND o_status = 'confirmed'
      AND n_ledger = o_ledger
      AND n_notif  = o_notif
    );
    v_msg := 'moved→'||n_date||' '||n_slot||' count '||o_cnt||'→'||n_cnt
           ||'; payment unchanged='||(n_paid IS NOT DISTINCT FROM o_paid AND n_ord IS NOT DISTINCT FROM o_ord AND n_pay IS NOT DISTINCT FROM o_pay AND n_price=o_price AND n_payout IS NOT DISTINCT FROM o_payout AND n_status='confirmed')::text
           ||'; ledger '||o_ledger||'→'||n_ledger||'; notifications '||o_notif||'→'||n_notif;
  END IF;
  INSERT INTO _p4a VALUES ('P4a.1_happy_payment_carries', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P4a.2 (REJECTION): a non-owner student cannot reschedule someone else's booking ───
DO $$
DECLARE v_pass boolean := false; v_msg text := '';
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"cafe0001-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.reschedule_booking('cafe0002-0000-0000-0000-0000000000b2', CURRENT_DATE+14, '11:00');
    v_msg := 'non-owner reschedule ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE='42501' AND SQLERRM ILIKE '%your own%' THEN v_pass := true; v_msg := 'denied: '||SQLERRM;
    ELSE v_msg := 'unexpected ['||SQLSTATE||']: '||SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p4a VALUES ('P4a.2_nonowner_blocked', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P4a.3 (REJECTION): a pending_payment booking is not reschedulable ───
DO $$
DECLARE v_pass boolean := false; v_msg text := '';
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"cafe0001-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.reschedule_booking('cafe0002-0000-0000-0000-0000000000b3', CURRENT_DATE+14, '11:00');
    v_msg := 'pending reschedule ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE='P0001' AND SQLERRM ILIKE '%confirmed%' THEN v_pass := true; v_msg := 'denied: '||SQLERRM;
    ELSE v_msg := 'unexpected ['||SQLSTATE||']: '||SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p4a VALUES ('P4a.3_pending_blocked', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P4a.4 (REJECTION): a booking already rescheduled twice is blocked ───
DO $$
DECLARE v_pass boolean := false; v_msg text := '';
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"cafe0001-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.reschedule_booking('cafe0002-0000-0000-0000-0000000000b4', CURRENT_DATE+15, '10:00');
    v_msg := 'maxed reschedule ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE='P0001' AND SQLERRM ILIKE '%maximum%' THEN v_pass := true; v_msg := 'denied: '||SQLERRM;
    ELSE v_msg := 'unexpected ['||SQLSTATE||']: '||SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p4a VALUES ('P4a.4_maxed_blocked', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P4a.5 (REJECTION): a session less than 12h away cannot be rescheduled ───
DO $$
DECLARE v_pass boolean := false; v_msg text := '';
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"cafe0001-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.reschedule_booking('cafe0002-0000-0000-0000-0000000000b5', CURRENT_DATE+14, '11:00');
    v_msg := '<12h reschedule ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE='P0001' AND SQLERRM ILIKE '%12 hours%' THEN v_pass := true; v_msg := 'denied: '||SQLERRM;
    ELSE v_msg := 'unexpected ['||SQLSTATE||']: '||SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p4a VALUES ('P4a.5_under_12h_blocked', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P4a.6 (REJECTION): the new slot collides with another booking ───
DO $$
DECLARE v_pass boolean := false; v_msg text := '';
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"cafe0001-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    -- B_collide → B_occupant's slot (CURRENT_DATE+8 12:00)
    PERFORM public.reschedule_booking('cafe0002-0000-0000-0000-0000000000b8', CURRENT_DATE+8, '12:00');
    v_msg := 'collision reschedule ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE '%slot already booked%' THEN v_pass := true; v_msg := 'denied: '||SQLERRM;
    ELSE v_msg := 'unexpected ['||SQLSTATE||']: '||SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p4a VALUES ('P4a.6_collision_blocked', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P4a.7 (REJECTION, invariant I-c): an already-settled (payout_id) booking is blocked ───
DO $$
DECLARE v_pass boolean := false; v_msg text := '';
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"cafe0001-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.reschedule_booking('cafe0002-0000-0000-0000-0000000000b6', CURRENT_DATE+15, '11:00');
    v_msg := 'settled-booking reschedule ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE='P0001' AND SQLERRM ILIKE '%settled%' THEN v_pass := true; v_msg := 'denied: '||SQLERRM;
    ELSE v_msg := 'unexpected ['||SQLSTATE||']: '||SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p4a VALUES ('P4a.7_payout_set_blocked', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

SELECT test_id, status, detail FROM _p4a ORDER BY test_id;

ROLLBACK;
