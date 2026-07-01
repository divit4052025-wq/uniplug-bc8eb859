-- ════════════════════════════════════════════════════════════════════════════
-- ADMIN P6 dev-seed: payments view (read-only).
-- Pairs with 20260701000007_admin_p6_payments.sql.
-- Proves: is_admin gate on all 4 readers; reconciliation summary buckets by
-- event_type (delta vs baseline, robust to persisting data); ledger feed masks
-- parties + event_type filter/reject; refund_intents (owed) + mentor_payouts
-- (accrued) lists mask + status filter.
-- BEGIN..ROLLBACK — does not persist.
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token, email_change, email_change_token_new, created_at, updated_at, instance_id) VALUES
('da000000-0000-0000-0000-0000000000a0','authenticated','authenticated','divitfatehpuria7@gmail.com',crypt('x',gen_salt('bf')),now(),'{"provider":"email"}','{"role":"student","full_name":"Founder","phone":"+91 90000 00000","school":"S","grade":"Grade 12","date_of_birth":"1990-01-01"}','','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
('da000000-0000-0000-0000-000000000601','authenticated','authenticated','p6-student@example.com',crypt('x',gen_salt('bf')),now(),'{"provider":"email"}','{"role":"student","full_name":"Priya Payments","phone":"+91 90000 10001","school":"DPS","grade":"Grade 12","date_of_birth":"2000-01-01"}','','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
('da000000-0000-0000-0000-000000000602','authenticated','authenticated','p6-mentor@example.com',crypt('x',gen_salt('bf')),now(),'{"provider":"email"}','{"role":"mentor","full_name":"Rohan Payments","university":"IIT","course":"CS","year":"3rd Year","date_of_birth":"1999-01-01"}','','','','',now(),now(),'00000000-0000-0000-0000-000000000000')
ON CONFLICT (id) DO NOTHING;
DELETE FROM public.admin_roles WHERE user_id <> 'da000000-0000-0000-0000-0000000000a0';
UPDATE public.mentors SET status='approved' WHERE id='da000000-0000-0000-0000-000000000602';
INSERT INTO public.bookings (id, student_id, mentor_id, date, time_slot, duration, price, status, paid_at, slot_range)
VALUES ('da000000-0000-0000-0000-000000000611','da000000-0000-0000-0000-000000000601','da000000-0000-0000-0000-000000000602',(current_date+20),'09:00',60,1000,'confirmed',now(),
   tstzrange(((current_date+20)+time '09:00')::timestamptz, ((current_date+20)+time '10:00')::timestamptz))
ON CONFLICT (id) DO NOTHING;

CREATE TEMP TABLE _p6 (test_id text PRIMARY KEY, status text NOT NULL, detail text NOT NULL);

-- baseline summary (as admin) BEFORE the money fixtures. is_admin() reads auth.uid()
-- from the JWT claims — no DB-role switch needed, so the connection stays superuser
-- and the RLS-locked INSERTs below are permitted (avoids the RESET ROLE pitfall).
SELECT set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-0000000000a0"}', true);
CREATE TEMP TABLE _base AS SELECT * FROM public.admin_payments_summary();
SELECT set_config('request.jwt.claims','{"role":"service_role"}', true);
-- money fixtures: a capture (1000/800/200), a refund_created (400), a clawback (mshare 320),
-- a pending refund (400), a scheduled payout (900).
INSERT INTO public.payment_ledger (booking_id, event_type, idempotency_key, razorpay_payment_id, amount_inr, mentor_share_inr, platform_fee_inr) VALUES
  ('da000000-0000-0000-0000-000000000611','payment_captured','p6-cap-1','pay_p6cap',1000,800,200),
  ('da000000-0000-0000-0000-000000000611','refund_created','p6-ref-1',NULL,400,NULL,NULL),
  ('da000000-0000-0000-0000-000000000611','clawback_owed','p6-claw-1',NULL,400,320,NULL);
INSERT INTO public.refund_intents (booking_id, amount_inr, tier, source, status) VALUES ('da000000-0000-0000-0000-000000000611',400,'full','admin','pending');
INSERT INTO public.mentor_payouts (mentor_id, amount_inr, payout_date, status) VALUES ('da000000-0000-0000-0000-000000000602',900,current_date,'scheduled');
-- after summary (as admin)
SELECT set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-0000000000a0"}', true);
CREATE TEMP TABLE _after AS SELECT * FROM public.admin_payments_summary();
SELECT set_config('request.jwt.claims','{"role":"service_role"}', true);

-- P6.02 (happy): summary reconciliation buckets — delta vs baseline == fixtures.
INSERT INTO _p6
SELECT 'P6.02_summary_deltas',
  CASE WHEN (a.gross_captured_inr - b.gross_captured_inr)=1000
        AND (a.mentor_share_accrued_inr - b.mentor_share_accrued_inr)=800
        AND (a.platform_fee_inr - b.platform_fee_inr)=200
        AND (a.total_refunded_inr - b.total_refunded_inr)=400
        AND (a.clawback_owed_inr - b.clawback_owed_inr)=320
        AND (a.refund_owed_inr - b.refund_owed_inr)=400
        AND (a.payout_scheduled_inr - b.payout_scheduled_inr)=900 THEN 'PASS' ELSE 'FAIL' END,
  'dGross='||(a.gross_captured_inr-b.gross_captured_inr)||' dMshare='||(a.mentor_share_accrued_inr-b.mentor_share_accrued_inr)
  ||' dFee='||(a.platform_fee_inr-b.platform_fee_inr)||' dRefunded='||(a.total_refunded_inr-b.total_refunded_inr)
  ||' dClawback='||(a.clawback_owed_inr-b.clawback_owed_inr)||' dRefundOwed='||(a.refund_owed_inr-b.refund_owed_inr)
  ||' dPayoutSched='||(a.payout_scheduled_inr-b.payout_scheduled_inr)
FROM _base b, _after a;

-- P6.01 (reject): non-admin (the student) refused by all 4 readers.
DO $$
DECLARE v int := 0;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-000000000601","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN PERFORM public.admin_payments_summary(); EXCEPTION WHEN OTHERS THEN IF SQLERRM ILIKE '%forbidden%' THEN v:=v+1; END IF; END;
  BEGIN PERFORM public.admin_list_payment_ledger(); EXCEPTION WHEN OTHERS THEN IF SQLERRM ILIKE '%forbidden%' THEN v:=v+1; END IF; END;
  BEGIN PERFORM public.admin_list_refund_intents(); EXCEPTION WHEN OTHERS THEN IF SQLERRM ILIKE '%forbidden%' THEN v:=v+1; END IF; END;
  BEGIN PERFORM public.admin_list_mentor_payouts(); EXCEPTION WHEN OTHERS THEN IF SQLERRM ILIKE '%forbidden%' THEN v:=v+1; END IF; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p6 VALUES ('P6.01_nonadmin_all_forbidden', CASE WHEN v=4 THEN 'PASS' ELSE 'FAIL' END, 'forbidden count='||v||'/4');
END $$;

-- P6.03 (happy): ledger feed masks parties + event_type filter + invalid rejects.
DO $$
DECLARE v_label text; v_leak bool; v_caponly int; v_badev bool := false;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-0000000000a0","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  -- identify our fixture rows via the RPC output columns (the base tables are
  -- RLS-locked and unreadable by the authenticated role we are running as).
  SELECT student_label INTO v_label FROM public.admin_list_payment_ledger()
    WHERE booking_id='da000000-0000-0000-0000-000000000611' AND event_type='payment_captured' AND amount_inr=1000 LIMIT 1;
  v_leak := (v_label ILIKE '%Priya Payments%');
  -- the captured row must NOT surface under an event_type='refund_created' filter
  SELECT count(*) INTO v_caponly FROM public.admin_list_payment_ledger('refund_created')
    WHERE booking_id='da000000-0000-0000-0000-000000000611' AND event_type='payment_captured' AND amount_inr=1000;
  BEGIN PERFORM public.admin_list_payment_ledger('not_an_event'); EXCEPTION WHEN OTHERS THEN IF SQLERRM ILIKE '%invalid_event_type%' THEN v_badev:=true; END IF; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p6 VALUES ('P6.03_ledger_masked_filtered',
    CASE WHEN v_label LIKE '%•%' AND NOT v_leak AND v_caponly=0 AND v_badev THEN 'PASS' ELSE 'FAIL' END,
    'label='||coalesce(v_label,'NULL')||' leak='||v_leak||' cap_in_refund_filter='||v_caponly||' invalid_rejected='||v_badev);
END $$;

-- P6.04/05 (happy): refund_intents (owed, masked, filter) + mentor_payouts (accrued, masked, filter).
DO $$
DECLARE v_rlabel text; v_rleak bool; v_rpending int; v_rprocessed int; v_plabel text; v_pleak bool; v_psched int;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-0000000000a0","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT student_label INTO v_rlabel FROM public.admin_list_refund_intents() WHERE booking_id='da000000-0000-0000-0000-000000000611' LIMIT 1;
  v_rleak := (v_rlabel ILIKE '%Priya Payments%');
  SELECT count(*) INTO v_rpending FROM public.admin_list_refund_intents('pending') WHERE booking_id='da000000-0000-0000-0000-000000000611';
  SELECT count(*) INTO v_rprocessed FROM public.admin_list_refund_intents('processed') WHERE booking_id='da000000-0000-0000-0000-000000000611';
  SELECT mentor_label INTO v_plabel FROM public.admin_list_mentor_payouts() WHERE mentor_id='da000000-0000-0000-0000-000000000602' AND amount_inr=900 LIMIT 1;
  v_pleak := (v_plabel ILIKE '%Rohan Payments%');
  SELECT count(*) INTO v_psched FROM public.admin_list_mentor_payouts('scheduled') WHERE mentor_id='da000000-0000-0000-0000-000000000602' AND amount_inr=900;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p6 VALUES ('P6.04_refunds_and_payouts',
    CASE WHEN v_rlabel LIKE '%•%' AND NOT v_rleak AND v_rpending=1 AND v_rprocessed=0
          AND v_plabel LIKE '%•%' AND NOT v_pleak AND v_psched=1 THEN 'PASS' ELSE 'FAIL' END,
    'refund_label='||coalesce(v_rlabel,'NULL')||' refund_leak='||v_rleak||' pending='||v_rpending||' processed_filter='||v_rprocessed
    ||' | payout_label='||coalesce(v_plabel,'NULL')||' payout_leak='||v_pleak||' scheduled='||v_psched);
END $$;

SELECT test_id, status, detail FROM _p6 ORDER BY test_id;
ROLLBACK;
