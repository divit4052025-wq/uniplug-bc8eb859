-- ════════════════════════════════════════════════════════════════════════════
-- Phase G4-follow-up dev-seed: interim parental-consent system
-- ════════════════════════════════════════════════════════════════════════════
--
-- Functional rejection + happy-path tests for migration
--   20260530000001_parental_consent_system.sql
--
-- All inside BEGIN..ROLLBACK — live state is unaffected. Booking attempts go
-- through book_session (the only INSERT path) so the gate fires exactly as it
-- does for real users.
--
-- COVERAGE
--   PC.1  happy: record_parental_consent sets parental_consent_at AND writes
--         exactly one immutable audit row with the right scope + version
--   PC.6  idempotent: a second consent click adds NO second audit row (still 1)
--   PC.2  reject: under-18 (by DOB) without consent → book_session blocked [P0001]
--   PC.3  reject: grade 9/10/11 with adult DOB, no consent → blocked [P0001]
--         (proves the live grade arm bites independent of age)
--   PC.4  happy: consenting minor → book_session succeeds
--   PC.5  reject: non-student / non-admin request_parental_consent → forbidden
--   PC.7  reject: client (authenticated) cannot write parental_consent_records
--   PC.8  reject (bonus): student editing own date_of_birth → blocked [P0001]
--         (anti-gaming immutability gate)
--
-- PASS CRITERIA: every row status='PASS'. A FAIL on a reject row is a
-- child-safety / security regression; a FAIL on a happy row is a UX break.
--
-- OPERATOR NOTE: tokens are minted here in setup (the handle_new_user
-- extension that mints them at signup lands with the signup-form stage).
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

DO $$
DECLARE
  m_a          constant uuid := '11111111-1111-1111-1111-1111111105a1';  -- approved mentor
  s_minor_dob  constant uuid := '22222222-2222-2222-2222-222222220501';  -- DOB 16 → minor by age
  s_grade_only constant uuid := '22222222-2222-2222-2222-222222220502';  -- DOB 19 (adult) but Grade 10
  s_consent    constant uuid := '22222222-2222-2222-2222-222222220503';  -- DOB 16, will consent
  s_null_g12   constant uuid := '22222222-2222-2222-2222-222222220504';  -- DOB NULL, Grade 12 (fail-closed case)
  s_adult_ok   constant uuid := '22222222-2222-2222-2222-222222220505';  -- DOB 25, Grade 12 → clean allow
  v_future     date := ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date + 7);
  v_future2    date := ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date + 14);
