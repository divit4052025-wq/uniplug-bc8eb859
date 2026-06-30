-- ════════════════════════════════════════════════════════════════════════════
-- A-ADV-FIX dev-seed (child-safety) — close the adversarial-pass bypasses.
-- Pairs with 20260630000005_a_adversarial_hardening.sql.
--
-- Proves, server-side, each previously-bypassed vector is now BLOCKED on its
-- SPECIFIC condition (a wrong-reason failure re-raises an ADF-FAIL marker so a
-- green run can never be a false pass):
--   FIX1a — signup whose parental_consent_email is a TAB-prefixed copy of the
--           student's OWN email is REJECTED by the trigger
--           (parent_email_must_differ_from_student).
--   FIX1b — record_parental_consent on a manufactured (trigger-disabled)
--           self-email-WITH-TAB row returns NULL (RPC guard normalizes too).
--   FIX2  — parent_phone = country-code form of own phone (own '9000000051',
--           parent '+91 90000 00051') is REJECTED
--           (parent_phone_must_differ_from_student); a genuinely DIFFERENT number
--           still PASSES (no over-block).
--   FIX3  — as an authenticated student with NO pre-existing row, INSERT into
--           students with parental_consent_at preset is permission-denied (the
--           narrowed INSERT grant drops the consent columns).
--   FIX4  — with consent REVOKED, the owning student calling
--           share_student_document(doc, mentor) RAISEs consent_revoked; with
--           consent PRESENT it still succeeds (no over-block).
--   FIX5  — a DOB downgrade to under-18 on an already-approved mentor is REJECTED
--           (mentor_must_be_18_plus); a status-&-DOB-unchanged re-save of an
--           approved adult still succeeds (no over-block).
--
-- Convention: identities are born via the real signup path (INSERT auth.users ->
-- on_auth_user_created -> handle_new_user) so the A1/A2 triggers fire as for real
-- users; approved mentors are created 18+; minors use a DISTINCT parent email.
--
-- RED (no migration): the whitespace/share vectors still slip through, so the
-- first such assertion aborts with an ADF-FAIL marker (no 'A-ADV-FIX PASS').
-- GREEN (migration applied): each block prints an 'ADF ok:' NOTICE and the script
-- ends with the 'A-ADV-FIX PASS' row.
--
-- Run:
--   docker exec -i supabase_db_ncfhmbugjeuerchleegq psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/dev-seeds/a-adversarial-hardening-verification.sql
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;
SET LOCAL client_min_messages = NOTICE;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ════════════════════════════════════════════════════════════════════════════
-- FIX1a — TAB-prefixed self-email at signup is rejected by the trigger.
-- ════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    created_at, updated_at, instance_id
  ) VALUES (
    'adf00000-0000-0000-0000-000000000a1a','authenticated','authenticated','fix1a@uniplug-adf.local',
    crypt('pw', gen_salt('bf')), now(), '{"provider":"email"}'::jsonb,
    jsonb_build_object('role','student','full_name','Fix1a Kid','phone','+91 90000 11111',
      'school','S','grade','Grade 10','date_of_birth','2012-01-01',
      'parent_email', E'\tfix1a@uniplug-adf.local'),   -- TAB + own email
    '','','','', now(), now(), '00000000-0000-0000-0000-000000000000');
  RAISE EXCEPTION 'ADF-FAIL: FIX1a tab-prefixed self-email signup was allowed';
EXCEPTION WHEN others THEN
  IF SQLERRM LIKE 'ADF-FAIL%' THEN RAISE; END IF;
  IF SQLERRM LIKE '%parent_email_must_differ%' THEN
    RAISE NOTICE 'ADF ok: FIX1a tab-prefixed self-email signup rejected (%).', SQLERRM;
  ELSE
    RAISE EXCEPTION 'ADF-FAIL: FIX1a rejected for the WRONG reason: %', SQLERRM;
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- FIX1b — record_parental_consent normalizes whitespace too (returns NULL).
--   Create a distinct-parent minor (passes the trigger), then DISABLE the trigger
--   to manufacture a TAB-disguised self-email row, then prove the RPC guard blocks.
-- ════════════════════════════════════════════════════════════════════════════
INSERT INTO auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  created_at, updated_at, instance_id
) VALUES (
  'adf00000-0000-0000-0000-000000000b1b','authenticated','authenticated','fix1b@uniplug-adf.local',
  crypt('pw', gen_salt('bf')), now(), '{"provider":"email"}'::jsonb,
  jsonb_build_object('role','student','full_name','Fix1b Kid','phone','+91 90000 22222',
    'school','S','grade','Grade 10','date_of_birth','2012-01-01',
    'parent_email','fix1b-parent@uniplug-adf.local'),
  '','','','', now(), now(), '00000000-0000-0000-0000-000000000000');
