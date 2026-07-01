-- ════════════════════════════════════════════════════════════════════════════
-- ADMIN P1 dev-seed: safeguarding queue + triage + case + account moderation.
-- Pairs with 20260701000002_admin_p1_safeguarding.sql.
-- Proves: is_admin gate on every RPC (non-admin rejected); unified queue with
-- masked labels; case bundle + view audit; triage upsert; warn; freeze/cancel
-- booking (respect A3, no refund); frozen booking blocks the join; escalation;
-- logged PII reveal; account suspend/ban ENFORCEMENT (blocked user cannot book
-- or message); locked tables immutable to clients.
-- BEGIN..ROLLBACK — does not persist.
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- Fixtures: founder admin (bootstrap super_admin), a MINOR student (reporter/
-- subject, with parent contact), a mentor. Valid signup metadata so handle_new_user succeeds.
INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token, email_change, email_change_token_new, created_at, updated_at, instance_id) VALUES
('da000000-0000-0000-0000-0000000000a0','authenticated','authenticated','divitfatehpuria7@gmail.com',crypt('x',gen_salt('bf')),now(),'{"provider":"email"}','{"role":"student","full_name":"Founder","phone":"+91","school":"S","grade":"Grade 12","date_of_birth":"1990-01-01"}','','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
('da000000-0000-0000-0000-0000000000b0','authenticated','authenticated','p1-student@example.com',crypt('x',gen_salt('bf')),now(),'{"provider":"email"}','{"role":"student","full_name":"Riya Student","phone":"+91 90000 11111","school":"DPS","grade":"Grade 8","date_of_birth":"2012-01-01","parent_email":"parent@example.com","parent_phone":"+91 90000 22222"}','','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
('da000000-0000-0000-0000-0000000000c0','authenticated','authenticated','p1-mentor@example.com',crypt('x',gen_salt('bf')),now(),'{"provider":"email"}','{"role":"mentor","full_name":"Arjun Mentor","university":"IIT","course":"CS","year":"3rd Year","date_of_birth":"2000-01-01"}','','','','',now(),now(),'00000000-0000-0000-0000-000000000000')
ON CONFLICT (id) DO NOTHING;
DELETE FROM public.admin_roles WHERE user_id NOT IN ('da000000-0000-0000-0000-0000000000a0');
UPDATE public.mentors SET status='approved' WHERE id='da000000-0000-0000-0000-0000000000c0';
-- grant the minor consent so the confirmed booking is join-testable
UPDATE public.students SET parental_consent_at=now() WHERE id='da000000-0000-0000-0000-0000000000b0';

-- Two reports (one per ledger) + two bookings (paid confirmed / unpaid), inserted while unblocked.
INSERT INTO public.message_reports (id, conversation_id, reporter_id, reported_message_id, reported_user_id, reason)
VALUES ('da000000-0000-0000-0000-0000000000d1','da000000-0000-0000-0000-0000000000e1','da000000-0000-0000-0000-0000000000b0',NULL,'da000000-0000-0000-0000-0000000000c0','mentor sent inappropriate messages')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.safety_reports (id, reporter_id, subject_user_id, booking_id, category, body, status)
VALUES ('da000000-0000-0000-0000-0000000000d2','da000000-0000-0000-0000-0000000000c0','da000000-0000-0000-0000-0000000000b0',NULL,'harassment','concerning behaviour flagged','open')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.bookings (id, student_id, mentor_id, date, time_slot, duration, price, status, paid_at)
VALUES ('da000000-0000-0000-0000-0000000000f1','da000000-0000-0000-0000-0000000000b0','da000000-0000-0000-0000-0000000000c0',(current_date+5),'14:00',60,1500,'confirmed',now()),
       ('da000000-0000-0000-0000-0000000000f2','da000000-0000-0000-0000-0000000000b0','da000000-0000-0000-0000-0000000000c0',(current_date+6),'15:00',60,1500,'pending_payment',NULL),
       ('da000000-0000-0000-0000-0000000000f3','da000000-0000-0000-0000-0000000000b0','da000000-0000-0000-0000-0000000000c0',(current_date+7),'16:00',60,1500,'confirmed',now())
ON CONFLICT (id) DO NOTHING;

CREATE TEMP TABLE _p1 (test_id text PRIMARY KEY, status text NOT NULL, detail text NOT NULL);

-- P1.01 (reject): a non-admin (the mentor) is refused by every admin RPC.
DO $$
DECLARE v_blocked int := 0;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-0000000000c0","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN PERFORM public.admin_list_safeguarding_queue(); EXCEPTION WHEN OTHERS THEN IF SQLERRM ILIKE '%forbidden%' THEN v_blocked:=v_blocked+1; END IF; END;
  BEGIN PERFORM public.admin_set_account_state('da000000-0000-0000-0000-0000000000b0','banned'); EXCEPTION WHEN OTHERS THEN IF SQLERRM ILIKE '%forbidden%' THEN v_blocked:=v_blocked+1; END IF; END;
  BEGIN PERFORM public.admin_warn_user('da000000-0000-0000-0000-0000000000b0','x'); EXCEPTION WHEN OTHERS THEN IF SQLERRM ILIKE '%forbidden%' THEN v_blocked:=v_blocked+1; END IF; END;
  BEGIN PERFORM public.admin_freeze_or_cancel_booking('da000000-0000-0000-0000-0000000000f1'); EXCEPTION WHEN OTHERS THEN IF SQLERRM ILIKE '%forbidden%' THEN v_blocked:=v_blocked+1; END IF; END;
  BEGIN PERFORM public.admin_record_escalation('childline_1098'); EXCEPTION WHEN OTHERS THEN IF SQLERRM ILIKE '%forbidden%' THEN v_blocked:=v_blocked+1; END IF; END;
  BEGIN PERFORM public.admin_reveal_contact('da000000-0000-0000-0000-0000000000b0'); EXCEPTION WHEN OTHERS THEN IF SQLERRM ILIKE '%forbidden%' THEN v_blocked:=v_blocked+1; END IF; END;
  BEGIN PERFORM public.admin_get_report_case('safety','da000000-0000-0000-0000-0000000000d2'); EXCEPTION WHEN OTHERS THEN IF SQLERRM ILIKE '%forbidden%' THEN v_blocked:=v_blocked+1; END IF; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p1 VALUES ('P1.01_nonadmin_all_forbidden',
    CASE WHEN v_blocked=7 THEN 'PASS' ELSE 'FAIL' END, 'forbidden count='||v_blocked||'/7');
END $$;

-- P1.02 (happy): unified queue returns BOTH reports with MASKED labels (no raw names).
DO $$
DECLARE v_n int; v_leak int;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-0000000000a0","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO v_n FROM public.admin_list_safeguarding_queue();
  SELECT count(*) INTO v_leak FROM public.admin_list_safeguarding_queue()
    WHERE reporter_label ILIKE '%Riya%' OR subject_label ILIKE '%Riya%' OR reporter_label ILIKE '%Arjun%';
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p1 VALUES ('P1.02_queue_unified_masked',
    CASE WHEN v_n>=2 AND v_leak=0 THEN 'PASS' ELSE 'FAIL' END, 'rows='||v_n||' (>=2) raw-name leaks='||v_leak||' (expect 0)');
END $$;

-- P1.03 (happy): opening a case returns the bundle AND writes a view_report_case audit row.
DO $$
DECLARE v_conv uuid; v_audit int;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-0000000000a0","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT conversation_id INTO v_conv FROM public.admin_get_report_case('message','da000000-0000-0000-0000-0000000000d1');
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  SELECT count(*) INTO v_audit FROM public.admin_audit_log WHERE action='view_report_case' AND target_id='da000000-0000-0000-0000-0000000000d1';
  INSERT INTO _p1 VALUES ('P1.03_case_bundle_and_view_logged',
    CASE WHEN v_conv='da000000-0000-0000-0000-0000000000e1' AND v_audit=1 THEN 'PASS' ELSE 'FAIL' END,
    'conversation_id='||coalesce(v_conv::text,'NULL')||' view_audit_rows='||v_audit);
END $$;

-- P1.04 (happy): triage upsert; queue reflects the new status + severity.
DO $$
DECLARE v_status text; v_sev text;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-0000000000a0","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.admin_set_report_triage('message','da000000-0000-0000-0000-0000000000d1','in_review','high','looking into it');
  SELECT status, severity INTO v_status, v_sev FROM public.admin_list_safeguarding_queue()
    WHERE source='message' AND report_id='da000000-0000-0000-0000-0000000000d1';
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p1 VALUES ('P1.04_triage_upsert',
    CASE WHEN v_status='in_review' AND v_sev='high' THEN 'PASS' ELSE 'FAIL' END,
    'status='||coalesce(v_status,'NULL')||' severity='||coalesce(v_sev,'NULL'));
END $$;

-- P1.05 (happy): freeze a PAID confirmed booking (frozen_at set, status UNCHANGED, no refund).
DO $$
DECLARE v_action text; v_status text; v_frozen timestamptz;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-0000000000a0","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT public.admin_freeze_or_cancel_booking('da000000-0000-0000-0000-0000000000f1','flagged in report') INTO v_action;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  SELECT status, frozen_at INTO v_status, v_frozen FROM public.bookings WHERE id='da000000-0000-0000-0000-0000000000f1';
  INSERT INTO _p1 VALUES ('P1.05_freeze_paid_booking',
    CASE WHEN v_action='freeze_paid_booking' AND v_status='confirmed' AND v_frozen IS NOT NULL THEN 'PASS' ELSE 'FAIL' END,
    'action='||v_action||' status='||v_status||' (unchanged) frozen_at_set='||(v_frozen IS NOT NULL)::text);
END $$;

-- P1.06 (happy+enforce): a frozen booking is NOT joinable (booking_frozen), and an
-- UNPAID booking cancels cleanly.
DO $$
DECLARE v_join_blocked bool := false; v_action text; v_status text;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-0000000000b0","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN PERFORM public.authorize_video_join('da000000-0000-0000-0000-0000000000f1'); EXCEPTION WHEN OTHERS THEN IF SQLERRM ILIKE '%booking_frozen%' THEN v_join_blocked:=true; END IF; END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-0000000000a0","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT public.admin_freeze_or_cancel_booking('da000000-0000-0000-0000-0000000000f2') INTO v_action;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  SELECT status INTO v_status FROM public.bookings WHERE id='da000000-0000-0000-0000-0000000000f2';
  INSERT INTO _p1 VALUES ('P1.06_frozen_join_blocked_and_cancel_unpaid',
    CASE WHEN v_join_blocked AND v_action='cancel_unpaid_booking' AND v_status='cancelled' THEN 'PASS' ELSE 'FAIL' END,
    'join_blocked='||v_join_blocked||' unpaid_action='||v_action||' unpaid_status='||v_status);
END $$;

-- P1.07 (happy+enforce): suspend the student → account_is_blocked → a NEW booking
-- and a NEW message for them are REJECTED by the enforcement triggers.
DO $$
DECLARE v_blocked bool; v_bk_blocked bool := false; v_msg_blocked bool := false;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-0000000000a0","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.admin_set_account_state('da000000-0000-0000-0000-0000000000b0','suspended','safeguarding hold');
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  SELECT public.account_is_blocked('da000000-0000-0000-0000-0000000000b0') INTO v_blocked;
  BEGIN
    INSERT INTO public.bookings (id, student_id, mentor_id, date, time_slot, duration, price, status)
    VALUES ('da000000-0000-0000-0000-0000000000f9','da000000-0000-0000-0000-0000000000b0','da000000-0000-0000-0000-0000000000c0',(current_date+9),'11:00',60,1500,'pending_payment');
  EXCEPTION WHEN OTHERS THEN IF SQLERRM ILIKE '%account_blocked%' THEN v_bk_blocked:=true; END IF; END;
  BEGIN
    INSERT INTO public.conversations (id, student_id, mentor_id) VALUES ('da000000-0000-0000-0000-0000000000e9','da000000-0000-0000-0000-0000000000b0','da000000-0000-0000-0000-0000000000c0') ON CONFLICT DO NOTHING;
    INSERT INTO public.messages (conversation_id, sender_id, recipient_id, body)
    VALUES ('da000000-0000-0000-0000-0000000000e9','da000000-0000-0000-0000-0000000000b0','da000000-0000-0000-0000-0000000000c0','hi');
  EXCEPTION WHEN OTHERS THEN IF SQLERRM ILIKE '%account_blocked%' THEN v_msg_blocked:=true; END IF; END;
  INSERT INTO _p1 VALUES ('P1.07_suspend_enforced',
    CASE WHEN v_blocked AND v_bk_blocked AND v_msg_blocked THEN 'PASS' ELSE 'FAIL' END,
    'is_blocked='||v_blocked||' booking_blocked='||v_bk_blocked||' message_blocked='||v_msg_blocked);
END $$;

-- P1.075 (HIGH fix): a SUSPENDED party cannot join an EXISTING confirmed video
-- session — the ban must close live 1:1 video with a minor, not just block new
-- bookings. Student b0 is still suspended (from P1.07); the (unblocked) mentor
-- tries to join their shared confirmed booking f3 and is refused account_blocked.
DO $$
DECLARE v_join_blocked bool := false;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-0000000000c0","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN PERFORM public.authorize_video_join('da000000-0000-0000-0000-0000000000f3'); EXCEPTION WHEN OTHERS THEN IF SQLERRM ILIKE '%account_blocked%' THEN v_join_blocked:=true; END IF; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p1 VALUES ('P1.075_suspended_party_cannot_join_video',
    CASE WHEN v_join_blocked THEN 'PASS' ELSE 'FAIL' END, 'video_join_blocked_while_suspended='||v_join_blocked||' (expect true)');
END $$;

-- P1.08 (happy): restore the account → no longer blocked.
DO $$
DECLARE v_blocked bool;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-0000000000a0","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.admin_set_account_state('da000000-0000-0000-0000-0000000000b0','active');
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  SELECT public.account_is_blocked('da000000-0000-0000-0000-0000000000b0') INTO v_blocked;
  INSERT INTO _p1 VALUES ('P1.08_restore_unblocks',
    CASE WHEN v_blocked=false THEN 'PASS' ELSE 'FAIL' END, 'is_blocked_after_restore='||v_blocked||' (expect false)');
END $$;

-- P1.09 (happy): warn + escalation recorded, audited, and readable.
DO $$
DECLARE v_warn uuid; v_esc uuid; v_esc_rows int; v_audit int;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-0000000000a0","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT public.admin_warn_user('da000000-0000-0000-0000-0000000000c0','tone warning') INTO v_warn;
  SELECT public.admin_record_escalation('childline_1098','da000000-0000-0000-0000-0000000000b0','safety','da000000-0000-0000-0000-0000000000d2','ref#123') INTO v_esc;
  SELECT count(*) INTO v_esc_rows FROM public.admin_list_escalations('safety','da000000-0000-0000-0000-0000000000d2');
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  SELECT count(*) INTO v_audit FROM public.admin_audit_log WHERE action IN ('warn_user','record_escalation');
  INSERT INTO _p1 VALUES ('P1.09_warn_and_escalation',
    CASE WHEN v_warn IS NOT NULL AND v_esc IS NOT NULL AND v_esc_rows=1 AND v_audit>=2 THEN 'PASS' ELSE 'FAIL' END,
    'warn='||(v_warn IS NOT NULL)::text||' esc='||(v_esc IS NOT NULL)::text||' esc_read='||v_esc_rows||' audit>=2 ('||v_audit||')');
END $$;

-- P1.10 (happy): reveal contact returns the minor's parent contact AND logs it.
DO $$
DECLARE v_pphone text; v_audit int;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-0000000000a0","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT parent_phone INTO v_pphone FROM public.admin_reveal_contact('da000000-0000-0000-0000-0000000000b0','case review');
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  SELECT count(*) INTO v_audit FROM public.admin_audit_log WHERE action='reveal_contact' AND target_id='da000000-0000-0000-0000-0000000000b0';
  INSERT INTO _p1 VALUES ('P1.10_reveal_contact_logged',
    CASE WHEN v_pphone='+91 90000 22222' AND v_audit=1 THEN 'PASS' ELSE 'FAIL' END,
    'parent_phone='||coalesce(v_pphone,'NULL')||' reveal_audit_rows='||v_audit);
END $$;

-- P1.11 (lock): the new tables are immutable to a signed-in non-service client.
DO $$
DECLARE v_triage bool := false; v_mod bool := false; v_esc bool := false;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-0000000000a0","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN PERFORM 1 FROM public.report_triage LIMIT 1; EXCEPTION WHEN OTHERS THEN v_triage:=true; END;
  BEGIN PERFORM 1 FROM public.account_moderation LIMIT 1; EXCEPTION WHEN OTHERS THEN v_mod:=true; END;
  BEGIN INSERT INTO public.escalation_records (channel, actor_id) VALUES ('other', auth.uid()); EXCEPTION WHEN OTHERS THEN v_esc:=true; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p1 VALUES ('P1.11_tables_locked',
    CASE WHEN v_triage AND v_mod AND v_esc THEN 'PASS' ELSE 'FAIL' END,
    'triage_read_blocked='||v_triage||' moderation_read_blocked='||v_mod||' escalation_insert_blocked='||v_esc);
END $$;

SELECT test_id, status, detail FROM _p1 ORDER BY test_id;
ROLLBACK;
