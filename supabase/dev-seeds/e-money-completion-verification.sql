-- ════════════════════════════════════════════════════════════════════════════
-- E dev-seed: money completion (non-disbursement)
-- Pairs with 20260604000050_e_money_completion.sql.
-- Proves: tiered student cancel (full ≥24h / 50% 2–24h / none <2h) with the
-- refund AMOUNT read from the immutable payment_captured ledger (NOT price);
-- mentor-cancel = full regardless of time; the cancel rejections; the dangling
-- demo-path closure; max_active_mentees enforcement (distinct students); and
-- orphan-capture detection.
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token, email_change, email_change_token_new, created_at, updated_at, instance_id) VALUES
('de000000-0000-0000-0000-00000000000a','authenticated','authenticated','e-m@example.com',crypt('x',gen_salt('bf')),now(),'{"provider":"email"}','{"role":"mentor","full_name":"E Mentor","university":"U","course":"C","year":"3rd Year"}','','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
('de000000-0000-0000-0000-00000000000b','authenticated','authenticated','e-mcap@example.com',crypt('x',gen_salt('bf')),now(),'{"provider":"email"}','{"role":"mentor","full_name":"E Cap Mentor","university":"U","course":"C","year":"2nd Year"}','','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
('de000000-0000-0000-0000-0000000000c1','authenticated','authenticated','e-s1@example.com',crypt('x',gen_salt('bf')),now(),'{"provider":"email"}','{"role":"student","full_name":"E S1","phone":"+91","school":"S","grade":"Grade 12","date_of_birth":"2000-01-01"}','','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
('de000000-0000-0000-0000-0000000000c2','authenticated','authenticated','e-s2@example.com',crypt('x',gen_salt('bf')),now(),'{"provider":"email"}','{"role":"student","full_name":"E S2","phone":"+91","school":"S","grade":"Grade 12","date_of_birth":"2000-01-01"}','','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
('de000000-0000-0000-0000-0000000000c3','authenticated','authenticated','e-s3@example.com',crypt('x',gen_salt('bf')),now(),'{"provider":"email"}','{"role":"student","full_name":"E S3","phone":"+91","school":"S","grade":"Grade 12","date_of_birth":"2000-01-01"}','','','','',now(),now(),'00000000-0000-0000-0000-000000000000')
ON CONFLICT (id) DO NOTHING;
UPDATE public.mentors SET status='approved', price_inr=1000 WHERE id='de000000-0000-0000-0000-00000000000a';
UPDATE public.mentors SET status='approved', price_inr=1000, max_active_mentees=1 WHERE id='de000000-0000-0000-0000-00000000000b';
INSERT INTO public.mentor_availability (mentor_id, day_of_week, start_hour)
SELECT 'de000000-0000-0000-0000-00000000000b'::uuid, d::smallint, h FROM generate_series(1,7) d, unnest(ARRAY[10,11]::smallint[]) h
ON CONFLICT DO NOTHING;

-- a payout row so b_payout can carry payout_id
INSERT INTO public.mentor_payouts (id, mentor_id, amount_inr, payout_date, status)
VALUES ('de000000-0000-0000-0000-0000000000f0','de000000-0000-0000-0000-00000000000a',800,CURRENT_DATE+1,'scheduled') ON CONFLICT (id) DO NOTHING;

-- helper to build date/slot at an IST hour-offset from now (truncated to the hour)
-- inlined per booking below.
INSERT INTO public.bookings (id, mentor_id, student_id, date, time_slot, duration, price, status, paid_at, payout_id) VALUES
('de000000-0000-0000-0000-00000000b001','de000000-0000-0000-0000-00000000000a','de000000-0000-0000-0000-0000000000c1', ((now() AT TIME ZONE 'Asia/Kolkata')+interval '26 hours')::date, to_char(date_trunc('hour',(now() AT TIME ZONE 'Asia/Kolkata')+interval '26 hours'),'HH24')||':00',60,1000,'confirmed',now(),NULL),
('de000000-0000-0000-0000-00000000b002','de000000-0000-0000-0000-00000000000a','de000000-0000-0000-0000-0000000000c1', ((now() AT TIME ZONE 'Asia/Kolkata')+interval '13 hours')::date, to_char(date_trunc('hour',(now() AT TIME ZONE 'Asia/Kolkata')+interval '13 hours'),'HH24')||':00',60,1000,'confirmed',now(),NULL),
('de000000-0000-0000-0000-00000000b003','de000000-0000-0000-0000-00000000000a','de000000-0000-0000-0000-0000000000c1', ((now() AT TIME ZONE 'Asia/Kolkata')+interval '1 hours')::date, to_char(date_trunc('hour',(now() AT TIME ZONE 'Asia/Kolkata')+interval '1 hours'),'HH24')||':00',60,1000,'confirmed',now(),NULL),
('de000000-0000-0000-0000-00000000b004','de000000-0000-0000-0000-00000000000a','de000000-0000-0000-0000-0000000000c1', ((now() AT TIME ZONE 'Asia/Kolkata')+interval '50 hours')::date, to_char(date_trunc('hour',(now() AT TIME ZONE 'Asia/Kolkata')+interval '50 hours'),'HH24')||':00',60,9999,'confirmed',now(),NULL),
('de000000-0000-0000-0000-00000000b005','de000000-0000-0000-0000-00000000000a','de000000-0000-0000-0000-0000000000c1', ((now() AT TIME ZONE 'Asia/Kolkata')+interval '4 hours')::date, to_char(date_trunc('hour',(now() AT TIME ZONE 'Asia/Kolkata')+interval '4 hours'),'HH24')||':00',60,1000,'confirmed',now(),NULL),
('de000000-0000-0000-0000-00000000b006','de000000-0000-0000-0000-00000000000a','de000000-0000-0000-0000-0000000000c1', ((now() AT TIME ZONE 'Asia/Kolkata')+interval '70 hours')::date, to_char(date_trunc('hour',(now() AT TIME ZONE 'Asia/Kolkata')+interval '70 hours'),'HH24')||':00',60,1000,'pending_payment',NULL,NULL),
('de000000-0000-0000-0000-00000000b007','de000000-0000-0000-0000-00000000000a','de000000-0000-0000-0000-0000000000c1', ((now() AT TIME ZONE 'Asia/Kolkata')+interval '74 hours')::date, to_char(date_trunc('hour',(now() AT TIME ZONE 'Asia/Kolkata')+interval '74 hours'),'HH24')||':00',60,1000,'confirmed',now(),'de000000-0000-0000-0000-0000000000f0'),
('de000000-0000-0000-0000-00000000b00b','de000000-0000-0000-0000-00000000000a','de000000-0000-0000-0000-0000000000c1', ((now() AT TIME ZONE 'Asia/Kolkata')+interval '95 hours')::date, to_char(date_trunc('hour',(now() AT TIME ZONE 'Asia/Kolkata')+interval '95 hours'),'HH24')||':00',60,1000,'confirmed',now(),NULL),
-- orphan fixtures (expired ones are outside the overlap guard)
('de000000-0000-0000-0000-00000000b008','de000000-0000-0000-0000-00000000000a','de000000-0000-0000-0000-0000000000c1', CURRENT_DATE-1,'10:00',60,1000,'expired',NULL,NULL),
('de000000-0000-0000-0000-00000000b009','de000000-0000-0000-0000-00000000000a','de000000-0000-0000-0000-0000000000c1', ((now() AT TIME ZONE 'Asia/Kolkata')+interval '120 hours')::date, to_char(date_trunc('hour',(now() AT TIME ZONE 'Asia/Kolkata')+interval '120 hours'),'HH24')||':00',60,1000,'confirmed',now(),NULL),
('de000000-0000-0000-0000-00000000b00a','de000000-0000-0000-0000-00000000000a','de000000-0000-0000-0000-0000000000c1', CURRENT_DATE-2,'10:00',60,1000,'expired',NULL,NULL),
-- cap: Sc3 is an active mentee of the cap mentor
('de000000-0000-0000-0000-00000000bc01','de000000-0000-0000-0000-00000000000b','de000000-0000-0000-0000-0000000000c3', CURRENT_DATE-5,'10:00',60,1000,'confirmed',now(),NULL)
ON CONFLICT (id) DO NOTHING;

-- captured ledger rows (amount_inr is what was actually charged). NOTE b004 was
-- charged 1000 even though bookings.price=9999 — the C-2 test point.
INSERT INTO public.payment_ledger (booking_id, event_type, idempotency_key, razorpay_payment_id, amount_inr, mentor_share_inr) VALUES
('de000000-0000-0000-0000-00000000b001','payment_captured','captured:e1','pay_e1',1000,800),
('de000000-0000-0000-0000-00000000b002','payment_captured','captured:e2','pay_e2',1000,800),
('de000000-0000-0000-0000-00000000b003','payment_captured','captured:e3','pay_e3',1000,800),
('de000000-0000-0000-0000-00000000b004','payment_captured','captured:e4','pay_e4',1000,800),
('de000000-0000-0000-0000-00000000b005','payment_captured','captured:e5','pay_e5',1000,800),
('de000000-0000-0000-0000-00000000b007','payment_captured','captured:e7','pay_e7',1000,800),
('de000000-0000-0000-0000-00000000b008','payment_captured','captured:e8','pay_e8',1000,800),
('de000000-0000-0000-0000-00000000b009','payment_captured','captured:e9','pay_e9',1000,800),
('de000000-0000-0000-0000-00000000b00a','payment_captured','captured:ea','pay_ea',1000,800),
('de000000-0000-0000-0000-00000000b00a','refund_created','refund:ea_ref','pay_ea',1000,NULL)  -- b00a already refunded → not an orphan
ON CONFLICT (idempotency_key) DO NOTHING;

CREATE TEMP TABLE _e (test_id text PRIMARY KEY, status text NOT NULL, detail text NOT NULL);

-- helpers: act as a user
-- E.01 full / E.02 half / E.03 none
DO $$
DECLARE r1 jsonb; r2 jsonb; r3 jsonb; v_st text; v_intent int;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"de000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  r1 := public.cancel_booking_as_student('de000000-0000-0000-0000-00000000b001');
  r2 := public.cancel_booking_as_student('de000000-0000-0000-0000-00000000b002');
  r3 := public.cancel_booking_as_student('de000000-0000-0000-0000-00000000b003');
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  SELECT status INTO v_st FROM public.bookings WHERE id='de000000-0000-0000-0000-00000000b001';
  SELECT count(*) INTO v_intent FROM public.refund_intents WHERE booking_id='de000000-0000-0000-0000-00000000b001' AND status='pending' AND amount_inr=1000;
  INSERT INTO _e VALUES ('E.01_tier_full_24h',
    CASE WHEN (r1->>'tier')='full' AND (r1->>'refundable_inr')='1000' AND v_st='cancelled' AND v_intent=1 THEN 'PASS' ELSE 'FAIL' END,
    'full: '||r1::text||' status='||v_st||' intent_rows='||v_intent);
  INSERT INTO _e VALUES ('E.02_tier_half_2to24h',
    CASE WHEN (r2->>'tier')='half' AND (r2->>'refundable_inr')='500' THEN 'PASS' ELSE 'FAIL' END, 'half: '||r2::text);
  INSERT INTO _e VALUES ('E.03_tier_none_under2h',
    CASE WHEN (r3->>'tier')='none' AND (r3->>'refundable_inr')='0' THEN 'PASS' ELSE 'FAIL' END, 'none: '||r3::text);
END $$;

-- E.04 refund amount from LEDGER not price (price=9999, captured=1000, full → 1000)
DO $$
DECLARE r jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"de000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  r := public.cancel_booking_as_student('de000000-0000-0000-0000-00000000b004');
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _e VALUES ('E.04_refund_from_ledger_not_price',
    CASE WHEN (r->>'refundable_inr')='1000' AND (r->>'captured_inr')='1000' THEN 'PASS' ELSE 'FAIL' END,
    'price was 9999 but captured 1000 → '||r::text||' (expect refundable 1000, NOT 9999)');
END $$;

-- E.05 mentor cancel → full regardless of time (4h out → full)
DO $$
DECLARE r jsonb; v_st text;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"de000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  r := public.cancel_booking_as_mentor('de000000-0000-0000-0000-00000000b005');
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  SELECT status INTO v_st FROM public.bookings WHERE id='de000000-0000-0000-0000-00000000b005';
  INSERT INTO _e VALUES ('E.05_mentor_cancel_full',
    CASE WHEN (r->>'tier')='full' AND (r->>'refundable_inr')='1000' AND v_st='cancelled' THEN 'PASS' ELSE 'FAIL' END,
    'mentor cancel 4h-out: '||r::text||' status='||v_st);
END $$;

-- E.06 rejections: non-owner / pending / payout-set
DO $$
DECLARE v_nonowner bool:=false; v_pending bool:=false; v_payout bool:=false;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"de000000-0000-0000-0000-0000000000c2","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN PERFORM public.cancel_booking_as_student('de000000-0000-0000-0000-00000000b006'); EXCEPTION WHEN OTHERS THEN IF SQLERRM ILIKE '%your own booking%' THEN v_nonowner:=true; END IF; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"sub":"de000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN PERFORM public.cancel_booking_as_student('de000000-0000-0000-0000-00000000b006'); EXCEPTION WHEN OTHERS THEN IF SQLERRM ILIKE '%only a confirmed%' THEN v_pending:=true; END IF; END;
  BEGIN PERFORM public.cancel_booking_as_student('de000000-0000-0000-0000-00000000b007'); EXCEPTION WHEN OTHERS THEN IF SQLERRM ILIKE '%already been settled%' THEN v_payout:=true; END IF; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _e VALUES ('E.06_cancel_rejections',
    CASE WHEN v_nonowner AND v_pending AND v_payout THEN 'PASS' ELSE 'FAIL' END,
    'non-owner='||v_nonowner||' pending='||v_pending||' payout-set='||v_payout);
END $$;

-- E.07 dangling demo paths closed
DO $$
DECLARE v_raw_st text; v_rpc_blocked bool:=false;
BEGIN
  -- (a) raw student UPDATE → no-op under RLS (no cancel policy anymore)
  PERFORM set_config('request.jwt.claims','{"sub":"de000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN UPDATE public.bookings SET status='cancelled' WHERE id='de000000-0000-0000-0000-00000000b00b'; EXCEPTION WHEN OTHERS THEN NULL; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  SELECT status INTO v_raw_st FROM public.bookings WHERE id='de000000-0000-0000-0000-00000000b00b';
  -- (b) update_booking_status_as_mentor not executable by authenticated
  PERFORM set_config('request.jwt.claims','{"sub":"de000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN PERFORM public.update_booking_status_as_mentor('de000000-0000-0000-0000-00000000b00b','cancelled'); EXCEPTION WHEN OTHERS THEN IF SQLERRM ILIKE '%permission denied%' THEN v_rpc_blocked:=true; END IF; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _e VALUES ('E.07_dangling_paths_closed',
    CASE WHEN v_raw_st='confirmed' AND v_rpc_blocked THEN 'PASS' ELSE 'FAIL' END,
    'raw student UPDATE left status='||v_raw_st||' (expect confirmed=no-op); demo mentor RPC blocked='||v_rpc_blocked);
END $$;

-- E.08 max_active_mentees: new student blocked at cap; already-active allowed
DO $$
DECLARE v_new_blocked bool:=false; v_active_ok uuid;
BEGIN
  -- S2 (new student) tries to book the cap mentor (cap=1, Sc3 already active) → reject
  PERFORM set_config('request.jwt.claims','{"sub":"de000000-0000-0000-0000-0000000000c2","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN PERFORM public.book_session('de000000-0000-0000-0000-00000000000b', CURRENT_DATE+3, '10:00');
  EXCEPTION WHEN OTHERS THEN IF SQLERRM ILIKE '%active-mentee limit%' THEN v_new_blocked:=true; END IF; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"sub":"de000000-0000-0000-0000-0000000000c3","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  -- Sc3 (already active) can book again even at cap
  BEGIN v_active_ok := public.book_session('de000000-0000-0000-0000-00000000000b', CURRENT_DATE+3, '11:00'); EXCEPTION WHEN OTHERS THEN v_active_ok := NULL; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _e VALUES ('E.08_mentee_cap',
    CASE WHEN v_new_blocked AND v_active_ok IS NOT NULL THEN 'PASS' ELSE 'FAIL' END,
    'new student blocked at cap='||v_new_blocked||'; already-active student booked again='||(v_active_ok IS NOT NULL)::text);
END $$;

-- E.09 orphan detection: expired+captured = orphan; confirmed+captured NOT; refunded NOT
DO $$
DECLARE v_has_exp bool; v_has_conf bool; v_has_ref bool;
BEGIN
  SELECT EXISTS(SELECT 1 FROM public.find_orphan_captures() WHERE booking_id='de000000-0000-0000-0000-00000000b008') INTO v_has_exp;
  SELECT EXISTS(SELECT 1 FROM public.find_orphan_captures() WHERE booking_id='de000000-0000-0000-0000-00000000b009') INTO v_has_conf;
  SELECT EXISTS(SELECT 1 FROM public.find_orphan_captures() WHERE booking_id='de000000-0000-0000-0000-00000000b00a') INTO v_has_ref;
  INSERT INTO _e VALUES ('E.09_orphan_detection',
    CASE WHEN v_has_exp AND NOT v_has_conf AND NOT v_has_ref THEN 'PASS' ELSE 'FAIL' END,
    'expired-captured orphan='||v_has_exp||' confirmed(NOT)='||v_has_conf||' refunded(NOT)='||v_has_ref||' (expect t,f,f)');
END $$;

-- E.10 (folded E-ORPHAN-DOUBLE-REFUND): a cancelled booking carrying a
-- refund_intent must NOT be swept as an orphan — else the deferred executor
-- would refund the full captured amount on top of the policy refund.
DO $$
DECLARE v_full bool; v_none bool;
BEGIN
  -- b001 was full-tier-cancelled (E.01), b003 none-tier-cancelled (E.03); both
  -- are status='cancelled' with a payment_captured ledger row + a refund_intent.
  SELECT EXISTS(SELECT 1 FROM public.find_orphan_captures() WHERE booking_id='de000000-0000-0000-0000-00000000b001') INTO v_full;
  SELECT EXISTS(SELECT 1 FROM public.find_orphan_captures() WHERE booking_id='de000000-0000-0000-0000-00000000b003') INTO v_none;
  INSERT INTO _e VALUES ('E.10_cancelled_not_double_refunded',
    CASE WHEN NOT v_full AND NOT v_none THEN 'PASS' ELSE 'FAIL' END,
    'full-tier-cancel in orphan set='||v_full||'; none-tier-cancel in orphan set='||v_none||' (expect false,false)');
END $$;

SELECT test_id, status, detail FROM _e ORDER BY test_id;
ROLLBACK;