BEGIN
  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    created_at, updated_at, instance_id
  ) VALUES
    (m_a, 'authenticated', 'authenticated', 'm_a@pc.local',
     crypt('pw', gen_salt('bf')), now(), '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','mentor','full_name','Approved M','university','T','course','T','year','2nd Year','date_of_birth','2000-01-01'),
     '', '', '', '', now(), now(), '00000000-0000-0000-0000-000000000000'),
    (s_minor_dob, 'authenticated', 'authenticated', 's_minor_dob@pc.local',
     crypt('pw', gen_salt('bf')), now(), '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','student','full_name','Minor By Age','phone','+91-0','school','T','grade','Grade 11'),
     '', '', '', '', now(), now(), '00000000-0000-0000-0000-000000000000'),
    (s_grade_only, 'authenticated', 'authenticated', 's_grade_only@pc.local',
     crypt('pw', gen_salt('bf')), now(), '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','student','full_name','Older In Grade10','phone','+91-0','school','T','grade','Grade 10'),
     '', '', '', '', now(), now(), '00000000-0000-0000-0000-000000000000'),
    (s_consent, 'authenticated', 'authenticated', 's_consent@pc.local',
     crypt('pw', gen_salt('bf')), now(), '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','student','full_name','Consenting Minor','phone','+91-0','school','T','grade','Grade 11'),
     '', '', '', '', now(), now(), '00000000-0000-0000-0000-000000000000'),
    (s_null_g12, 'authenticated', 'authenticated', 's_null_g12@pc.local',
     crypt('pw', gen_salt('bf')), now(), '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','student','full_name','Null DOB G12','phone','+91-0','school','T','grade','Grade 12'),
     '', '', '', '', now(), now(), '00000000-0000-0000-0000-000000000000'),
    (s_adult_ok, 'authenticated', 'authenticated', 's_adult_ok@pc.local',
     crypt('pw', gen_salt('bf')), now(), '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','student','full_name','Adult G12','phone','+91-0','school','T','grade','Grade 12'),
     '', '', '', '', now(), now(), '00000000-0000-0000-0000-000000000000');

  UPDATE public.mentors SET status = 'approved' WHERE id = m_a;
  INSERT INTO public.mentor_availability (mentor_id, day_of_week, start_hour)
  VALUES (m_a, EXTRACT(ISODOW FROM v_future)::smallint, 14),
         (m_a, EXTRACT(ISODOW FROM v_future2)::smallint, 14) ON CONFLICT DO NOTHING;

  -- DOBs + parent contact + tokens (service_role bypasses the dob-immutable
  -- trigger, so this setup write is allowed).
  UPDATE public.students
     SET date_of_birth = current_date - interval '16 years',
         parental_consent_email = 'parent.dob@pc.local',
         parent_phone = '+91-1',
         parental_consent_token = gen_random_uuid()
   WHERE id = s_minor_dob;

  UPDATE public.students
     SET date_of_birth = current_date - interval '19 years',
         parental_consent_email = 'parent.grade@pc.local',
         parent_phone = '+91-2',
         parental_consent_token = gen_random_uuid()
   WHERE id = s_grade_only;

  UPDATE public.students
     SET date_of_birth = current_date - interval '16 years',
         parental_consent_email = 'parent.consent@pc.local',
         parent_phone = '+91-3',
         parental_consent_token = gen_random_uuid()
   WHERE id = s_consent;

  -- s_null_g12: DOB stays NULL on purpose (fail-closed case). No token.
  -- s_adult_ok: genuine adult in a non-gated grade → clean allow, no consent.
  UPDATE public.students
     SET date_of_birth = current_date - interval '25 years'
   WHERE id = s_adult_ok;
END $$;

CREATE TEMP TABLE _pc_results (test_id text PRIMARY KEY, status text NOT NULL, detail text NOT NULL);

-- ─── PC.1: record_parental_consent → sets timestamp + ONE audit row ─────────
DO $$
DECLARE
  v_pass boolean := false; v_msg text := '';
  v_token uuid; v_returned uuid; v_consent_at timestamptz;
  v_rows int; v_scope text[]; v_version text; v_anon boolean;