ALTER TABLE public.students DISABLE TRIGGER students_parent_not_self;
UPDATE public.students SET parental_consent_email = E'fix1b@uniplug-adf.local\n'  -- own email + trailing NEWLINE
 WHERE id = 'adf00000-0000-0000-0000-000000000b1b';
ALTER TABLE public.students ENABLE TRIGGER students_parent_not_self;
DO $$
DECLARE v_tok uuid; v_ret uuid; v_at timestamptz;
BEGIN
  SELECT parental_consent_token INTO v_tok FROM public.students
   WHERE id = 'adf00000-0000-0000-0000-000000000b1b';
  PERFORM set_config('request.jwt.claims','{"role":"anon"}', true);
  EXECUTE 'SET LOCAL ROLE anon';
  v_ret := public.record_parental_consent(v_tok);
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  SELECT parental_consent_at INTO v_at FROM public.students
   WHERE id = 'adf00000-0000-0000-0000-000000000b1b';
  IF v_ret IS NOT NULL OR v_at IS NOT NULL THEN
    RAISE EXCEPTION 'ADF-FAIL: FIX1b whitespace self-routed token accepted (ret=%, consent_at=%)', v_ret, v_at;
  END IF;
  RAISE NOTICE 'ADF ok: FIX1b whitespace self-routed token rejected by record_parental_consent (ret NULL, consent NULL).';
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- FIX2 — country-code form of own phone is rejected; a different number passes.
--   Minor born with own phone '9000000051' + a DISTINCT parent phone.
-- ════════════════════════════════════════════════════════════════════════════
INSERT INTO auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  created_at, updated_at, instance_id
) VALUES (
  'adf00000-0000-0000-0000-000000000f02','authenticated','authenticated','fix2@uniplug-adf.local',
  crypt('pw', gen_salt('bf')), now(), '{"provider":"email"}'::jsonb,
  jsonb_build_object('role','student','full_name','Fix2 Kid','phone','9000000051',
    'school','S','grade','Grade 10','date_of_birth','2012-01-01',
    'parent_email','fix2-parent@uniplug-adf.local','parent_phone','+91 98888 11111'),
  '','','','', now(), now(), '00000000-0000-0000-0000-000000000000');

-- FIX2 REJECT: parent_phone = +91-prefixed (country-code) form of own phone.
DO $$
BEGIN
  UPDATE public.students SET parent_phone = '+91 90000 00051'   -- same number, country-code form
   WHERE id = 'adf00000-0000-0000-0000-000000000f02';
  RAISE EXCEPTION 'ADF-FAIL: FIX2 country-code self-phone UPDATE was allowed';
EXCEPTION WHEN others THEN
  IF SQLERRM LIKE 'ADF-FAIL%' THEN RAISE; END IF;
  IF SQLERRM LIKE '%parent_phone_must_differ%' THEN
    RAISE NOTICE 'ADF ok: FIX2 country-code self-phone rejected (%).', SQLERRM;
  ELSE
    RAISE EXCEPTION 'ADF-FAIL: FIX2 rejected for the WRONG reason: %', SQLERRM;
  END IF;
END $$;

-- FIX2 NO-OVER-BLOCK: a genuinely different number still passes.
DO $$
DECLARE v_pp text;
BEGIN
  UPDATE public.students SET parent_phone = '9111111111'   -- genuinely different number
   WHERE id = 'adf00000-0000-0000-0000-000000000f02';
  SELECT parent_phone INTO v_pp FROM public.students
   WHERE id = 'adf00000-0000-0000-0000-000000000f02';
  IF v_pp IS DISTINCT FROM '9111111111' THEN
    RAISE EXCEPTION 'ADF-FAIL: FIX2 different-number UPDATE did not persist (got %)', coalesce(v_pp,'NULL');
  END IF;
  RAISE NOTICE 'ADF ok: FIX2 genuinely-different parent phone still accepted (no over-block).';
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- FIX3 — authenticated self-INSERT with parental_consent_at preset is denied.
--   Build an authenticated identity with NO students row: create the user (so the
--   FK + auth.uid()=id hold for a real bypass in RED), then delete its students row.
-- ════════════════════════════════════════════════════════════════════════════
INSERT INTO auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  created_at, updated_at, instance_id
) VALUES (
  'adf00000-0000-0000-0000-000000000f03','authenticated','authenticated','fix3@uniplug-adf.local',
  crypt('pw', gen_salt('bf')), now(), '{"provider":"email"}'::jsonb,
  jsonb_build_object('role','student','full_name','Fix3 Adult','phone','+91 90000 33333',
    'school','S','grade','Grade 12','date_of_birth','2000-01-01'),
  '','','','', now(), now(), '00000000-0000-0000-0000-000000000000');
