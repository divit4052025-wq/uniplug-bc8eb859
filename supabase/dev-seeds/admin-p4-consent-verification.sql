-- ════════════════════════════════════════════════════════════════════════════
-- ADMIN P4 dev-seed: consent oversight.
-- Pairs with 20260701000005_admin_p4_consent.sql.
-- Proves: is_admin gate on all 4 fns; DERIVED status (granted/pending/revoked);
-- audited revocation (fills the A3 audit gap) + its booking fallout; resolve a
-- fallout event; and that the un-audited mark_consent_revoked primitive is closed.
-- BEGIN..ROLLBACK — does not persist.
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token, email_change, email_change_token_new, created_at, updated_at, instance_id) VALUES
('da000000-0000-0000-0000-0000000000a0','authenticated','authenticated','divitfatehpuria7@gmail.com',crypt('x',gen_salt('bf')),now(),'{"provider":"email"}','{"role":"student","full_name":"Founder","phone":"+91 90000 00000","school":"S","grade":"Grade 12","date_of_birth":"1990-01-01"}','','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
('da000000-0000-0000-0000-0000000004b1','authenticated','authenticated','p4-granted@example.com',crypt('x',gen_salt('bf')),now(),'{"provider":"email"}','{"role":"student","full_name":"Granted Minor","phone":"+91 90000 11111","school":"DPS","grade":"Grade 8","date_of_birth":"2012-01-01","parent_email":"parent1@example.com","parent_phone":"+91 90000 22222"}','','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
('da000000-0000-0000-0000-0000000004b2','authenticated','authenticated','p4-pending@example.com',crypt('x',gen_salt('bf')),now(),'{"provider":"email"}','{"role":"student","full_name":"Pending Minor","phone":"+91 90000 33333","school":"DPS","grade":"Grade 8","date_of_birth":"2012-01-01","parent_email":"parent2@example.com","parent_phone":"+91 90000 44444"}','','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
('da000000-0000-0000-0000-0000000004b3','authenticated','authenticated','p4-revoked@example.com',crypt('x',gen_salt('bf')),now(),'{"provider":"email"}','{"role":"student","full_name":"Revoked Minor","phone":"+91 90000 55555","school":"DPS","grade":"Grade 8","date_of_birth":"2012-01-01","parent_email":"parent3@example.com","parent_phone":"+91 90000 66666"}','','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
('da000000-0000-0000-0000-0000000004c0','authenticated','authenticated','p4-mentor@example.com',crypt('x',gen_salt('bf')),now(),'{"provider":"email"}','{"role":"mentor","full_name":"Arjun Mentor","university":"IIT","course":"CS","year":"3rd Year","date_of_birth":"2000-01-01"}','','','','',now(),now(),'00000000-0000-0000-0000-000000000000')
ON CONFLICT (id) DO NOTHING;
DELETE FROM public.admin_roles WHERE user_id <> 'da000000-0000-0000-0000-0000000000a0';
UPDATE public.mentors SET status='approved' WHERE id='da000000-0000-0000-0000-0000000004c0';

-- b1 = GRANTED (consent on file) + a paid confirmed booking (will freeze on revoke)
UPDATE public.students SET parental_consent_at=now() WHERE id='da000000-0000-0000-0000-0000000004b1';
INSERT INTO public.bookings (id, student_id, mentor_id, date, time_slot, duration, price, status, paid_at)
VALUES ('da000000-0000-0000-0000-0000000004f1','da000000-0000-0000-0000-0000000004b1','da000000-0000-0000-0000-0000000004c0',(current_date+5),'14:00',60,1500,'confirmed',now())
ON CONFLICT (id) DO NOTHING;
-- b2 = PENDING (minor, no consent, no revocation)  [left as-is after signup]
-- b3 = REVOKED (minor, no consent, has a revocation event)
UPDATE public.students SET parental_consent_at=NULL, parental_consent_token=NULL WHERE id='da000000-0000-0000-0000-0000000004b3';
INSERT INTO public.consent_revocation_events (student_id, booking_id, action) VALUES ('da000000-0000-0000-0000-0000000004b3', NULL, 'shares_revoked');

CREATE TEMP TABLE _p4 (test_id text PRIMARY KEY, status text NOT NULL, detail text NOT NULL);

-- P4.01 (reject): a non-admin (a student) is refused by all 4 fns.
DO $$
DECLARE v int := 0;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-0000000004b2","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN PERFORM public.admin_list_consent(); EXCEPTION WHEN OTHERS THEN IF SQLERRM ILIKE '%forbidden%' THEN v:=v+1; END IF; END;
  BEGIN PERFORM public.admin_list_consent_fallout(); EXCEPTION WHEN OTHERS THEN IF SQLERRM ILIKE '%forbidden%' THEN v:=v+1; END IF; END;
  BEGIN PERFORM public.admin_revoke_consent('da000000-0000-0000-0000-0000000004b1','x'); EXCEPTION WHEN OTHERS THEN IF SQLERRM ILIKE '%forbidden%' THEN v:=v+1; END IF; END;
  BEGIN PERFORM public.admin_resolve_consent_event(gen_random_uuid(),'x'); EXCEPTION WHEN OTHERS THEN IF SQLERRM ILIKE '%forbidden%' THEN v:=v+1; END IF; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p4 VALUES ('P4.01_nonadmin_all_forbidden', CASE WHEN v=4 THEN 'PASS' ELSE 'FAIL' END, 'forbidden count='||v||'/4');
END $$;

-- P4.02 (happy): derived status per minor + status filter.
DO $$
DECLARE v_b1 text; v_b2 text; v_b3 text; v_filter int;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-0000000000a0","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT status INTO v_b1 FROM public.admin_list_consent() WHERE student_id='da000000-0000-0000-0000-0000000004b1';
  SELECT status INTO v_b2 FROM public.admin_list_consent() WHERE student_id='da000000-0000-0000-0000-0000000004b2';
  SELECT status INTO v_b3 FROM public.admin_list_consent() WHERE student_id='da000000-0000-0000-0000-0000000004b3';
  SELECT count(*) INTO v_filter FROM public.admin_list_consent('granted') WHERE student_id='da000000-0000-0000-0000-0000000004b2';
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p4 VALUES ('P4.02_derived_status',
    CASE WHEN v_b1='granted' AND v_b2='pending' AND v_b3='revoked' AND v_filter=0 THEN 'PASS' ELSE 'FAIL' END,
    'b1='||coalesce(v_b1,'NULL')||' b2='||coalesce(v_b2,'NULL')||' b3='||coalesce(v_b3,'NULL')||' pending-in-granted-filter='||v_filter);
END $$;

-- P4.03 (happy): audited revoke + reason required + cascade NULLs consent.
DO $$
DECLARE v_reason_blocked bool := false; v_consent timestamptz; v_audit int;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-0000000000a0","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN PERFORM public.admin_revoke_consent('da000000-0000-0000-0000-0000000004b1',''); EXCEPTION WHEN OTHERS THEN IF SQLERRM ILIKE '%reason_required%' THEN v_reason_blocked:=true; END IF; END;
  PERFORM public.admin_revoke_consent('da000000-0000-0000-0000-0000000004b1','parent withdrew consent');
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  SELECT parental_consent_at INTO v_consent FROM public.students WHERE id='da000000-0000-0000-0000-0000000004b1';
  SELECT count(*) INTO v_audit FROM public.admin_audit_log WHERE action='revoke_consent' AND target_id='da000000-0000-0000-0000-0000000004b1' AND justification='parent withdrew consent';
  INSERT INTO _p4 VALUES ('P4.03_audited_revoke',
    CASE WHEN v_reason_blocked AND v_consent IS NULL AND v_audit=1 THEN 'PASS' ELSE 'FAIL' END,
    'reason_required='||v_reason_blocked||' consent_now='||coalesce(v_consent::text,'NULL')||' audit_rows='||v_audit);
END $$;

-- P4.04 (happy): the revoke froze b1's paid booking => a frozen_paid fallout event (unresolved).
DO $$
DECLARE v_fallout int; v_action text;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-0000000000a0","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*), max(action) INTO v_fallout, v_action FROM public.admin_list_consent_fallout()
    WHERE booking_id='da000000-0000-0000-0000-0000000004f1';
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p4 VALUES ('P4.04_revoke_froze_paid_booking',
    CASE WHEN v_fallout=1 AND v_action='frozen_paid' THEN 'PASS' ELSE 'FAIL' END,
    'fallout_for_f1='||v_fallout||' action='||coalesce(v_action,'NULL')||' (expect 1,frozen_paid)');
END $$;

-- P4.05 (happy): resolve the fallout event => resolved + audited; second resolve raises.
DO $$
DECLARE v_ev uuid; v_resolved timestamptz; v_audit int; v_double_blocked bool := false;
BEGIN
  SELECT id INTO v_ev FROM public.consent_revocation_events WHERE booking_id='da000000-0000-0000-0000-0000000004f1' AND action='frozen_paid';
  PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-0000000000a0","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.admin_resolve_consent_event(v_ev, 'refunded manually via gateway');
  BEGIN PERFORM public.admin_resolve_consent_event(v_ev, 'again'); EXCEPTION WHEN OTHERS THEN IF SQLERRM ILIKE '%already_resolved%' THEN v_double_blocked:=true; END IF; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  SELECT resolved_at INTO v_resolved FROM public.consent_revocation_events WHERE id=v_ev;
  SELECT count(*) INTO v_audit FROM public.admin_audit_log WHERE action='resolve_consent_fallout' AND target_id='da000000-0000-0000-0000-0000000004b1';
  INSERT INTO _p4 VALUES ('P4.05_resolve_fallout',
    CASE WHEN v_resolved IS NOT NULL AND v_audit=1 AND v_double_blocked THEN 'PASS' ELSE 'FAIL' END,
    'resolved='||(v_resolved IS NOT NULL)||' audit='||v_audit||' double_blocked='||v_double_blocked);
END $$;

-- P4.06 (audit-bypass closed): direct mark_consent_revoked is denied for authenticated.
DO $$
DECLARE v_denied bool := false;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-0000000000a0","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN PERFORM public.mark_consent_revoked('da000000-0000-0000-0000-0000000004b2');
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; WHEN OTHERS THEN IF SQLERRM ILIKE '%permission denied%' THEN v_denied:=true; END IF; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p4 VALUES ('P4.06_primitive_direct_call_denied',
    CASE WHEN v_denied THEN 'PASS' ELSE 'FAIL' END, 'mark_consent_revoked_denied='||v_denied);
END $$;

-- P4.07 (review: re-revocation guard): revoking an already-revoked student (b1, now
-- NULL after P4.03) or a never-granted pending minor (b2) raises no_active_consent —
-- so no duplicate frozen_paid fallout + no phantom audit/ledger row on a typo.
DO $$
DECLARE v_already bool := false; v_pending bool := false;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-0000000000a0","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN PERFORM public.admin_revoke_consent('da000000-0000-0000-0000-0000000004b1','again'); EXCEPTION WHEN OTHERS THEN IF SQLERRM ILIKE '%no_active_consent%' THEN v_already:=true; END IF; END;
  BEGIN PERFORM public.admin_revoke_consent('da000000-0000-0000-0000-0000000004b2','pending'); EXCEPTION WHEN OTHERS THEN IF SQLERRM ILIKE '%no_active_consent%' THEN v_pending:=true; END IF; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p4 VALUES ('P4.07_re_revocation_guarded',
    CASE WHEN v_already AND v_pending THEN 'PASS' ELSE 'FAIL' END,
    'already_revoked_blocked='||v_already||' pending_revoke_blocked='||v_pending);
END $$;

SELECT test_id, status, detail FROM _p4 ORDER BY test_id;
ROLLBACK;
