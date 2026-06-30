-- ════════════════════════════════════════════════════════════════════════════
-- D dev-seed: consent fail-closed for messaging (P6.2)
-- Pairs with 20260604000040_d_consent_messaging.sql.
-- Proves: a no-consent minor and a NULL-DOB student are blocked from messaging
-- (consent_required, no write); a consented minor and an adult pass; the
-- student_has_consent truth table; and parity with the booking gate.
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token, email_change, email_change_token_new, created_at, updated_at, instance_id) VALUES
('dd000000-0000-0000-0000-00000000000a','authenticated','authenticated','d-m@example.com',crypt('x',gen_salt('bf')),now(),'{"provider":"email"}','{"role":"mentor","full_name":"D Mentor","university":"U","course":"C","year":"3rd Year","date_of_birth":"2000-01-01"}','','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
-- minor, gated grade, NO consent
('dd000000-0000-0000-0000-0000000000c1','authenticated','authenticated','d-minor@example.com',crypt('x',gen_salt('bf')),now(),'{"provider":"email"}','{"role":"student","full_name":"Minor NoConsent","phone":"+91","school":"S","grade":"Grade 10","date_of_birth":"2012-01-01","parent_email":"p@e.com"}','','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
-- NULL dob, non-gated grade (fail-closed must still block)
('dd000000-0000-0000-0000-0000000000c2','authenticated','authenticated','d-nulldob@example.com',crypt('x',gen_salt('bf')),now(),'{"provider":"email"}','{"role":"student","full_name":"Null Dob","phone":"+91","school":"S","grade":"Grade 12"}','','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
-- consented minor
('dd000000-0000-0000-0000-0000000000c3','authenticated','authenticated','d-consented@example.com',crypt('x',gen_salt('bf')),now(),'{"provider":"email"}','{"role":"student","full_name":"Consented Minor","phone":"+91","school":"S","grade":"Grade 10","date_of_birth":"2012-01-01","parent_email":"p@e.com"}','','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
-- adult
('dd000000-0000-0000-0000-0000000000c4','authenticated','authenticated','d-adult@example.com',crypt('x',gen_salt('bf')),now(),'{"provider":"email"}','{"role":"student","full_name":"Adult Student","phone":"+91","school":"S","grade":"Grade 12","date_of_birth":"2000-01-01"}','','','','',now(),now(),'00000000-0000-0000-0000-000000000000')
ON CONFLICT (id) DO NOTHING;
UPDATE public.mentors SET status='approved', price_inr=1000 WHERE id='dd000000-0000-0000-0000-00000000000a';
-- record consent for the consented minor
UPDATE public.students SET parental_consent_at=now() WHERE id='dd000000-0000-0000-0000-0000000000c3';
-- availability for the booking-parity test
INSERT INTO public.mentor_availability (mentor_id, day_of_week, start_hour)
SELECT 'dd000000-0000-0000-0000-00000000000a'::uuid, d::smallint, h FROM generate_series(1,7) d, unnest(ARRAY[10,11]::smallint[]) h
ON CONFLICT DO NOTHING;

CREATE TEMP TABLE _d (test_id text PRIMARY KEY, status text NOT NULL, detail text NOT NULL);

-- act-as-student send helper inline per test
-- D.01: minor no-consent → consent_required + NO write
DO $$
DECLARE v_res jsonb; v_msgs int;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"dd000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_res := public.send_message('dd000000-0000-0000-0000-00000000000a','hello can you help');
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  SELECT count(*) INTO v_msgs FROM public.messages WHERE sender_id='dd000000-0000-0000-0000-0000000000c1';
  INSERT INTO _d VALUES ('D.01_minor_noconsent_blocked',
    CASE WHEN (v_res->>'ok')='false' AND (v_res->>'reason')='consent_required' AND v_msgs=0 THEN 'PASS' ELSE 'FAIL' END,
    'res='||v_res::text||' messages_written='||v_msgs||' (expect ok:false consent_required, 0)');
END $$;

-- D.02: NULL-DOB → consent_required (fail-closed even though grade not gated)
DO $$
DECLARE v_res jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"dd000000-0000-0000-0000-0000000000c2","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_res := public.send_message('dd000000-0000-0000-0000-00000000000a','hi there');
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _d VALUES ('D.02_nulldob_failclosed',
    CASE WHEN (v_res->>'reason')='consent_required' THEN 'PASS' ELSE 'FAIL' END, 'res='||v_res::text);
END $$;

-- D.03: consented minor → ok
DO $$
DECLARE v_res jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"dd000000-0000-0000-0000-0000000000c3","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_res := public.send_message('dd000000-0000-0000-0000-00000000000a','hello mentor');
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _d VALUES ('D.03_consented_minor_ok',
    CASE WHEN (v_res->>'ok')='true' THEN 'PASS' ELSE 'FAIL' END, 'res='||v_res::text);
END $$;

-- D.04: adult → ok
DO $$
DECLARE v_res jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"dd000000-0000-0000-0000-0000000000c4","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_res := public.send_message('dd000000-0000-0000-0000-00000000000a','hi i am an adult');
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _d VALUES ('D.04_adult_ok',
    CASE WHEN (v_res->>'ok')='true' THEN 'PASS' ELSE 'FAIL' END, 'res='||v_res::text);
END $$;

-- D.05: student_has_consent truth table (minor=false, nulldob=false, consented=true, adult=true)
DO $$
DECLARE v1 bool; v2 bool; v3 bool; v4 bool;
BEGIN
  v1 := public.student_has_consent('dd000000-0000-0000-0000-0000000000c1');
  v2 := public.student_has_consent('dd000000-0000-0000-0000-0000000000c2');
  v3 := public.student_has_consent('dd000000-0000-0000-0000-0000000000c3');
  v4 := public.student_has_consent('dd000000-0000-0000-0000-0000000000c4');
  INSERT INTO _d VALUES ('D.05_helper_truth_table',
    CASE WHEN NOT v1 AND NOT v2 AND v3 AND v4 THEN 'PASS' ELSE 'FAIL' END,
    'minor='||v1||' nulldob='||v2||' consented='||v3||' adult='||v4||' (expect f,f,t,t)');
END $$;

-- D.06: PARITY with booking gate — minor-no-consent booking raises consent;
-- adult booking does NOT raise a consent error
DO $$
DECLARE v_minor_consent_err bool := false; v_adult_consent_err bool := false;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"dd000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN PERFORM public.book_session('dd000000-0000-0000-0000-00000000000a', CURRENT_DATE+7, '10:00');
  EXCEPTION WHEN OTHERS THEN IF SQLERRM ILIKE '%consent%' THEN v_minor_consent_err := true; END IF; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"sub":"dd000000-0000-0000-0000-0000000000c4","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN PERFORM public.book_session('dd000000-0000-0000-0000-00000000000a', CURRENT_DATE+7, '11:00');
  EXCEPTION WHEN OTHERS THEN IF SQLERRM ILIKE '%consent%' THEN v_adult_consent_err := true; END IF; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _d VALUES ('D.06_parity_with_booking_gate',
    CASE WHEN v_minor_consent_err AND NOT v_adult_consent_err THEN 'PASS' ELSE 'FAIL' END,
    'minor booking consent-blocked='||v_minor_consent_err||'; adult booking consent-blocked='||v_adult_consent_err||' (expect true,false)');
END $$;

-- D.07 (folded D-1): after parental consent is REVOKED, the MENTOR cannot keep
-- messaging the minor (the gate is on the student party, regardless of sender).
DO $$
DECLARE v_res jsonb;
BEGIN
  -- c3 (consented minor) opened a conversation with M in D.03; revoke consent now.
  UPDATE public.students SET parental_consent_at=NULL WHERE id='dd000000-0000-0000-0000-0000000000c3';
  PERFORM set_config('request.jwt.claims','{"sub":"dd000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_res := public.send_message('dd000000-0000-0000-0000-0000000000c3','are you there?');
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _d VALUES ('D.07_mentor_blocked_after_revoke',
    CASE WHEN (v_res->>'reason')='consent_required' THEN 'PASS' ELSE 'FAIL' END,
    'mentor reply after revoke: '||v_res::text||' (expect consent_required)');
END $$;

SELECT test_id, status, detail FROM _d ORDER BY test_id;
ROLLBACK;
