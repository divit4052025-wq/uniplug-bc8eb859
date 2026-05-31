-- ════════════════════════════════════════════════════════════════════════════
-- Payments Stage 6 dev-seed: apply_refund + clawback + refund.processed.
-- ════════════════════════════════════════════════════════════════════════════
--
-- WHAT THIS FILE IS
--   Runnable rejection + happy-path tests for migration
--     20260531120008_payments_6_refunds.sql
--   Everything ROLLBACKs at the end — DB state unchanged.
--
-- PASS CRITERIA  Each test row ends with status = 'PASS'.
--   P6.1 (reject) apply_refund / confirm_refund_processed are service_role-only —
--                 an authenticated caller has no EXECUTE.
--   P6.2 (happy)  refunding a confirmed (unstamped) booking → cancelled; no
--                 clawback needed (payout_id was NULL).
--   P6.3 (happy)  refunding a booking stamped into a SCHEDULED payout decrements
--                 that payout's amount_inr by the mentor share and clears payout_id.
--   P6.4 (happy)  refunding a booking stamped into an ALREADY-PAID payout writes a
--                 clawback_owed ledger row (no auto-reversal) and leaves payout intact.
--   P6.5 (idempotency) confirm_refund_processed records once; a redelivery is a
--                 no-op (returns false, ledger count stays 1).
--
-- apply_refund/confirm_refund_processed run as service_role here (production caller
-- is the admin server fn / webhook, both service_role).
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

DO $$
DECLARE
  m_a constant uuid := '11111111-1111-1111-1111-1111110601a1';
  s_x constant uuid := '22222222-2222-2222-2222-2222220601a1';
  v_future date := ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date + 7);
BEGIN
  INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
     raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token,
     email_change, email_change_token_new, created_at, updated_at, instance_id) VALUES
    (m_a,'authenticated','authenticated','m_a@p6.local',crypt('pw',gen_salt('bf')),now(),
     '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','mentor','full_name','Mentor P6','university','T','course','T','year','2nd Year'),
     '','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
    (s_x,'authenticated','authenticated','s_x@p6.local',crypt('pw',gen_salt('bf')),now(),
     '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','student','full_name','Student P6','phone','+91-0','school','T','grade','Undergraduate'),
     '','','','',now(),now(),'00000000-0000-0000-0000-000000000000');
  UPDATE public.mentors SET status='approved', price_inr=2000 WHERE id=m_a;

  -- B1: confirmed + paid, unstamped (P6.2)
  INSERT INTO public.bookings (id, mentor_id, student_id, date, time_slot, duration, price, status, paid_at, razorpay_payment_id)
  VALUES ('33333333-3333-3333-3333-3333330601a1', m_a, s_x, v_future, '10:00', 60, 2000, 'confirmed', now(), 'pay_B1');

  -- B2: completed + paid, stamped into a SCHEDULED payout (P6.3)
  INSERT INTO public.mentor_payouts (id, mentor_id, amount_inr, payout_date, status)
  VALUES ('44444444-4444-4444-4444-444444440601', m_a, 3200, current_date, 'scheduled'); -- two bookings' worth
  INSERT INTO public.bookings (id, mentor_id, student_id, date, time_slot, duration, price, status, paid_at, payout_id)
  VALUES ('33333333-3333-3333-3333-3333330601a2', m_a, s_x, v_future - 14, '10:00', 60, 2000, 'completed', now(),
          '44444444-4444-4444-4444-444444440601');

  -- B3: completed + paid, stamped into an ALREADY-PAID payout (P6.4)
  INSERT INTO public.mentor_payouts (id, mentor_id, amount_inr, payout_date, status)
  VALUES ('44444444-4444-4444-4444-444444440602', m_a, 1600, current_date, 'paid');
  INSERT INTO public.bookings (id, mentor_id, student_id, date, time_slot, duration, price, status, paid_at, payout_id)
  VALUES ('33333333-3333-3333-3333-3333330601a3', m_a, s_x, v_future - 21, '10:00', 60, 2000, 'completed', now(),
          '44444444-4444-4444-4444-444444440602');
END $$;

CREATE TEMP TABLE _p6 (test_id text PRIMARY KEY, status text NOT NULL, detail text NOT NULL);

