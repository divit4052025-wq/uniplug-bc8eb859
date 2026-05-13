-- ════════════════════════════════════════════════════════════════════════════
-- Bug 6.2 dev-seed: handle_new_user trigger verification
-- ════════════════════════════════════════════════════════════════════════════
--
-- WHAT THIS FILE IS
--   Runnable rejection and happy-path tests for the on_auth_user_created
--   trigger and public.handle_new_user() added in migration
--   20260514000001_bug6_2_signup_atomicity.sql.
--
--   This is NOT a migration — it lives outside supabase/migrations/ and must
--   NEVER be added to the migration sequence.
--
-- WHAT IT TESTS
--   Rejection cases — the trigger must raise a clear exception, rolling back
--   the auth.users INSERT so no orphan exists:
--     T1:  metadata missing 'role'                  → reject
--     T2:  'role' = 'wizard' (unknown)              → reject
--     T3:  role='student', missing full_name        → reject
--     T4:  role='student', missing phone            → reject
--     T5:  role='student', missing school           → reject
--     T6:  role='student', missing grade            → reject
--     T7:  role='mentor',  missing full_name        → reject
--     T8:  role='mentor',  missing university       → reject
--     T9:  role='mentor',  missing course           → reject
--     T10: role='mentor',  missing year             → reject
--   Happy paths:
--     T11: full student metadata → row in public.students with all fields
--     T12: full mentor metadata  → row in public.mentors, status='pending'
--
-- HOW TO RUN
--   Paste the entire file into the Supabase SQL Editor (or pipe via psql /
--   MCP execute_sql). Everything runs inside a single transaction that is
--   ROLLED BACK at the end — the database state is unchanged after the run.
--
-- PASS CRITERIA
--   Each test block emits a "T# PASS: ..." NOTICE. If any block raises a
--   "T# FAIL: ..." EXCEPTION, the trigger contract is broken — investigate
--   before merging. Successful completion of the script ends with a clean
--   ROLLBACK that leaves no trace in the database.
--
-- WHY ROLLBACK AT THE END
--   T11/T12 actually insert into auth.users and (via the trigger) into
--   public.students / public.mentors. ROLLBACK undoes both. T1–T10 never
--   commit their auth.users rows because the trigger rejects them, but the
--   single outer ROLLBACK also covers anything unexpected.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ──────────────────────────────────────────────────────────────────────────
-- T1: metadata missing 'role' → reject with "Account type is required"
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    created_at, updated_at, instance_id
  ) VALUES (
    v_id, 'authenticated', 'authenticated',
    't1@uniplug-dev.local',
    crypt('pw', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    '', '', '', '',
    now(), now(), '00000000-0000-0000-0000-000000000000'
  );
  RAISE EXCEPTION 'T1 FAIL: missing role was accepted; trigger did not reject';
EXCEPTION
  WHEN raise_exception THEN
    IF SQLERRM LIKE 'T1 FAIL%' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE '%Account type is required%' THEN
      RAISE EXCEPTION 'T1 FAIL: rejected with unexpected message: %', SQLERRM;
    END IF;
    RAISE NOTICE 'T1 PASS: missing role → "%"', SQLERRM;
END $$;

-- ──────────────────────────────────────────────────────────────────────────
-- T2: 'role' = 'wizard' → reject with "Unsupported account type"
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    created_at, updated_at, instance_id
  ) VALUES (
    v_id, 'authenticated', 'authenticated',
    't2@uniplug-dev.local',
    crypt('pw', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"role":"wizard","full_name":"Wiz"}'::jsonb,
    '', '', '', '',
    now(), now(), '00000000-0000-0000-0000-000000000000'
  );
  RAISE EXCEPTION 'T2 FAIL: unknown role "wizard" was accepted';
EXCEPTION
  WHEN raise_exception THEN
    IF SQLERRM LIKE 'T2 FAIL%' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE '%Unsupported account type%' THEN
      RAISE EXCEPTION 'T2 FAIL: rejected with unexpected message: %', SQLERRM;
    END IF;
    RAISE NOTICE 'T2 PASS: unknown role → "%"', SQLERRM;
END $$;

-- ──────────────────────────────────────────────────────────────────────────
-- T3: role='student', missing full_name → reject
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    created_at, updated_at, instance_id
  ) VALUES (
    v_id, 'authenticated', 'authenticated',
    't3@uniplug-dev.local',
    crypt('pw', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"role":"student"}'::jsonb,
    '', '', '', '',
    now(), now(), '00000000-0000-0000-0000-000000000000'
  );
  RAISE EXCEPTION 'T3 FAIL: missing full_name was accepted';
EXCEPTION
  WHEN raise_exception THEN
    IF SQLERRM LIKE 'T3 FAIL%' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE '%Full name is required%' THEN
      RAISE EXCEPTION 'T3 FAIL: rejected with unexpected message: %', SQLERRM;
    END IF;
    RAISE NOTICE 'T3 PASS: student missing full_name → "%"', SQLERRM;
