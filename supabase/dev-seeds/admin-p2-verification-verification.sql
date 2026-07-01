-- ════════════════════════════════════════════════════════════════════════════
-- ADMIN P2 dev-seed: mentor verification (applications reader + audited approve/reject).
-- Pairs with 20260701000003_admin_p2_verification.sql.
-- Proves: is_admin gate; the reader's server-side is_adult result; audited approve
-- (+ the 18+ trigger blocking a non-adult approve and rolling back with NO audit
-- row); audited reject with reason stored; reason-required.
-- BEGIN..ROLLBACK — does not persist.
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- Fixtures: founder admin + three adult pending mentors (A2 blocks non-adult mentor
-- signup, so all are created adult; m2's DOB is downgraded post-signup for the block test).
INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token, email_change, email_change_token_new, created_at, updated_at, instance_id) VALUES
('da000000-0000-0000-0000-0000000000a0','authenticated','authenticated','divitfatehpuria7@gmail.com',crypt('x',gen_salt('bf')),now(),'{"provider":"email"}','{"role":"student","full_name":"Founder","phone":"+91","school":"S","grade":"Grade 12","date_of_birth":"1990-01-01"}','','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
('da000000-0000-0000-0000-0000000000c1','authenticated','authenticated','p2-m1@example.com',crypt('x',gen_salt('bf')),now(),'{"provider":"email"}','{"role":"mentor","full_name":"Approvable Mentor","university":"IIT","course":"CS","year":"3rd Year","date_of_birth":"2000-01-01"}','','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
('da000000-0000-0000-0000-0000000000c2','authenticated','authenticated','p2-m2@example.com',crypt('x',gen_salt('bf')),now(),'{"provider":"email"}','{"role":"mentor","full_name":"Underage Mentor","university":"IIT","course":"CS","year":"2nd Year","date_of_birth":"2001-01-01"}','','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
('da000000-0000-0000-0000-0000000000c3','authenticated','authenticated','p2-m3@example.com',crypt('x',gen_salt('bf')),now(),'{"provider":"email"}','{"role":"mentor","full_name":"Rejectable Mentor","university":"IIT","course":"CS","year":"4th Year","date_of_birth":"1999-01-01"}','','','','',now(),now(),'00000000-0000-0000-0000-000000000000')
ON CONFLICT (id) DO NOTHING;
DELETE FROM public.admin_roles WHERE user_id <> 'da000000-0000-0000-0000-0000000000a0';
-- submitted applications with a college-ID doc on file (service_role bypasses the self-approval lock)
UPDATE public.mentors SET id_document_path = id||'/id.jpg', application_submitted_at = now()
  WHERE id IN ('da000000-0000-0000-0000-0000000000c1','da000000-0000-0000-0000-0000000000c2','da000000-0000-0000-0000-0000000000c3');
-- downgrade m2's DOB to a minor (allowed while status='pending' — the 18+ trigger only bites on the transition INTO approved)
UPDATE public.mentors SET date_of_birth = (current_date - interval '15 years')::date WHERE id = 'da000000-0000-0000-0000-0000000000c2';

CREATE TEMP TABLE _p2 (test_id text PRIMARY KEY, status text NOT NULL, detail text NOT NULL);

-- P2.01 (reject): a non-admin (mentor m3) is refused by every P2 RPC.
DO $$
DECLARE v_blocked int := 0;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-0000000000c3","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN PERFORM public.admin_list_mentor_applications(); EXCEPTION WHEN OTHERS THEN IF SQLERRM ILIKE '%forbidden%' THEN v_blocked:=v_blocked+1; END IF; END;
  BEGIN PERFORM public.admin_approve_mentor('da000000-0000-0000-0000-0000000000c1'); EXCEPTION WHEN OTHERS THEN IF SQLERRM ILIKE '%forbidden%' THEN v_blocked:=v_blocked+1; END IF; END;
  BEGIN PERFORM public.admin_reject_mentor('da000000-0000-0000-0000-0000000000c1','x'); EXCEPTION WHEN OTHERS THEN IF SQLERRM ILIKE '%forbidden%' THEN v_blocked:=v_blocked+1; END IF; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p2 VALUES ('P2.01_nonadmin_forbidden',
    CASE WHEN v_blocked=3 THEN 'PASS' ELSE 'FAIL' END, 'forbidden count='||v_blocked||'/3');
END $$;

-- P2.02 (happy): the reader returns the server-side is_adult result (m1 adult, m2 minor) + doc flags.
DO $$
DECLARE v_m1_adult bool; v_m2_adult bool; v_m1_hasdoc bool;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-0000000000a0","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT is_adult, has_id_doc INTO v_m1_adult, v_m1_hasdoc FROM public.admin_list_mentor_applications(NULL,'da000000-0000-0000-0000-0000000000c1');
  SELECT is_adult INTO v_m2_adult FROM public.admin_list_mentor_applications(NULL,'da000000-0000-0000-0000-0000000000c2');
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p2 VALUES ('P2.02_reader_is_adult_and_docflags',
    CASE WHEN v_m1_adult AND v_m2_adult=false AND v_m1_hasdoc THEN 'PASS' ELSE 'FAIL' END,
    'm1_adult='||v_m1_adult||' m2_adult='||v_m2_adult||' m1_has_id_doc='||v_m1_hasdoc||' (expect true,false,true)');
END $$;

-- P2.03 (happy): admin_approve_mentor(m1) → approved + verified_at + audited.
DO $$
DECLARE v_status text; v_verified bool; v_rr bool; v_audit int;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-0000000000a0","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.admin_approve_mentor('da000000-0000-0000-0000-0000000000c1');
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  SELECT status::text, verified_at IS NOT NULL, re_review_pending INTO v_status, v_verified, v_rr FROM public.mentors WHERE id='da000000-0000-0000-0000-0000000000c1';
  SELECT count(*) INTO v_audit FROM public.admin_audit_log WHERE action='approve_mentor' AND target_id='da000000-0000-0000-0000-0000000000c1';
  INSERT INTO _p2 VALUES ('P2.03_approve_audited',
    CASE WHEN v_status='approved' AND v_verified AND v_rr=false AND v_audit=1 THEN 'PASS' ELSE 'FAIL' END,
    'status='||v_status||' verified='||v_verified||' re_review='||v_rr||' audit='||v_audit);
END $$;

-- P2.04 (block): approving a NON-adult mentor is blocked by the 18+ trigger and
-- rolls back — status unchanged AND no approve audit row for m2.
DO $$
DECLARE v_blocked bool := false; v_status text; v_audit int;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-0000000000a0","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN PERFORM public.admin_approve_mentor('da000000-0000-0000-0000-0000000000c2'); EXCEPTION WHEN OTHERS THEN IF SQLERRM ILIKE '%18_plus%' OR SQLERRM ILIKE '%check_violation%' THEN v_blocked:=true; END IF; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  SELECT status::text INTO v_status FROM public.mentors WHERE id='da000000-0000-0000-0000-0000000000c2';
  SELECT count(*) INTO v_audit FROM public.admin_audit_log WHERE action='approve_mentor' AND target_id='da000000-0000-0000-0000-0000000000c2';
  INSERT INTO _p2 VALUES ('P2.04_underage_approve_blocked_no_audit',
    CASE WHEN v_blocked AND v_status='pending' AND v_audit=0 THEN 'PASS' ELSE 'FAIL' END,
    'blocked='||v_blocked||' status='||v_status||' (still pending) approve_audit='||v_audit||' (expect 0)');
END $$;

-- P2.05 (happy): admin_reject_mentor(m3, reason) → rejected + reason stored + audited.
DO $$
DECLARE v_status text; v_notes text; v_audit int;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-0000000000a0","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.admin_reject_mentor('da000000-0000-0000-0000-0000000000c3','ID photo is blurry — please resubmit');
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  SELECT status::text, verification_notes INTO v_status, v_notes FROM public.mentors WHERE id='da000000-0000-0000-0000-0000000000c3';
  SELECT count(*) INTO v_audit FROM public.admin_audit_log WHERE action='reject_mentor' AND target_id='da000000-0000-0000-0000-0000000000c3';
  INSERT INTO _p2 VALUES ('P2.05_reject_audited',
    CASE WHEN v_status='rejected' AND v_notes='ID photo is blurry — please resubmit' AND v_audit=1 THEN 'PASS' ELSE 'FAIL' END,
    'status='||v_status||' notes='||coalesce(v_notes,'∅')||' audit='||v_audit);
END $$;

-- P2.06 (reject): rejecting with an empty reason is refused.
DO $$
DECLARE v_blocked bool := false;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-0000000000a0","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN PERFORM public.admin_reject_mentor('da000000-0000-0000-0000-0000000000c1','   '); EXCEPTION WHEN OTHERS THEN IF SQLERRM ILIKE '%reason_required%' THEN v_blocked:=true; END IF; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p2 VALUES ('P2.06_reject_reason_required',
    CASE WHEN v_blocked THEN 'PASS' ELSE 'FAIL' END, 'empty-reason reject blocked='||v_blocked);
END $$;

-- P2.07 (audit-bypass closed): even an admin, acting as the `authenticated` role,
-- can NOT call the un-audited primitives directly — EXECUTE is revoked, so the only
-- authenticated path is the audited wrapper (which reaches them as the owner).
DO $$
DECLARE v_appr bool := false; v_rej bool := false; v_set bool := false;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-0000000000a0","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN PERFORM public.approve_mentor('da000000-0000-0000-0000-0000000000c1'); EXCEPTION WHEN insufficient_privilege THEN v_appr:=true; WHEN OTHERS THEN IF SQLERRM ILIKE '%permission denied%' THEN v_appr:=true; END IF; END;
  BEGIN PERFORM public.reject_mentor('da000000-0000-0000-0000-0000000000c1','x'); EXCEPTION WHEN insufficient_privilege THEN v_rej:=true; WHEN OTHERS THEN IF SQLERRM ILIKE '%permission denied%' THEN v_rej:=true; END IF; END;
  BEGIN PERFORM public.admin_set_mentor_status('da000000-0000-0000-0000-0000000000c1','approved'); EXCEPTION WHEN insufficient_privilege THEN v_set:=true; WHEN OTHERS THEN IF SQLERRM ILIKE '%permission denied%' THEN v_set:=true; END IF; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p2 VALUES ('P2.07_primitives_direct_call_denied',
    CASE WHEN v_appr AND v_rej AND v_set THEN 'PASS' ELSE 'FAIL' END,
    'approve_denied='||v_appr||' reject_denied='||v_rej||' set_status_denied='||v_set);
END $$;

SELECT test_id, status, detail FROM _p2 ORDER BY test_id;
ROLLBACK;
