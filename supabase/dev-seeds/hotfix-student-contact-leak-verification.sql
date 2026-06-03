-- ════════════════════════════════════════════════════════════════════════════
-- Child-safety hotfix dev-seed: get_student_overview_for_mentor no longer leaks
-- student email / phone to the mentor (booking-gated cross-party payload).
-- ════════════════════════════════════════════════════════════════════════════
--
-- Pairs with supabase/migrations/20260603000006_hotfix_student_overview_no_contact.sql.
-- Setup (bootstrap role, RLS-bypassing) creates a mentor M, an ADULT student S,
-- and a CONFIRMED booking between them (so the function's access gate is open).
-- Then asserts: the contact columns are GONE from the return shape, while the
-- legitimate fields still resolve for the booked mentor.
--
-- Run: docker exec -i supabase_db_<ref> psql "postgresql://postgres:postgres@localhost:5432/postgres" \
--        -v ON_ERROR_STOP=1 < this-file.sql
-- PASS CRITERIA: every row status = 'PASS'. Any '| FAIL |' fails CI.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- Mentor M + adult student S (Grade 12 → no parental-consent gate on the booking).
INSERT INTO auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  created_at, updated_at, instance_id
) VALUES
(
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'::uuid,
  'authenticated', 'authenticated', 'hotfix-mentor@example.com',
  crypt('hotfix-pw', gen_salt('bf')), now(), '{"provider":"email"}'::jsonb,
  jsonb_build_object('role','mentor','full_name','Hotfix Mentor','university','IIT Bombay','course','Computer Science','year','3rd Year'),
  '', '', '', '', now(), now(), '00000000-0000-0000-0000-000000000000'
),
(
  'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid,
  'authenticated', 'authenticated', 'hotfix-student@example.com',
  crypt('hotfix-pw', gen_salt('bf')), now(), '{"provider":"email"}'::jsonb,
  jsonb_build_object('role','student','full_name','Hotfix Student','phone','+91-700','school','Test School','grade','Grade 12'),
  '', '', '', '', now(), now(), '00000000-0000-0000-0000-000000000000'
)
ON CONFLICT (id) DO NOTHING;

-- A confirmed booking opens the overview gate (mentor_id = M, student_id = S).
INSERT INTO public.bookings (mentor_id, student_id, date, time_slot, duration, price, status)
VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'ffffffff-ffff-ffff-ffff-ffffffffffff',
        CURRENT_DATE + 7, '10:00', 60, 1000, 'confirmed');

CREATE TEMP TABLE _hf (test_id text PRIMARY KEY, status text NOT NULL, detail text NOT NULL);

-- ─── HF.1: the function's return shape no longer includes email/phone, but keeps the legit fields ───
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_sig text;
BEGIN
  v_sig := pg_get_function_result('public.get_student_overview_for_mentor'::regproc);
  v_pass := (v_sig NOT ILIKE '%email%' AND v_sig NOT ILIKE '%phone%'
             AND v_sig ILIKE '%full_name%' AND v_sig ILIKE '%school%' AND v_sig ILIKE '%grade%'
             AND v_sig ILIKE '%documents%' AND v_sig ILIKE '%schools%');
  v_msg := 'return shape = ' || v_sig;
  INSERT INTO _hf VALUES ('HF.1_return_shape_no_contact', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── HF.2: a booked mentor still gets the student's legitimate fields (gate intact) ───
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_name text; v_school text; v_grade text; v_cnt int;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    SELECT count(*) INTO v_cnt FROM public.get_student_overview_for_mentor('ffffffff-ffff-ffff-ffff-ffffffffffff');
    SELECT full_name, school, grade INTO v_name, v_school, v_grade
      FROM public.get_student_overview_for_mentor('ffffffff-ffff-ffff-ffff-ffffffffffff');
    v_pass := (v_cnt = 1 AND v_name = 'Hotfix Student' AND v_school = 'Test School' AND v_grade = 'Grade 12');
    v_msg := 'booked mentor got rows='||v_cnt||' full_name='||coalesce(v_name,'<null>')||' school='||coalesce(v_school,'<null>');
  EXCEPTION WHEN OTHERS THEN
    v_msg := 'unexpected ['||SQLSTATE||']: '||SQLERRM;
  END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _hf VALUES ('HF.2_legit_fields_present', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── HF.3: selecting `email` off the result is now a structural error (column gone) ───
DO $$
DECLARE v_pass boolean := false; v_msg text := '';
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    EXECUTE 'SELECT email FROM public.get_student_overview_for_mentor(''ffffffff-ffff-ffff-ffff-ffffffffffff'')';
    v_msg := 'email column STILL selectable — leak NOT closed';
  EXCEPTION
    WHEN undefined_column THEN v_pass := true; v_msg := 'email column absent ['||SQLSTATE||']';
    WHEN OTHERS THEN v_msg := 'unexpected ['||SQLSTATE||']: '||SQLERRM;
  END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _hf VALUES ('HF.3_email_column_absent', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── HF.4: selecting `phone` off the result is now a structural error (column gone) ───
DO $$
DECLARE v_pass boolean := false; v_msg text := '';
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    EXECUTE 'SELECT phone FROM public.get_student_overview_for_mentor(''ffffffff-ffff-ffff-ffff-ffffffffffff'')';
    v_msg := 'phone column STILL selectable — leak NOT closed';
  EXCEPTION
    WHEN undefined_column THEN v_pass := true; v_msg := 'phone column absent ['||SQLSTATE||']';
    WHEN OTHERS THEN v_msg := 'unexpected ['||SQLSTATE||']: '||SQLERRM;
  END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _hf VALUES ('HF.4_phone_column_absent', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

SELECT test_id, status, detail FROM _hf ORDER BY test_id;

ROLLBACK;