END $$;

-- ──────────────────────────────────────────────────────────────────────────
-- T4: role='student', missing phone → reject
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    created_at, updated_at, instance_id
  ) VALUES (
    v_id, 'authenticated', 'authenticated',
    't4@uniplug-dev.local',
    crypt('pw', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"role":"student","full_name":"Aanya"}'::jsonb,
    '', '', '', '',
    now(), now(), '00000000-0000-0000-0000-000000000000'
  );
  RAISE EXCEPTION 'T4 FAIL: missing phone was accepted';
EXCEPTION
  WHEN raise_exception THEN
    IF SQLERRM LIKE 'T4 FAIL%' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE '%Phone number is required%' THEN
      RAISE EXCEPTION 'T4 FAIL: rejected with unexpected message: %', SQLERRM;
    END IF;
    RAISE NOTICE 'T4 PASS: student missing phone → "%"', SQLERRM;
END $$;

-- ──────────────────────────────────────────────────────────────────────────
-- T5: role='student', missing school → reject  (REQUIRED by spec)
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    created_at, updated_at, instance_id
  ) VALUES (
    v_id, 'authenticated', 'authenticated',
    't5@uniplug-dev.local',
    crypt('pw', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"role":"student","full_name":"Aanya","phone":"+91-9999900000"}'::jsonb,
    '', '', '', '',
    now(), now(), '00000000-0000-0000-0000-000000000000'
  );
  RAISE EXCEPTION 'T5 FAIL: missing school was accepted';
EXCEPTION
  WHEN raise_exception THEN
    IF SQLERRM LIKE 'T5 FAIL%' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE '%School is required%' THEN
      RAISE EXCEPTION 'T5 FAIL: rejected with unexpected message: %', SQLERRM;
    END IF;
    RAISE NOTICE 'T5 PASS: student missing school → "%"', SQLERRM;
END $$;

-- ──────────────────────────────────────────────────────────────────────────
-- T6: role='student', missing grade → reject
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    created_at, updated_at, instance_id
  ) VALUES (
    v_id, 'authenticated', 'authenticated',
    't6@uniplug-dev.local',
    crypt('pw', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"role":"student","full_name":"Aanya","phone":"+91-9999900000","school":"DPS"}'::jsonb,
    '', '', '', '',
    now(), now(), '00000000-0000-0000-0000-000000000000'
  );
  RAISE EXCEPTION 'T6 FAIL: missing grade was accepted';
EXCEPTION
  WHEN raise_exception THEN
    IF SQLERRM LIKE 'T6 FAIL%' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE '%Grade is required%' THEN
      RAISE EXCEPTION 'T6 FAIL: rejected with unexpected message: %', SQLERRM;
    END IF;
    RAISE NOTICE 'T6 PASS: student missing grade → "%"', SQLERRM;
END $$;

-- ──────────────────────────────────────────────────────────────────────────
-- T7: role='mentor', missing full_name → reject
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    created_at, updated_at, instance_id
  ) VALUES (
    v_id, 'authenticated', 'authenticated',
    't7@uniplug-dev.local',
    crypt('pw', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"role":"mentor"}'::jsonb,
    '', '', '', '',
    now(), now(), '00000000-0000-0000-0000-000000000000'
  );
  RAISE EXCEPTION 'T7 FAIL: missing full_name was accepted';
EXCEPTION
  WHEN raise_exception THEN
    IF SQLERRM LIKE 'T7 FAIL%' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE '%Full name is required%' THEN
      RAISE EXCEPTION 'T7 FAIL: rejected with unexpected message: %', SQLERRM;
    END IF;
    RAISE NOTICE 'T7 PASS: mentor missing full_name → "%"', SQLERRM;
END $$;

-- ──────────────────────────────────────────────────────────────────────────
-- T8: role='mentor', missing university → reject  (REQUIRED by spec)
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    created_at, updated_at, instance_id
  ) VALUES (
    v_id, 'authenticated', 'authenticated',
    't8@uniplug-dev.local',
    crypt('pw', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"role":"mentor","full_name":"Rohan"}'::jsonb,
    '', '', '', '',
    now(), now(), '00000000-0000-0000-0000-000000000000'
  );
  RAISE EXCEPTION 'T8 FAIL: missing university was accepted';
EXCEPTION
  WHEN raise_exception THEN
    IF SQLERRM LIKE 'T8 FAIL%' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE '%University is required%' THEN
      RAISE EXCEPTION 'T8 FAIL: rejected with unexpected message: %', SQLERRM;
    END IF;
    RAISE NOTICE 'T8 PASS: mentor missing university → "%"', SQLERRM;
END $$;

-- ──────────────────────────────────────────────────────────────────────────
-- T9: role='mentor', missing course → reject
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    created_at, updated_at, instance_id
  ) VALUES (
    v_id, 'authenticated', 'authenticated',
    't9@uniplug-dev.local',
    crypt('pw', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"role":"mentor","full_name":"Rohan","university":"Oxford"}'::jsonb,
    '', '', '', '',
    now(), now(), '00000000-0000-0000-0000-000000000000'
  );
  RAISE EXCEPTION 'T9 FAIL: missing course was accepted';