DELETE FROM public.students WHERE id = 'adf00000-0000-0000-0000-000000000f03';

SELECT set_config('request.jwt.claims',
  '{"sub":"adf00000-0000-0000-0000-000000000f03","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  INSERT INTO public.students (id, full_name, email, phone, school, grade, parental_consent_at)
  VALUES ('adf00000-0000-0000-0000-000000000f03','Fix3 Adult','fix3@uniplug-adf.local',
          '+91 90000 33333','S','Grade 12', now());
  RAISE EXCEPTION 'ADF-FAIL: FIX3 authenticated self-INSERT with parental_consent_at was allowed';
EXCEPTION WHEN others THEN
  IF SQLERRM LIKE 'ADF-FAIL%' THEN RAISE; END IF;
  IF SQLSTATE = '42501' OR SQLERRM ILIKE '%permission denied%' THEN
    RAISE NOTICE 'ADF ok: FIX3 authenticated self-INSERT with consent preset denied (% %).', SQLSTATE, SQLERRM;
  ELSE
    RAISE EXCEPTION 'ADF-FAIL: FIX3 blocked for the WRONG reason: % %', SQLSTATE, SQLERRM;
  END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ════════════════════════════════════════════════════════════════════════════
-- FIX4 — revoked minor cannot re-create a deleted share; consented share works.
-- ════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_admin  constant uuid := 'adf00000-0000-0000-0000-0000000ad004';
  v_mentor constant uuid := 'adf00000-0000-0000-0000-0000000be004';
  v_minor  constant uuid := 'adf00000-0000-0000-0000-0000000c0004';
  b_conf   constant uuid := 'adf00000-0000-0000-0000-000000b00004';
  d_doc    constant uuid := 'adf00000-0000-0000-0000-0000000d0004';
  v_today  date := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date;
  v_hh     text := to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata', 'HH24:00');
BEGIN
  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    created_at, updated_at, instance_id
  ) VALUES
    (v_admin, 'authenticated','authenticated','divitfatehpuria7@gmail.com',
     crypt('pw', gen_salt('bf')), now(), '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','student','full_name','ADF Admin','phone','+91-0',
                        'school','S','grade','Grade 12','date_of_birth','1990-01-01'),
     '','','','', now(), now(), '00000000-0000-0000-0000-000000000000'),
    (v_mentor, 'authenticated','authenticated','adf_mentor@uniplug-adf.local',
     crypt('pw', gen_salt('bf')), now(), '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','mentor','full_name','ADF Mentor','university','Real U',
                        'course','CS','year','2nd Year','date_of_birth','2000-01-01'),
     '','','','', now(), now(), '00000000-0000-0000-0000-000000000000'),
    (v_minor, 'authenticated','authenticated','adf_minor@uniplug-adf.local',
     crypt('pw', gen_salt('bf')), now(), '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','student','full_name','ADF Minor','phone','+91-1',
                        'school','S','grade','Grade 10','date_of_birth','2012-01-01',
                        'parent_email','adf_parent@uniplug-adf.local'),
     '','','','', now(), now(), '00000000-0000-0000-0000-000000000000');

  UPDATE public.mentors SET status = 'approved', price_inr = 1000 WHERE id = v_mentor;
  UPDATE public.students SET parental_consent_at = now() WHERE id = v_minor;  -- starts consented

  INSERT INTO public.bookings (id, mentor_id, student_id, date, time_slot, duration, price, status)
  VALUES (b_conf, v_mentor, v_minor, v_today, v_hh, 60, 1000, 'confirmed');   -- PAID/confirmed

  INSERT INTO public.student_documents (id, student_id, file_name, storage_path, size_bytes, visibility)
  VALUES (d_doc, v_minor, 'private.pdf', v_minor::text || '/private.pdf', 2000, 'restricted');
END $$;