BEGIN
  v_anon := has_function_privilege('anon', 'public.record_parental_consent(uuid)', 'execute');
  SELECT parental_consent_token INTO v_token FROM public.students
   WHERE id = '22222222-2222-2222-2222-222222220503'::uuid;

  v_returned := public.record_parental_consent(v_token);

  SELECT parental_consent_at INTO v_consent_at FROM public.students
   WHERE id = '22222222-2222-2222-2222-222222220503'::uuid;
  SELECT count(*), max(consent_scope), max(consent_version)
    INTO v_rows, v_scope, v_version
    FROM public.parental_consent_records
   WHERE student_id = '22222222-2222-2222-2222-222222220503'::uuid;

  IF NOT v_anon THEN
    v_msg := 'anon lacks EXECUTE — a real parent could not use the link';
  ELSIF v_returned <> '22222222-2222-2222-2222-222222220503'::uuid OR v_consent_at IS NULL THEN
    v_msg := 'returned '||coalesce(v_returned::text,'NULL')||' consent_at='||coalesce(v_consent_at::text,'NULL');
  ELSIF v_rows <> 1 THEN
    v_msg := 'expected 1 audit row, got '||v_rows;
  ELSIF NOT (v_scope @> ARRAY['data_processing','mentorship_sessions','messaging','session_recording']
             AND array_length(v_scope,1) = 4) THEN
    v_msg := 'audit scope wrong: '||array_to_string(v_scope, ',');
  ELSIF v_version IS DISTINCT FROM 'v1-2026-05-30' THEN
    v_msg := 'audit version wrong: '||coalesce(v_version,'NULL');
  ELSE
    v_pass := true;
    v_msg := 'consent_at set; 1 immutable row scope=['||array_to_string(v_scope,',')||'] version='||v_version||'; anon EXECUTE ok';
  END IF;
  INSERT INTO _pc_results VALUES ('PC.1_record_consent_writes_audit',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── PC.6: second consent click → still exactly one audit row (idempotent) ──
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_token uuid; v_rows int;
BEGIN
  SELECT parental_consent_token INTO v_token FROM public.students
   WHERE id = '22222222-2222-2222-2222-222222220503'::uuid;
  PERFORM public.record_parental_consent(v_token);  -- second click
  SELECT count(*) INTO v_rows FROM public.parental_consent_records
   WHERE student_id = '22222222-2222-2222-2222-222222220503'::uuid;
  IF v_rows = 1 THEN v_pass := true; v_msg := 'still exactly 1 audit row after re-click';
  ELSE v_msg := 'idempotency breach: '||v_rows||' rows after second consent'; END IF;
  INSERT INTO _pc_results VALUES ('PC.6_double_consent_idempotent',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── PC.2: under-18 by DOB, no consent → book_session blocked ───────────────
DO $$
DECLARE v_pass boolean := false; v_msg text := '';
  v_future date := ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date + 7);
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222220501","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.book_session('11111111-1111-1111-1111-1111111105a1'::uuid, v_future, '14:00');
    v_msg := 'under-18 booking ACCEPTED — security regression';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE '%parental consent required%' THEN v_pass := true; v_msg := 'rejected ['||SQLSTATE||']: '||SQLERRM;
    ELSE v_msg := 'wrong reject ['||SQLSTATE||']: '||SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _pc_results VALUES ('PC.2_under18_dob_blocked',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── PC.3: Grade 10 with ADULT DOB, no consent → blocked (grade arm) ────────
DO $$
DECLARE v_pass boolean := false; v_msg text := '';
  v_future date := ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date + 7);
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222220502","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.book_session('11111111-1111-1111-1111-1111111105a1'::uuid, v_future, '14:00');
    v_msg := 'grade-10 (adult DOB) booking ACCEPTED — grade arm not enforced';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE '%parental consent required%' THEN v_pass := true; v_msg := 'rejected ['||SQLSTATE||']: '||SQLERRM;
    ELSE v_msg := 'wrong reject ['||SQLSTATE||']: '||SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _pc_results VALUES ('PC.3_grade_arm_blocked',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── PC.4: consenting minor → book_session succeeds ─────────────────────────
DO $$
DECLARE v_pass boolean := false; v_msg text := '';
  v_future date := ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date + 7);
  v_id uuid;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222220503","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    v_id := public.book_session('11111111-1111-1111-1111-1111111105a1'::uuid, v_future, '14:00');
    IF v_id IS NOT NULL THEN v_pass := true; v_msg := 'consenting minor booking succeeded, id='||v_id;
    ELSE v_msg := 'booking returned NULL id'; END IF;
  EXCEPTION WHEN OTHERS THEN
    v_msg := 'unexpected denial ['||SQLSTATE||']: '||SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _pc_results VALUES ('PC.4_consenting_minor_books',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── PC.5: non-student / non-admin request_parental_consent → forbidden ─────
DO $$
DECLARE v_pass boolean := false; v_msg text := '';
BEGIN
  -- Caller is the MENTOR (not the target student, not an admin).
  PERFORM set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-1111111105a1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.request_parental_consent('22222222-2222-2222-2222-222222220501'::uuid);
    v_msg := 'non-owner call ACCEPTED — security regression';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE '%forbidden%' THEN v_pass := true; v_msg := 'rejected ['||SQLSTATE||']: '||SQLERRM;
    ELSE v_msg := 'wrong reject ['||SQLSTATE||']: '||SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _pc_results VALUES ('PC.5_request_consent_forbidden',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── PC.7: client (authenticated) cannot INSERT / UPDATE / DELETE the audit ─
--          table (full immutability — not just INSERT). s_consent has one real
--          audit row from PC.1, so UPDATE/DELETE have a row to target.
DO $$
DECLARE
  v_pass boolean := false; v_msg text := '';
  v_ins text := ''; v_upd text := ''; v_del text := '';
  c_sid constant uuid := '22222222-2222-2222-2222-222222220503';
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222220503","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  BEGIN
    INSERT INTO public.parental_consent_records (student_id, consent_scope, consent_version)
    VALUES (c_sid, ARRAY['tampered'], 'hack');
    v_ins := 'ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    v_ins := CASE WHEN SQLSTATE = '42501' THEN 'denied' ELSE 'unexpected:'||SQLSTATE END;
  END;

  BEGIN
    UPDATE public.parental_consent_records SET consent_version = 'hack' WHERE student_id = c_sid;
    v_upd := 'ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    v_upd := CASE WHEN SQLSTATE = '42501' THEN 'denied' ELSE 'unexpected:'||SQLSTATE END;
  END;

  BEGIN
    DELETE FROM public.parental_consent_records WHERE student_id = c_sid;
    v_del := 'ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    v_del := CASE WHEN SQLSTATE = '42501' THEN 'denied' ELSE 'unexpected:'||SQLSTATE END;
  END;

  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

  IF v_ins = 'denied' AND v_upd = 'denied' AND v_del = 'denied' THEN
    v_pass := true; v_msg := 'INSERT/UPDATE/DELETE all denied [42501] — append-only holds';
  ELSE
    v_msg := 'INSERT='||v_ins||' UPDATE='||v_upd||' DELETE='||v_del;
  END IF;
  INSERT INTO _pc_results VALUES ('PC.7_audit_no_client_write',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── PC.8 (bonus): student cannot edit own date_of_birth ────────────────────
DO $$
DECLARE v_pass boolean := false; v_msg text := '';
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222220503","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    UPDATE public.students SET date_of_birth = current_date - interval '30 years'
     WHERE id = '22222222-2222-2222-2222-222222220503'::uuid;
    v_msg := 'student DOB edit ACCEPTED — gaming gate open';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE '%date of birth can only be changed by an administrator%' THEN
      v_pass := true; v_msg := 'rejected ['||SQLSTATE||']: '||SQLERRM;
    ELSE v_msg := 'wrong reject ['||SQLSTATE||']: '||SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _pc_results VALUES ('PC.8_dob_immutable_for_student',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── PC.9: NULL-DOB, Grade 12 (non-gated grade) → blocked (fail-closed) ─────
--          The case Option A would have MISSED: grade 12 isn't gated and DOB
--          is unknown, so only the fail-closed NULL arm blocks it.
DO $$
DECLARE v_pass boolean := false; v_msg text := '';
  v_future date := ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date + 7);
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222220504","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.book_session('11111111-1111-1111-1111-1111111105a1'::uuid, v_future, '14:00');
    v_msg := 'NULL-DOB grade-12 booking ACCEPTED — fail-closed hole';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE '%parental consent required%' THEN v_pass := true; v_msg := 'rejected ['||SQLSTATE||']: '||SQLERRM;
    ELSE v_msg := 'wrong reject ['||SQLSTATE||']: '||SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _pc_results VALUES ('PC.9_null_dob_g12_fails_closed',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── PC.10: adult (DOB 25, Grade 12, non-gated), no consent → allowed ───────
--           Confirms the gate isn't over-blocking — a genuine adult in a
--           non-gated grade books with no parent step.
DO $$
DECLARE v_pass boolean := false; v_msg text := '';
  v_future2 date := ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date + 14);
  v_id uuid;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222220505","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    v_id := public.book_session('11111111-1111-1111-1111-1111111105a1'::uuid, v_future2, '14:00');
    IF v_id IS NOT NULL THEN v_pass := true; v_msg := 'adult non-gated booking succeeded, id='||v_id;
    ELSE v_msg := 'booking returned NULL id'; END IF;
  EXCEPTION WHEN OTHERS THEN
    v_msg := 'unexpected denial ['||SQLSTATE||']: '||SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _pc_results VALUES ('PC.10_adult_non_gated_allowed',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

SELECT test_id, status, detail FROM _pc_results ORDER BY test_id;

ROLLBACK;
