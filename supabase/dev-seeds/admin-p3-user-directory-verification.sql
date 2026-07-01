-- ════════════════════════════════════════════════════════════════════════════
-- ADMIN P3 dev-seed: user directory + 360 profiles.
-- Pairs with 20260701000004_admin_p3_user_directory.sql.
-- Proves: is_admin gate on all 5 readers; unified search (name/role) with account
-- state; the 360 header for a student (consent/minor) and a mentor (18+/status);
-- per-user bookings (masked counterpart), reports-involving (role_in), warnings.
-- BEGIN..ROLLBACK — does not persist.
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token, email_change, email_change_token_new, created_at, updated_at, instance_id) VALUES
('da000000-0000-0000-0000-0000000000a0','authenticated','authenticated','divitfatehpuria7@gmail.com',crypt('x',gen_salt('bf')),now(),'{"provider":"email"}','{"role":"student","full_name":"Founder","phone":"+91","school":"S","grade":"Grade 12","date_of_birth":"1990-01-01"}','','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
('da000000-0000-0000-0000-0000000000b0','authenticated','authenticated','p3-student@example.com',crypt('x',gen_salt('bf')),now(),'{"provider":"email"}','{"role":"student","full_name":"Riya Directory","phone":"+91 90000 11111","school":"DPS","grade":"Grade 8","date_of_birth":"2012-01-01","parent_email":"parent@example.com","parent_phone":"+91 90000 22222"}','','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
('da000000-0000-0000-0000-0000000000c0','authenticated','authenticated','p3-mentor@example.com',crypt('x',gen_salt('bf')),now(),'{"provider":"email"}','{"role":"mentor","full_name":"Arjun Directory","university":"IIT","course":"CS","year":"3rd Year","date_of_birth":"2000-01-01"}','','','','',now(),now(),'00000000-0000-0000-0000-000000000000')
ON CONFLICT (id) DO NOTHING;
DELETE FROM public.admin_roles WHERE user_id <> 'da000000-0000-0000-0000-0000000000a0';
UPDATE public.mentors SET status='approved' WHERE id='da000000-0000-0000-0000-0000000000c0';
UPDATE public.students SET parental_consent_at=now() WHERE id='da000000-0000-0000-0000-0000000000b0';

-- a booking, a report (b0 as subject), a warning — inserted while b0 is active
INSERT INTO public.bookings (id, student_id, mentor_id, date, time_slot, duration, price, status, paid_at)
VALUES ('da000000-0000-0000-0000-0000000000f1','da000000-0000-0000-0000-0000000000b0','da000000-0000-0000-0000-0000000000c0',(current_date+5),'14:00',60,1500,'confirmed',now())
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.message_reports (id, conversation_id, reporter_id, reported_user_id, reason)
VALUES ('da000000-0000-0000-0000-0000000000d1','da000000-0000-0000-0000-0000000000e1','da000000-0000-0000-0000-0000000000c0','da000000-0000-0000-0000-0000000000b0','flagged')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.user_warnings (user_id, reason, actor_id)
VALUES ('da000000-0000-0000-0000-0000000000b0','tone', 'da000000-0000-0000-0000-0000000000a0');
-- now suspend b0 (after the booking, so the block trigger doesn't reject the insert)
INSERT INTO public.account_moderation (user_id, state, reason, actor_id) VALUES ('da000000-0000-0000-0000-0000000000b0','suspended','hold','da000000-0000-0000-0000-0000000000a0');

CREATE TEMP TABLE _p3 (test_id text PRIMARY KEY, status text NOT NULL, detail text NOT NULL);

-- P3.01 (reject): a non-admin (the student) is refused by all 5 readers.
DO $$
DECLARE v_blocked int := 0;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-0000000000b0","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN PERFORM public.admin_search_users('a'); EXCEPTION WHEN OTHERS THEN IF SQLERRM ILIKE '%forbidden%' THEN v_blocked:=v_blocked+1; END IF; END;
  BEGIN PERFORM public.admin_get_user_profile('da000000-0000-0000-0000-0000000000b0'); EXCEPTION WHEN OTHERS THEN IF SQLERRM ILIKE '%forbidden%' THEN v_blocked:=v_blocked+1; END IF; END;
  BEGIN PERFORM public.admin_list_user_bookings('da000000-0000-0000-0000-0000000000b0'); EXCEPTION WHEN OTHERS THEN IF SQLERRM ILIKE '%forbidden%' THEN v_blocked:=v_blocked+1; END IF; END;
  BEGIN PERFORM public.admin_list_user_reports('da000000-0000-0000-0000-0000000000b0'); EXCEPTION WHEN OTHERS THEN IF SQLERRM ILIKE '%forbidden%' THEN v_blocked:=v_blocked+1; END IF; END;
  BEGIN PERFORM public.admin_list_user_warnings('da000000-0000-0000-0000-0000000000b0'); EXCEPTION WHEN OTHERS THEN IF SQLERRM ILIKE '%forbidden%' THEN v_blocked:=v_blocked+1; END IF; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p3 VALUES ('P3.01_nonadmin_all_forbidden',
    CASE WHEN v_blocked=5 THEN 'PASS' ELSE 'FAIL' END, 'forbidden count='||v_blocked||'/5');
END $$;

-- P3.02 (happy): search finds the student by name + surfaces account state; role filter works.
DO $$
DECLARE v_state text; v_mentor_n int;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-0000000000a0","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT account_state INTO v_state FROM public.admin_search_users('Riya') WHERE user_id='da000000-0000-0000-0000-0000000000b0';
  SELECT count(*) INTO v_mentor_n FROM public.admin_search_users('Directory','mentor');
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p3 VALUES ('P3.02_search_and_state',
    CASE WHEN v_state='suspended' AND v_mentor_n=1 THEN 'PASS' ELSE 'FAIL' END,
    'student_state='||coalesce(v_state,'NULL')||' mentor_role_filtered='||v_mentor_n||' (expect suspended,1)');
END $$;

-- P3.03 (happy): student 360 header — role/state + AUTHORITATIVE consent (grade-8
-- minor with consent granted => requires_consent=true, has_consent=true, dob_known=true).
DO $$
DECLARE v_role text; v_state text; v_req bool; v_consent bool; v_dobk bool;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-0000000000a0","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT role, account_state, requires_consent, has_consent, dob_known INTO v_role, v_state, v_req, v_consent, v_dobk
    FROM public.admin_get_user_profile('da000000-0000-0000-0000-0000000000b0');
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p3 VALUES ('P3.03_student_profile',
    CASE WHEN v_role='student' AND v_state='suspended' AND v_req AND v_consent AND v_dobk THEN 'PASS' ELSE 'FAIL' END,
    'role='||v_role||' state='||v_state||' requires_consent='||v_req||' has_consent='||v_consent||' dob_known='||v_dobk);
END $$;

-- P3.035 (HIGH fix): a NULL-DOB student is FAIL-CLOSED — requires_consent=true,
-- has_consent=false, dob_known=false — so the UI can never show "not required (18+)".
DO $$
DECLARE v_req bool; v_consent bool; v_dobk bool;
BEGIN
  INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token, email_change, email_change_token_new, created_at, updated_at, instance_id)
  VALUES ('da000000-0000-0000-0000-0000000000b9','authenticated','authenticated','p3-nulldob@example.com',crypt('x',gen_salt('bf')),now(),'{"provider":"email"}','{"role":"student","full_name":"NullDob Student","phone":"+91","school":"S","grade":"Grade 9"}','','','','',now(),now(),'00000000-0000-0000-0000-000000000000')
  ON CONFLICT (id) DO NOTHING;
  PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-0000000000a0","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT requires_consent, has_consent, dob_known INTO v_req, v_consent, v_dobk
    FROM public.admin_get_user_profile('da000000-0000-0000-0000-0000000000b9');
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p3 VALUES ('P3.035_null_dob_fail_closed',
    CASE WHEN v_req AND v_consent=false AND v_dobk=false THEN 'PASS' ELSE 'FAIL' END,
    'requires_consent='||v_req||' has_consent='||v_consent||' dob_known='||v_dobk||' (expect true,false,false)');
END $$;

-- P3.04 (happy): mentor 360 header — role/18+/status.
DO $$
DECLARE v_role text; v_adult bool; v_mstatus text;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-0000000000a0","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT role, is_adult, mentor_status INTO v_role, v_adult, v_mstatus
    FROM public.admin_get_user_profile('da000000-0000-0000-0000-0000000000c0');
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p3 VALUES ('P3.04_mentor_profile',
    CASE WHEN v_role='mentor' AND v_adult AND v_mstatus='approved' THEN 'PASS' ELSE 'FAIL' END,
    'role='||v_role||' is_adult='||v_adult||' status='||coalesce(v_mstatus,'NULL'));
END $$;

-- P3.05/06/07 (happy): per-user bookings (masked counterpart), reports (role_in), warnings.
DO $$
DECLARE v_bk int; v_role_in text; v_leak int; v_rep int; v_rep_role text; v_warn int;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-0000000000a0","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO v_bk FROM public.admin_list_user_bookings('da000000-0000-0000-0000-0000000000b0');
  SELECT role_in INTO v_role_in FROM public.admin_list_user_bookings('da000000-0000-0000-0000-0000000000b0') LIMIT 1;
  SELECT count(*) INTO v_leak FROM public.admin_list_user_bookings('da000000-0000-0000-0000-0000000000b0') WHERE counterpart_label ILIKE '%Arjun%';
  SELECT count(*), max(role_in) INTO v_rep, v_rep_role FROM public.admin_list_user_reports('da000000-0000-0000-0000-0000000000b0');
  SELECT count(*) INTO v_warn FROM public.admin_list_user_warnings('da000000-0000-0000-0000-0000000000b0');
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p3 VALUES ('P3.05_bookings_reports_warnings',
    CASE WHEN v_bk=1 AND v_role_in='student' AND v_leak=0 AND v_rep=1 AND v_rep_role='subject' AND v_warn=1 THEN 'PASS' ELSE 'FAIL' END,
    'bookings='||v_bk||' role_in='||v_role_in||' name_leak='||v_leak||' reports='||v_rep||' report_role='||v_rep_role||' warnings='||v_warn);
END $$;

SELECT test_id, status, detail FROM _p3 ORDER BY test_id;
ROLLBACK;