-- FIX4 HAPPY: consented minor can share the doc with the booked mentor.
DO $$
DECLARE v_share uuid;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"adf00000-0000-0000-0000-0000000c0004","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_share := public.share_student_document('adf00000-0000-0000-0000-0000000d0004'::uuid,
                                           'adf00000-0000-0000-0000-0000000be004'::uuid);
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  IF v_share IS NULL THEN
    RAISE EXCEPTION 'ADF-FAIL: FIX4 consented share returned NULL';
  END IF;
  RAISE NOTICE 'ADF ok: FIX4 consented minor shared doc with booked mentor (no over-block).';
END $$;

-- Admin revokes consent (cascade deletes the share, freezes the paid booking).
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"adf00000-0000-0000-0000-0000000ad004","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.mark_consent_revoked('adf00000-0000-0000-0000-0000000c0004'::uuid);
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  RAISE NOTICE 'ADF ok: FIX4 admin revoked consent (cascade ran).';
END $$;

-- FIX4 BLOCKED: with consent revoked, re-sharing RAISEs consent_revoked.
DO $$
DECLARE v_share uuid;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"adf00000-0000-0000-0000-0000000c0004","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    v_share := public.share_student_document('adf00000-0000-0000-0000-0000000d0004'::uuid,
                                             'adf00000-0000-0000-0000-0000000be004'::uuid);
    EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
    RAISE EXCEPTION 'ADF-FAIL: FIX4 revoked minor re-created the share (id=%)', v_share;
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE 'ADF-FAIL%' THEN RAISE; END IF;
    EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
    IF SQLERRM NOT LIKE '%consent_revoked%' THEN
      RAISE EXCEPTION 'ADF-FAIL: FIX4 re-share blocked for the WRONG reason: %', SQLERRM;
    END IF;
    RAISE NOTICE 'ADF ok: FIX4 revoked minor re-share blocked (%).', SQLERRM;
  END;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- FIX5 — DOB downgrade on an approved mentor is rejected; clean re-save passes.
-- ════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    created_at, updated_at, instance_id
  ) VALUES (
    'adf00000-0000-0000-0000-000000000f05','authenticated','authenticated','fix5_mentor@uniplug-adf.local',
    crypt('pw', gen_salt('bf')), now(), '{"provider":"email"}'::jsonb,
    jsonb_build_object('role','mentor','full_name','Fix5 Mentor','university','Real U',
                       'course','CS','year','2nd Year','date_of_birth','2000-01-01'),
    '','','','', now(), now(), '00000000-0000-0000-0000-000000000000');
END $$;
-- approve the 18+ mentor (succeeds)
UPDATE public.mentors SET status='approved' WHERE id='adf00000-0000-0000-0000-000000000f05';

-- FIX5 REJECT: DOB downgrade to under-18 on the still-approved row.
DO $$
BEGIN
  UPDATE public.mentors SET date_of_birth='2012-01-01'   -- under 18; status stays 'approved'
   WHERE id='adf00000-0000-0000-0000-000000000f05';
  RAISE EXCEPTION 'ADF-FAIL: FIX5 DOB downgrade on approved mentor was allowed';
EXCEPTION WHEN others THEN
  IF SQLERRM LIKE 'ADF-FAIL%' THEN RAISE; END IF;
  IF SQLERRM NOT LIKE '%mentor_must_be_18_plus%' THEN
    RAISE EXCEPTION 'ADF-FAIL: FIX5 DOB downgrade rejected for the WRONG reason: %', SQLERRM;
  END IF;
  RAISE NOTICE 'ADF ok: FIX5 DOB downgrade on approved mentor rejected (%).', SQLERRM;
END $$;

-- FIX5 NO-OVER-BLOCK: re-saving the approved adult (status & DOB unchanged) passes.
DO $$
DECLARE v_status text; v_dob date;
BEGIN
  UPDATE public.mentors SET status='approved', date_of_birth='2000-01-01'   -- unchanged values
   WHERE id='adf00000-0000-0000-0000-000000000f05';
  SELECT status, date_of_birth INTO v_status, v_dob FROM public.mentors
   WHERE id='adf00000-0000-0000-0000-000000000f05';
  IF v_status IS DISTINCT FROM 'approved' OR v_dob IS DISTINCT FROM DATE '2000-01-01' THEN
    RAISE EXCEPTION 'ADF-FAIL: FIX5 clean re-save altered the row (status=%, dob=%)', v_status, v_dob;
  END IF;
  RAISE NOTICE 'ADF ok: FIX5 clean re-save of approved adult still succeeds (no over-block).';
END $$;

SELECT 'A-ADV-FIX PASS' AS result;
ROLLBACK;
