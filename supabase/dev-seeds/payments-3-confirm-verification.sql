-- ════════════════════════════════════════════════════════════════════════════
-- Payments Stage 3 dev-seed: mark_booking_paid / mark_booking_failed atomicity +
--                            idempotency + on-confirm notification + orphan capture.
-- ════════════════════════════════════════════════════════════════════════════
--
-- WHAT THIS FILE IS
--   Runnable rejection + happy-path tests for migration
--     20260531120005_payments_3_confirm.sql
--   Everything ROLLBACKs at the end — DB state unchanged.
--
-- PASS CRITERIA  Each test row ends with status = 'PASS'.
--   P3.1 (happy)  mark_booking_paid on a pending booking → newly_confirmed=true,
--                 status confirmed, paid_at set, razorpay ids set, exactly ONE
--                 payment_captured ledger row, exactly ONE booking_confirmed
--                 notification (fired by the on-confirm trigger).
--   P3.2 (reject/idempotency)  a SECOND identical delivery → newly_confirmed=false,
--                 still exactly one captured ledger row, still exactly one
--                 notification (no double-confirm, no double-email, no double-notify).
--   P3.3 (happy)  atomicity — after the confirm, the ledger row and the confirmed
--                 booking co-exist (both present), proving they committed together.
--   P3.4 (orphan) mark_booking_paid on an EXPIRED booking → newly_confirmed=false
--                 and booking_status='expired' (worker would refund), yet the
--                 payment_captured ledger row IS recorded (money logged, never lost).
--   P3.5 (happy)  mark_booking_failed on a pending booking → flips to
--                 payment_failed, writes a failed ledger row; second call no-op.
--
-- Service-role inserts everywhere (the production writer is the service-role
-- webhook). Students seeded as adults so the consent gate is satisfied.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

DO $$
DECLARE
  m_a constant uuid := '11111111-1111-1111-1111-1111110301a1';
  s_x constant uuid := '22222222-2222-2222-2222-2222220301a1';
  v_future date := ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date + 7);
BEGIN
  INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
     raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token,
     email_change, email_change_token_new, created_at, updated_at, instance_id) VALUES
    (m_a,'authenticated','authenticated','m_a@p3.local',crypt('pw',gen_salt('bf')),now(),
     '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','mentor','full_name','Mentor P3','university','T','course','T','year','2nd Year','date_of_birth','2000-01-01'),
     '','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
    (s_x,'authenticated','authenticated','s_x@p3.local',crypt('pw',gen_salt('bf')),now(),
     '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','student','full_name','Student P3','phone','+91-0','school','T','grade','Undergraduate'),
     '','','','',now(),now(),'00000000-0000-0000-0000-000000000000');
  UPDATE public.mentors SET status='approved', price_inr=2000 WHERE id=m_a;
  UPDATE public.students SET date_of_birth=(CURRENT_DATE - interval '30 years')::date WHERE id=s_x;

  -- Two pending bookings (one to confirm, one to fail) + one already-expired.
  INSERT INTO public.bookings (id, mentor_id, student_id, date, time_slot, duration, price, status) VALUES
    ('33333333-3333-3333-3333-3333330301a1', m_a, s_x, v_future, '10:00', 60, 2000, 'pending_payment'),
    ('33333333-3333-3333-3333-3333330301a2', m_a, s_x, v_future, '11:00', 60, 2000, 'pending_payment'),
    ('33333333-3333-3333-3333-3333330301a3', m_a, s_x, v_future, '12:00', 60, 2000, 'expired');
END $$;

CREATE TEMP TABLE _p3 (test_id text PRIMARY KEY, status text NOT NULL, detail text NOT NULL);

-- ─── P3.1: first confirm → newly_confirmed, status, paid_at, ledger, notif ──
DO $$
DECLARE
  v_pass boolean := false; v_msg text := '';
  bk constant uuid := '33333333-3333-3333-3333-3333330301a1';
  v_newly boolean; v_bstatus text; v_paid timestamptz; v_oid text; v_pid text;
  v_ledger int; v_notif int;
