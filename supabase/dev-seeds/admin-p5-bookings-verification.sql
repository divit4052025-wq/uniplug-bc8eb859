-- ════════════════════════════════════════════════════════════════════════════
-- ADMIN P5 dev-seed: bookings / sessions ledger.
-- Pairs with 20260701000006_admin_p5_bookings.sql.
-- Proves: is_admin gate on all 3 readers; filterable ledger (status/frozen) with
-- MASKED parties + paid proxy + refund-pending flag + invalid_status reject; booking
-- detail logs view_booking (+ existence check); honest join-audit reader.
-- BEGIN..ROLLBACK — does not persist.
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;
DELETE FROM auth.users WHERE email = 'divitfatehpuria7@gmail.com' AND id <> 'da000000-0000-0000-0000-0000000000a0';  -- CI-compose: drop admin-fixture founder-email row (rolled back)
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token, email_change, email_change_token_new, created_at, updated_at, instance_id) VALUES
('da000000-0000-0000-0000-0000000000a0','authenticated','authenticated','divitfatehpuria7@gmail.com',crypt('x',gen_salt('bf')),now(),'{"provider":"email"}','{"role":"student","full_name":"Founder","phone":"+91 90000 00000","school":"S","grade":"Grade 12","date_of_birth":"1990-01-01"}','','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
('da000000-0000-0000-0000-000000000501','authenticated','authenticated','p5-student@example.com',crypt('x',gen_salt('bf')),now(),'{"provider":"email"}','{"role":"student","full_name":"Zoya Ledger","phone":"+91 90000 10001","school":"DPS","grade":"Grade 12","date_of_birth":"2000-01-01"}','','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
('da000000-0000-0000-0000-000000000502','authenticated','authenticated','p5-mentor@example.com',crypt('x',gen_salt('bf')),now(),'{"provider":"email"}','{"role":"mentor","full_name":"Vikram Ledger","university":"IIT","course":"CS","year":"3rd Year","date_of_birth":"1999-01-01"}','','','','',now(),now(),'00000000-0000-0000-0000-000000000000')
ON CONFLICT (id) DO NOTHING;
DELETE FROM public.admin_roles WHERE user_id <> 'da000000-0000-0000-0000-0000000000a0';
UPDATE public.mentors SET status='approved' WHERE id='da000000-0000-0000-0000-000000000502';

-- 4 bookings across states (active ones need slot_range; distinct dates => no overlap)
INSERT INTO public.bookings (id, student_id, mentor_id, date, time_slot, duration, price, status, paid_at, frozen_at, slot_range) VALUES
('da000000-0000-0000-0000-000000000511','da000000-0000-0000-0000-000000000501','da000000-0000-0000-0000-000000000502',(current_date+10),'10:00',60,1500,'confirmed',now(),NULL,
   tstzrange(((current_date+10)+time '10:00')::timestamptz, ((current_date+10)+time '11:00')::timestamptz)),
('da000000-0000-0000-0000-000000000512','da000000-0000-0000-0000-000000000501','da000000-0000-0000-0000-000000000502',(current_date+11),'10:00',60,1500,'pending_payment',NULL,NULL,
   tstzrange(((current_date+11)+time '10:00')::timestamptz, ((current_date+11)+time '11:00')::timestamptz)),
('da000000-0000-0000-0000-000000000513','da000000-0000-0000-0000-000000000501','da000000-0000-0000-0000-000000000502',(current_date+12),'10:00',60,1500,'confirmed',now(),now(),
   tstzrange(((current_date+12)+time '10:00')::timestamptz, ((current_date+12)+time '11:00')::timestamptz)),
('da000000-0000-0000-0000-000000000514','da000000-0000-0000-0000-000000000501','da000000-0000-0000-0000-000000000502',(current_date+13),'10:00',60,2000,'cancelled',now(),NULL,NULL)
ON CONFLICT (id) DO NOTHING;
-- join tokens issued for the confirmed booking (honest signal); a pending refund for the cancelled one
INSERT INTO public.video_join_audit (booking_id, user_id, role, issued_at, token_exp) VALUES
('da000000-0000-0000-0000-000000000511','da000000-0000-0000-0000-000000000501','student', now(), now()+interval '1 hour'),
('da000000-0000-0000-0000-000000000511','da000000-0000-0000-0000-000000000502','mentor',  now(), now()+interval '1 hour');
INSERT INTO public.refund_intents (booking_id, amount_inr, tier, source, status)
VALUES ('da000000-0000-0000-0000-000000000514', 2000, 'full', 'admin', 'pending');

CREATE TEMP TABLE _p5 (test_id text PRIMARY KEY, status text NOT NULL, detail text NOT NULL);

-- P5.01 (reject): non-admin (the student) refused by all 3 readers.
DO $$
DECLARE v int := 0;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-000000000501","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN PERFORM public.admin_list_bookings_ledger(); EXCEPTION WHEN OTHERS THEN IF SQLERRM ILIKE '%forbidden%' THEN v:=v+1; END IF; END;
  BEGIN PERFORM public.admin_get_booking('da000000-0000-0000-0000-000000000511'); EXCEPTION WHEN OTHERS THEN IF SQLERRM ILIKE '%forbidden%' THEN v:=v+1; END IF; END;
  BEGIN PERFORM public.admin_list_booking_joins('da000000-0000-0000-0000-000000000511'); EXCEPTION WHEN OTHERS THEN IF SQLERRM ILIKE '%forbidden%' THEN v:=v+1; END IF; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p5 VALUES ('P5.01_nonadmin_all_forbidden', CASE WHEN v=3 THEN 'PASS' ELSE 'FAIL' END, 'forbidden count='||v||'/3');
END $$;

-- P5.02 (happy): ledger masks parties + paid proxy + invalid_status rejects.
DO $$
DECLARE v_conf_label text; v_conf_paid bool; v_unpaid_paid bool; v_leak bool := false; v_badstatus bool := false;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-0000000000a0","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT student_label, paid INTO v_conf_label, v_conf_paid FROM public.admin_list_bookings_ledger() WHERE id='da000000-0000-0000-0000-000000000511';
  SELECT paid INTO v_unpaid_paid FROM public.admin_list_bookings_ledger() WHERE id='da000000-0000-0000-0000-000000000512';
  v_leak := (v_conf_label ILIKE '%Zoya Ledger%');
  BEGIN PERFORM public.admin_list_bookings_ledger('not_a_status'); EXCEPTION WHEN OTHERS THEN IF SQLERRM ILIKE '%invalid_status%' THEN v_badstatus:=true; END IF; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p5 VALUES ('P5.02_ledger_masked_paid_proxy',
    CASE WHEN v_conf_label LIKE '%•%' AND NOT v_leak AND v_conf_paid AND NOT v_unpaid_paid AND v_badstatus THEN 'PASS' ELSE 'FAIL' END,
    'conf_label='||coalesce(v_conf_label,'NULL')||' name_leak='||v_leak||' conf_paid='||v_conf_paid||' unpaid_paid='||v_unpaid_paid||' invalid_rejected='||v_badstatus);
END $$;

-- P5.03 (happy): status filter + frozen_only + refund_pending flag.
DO $$
DECLARE v_conf_only int; v_conf_has_unpaid int; v_frozen int; v_refund bool;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-0000000000a0","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO v_conf_only FROM public.admin_list_bookings_ledger('confirmed') WHERE id='da000000-0000-0000-0000-000000000511';
  SELECT count(*) INTO v_conf_has_unpaid FROM public.admin_list_bookings_ledger('confirmed') WHERE id='da000000-0000-0000-0000-000000000512';
  SELECT count(*) INTO v_frozen FROM public.admin_list_bookings_ledger(NULL,NULL,NULL,true) WHERE id='da000000-0000-0000-0000-000000000513';
  SELECT refund_pending INTO v_refund FROM public.admin_list_bookings_ledger() WHERE id='da000000-0000-0000-0000-000000000514';
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p5 VALUES ('P5.03_filters',
    CASE WHEN v_conf_only=1 AND v_conf_has_unpaid=0 AND v_frozen=1 AND v_refund THEN 'PASS' ELSE 'FAIL' END,
    'confirmed_incl_bkconf='||v_conf_only||' confirmed_excl_unpaid='||v_conf_has_unpaid||' frozen_only='||v_frozen||' refund_pending='||v_refund);
END $$;

-- P5.04 (happy): booking detail logs view_booking + masks + refund summary.
DO $$
DECLARE v_status text; v_mlabel text; v_has_payment bool; v_refund text; v_audit int;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-0000000000a0","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT status, mentor_label, has_payment, refund_status INTO v_status, v_mlabel, v_has_payment, v_refund
    FROM public.admin_get_booking('da000000-0000-0000-0000-000000000514');
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  SELECT count(*) INTO v_audit FROM public.admin_audit_log WHERE action='view_booking' AND target_id='da000000-0000-0000-0000-000000000514';
  INSERT INTO _p5 VALUES ('P5.04_detail_logs_and_refund',
    CASE WHEN v_status='cancelled' AND v_mlabel LIKE '%•%' AND v_refund='pending' AND v_audit=1 THEN 'PASS' ELSE 'FAIL' END,
    'status='||v_status||' mentor_masked='||(v_mlabel LIKE '%•%')||' refund='||coalesce(v_refund,'NULL')||' view_audit='||v_audit);
END $$;

-- P5.05 (happy): join-audit reader returns the token-issuance rows (masked).
DO $$
DECLARE v_n int; v_roles text; v_leak bool;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-0000000000a0","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*), string_agg(role, ',' ORDER BY role), bool_or(user_label ILIKE '%Vikram%' OR user_label ILIKE '%Zoya%')
    INTO v_n, v_roles, v_leak FROM public.admin_list_booking_joins('da000000-0000-0000-0000-000000000511');
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p5 VALUES ('P5.05_join_audit',
    CASE WHEN v_n=2 AND v_roles='mentor,student' AND NOT v_leak THEN 'PASS' ELSE 'FAIL' END,
    'joins='||v_n||' roles='||coalesce(v_roles,'NULL')||' name_leak='||v_leak);
END $$;

-- P5.06 (existence): detail of a non-existent booking returns 0 rows + writes NO view log.
DO $$
DECLARE v_rows int; v_audit int;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-0000000000a0","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO v_rows FROM public.admin_get_booking('da000000-0000-0000-0000-0000000000ff');
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  SELECT count(*) INTO v_audit FROM public.admin_audit_log WHERE action='view_booking' AND target_id='da000000-0000-0000-0000-0000000000ff';
  INSERT INTO _p5 VALUES ('P5.06_nonexistent_no_log',
    CASE WHEN v_rows=0 AND v_audit=0 THEN 'PASS' ELSE 'FAIL' END, 'rows='||v_rows||' phantom_view_log='||v_audit);
END $$;

-- P5.07 (review: audit the sensitive join-audit read): admin_list_booking_joins logs
-- view_booking_joins (P5.05 already called it for bk_conf as the founder admin).
DO $$
DECLARE v_audit int;
BEGIN
  SELECT count(*) INTO v_audit FROM public.admin_audit_log
   WHERE action='view_booking_joins' AND target_id='da000000-0000-0000-0000-000000000511'
     AND actor_id='da000000-0000-0000-0000-0000000000a0';
  INSERT INTO _p5 VALUES ('P5.07_join_read_audited',
    CASE WHEN v_audit >= 1 THEN 'PASS' ELSE 'FAIL' END, 'view_booking_joins rows='||v_audit);
END $$;

SELECT test_id, status, detail FROM _p5 ORDER BY test_id;
ROLLBACK;
