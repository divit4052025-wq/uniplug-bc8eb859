-- ════════════════════════════════════════════════════════════════════════════
-- Payments Stage 1b dev-seed: immutable payment_ledger.
-- ════════════════════════════════════════════════════════════════════════════
--
-- WHAT THIS FILE IS
--   Runnable rejection + happy-path tests for migration
--     20260531120002_payments_1b_ledger.sql
--   Everything ROLLBACKs at the end — DB state unchanged.
--
-- PASS CRITERIA  Each test row ends with status = 'PASS'.
--   P1b.1 (reject)  a 2nd insert with the same idempotency_key is swallowed by
--                   ON CONFLICT DO NOTHING (row count stays 1) — the dedupe spine.
--   P1b.2 (reject)  an UPDATE as `authenticated` is denied (RLS, no policy).
--   P1b.3 (reject)  a DELETE as `authenticated` is denied (RLS, no policy).
--   P1b.4 (reject)  event_type outside the CHECK set is rejected.
--   P1b.5 (happy)   service-role inserts order_created then payment_captured for
--                   one booking; both present with distinct keys.
--
-- The append-only writer in production is service_role; here we insert as the
-- bootstrap role (which, like service_role, bypasses RLS) and separately prove
-- that a real `authenticated` caller is blocked.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- A booking to hang ledger rows off (FK is ON DELETE SET NULL, so even NULL ok,
-- but a real booking makes the happy path realistic).
DO $$
DECLARE
  m_a constant uuid := '11111111-1111-1111-1111-1111110b1b01';
  s_x constant uuid := '22222222-2222-2222-2222-2222220b1b01';
  v_future date := ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date + 7);
BEGIN
  INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
     raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token,
     email_change, email_change_token_new, created_at, updated_at, instance_id) VALUES
    (m_a,'authenticated','authenticated','m_a@p1b.local',crypt('pw',gen_salt('bf')),now(),
     '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','mentor','full_name','Mentor B','university','T','course','T','year','2nd Year','date_of_birth','2000-01-01'),
     '','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
    (s_x,'authenticated','authenticated','s_x@p1b.local',crypt('pw',gen_salt('bf')),now(),
     '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','student','full_name','Student B','phone','+91-0','school','T','grade','Grade 11'),
     '','','','',now(),now(),'00000000-0000-0000-0000-000000000000');
  UPDATE public.mentors SET status='approved', price_inr=2000 WHERE id=m_a;
  INSERT INTO public.bookings (id, mentor_id, student_id, date, time_slot, duration, price, status)
  VALUES ('33333333-3333-3333-3333-3333330b1b01', m_a, s_x, v_future, '14:00', 60, 2000, 'pending_payment');
END $$;

CREATE TEMP TABLE _p1b (test_id text PRIMARY KEY, status text NOT NULL, detail text NOT NULL);

-- ─── P1b.5 (happy, runs first to populate): two distinct events, one booking ─
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_cnt int;
  bk constant uuid := '33333333-3333-3333-3333-3333330b1b01';
BEGIN
  INSERT INTO public.payment_ledger (booking_id, event_type, idempotency_key, razorpay_order_id, amount_inr)
  VALUES (bk, 'order_created', 'order:order_TEST1', 'order_TEST1', 2000);
  INSERT INTO public.payment_ledger (booking_id, event_type, idempotency_key, razorpay_payment_id, amount_inr, mentor_share_inr, platform_fee_inr)
  VALUES (bk, 'payment_captured', 'captured:pay_TEST1', 'pay_TEST1', 2000, 1600, 400);
  SELECT count(*) INTO v_cnt FROM public.payment_ledger WHERE booking_id = bk;
  v_pass := (v_cnt = 2);
  v_msg := 'distinct-key rows for booking = '||v_cnt;
  INSERT INTO _p1b VALUES ('P1b.5_two_events_one_booking', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P1b.1: duplicate idempotency_key swallowed by ON CONFLICT DO NOTHING ────
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_before int; v_after int;
BEGIN
  SELECT count(*) INTO v_before FROM public.payment_ledger WHERE idempotency_key='captured:pay_TEST1';
  INSERT INTO public.payment_ledger (booking_id, event_type, idempotency_key, razorpay_payment_id, amount_inr)
  VALUES ('33333333-3333-3333-3333-3333330b1b01','payment_captured','captured:pay_TEST1','pay_TEST1',2000)
  ON CONFLICT (idempotency_key) DO NOTHING;
  SELECT count(*) INTO v_after FROM public.payment_ledger WHERE idempotency_key='captured:pay_TEST1';
  v_pass := (v_before = 1 AND v_after = 1);
  v_msg := 'count before='||v_before||' after='||v_after;
  INSERT INTO _p1b VALUES ('P1b.1_idempotency_key_dedupe', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P1b.4: event_type outside CHECK set → reject ───────────────────────────
DO $$
DECLARE v_pass boolean := false; v_msg text := '';
BEGIN
  BEGIN
    INSERT INTO public.payment_ledger (event_type, idempotency_key) VALUES ('not_a_real_event','k:x');
    v_msg := 'bogus event_type ACCEPTED';
  EXCEPTION WHEN check_violation THEN
    v_pass := true; v_msg := 'rejected ['||SQLSTATE||']';
  WHEN OTHERS THEN v_msg := 'wrong reject ['||SQLSTATE||']: '||SQLERRM;
  END;
  INSERT INTO _p1b VALUES ('P1b.4_event_type_check', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P1b.2: UPDATE as authenticated → denied (RLS, no policy) ────────────────
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_rows int;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"22222222-2222-2222-2222-2222220b1b01","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    UPDATE public.payment_ledger SET amount_inr = 9999 WHERE idempotency_key='captured:pay_TEST1';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    -- RLS with no policy → 0 rows visible/updatable (no error, just no effect).
    v_pass := (v_rows = 0);
    v_msg := 'authenticated UPDATE affected '||v_rows||' rows (expect 0)';
  EXCEPTION WHEN insufficient_privilege THEN
    v_pass := true; v_msg := 'denied ['||SQLSTATE||']';
  WHEN OTHERS THEN v_msg := 'unexpected ['||SQLSTATE||']: '||SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _p1b VALUES ('P1b.2_authenticated_update_denied', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P1b.3: DELETE as authenticated → denied (RLS, no policy) ────────────────
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_rows int;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"22222222-2222-2222-2222-2222220b1b01","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    DELETE FROM public.payment_ledger WHERE idempotency_key='captured:pay_TEST1';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_pass := (v_rows = 0);
    v_msg := 'authenticated DELETE affected '||v_rows||' rows (expect 0)';
  EXCEPTION WHEN insufficient_privilege THEN
    v_pass := true; v_msg := 'denied ['||SQLSTATE||']';
  WHEN OTHERS THEN v_msg := 'unexpected ['||SQLSTATE||']: '||SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _p1b VALUES ('P1b.3_authenticated_delete_denied', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

SELECT test_id, status, detail FROM _p1b ORDER BY test_id;

ROLLBACK;