BEGIN
  SELECT newly_confirmed, booking_status INTO v_newly, v_bstatus
    FROM public.mark_booking_paid(bk, 'order_P31', 'pay_P31', 2000,
         '{"event":"payment.captured"}'::jsonb);
  SELECT paid_at, razorpay_order_id, razorpay_payment_id INTO v_paid, v_oid, v_pid
    FROM public.bookings WHERE id = bk;
  SELECT count(*) INTO v_ledger FROM public.payment_ledger
    WHERE booking_id = bk AND event_type='payment_captured';
  SELECT count(*) INTO v_notif FROM public.notifications
    WHERE booking_id = bk AND kind='booking_confirmed';
  v_pass := (v_newly AND v_bstatus='confirmed' AND v_paid IS NOT NULL
             AND v_oid='order_P31' AND v_pid='pay_P31' AND v_ledger=1 AND v_notif=1);
  v_msg := 'newly='||v_newly||' status='||v_bstatus||' paid='||(v_paid IS NOT NULL)::text||
           ' ledger='||v_ledger||' notif='||v_notif;
  INSERT INTO _p3 VALUES ('P3.1_first_confirm', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P3.2: duplicate delivery → no second confirm/ledger/notif ──────────────
DO $$
DECLARE
  v_pass boolean := false; v_msg text := '';
  bk constant uuid := '33333333-3333-3333-3333-3333330301a1';
  v_newly boolean; v_bstatus text; v_ledger int; v_notif int;
BEGIN
  SELECT newly_confirmed, booking_status INTO v_newly, v_bstatus
    FROM public.mark_booking_paid(bk, 'order_P31', 'pay_P31', 2000,
         '{"event":"payment.captured","redelivery":true}'::jsonb);
  SELECT count(*) INTO v_ledger FROM public.payment_ledger
    WHERE booking_id = bk AND event_type='payment_captured';
  SELECT count(*) INTO v_notif FROM public.notifications
    WHERE booking_id = bk AND kind='booking_confirmed';
  v_pass := (NOT v_newly AND v_bstatus='confirmed' AND v_ledger=1 AND v_notif=1);
  v_msg := 'newly='||v_newly||' status='||v_bstatus||' ledger(still)='||v_ledger||' notif(still)='||v_notif;
  INSERT INTO _p3 VALUES ('P3.2_duplicate_noop', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P3.3: atomicity — confirmed booking AND its ledger row co-exist ────────
DO $$
DECLARE
  v_pass boolean := false; v_msg text := '';
  bk constant uuid := '33333333-3333-3333-3333-3333330301a1';
  v_booking_ok boolean; v_ledger_ok boolean;
BEGIN
  SELECT (status='confirmed' AND paid_at IS NOT NULL) INTO v_booking_ok
    FROM public.bookings WHERE id = bk;
  SELECT EXISTS(SELECT 1 FROM public.payment_ledger
                WHERE booking_id=bk AND event_type='payment_captured'
                  AND idempotency_key='captured:pay_P31') INTO v_ledger_ok;
  v_pass := (v_booking_ok AND v_ledger_ok);
  v_msg := 'booking_confirmed_and_paid='||v_booking_ok||' ledger_present='||v_ledger_ok;
  INSERT INTO _p3 VALUES ('P3.3_atomic_both_present', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P3.4: capture-after-expiry (orphan) — not confirmed, money still logged ─
DO $$
DECLARE
  v_pass boolean := false; v_msg text := '';
  bk constant uuid := '33333333-3333-3333-3333-3333330301a3';  -- the expired one
  v_newly boolean; v_bstatus text; v_ledger int;
BEGIN
  SELECT newly_confirmed, booking_status INTO v_newly, v_bstatus
    FROM public.mark_booking_paid(bk, 'order_P34', 'pay_P34', 2000,
         '{"event":"payment.captured","late":true}'::jsonb);
  SELECT count(*) INTO v_ledger FROM public.payment_ledger
    WHERE booking_id = bk AND event_type='payment_captured';
  -- Not confirmed (stays expired), but the capture IS recorded so a refund can run.
  v_pass := (NOT v_newly AND v_bstatus='expired' AND v_ledger=1);
  v_msg := 'newly='||v_newly||' status='||v_bstatus||' captured_ledger='||v_ledger;
  INSERT INTO _p3 VALUES ('P3.4_orphan_capture_logged', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P3.5: mark_booking_failed flips pending → payment_failed, idempotent ────
DO $$
DECLARE
  v_pass boolean := false; v_msg text := '';
  bk constant uuid := '33333333-3333-3333-3333-3333330301a2';
  v_first boolean; v_second boolean; v_status text; v_ledger int;
BEGIN
  v_first  := public.mark_booking_failed(bk, 'pay_P35', '{"event":"payment.failed"}'::jsonb);
  v_second := public.mark_booking_failed(bk, 'pay_P35', '{"event":"payment.failed"}'::jsonb);
  SELECT status INTO v_status FROM public.bookings WHERE id = bk;
  SELECT count(*) INTO v_ledger FROM public.payment_ledger
    WHERE booking_id = bk AND event_type='payment_failed';
  v_pass := (v_first AND NOT v_second AND v_status='payment_failed' AND v_ledger=1);
  v_msg := 'first='||v_first||' second='||v_second||' status='||v_status||' ledger='||v_ledger;
  INSERT INTO _p3 VALUES ('P3.5_mark_failed', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

SELECT test_id, status, detail FROM _p3 ORDER BY test_id;

ROLLBACK;