-- ─── P6.1: service_role-only (authenticated has no EXECUTE) ─────────────────
DO $$
DECLARE v_pass boolean; v_ar boolean; v_cr boolean;
BEGIN
  v_ar := has_function_privilege('authenticated', 'public.apply_refund(text,text,jsonb)', 'execute');
  v_cr := has_function_privilege('authenticated', 'public.confirm_refund_processed(text,text,jsonb)', 'execute');
  v_pass := (NOT v_ar AND NOT v_cr);
  INSERT INTO _p6 VALUES ('P6.1_service_role_only',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END,
    'authenticated apply_refund='||v_ar::text||' confirm_refund='||v_cr::text||' (both expect false)');
END $$;

-- ─── P6.2: refund unstamped confirmed booking → cancelled, no clawback ──────
DO $$
DECLARE v_pass boolean; v_res jsonb; v_status text;
BEGIN
  v_res := public.apply_refund('33333333-3333-3333-3333-3333330601a1', 'rfnd_B1', NULL);
  SELECT status INTO v_status FROM public.bookings WHERE id='33333333-3333-3333-3333-3333330601a1';
  v_pass := (v_status='cancelled' AND v_res->>'clawback'='none');
  INSERT INTO _p6 VALUES ('P6.2_refund_unstamped',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END,
    'status='||v_status||' clawback='||(v_res->>'clawback'));
END $$;

-- ─── P6.3: refund booking in SCHEDULED payout → decrement + clear payout_id ──
DO $$
DECLARE v_pass boolean; v_res jsonb; v_status text; v_amt int; v_pid uuid;
BEGIN
  v_res := public.apply_refund('33333333-3333-3333-3333-3333330601a2', 'rfnd_B2', NULL);
  SELECT status, payout_id INTO v_status, v_pid FROM public.bookings WHERE id='33333333-3333-3333-3333-3333330601a2';
  SELECT amount_inr INTO v_amt FROM public.mentor_payouts WHERE id='44444444-4444-4444-4444-444444440601';
  -- 3200 - round(2000*.8)=1600 → 1600 left; payout_id cleared; clawback reversed.
  v_pass := (v_status='cancelled' AND v_pid IS NULL AND v_amt=1600 AND v_res->>'clawback'='reversed_scheduled');
  INSERT INTO _p6 VALUES ('P6.3_clawback_scheduled',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END,
    'status='||v_status||' payout_amt='||v_amt||' payout_id_cleared='||(v_pid IS NULL)::text||
    ' clawback='||(v_res->>'clawback'));
END $$;

-- ─── P6.4: refund booking in ALREADY-PAID payout → clawback_owed ledger ─────
DO $$
DECLARE v_pass boolean; v_res jsonb; v_status text; v_amt int; v_owed int;
BEGIN
  v_res := public.apply_refund('33333333-3333-3333-3333-3333330601a3', 'rfnd_B3', NULL);
  SELECT status INTO v_status FROM public.bookings WHERE id='33333333-3333-3333-3333-3333330601a3';
  SELECT amount_inr INTO v_amt FROM public.mentor_payouts WHERE id='44444444-4444-4444-4444-444444440602';
  SELECT count(*) INTO v_owed FROM public.payment_ledger
    WHERE booking_id='33333333-3333-3333-3333-3333330601a3' AND event_type='clawback_owed';
  -- paid payout left intact (1600), one clawback_owed ledger row, booking cancelled.
  v_pass := (v_status='cancelled' AND v_amt=1600 AND v_owed=1 AND v_res->>'clawback'='owed_already_paid');
  INSERT INTO _p6 VALUES ('P6.4_clawback_already_paid',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END,
    'status='||v_status||' paid_payout_amt='||v_amt||' clawback_owed_rows='||v_owed||
    ' clawback='||(v_res->>'clawback'));
END $$;

-- ─── P6.5: confirm_refund_processed idempotent ──────────────────────────────
DO $$
DECLARE v_pass boolean; v_first boolean; v_second boolean; v_rows int;
BEGIN
  v_first  := public.confirm_refund_processed('33333333-3333-3333-3333-3333330601a1', 'rfnd_B1', '{"e":"refund.processed"}'::jsonb);
  v_second := public.confirm_refund_processed('33333333-3333-3333-3333-3333330601a1', 'rfnd_B1', '{"e":"refund.processed","redelivery":true}'::jsonb);
  SELECT count(*) INTO v_rows FROM public.payment_ledger
    WHERE event_type='refund_processed' AND idempotency_key='refundproc:rfnd_B1';
  v_pass := (v_first AND NOT v_second AND v_rows=1);
  INSERT INTO _p6 VALUES ('P6.5_refund_processed_idempotent',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END,
    'first='||v_first||' second='||v_second||' ledger='||v_rows);
END $$;

SELECT test_id, status, detail FROM _p6 ORDER BY test_id;

ROLLBACK;