EXCEPTION
  WHEN raise_exception THEN
    IF SQLERRM LIKE 'T9 FAIL%' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE '%Course is required%' THEN
      RAISE EXCEPTION 'T9 FAIL: rejected with unexpected message: %', SQLERRM;
    END IF;
    RAISE NOTICE 'T9 PASS: mentor missing course → "%"', SQLERRM;
END $$;

-- ──────────────────────────────────────────────────────────────────────────
-- T10: role='mentor', missing year → reject
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    created_at, updated_at, instance_id
  ) VALUES (
    v_id, 'authenticated', 'authenticated',
    't10@uniplug-dev.local',
    crypt('pw', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"role":"mentor","full_name":"Rohan","university":"Oxford","course":"CS"}'::jsonb,
    '', '', '', '',
    now(), now(), '00000000-0000-0000-0000-000000000000'
  );
  RAISE EXCEPTION 'T10 FAIL: missing year was accepted';
EXCEPTION
  WHEN raise_exception THEN
    IF SQLERRM LIKE 'T10 FAIL%' THEN RAISE; END IF;
    IF SQLERRM NOT LIKE '%Year of study is required%' THEN
      RAISE EXCEPTION 'T10 FAIL: rejected with unexpected message: %', SQLERRM;
    END IF;
    RAISE NOTICE 'T10 PASS: mentor missing year → "%"', SQLERRM;
END $$;

-- ──────────────────────────────────────────────────────────────────────────
-- T11: HAPPY PATH — full student → row in public.students with all fields
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    created_at, updated_at, instance_id
  ) VALUES (
    v_id, 'authenticated', 'authenticated',
    't11-student@uniplug-dev.local',
    crypt('pw', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object(
      'role',      'student',
      'full_name', 'Aanya Sharma',
      'phone',     '+91-9876543210',
      'school',    'Delhi Public School',
      'grade',     'Grade 11',
      'countries', jsonb_build_array('United Kingdom', 'United States')
    ),
    '', '', '', '',
    now(), now(), '00000000-0000-0000-0000-000000000000'
  );

  IF NOT EXISTS (
    SELECT 1 FROM public.students
    WHERE id        = v_id
      AND full_name = 'Aanya Sharma'
      AND email     = 't11-student@uniplug-dev.local'
      AND phone     = '+91-9876543210'
      AND school    = 'Delhi Public School'
      AND grade     = 'Grade 11'
      AND countries = ARRAY['United Kingdom', 'United States']::text[]
  ) THEN
    RAISE EXCEPTION 'T11 FAIL: student row not found or fields did not match for id %', v_id;
  END IF;

  RAISE NOTICE 'T11 PASS: full student metadata → public.students row populated correctly';
END $$;

-- ──────────────────────────────────────────────────────────────────────────
-- T12: HAPPY PATH — full mentor → row in public.mentors with status='pending'
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    created_at, updated_at, instance_id
  ) VALUES (
    v_id, 'authenticated', 'authenticated',
    't12-mentor@uniplug-dev.local',
    crypt('pw', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object(
      'role',       'mentor',
      'full_name',  'Rohan Iyer',
      'university', 'University of Oxford',
      'course',     'Computer Science',
      'year',       '2nd Year',
      'countries',  jsonb_build_array('United Kingdom', 'United States', 'Singapore')
    ),
    '', '', '', '',
    now(), now(), '00000000-0000-0000-0000-000000000000'
  );

  IF NOT EXISTS (
    SELECT 1 FROM public.mentors
    WHERE id         = v_id
      AND full_name  = 'Rohan Iyer'
      AND email      = 't12-mentor@uniplug-dev.local'
      AND university = 'University of Oxford'
      AND course     = 'Computer Science'
      AND year       = '2nd Year'
      AND countries  = ARRAY['United Kingdom', 'United States', 'Singapore']::text[]
      AND status     = 'pending'
  ) THEN
    RAISE EXCEPTION 'T12 FAIL: mentor row not found or fields did not match for id %', v_id;
  END IF;

  RAISE NOTICE 'T12 PASS: full mentor metadata → public.mentors row populated, status=pending';
END $$;

-- ──────────────────────────────────────────────────────────────────────────
-- Cleanup: roll back every change made by this script.
-- ──────────────────────────────────────────────────────────────────────────
ROLLBACK;

-- Post-run sanity (run these AFTER the ROLLBACK to confirm no leakage):
--   SELECT COUNT(*) FROM auth.users      WHERE email LIKE 't%@uniplug-dev.local';  -- expect 0
--   SELECT COUNT(*) FROM public.students WHERE email LIKE 't%@uniplug-dev.local';  -- expect 0
--   SELECT COUNT(*) FROM public.mentors  WHERE email LIKE 't%@uniplug-dev.local';  -- expect 0
