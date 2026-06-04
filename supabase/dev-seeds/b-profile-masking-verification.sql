-- ════════════════════════════════════════════════════════════════════════════
-- B dev-seed: profile masking + rating aggregate + filters + contact audit
-- Pairs with 20260604000020_b_profile_masking.sql.
-- Proves: full name + photo only on a confirmed/completed booking link; pre-
-- booking + anon get first-name only and NULL photo; rating aggregate; the
-- specialty/university/min-rating filters; and (contact audit) neither masking
-- RPC's result type contains email/phone.
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token, email_change, email_change_token_new, created_at, updated_at, instance_id) VALUES
('db000000-0000-0000-0000-0000000000a1','authenticated','authenticated','b-m1@example.com',crypt('x',gen_salt('bf')),now(),'{"provider":"email"}','{"role":"mentor","full_name":"Riya Sharma","university":"IIT Bombay","course":"CS","year":"3rd Year"}','','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
('db000000-0000-0000-0000-0000000000a2','authenticated','authenticated','b-m2@example.com',crypt('x',gen_salt('bf')),now(),'{"provider":"email"}','{"role":"mentor","full_name":"Arjun Mehta","university":"IIT Delhi","course":"ME","year":"2nd Year"}','','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
('db000000-0000-0000-0000-0000000000c1','authenticated','authenticated','b-s1@example.com',crypt('x',gen_salt('bf')),now(),'{"provider":"email"}','{"role":"student","full_name":"S One","phone":"+91","school":"S","grade":"Grade 12","date_of_birth":"2000-01-01"}','','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
('db000000-0000-0000-0000-0000000000c2','authenticated','authenticated','b-s2@example.com',crypt('x',gen_salt('bf')),now(),'{"provider":"email"}','{"role":"student","full_name":"S Two","phone":"+91","school":"S","grade":"Grade 12","date_of_birth":"2000-01-01"}','','','','',now(),now(),'00000000-0000-0000-0000-000000000000')
ON CONFLICT (id) DO NOTHING;
UPDATE public.mentors SET status='approved', price_inr=1000, photo_url='photo1.jpg',
       specialty_id=(SELECT id FROM public.ref_specialties WHERE key='essays')
 WHERE id='db000000-0000-0000-0000-0000000000a1';
UPDATE public.mentors SET status='approved', price_inr=1000, photo_url='photo2.jpg',
       specialty_id=(SELECT id FROM public.ref_specialties WHERE key='sports')
 WHERE id='db000000-0000-0000-0000-0000000000a2';

-- S1 has a confirmed booking with M1 (unlocks M1) but NOT with M2.
INSERT INTO public.bookings (mentor_id, student_id, date, time_slot, duration, price, status) VALUES
('db000000-0000-0000-0000-0000000000a1','db000000-0000-0000-0000-0000000000c1', CURRENT_DATE-9,'10:00',60,1000,'completed');
-- M1 has two reviews (4,5 → avg 4.5); M2 has none.
INSERT INTO public.reviews (mentor_id, student_id, rating, review) VALUES
('db000000-0000-0000-0000-0000000000a1','db000000-0000-0000-0000-0000000000c1',5,'great'),
('db000000-0000-0000-0000-0000000000a1','db000000-0000-0000-0000-0000000000c2',4,'good');

CREATE TEMP TABLE _b (test_id text PRIMARY KEY, status text NOT NULL, detail text NOT NULL);

-- B.01: booked student S1 sees M1's REAL full name + photo + rating
DO $$
DECLARE v_fn text; v_photo text; v_avg numeric; v_cnt int;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"db000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT full_name, photo_url, avg_rating, review_count INTO v_fn, v_photo, v_avg, v_cnt
    FROM public.get_mentor_public_profile('db000000-0000-0000-0000-0000000000a1');
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _b VALUES ('B.01_booked_unlocks_name_photo',
    CASE WHEN v_fn='Riya Sharma' AND v_photo='photo1.jpg' AND v_avg=4.5 AND v_cnt=2 THEN 'PASS' ELSE 'FAIL' END,
    'full_name='||v_fn||' photo='||coalesce(v_photo,'∅')||' avg='||coalesce(v_avg::text,'∅')||' cnt='||v_cnt||' (expect Riya Sharma,photo1.jpg,4.5,2)');
END $$;

-- B.02: unbooked student S1→M2 gets first-name only + NULL photo + no rating
DO $$
DECLARE v_fn text; v_photo text; v_avg numeric; v_cnt int;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"db000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT full_name, photo_url, avg_rating, review_count INTO v_fn, v_photo, v_avg, v_cnt
    FROM public.get_mentor_public_profile('db000000-0000-0000-0000-0000000000a2');
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _b VALUES ('B.02_unbooked_masked',
    CASE WHEN v_fn='Arjun' AND v_photo IS NULL AND v_avg IS NULL AND v_cnt=0 THEN 'PASS' ELSE 'FAIL' END,
    'full_name='||v_fn||' photo='||coalesce(v_photo,'NULL')||' avg='||coalesce(v_avg::text,'NULL')||' cnt='||v_cnt||' (expect Arjun,NULL,NULL,0)');
END $$;

-- B.03: anon NEVER unlocks (M1 masked to first name despite reviews)
DO $$
DECLARE v_fn text; v_photo text;
BEGIN
  PERFORM set_config('request.jwt.claims','{"role":"anon"}', true);
  EXECUTE 'SET LOCAL ROLE anon';
  SELECT full_name, photo_url INTO v_fn, v_photo
    FROM public.get_mentor_public_profile('db000000-0000-0000-0000-0000000000a1');
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _b VALUES ('B.03_anon_masked',
    CASE WHEN v_fn='Riya' AND v_photo IS NULL THEN 'PASS' ELSE 'FAIL' END,
    'anon full_name='||v_fn||' photo='||coalesce(v_photo,'NULL')||' (expect Riya,NULL)');
END $$;

-- B.04: list never exposes a last name; mascot + rating present
DO $$
DECLARE v_leak int; v_mascot text; v_avg numeric;
BEGIN
  PERFORM set_config('request.jwt.claims','{"role":"anon"}', true);
  EXECUTE 'SET LOCAL ROLE anon';
  SELECT count(*) INTO v_leak FROM public.list_approved_mentor_profiles() WHERE full_name LIKE '% %';
  SELECT mascot_key, avg_rating INTO v_mascot, v_avg
    FROM public.list_approved_mentor_profiles() WHERE id='db000000-0000-0000-0000-0000000000a1';
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _b VALUES ('B.04_list_no_lastname_has_mascot_rating',
    CASE WHEN v_leak=0 AND v_mascot='essays' AND v_avg=4.5 THEN 'PASS' ELSE 'FAIL' END,
    'rows with a space in full_name='||v_leak||' (expect 0); M1 mascot='||coalesce(v_mascot,'∅')||' avg='||coalesce(v_avg::text,'∅'));
END $$;

-- B.05: filters — specialty, university, min-rating (excludes no-review mentor)
DO $$
DECLARE v_essays int; v_iitd int; v_rated bool; v_m1_in_rated bool; v_m2_in_essays bool; v_essays_id uuid;
BEGIN
  -- Resolve the specialty id while still service_role (anon may not read ref_specialties);
  -- a real client passes the uuid literally, so this mirrors that.
  SELECT id INTO v_essays_id FROM public.ref_specialties WHERE key='essays';
  PERFORM set_config('request.jwt.claims','{"role":"anon"}', true);
  EXECUTE 'SET LOCAL ROLE anon';
  SELECT count(*) INTO v_essays FROM public.list_approved_mentor_profiles(_specialty_id := v_essays_id)
    WHERE id IN ('db000000-0000-0000-0000-0000000000a1','db000000-0000-0000-0000-0000000000a2');
  SELECT EXISTS(SELECT 1 FROM public.list_approved_mentor_profiles(_specialty_id := v_essays_id) WHERE id='db000000-0000-0000-0000-0000000000a2') INTO v_m2_in_essays;
  SELECT count(*) INTO v_iitd FROM public.list_approved_mentor_profiles(_university := 'IIT Delhi')
    WHERE id IN ('db000000-0000-0000-0000-0000000000a1','db000000-0000-0000-0000-0000000000a2');
  SELECT EXISTS(SELECT 1 FROM public.list_approved_mentor_profiles(_min_rating := 4.0) WHERE id='db000000-0000-0000-0000-0000000000a1') INTO v_m1_in_rated;
  SELECT EXISTS(SELECT 1 FROM public.list_approved_mentor_profiles(_min_rating := 4.0) WHERE id='db000000-0000-0000-0000-0000000000a2') INTO v_rated; -- M2 no reviews → excluded
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _b VALUES ('B.05_filters',
    CASE WHEN v_essays=1 AND NOT v_m2_in_essays AND v_iitd=1 AND v_m1_in_rated AND NOT v_rated THEN 'PASS' ELSE 'FAIL' END,
    'essays-only count(M1/M2)='||v_essays||' M2-in-essays='||v_m2_in_essays||' IITDelhi count='||v_iitd||' M1>=4.0='||v_m1_in_rated||' M2(no reviews)>=4.0='||v_rated);
END $$;

-- B.06: CONTACT AUDIT — neither masking RPC's result type contains email/phone
DO $$
DECLARE v_list text; v_detail text; v_pass bool;
BEGIN
  SELECT pg_get_function_result(oid) INTO v_list FROM pg_proc WHERE proname='list_approved_mentor_profiles' AND pronamespace='public'::regnamespace;
  SELECT pg_get_function_result(oid) INTO v_detail FROM pg_proc WHERE proname='get_mentor_public_profile' AND pronamespace='public'::regnamespace;
  v_pass := (v_list NOT ILIKE '%email%' AND v_list NOT ILIKE '%phone%'
             AND v_detail NOT ILIKE '%email%' AND v_detail NOT ILIKE '%phone%');
  INSERT INTO _b VALUES ('B.06_contact_audit_no_email_phone',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END,
    'masking RPC result types free of email/phone='||v_pass);
END $$;

SELECT test_id, status, detail FROM _b ORDER BY test_id;
ROLLBACK;
