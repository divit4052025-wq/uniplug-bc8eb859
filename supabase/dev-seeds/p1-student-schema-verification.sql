-- ════════════════════════════════════════════════════════════════════════════
-- Phase 1 dev-seed: student schema verification
-- ════════════════════════════════════════════════════════════════════════════
--
-- WHAT THIS FILE IS
--   Runnable rejection + happy-path tests for the tables, columns, RLS policies,
--   storage bucket and handle_new_user extension added in
--   supabase/migrations/20260603000004_p1_student_schema.sql. NOT a migration.
--
-- HOW IT WORKS
--   Single outer BEGIN..ROLLBACK. Setup (bootstrap role, RLS-bypassing) creates
--   two student auth users (A and B) — the on_auth_user_created → handle_new_user
--   trigger cascades their public.students rows; A's metadata carries the new
--   board/bio + terms/privacy versions so we can prove the trigger extension.
--   Each test switches SET LOCAL ROLE + request.jwt.claims so auth.uid() and RLS
--   evaluate as for a real signed-in user. Results accumulate in a TEMP table;
--   everything ROLLBACKs.
--
-- HOW TO RUN
--   docker exec -i supabase_db_<ref> psql "postgresql://postgres:postgres@localhost:5432/postgres" \
--     -v ON_ERROR_STOP=1 < this-file.sql
--
-- PASS CRITERIA
--   Final SELECT returns one row per test, status = 'PASS'. Any '| FAIL |' row
--   fails CI.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- Two student auth users. handle_new_user cascades the public.students rows.
-- A carries the new optional metadata (board/bio + terms/privacy versions).
-- Grade 12 + no DOB → adult path (no parental-consent email side effects).
INSERT INTO auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  created_at, updated_at, instance_id
) VALUES
(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  'authenticated', 'authenticated', 'p1-student-a@example.com',
  crypt('p1-fixture-pw', gen_salt('bf')), now(),
  '{"provider":"email"}'::jsonb,
  jsonb_build_object(
    'role','student','full_name','Phase1 Student A','phone','+91-100',
    'school','Test School A','grade','Grade 12',
    'board','CBSE','bio','aspiring engineer',
    'terms_version','2026-06-01','privacy_version','2026-06-01'
  ),
  '', '', '', '', now(), now(), '00000000-0000-0000-0000-000000000000'
),
(
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid,
  'authenticated', 'authenticated', 'p1-student-b@example.com',
  crypt('p1-fixture-pw', gen_salt('bf')), now(),
  '{"provider":"email"}'::jsonb,
  jsonb_build_object(
    'role','student','full_name','Phase1 Student B','phone','+91-200',
    'school','Test School B','grade','Grade 12'
  ),
  '', '', '', '', now(), now(), '00000000-0000-0000-0000-000000000000'
),
-- C: rich signup metadata, NEVER mutated by any test → proves handle_new_user
-- populated board/bio + legal acceptances at signup (P1.18 reads C).
(
  'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid,
  'authenticated', 'authenticated', 'p1-student-c@example.com',
  crypt('p1-fixture-pw', gen_salt('bf')), now(),
  '{"provider":"email"}'::jsonb,
  jsonb_build_object(
    'role','student','full_name','Phase1 Student C','phone','+91-300',
    'school','Test School C','grade','Grade 12',
    'board','CBSE','bio','aspiring engineer',
    'terms_version','2026-06-01','privacy_version','2026-06-01'
  ),
  '', '', '', '', now(), now(), '00000000-0000-0000-0000-000000000000'
)
ON CONFLICT (id) DO NOTHING;

-- One real reference id per axis (P0 seed guarantees these exist).
CREATE TEMP TABLE _p1ids AS
SELECT
  (SELECT id FROM public.ref_courses            LIMIT 1) AS course_id,
  (SELECT id FROM public.ref_subjects           LIMIT 1) AS subject_id,
  (SELECT id FROM public.ref_sports             LIMIT 1) AS sport_id,
  (SELECT id FROM public.ref_cocurriculars      LIMIT 1) AS cocurricular_id,
  (SELECT id FROM public.ref_project_categories LIMIT 1) AS project_category_id,
  (SELECT id FROM public.ref_universities       LIMIT 1) AS university_id;

CREATE TEMP TABLE _p1 (test_id text PRIMARY KEY, status text NOT NULL, detail text NOT NULL);

-- Helpers: impersonate A / B / reset are inlined per block (matches repo idiom).
-- A = aaaaaaaa..., B = bbbbbbbb....

-- ─── P1.1 (HAPPY): student updates own profile (new board/bio columns) ───
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_rows int;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    UPDATE public.students SET bio = 'updated bio', board = 'ICSE'
      WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_pass := (v_rows = 1);
    v_msg := 'owner update of own board/bio affected '||v_rows||' row(s) (expect 1)';
  EXCEPTION WHEN OTHERS THEN
    v_msg := 'unexpected ['||SQLSTATE||']: '||SQLERRM;
  END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p1 VALUES ('P1.01_students_owner_update', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P1.2 (REJECTION): student cannot update another student's profile ───
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_rows int;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    UPDATE public.students SET bio = 'hacked' WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_pass := (v_rows = 0);
    v_msg := 'cross-owner update affected '||v_rows||' row(s) (expect 0 — RLS hides B)';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE IN ('42501','P0001') THEN v_pass := true; v_msg := 'denied ['||SQLSTATE||']';
    ELSE v_msg := 'unexpected ['||SQLSTATE||']: '||SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p1 VALUES ('P1.02_students_cross_owner_update_blocked', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P1.3 (HAPPY): student adds own target university with ref link (student_schools extension) ───
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_uni uuid;
BEGIN
  SELECT university_id INTO v_uni FROM _p1ids;
  PERFORM set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    INSERT INTO public.student_schools (student_id, name, category, ref_university_id)
    VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'My Dream Uni', 'target', v_uni);
    v_pass := true; v_msg := 'owner inserted target uni with ref_university_id';
  EXCEPTION WHEN OTHERS THEN
    v_msg := 'unexpected denial ['||SQLSTATE||']: '||SQLERRM;
  END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p1 VALUES ('P1.03_student_schools_owner_insert_reflink', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P1.4 (REJECTION): student cannot add a target university for another student ───
DO $$
DECLARE v_pass boolean := false; v_msg text := '';
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    INSERT INTO public.student_schools (student_id, name, category)
    VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Hijack Uni', 'target');
    v_msg := 'cross-owner student_schools insert ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE IN ('42501','P0001') THEN v_pass := true; v_msg := 'denied ['||SQLSTATE||']';
    ELSE v_msg := 'unexpected ['||SQLSTATE||']: '||SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p1 VALUES ('P1.04_student_schools_cross_owner_blocked', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P1.5 / P1.6 student_courses happy + rejection ───
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_cid uuid;
BEGIN
  SELECT course_id INTO v_cid FROM _p1ids;
  PERFORM set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    INSERT INTO public.student_courses (student_id, course_id)
    VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', v_cid);
    v_pass := true; v_msg := 'owner inserted own course';
  EXCEPTION WHEN OTHERS THEN v_msg := 'unexpected denial ['||SQLSTATE||']: '||SQLERRM; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p1 VALUES ('P1.05_student_courses_owner_insert', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_cid uuid;
BEGIN
  SELECT course_id INTO v_cid FROM _p1ids;
  PERFORM set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    INSERT INTO public.student_courses (student_id, course_id)
    VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', v_cid);
    v_msg := 'cross-owner course insert ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE IN ('42501','P0001') THEN v_pass := true; v_msg := 'denied ['||SQLSTATE||']';
    ELSE v_msg := 'unexpected ['||SQLSTATE||']: '||SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p1 VALUES ('P1.06_student_courses_cross_owner_blocked', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P1.7 / P1.8 student_subjects happy + rejection ───
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_id uuid;
BEGIN
  SELECT subject_id INTO v_id FROM _p1ids;
  PERFORM set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    INSERT INTO public.student_subjects (student_id, subject_id) VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', v_id);
    v_pass := true; v_msg := 'owner inserted own subject';
  EXCEPTION WHEN OTHERS THEN v_msg := 'unexpected denial ['||SQLSTATE||']: '||SQLERRM; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p1 VALUES ('P1.07_student_subjects_owner_insert', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_id uuid;
BEGIN
  SELECT subject_id INTO v_id FROM _p1ids;
  PERFORM set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    INSERT INTO public.student_subjects (student_id, subject_id) VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', v_id);
    v_msg := 'cross-owner subject insert ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE IN ('42501','P0001') THEN v_pass := true; v_msg := 'denied ['||SQLSTATE||']';
    ELSE v_msg := 'unexpected ['||SQLSTATE||']: '||SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p1 VALUES ('P1.08_student_subjects_cross_owner_blocked', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P1.9 / P1.10 student_sports happy + rejection ───
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_id uuid;
BEGIN
  SELECT sport_id INTO v_id FROM _p1ids;
  PERFORM set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    INSERT INTO public.student_sports (student_id, sport_id) VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', v_id);
    v_pass := true; v_msg := 'owner inserted own sport';
  EXCEPTION WHEN OTHERS THEN v_msg := 'unexpected denial ['||SQLSTATE||']: '||SQLERRM; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p1 VALUES ('P1.09_student_sports_owner_insert', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_id uuid;
BEGIN
  SELECT sport_id INTO v_id FROM _p1ids;
  PERFORM set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    INSERT INTO public.student_sports (student_id, sport_id) VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', v_id);
    v_msg := 'cross-owner sport insert ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE IN ('42501','P0001') THEN v_pass := true; v_msg := 'denied ['||SQLSTATE||']';
    ELSE v_msg := 'unexpected ['||SQLSTATE||']: '||SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p1 VALUES ('P1.10_student_sports_cross_owner_blocked', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P1.11 / P1.12 student_cocurriculars happy + rejection ───
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_id uuid;
BEGIN
  SELECT cocurricular_id INTO v_id FROM _p1ids;
  PERFORM set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    INSERT INTO public.student_cocurriculars (student_id, cocurricular_id) VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', v_id);
    v_pass := true; v_msg := 'owner inserted own cocurricular';
  EXCEPTION WHEN OTHERS THEN v_msg := 'unexpected denial ['||SQLSTATE||']: '||SQLERRM; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p1 VALUES ('P1.11_student_cocurriculars_owner_insert', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_id uuid;
BEGIN
  SELECT cocurricular_id INTO v_id FROM _p1ids;
  PERFORM set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    INSERT INTO public.student_cocurriculars (student_id, cocurricular_id) VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', v_id);
    v_msg := 'cross-owner cocurricular insert ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE IN ('42501','P0001') THEN v_pass := true; v_msg := 'denied ['||SQLSTATE||']';
    ELSE v_msg := 'unexpected ['||SQLSTATE||']: '||SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p1 VALUES ('P1.12_student_cocurriculars_cross_owner_blocked', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P1.13 / P1.14 student_project_categories (with detail) happy + rejection ───
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_id uuid;
BEGIN
  SELECT project_category_id INTO v_id FROM _p1ids;
  PERFORM set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    INSERT INTO public.student_project_categories (student_id, project_category_id, detail)
    VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', v_id, 'Built a solar-powered weather station');
    v_pass := true; v_msg := 'owner inserted own project with detail';
  EXCEPTION WHEN OTHERS THEN v_msg := 'unexpected denial ['||SQLSTATE||']: '||SQLERRM; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p1 VALUES ('P1.13_student_projects_owner_insert', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_id uuid;
BEGIN
  SELECT project_category_id INTO v_id FROM _p1ids;
  PERFORM set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    INSERT INTO public.student_project_categories (student_id, project_category_id, detail)
    VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', v_id, 'hijack');
    v_msg := 'cross-owner project insert ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE IN ('42501','P0001') THEN v_pass := true; v_msg := 'denied ['||SQLSTATE||']';
    ELSE v_msg := 'unexpected ['||SQLSTATE||']: '||SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p1 VALUES ('P1.14_student_projects_cross_owner_blocked', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P1.15 / P1.16 legal_acceptances owner-insert happy + cross-owner rejection ───
DO $$
DECLARE v_pass boolean := false; v_msg text := '';
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    INSERT INTO public.legal_acceptances (user_id, doc_type, version)
    VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'terms', '2026-06-02');
    v_pass := true; v_msg := 'owner recorded own acceptance';
  EXCEPTION WHEN OTHERS THEN v_msg := 'unexpected denial ['||SQLSTATE||']: '||SQLERRM; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p1 VALUES ('P1.15_legal_owner_insert', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;
DO $$
DECLARE v_pass boolean := false; v_msg text := '';
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    INSERT INTO public.legal_acceptances (user_id, doc_type, version)
    VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'terms', '2026-06-02');
    v_msg := 'cross-owner legal insert ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE IN ('42501','P0001') THEN v_pass := true; v_msg := 'denied ['||SQLSTATE||']';
    ELSE v_msg := 'unexpected ['||SQLSTATE||']: '||SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p1 VALUES ('P1.16_legal_cross_owner_blocked', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P1.17 (REJECTION/IMMUTABLE): legal_acceptances has no UPDATE path (append-only) ───
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_rows int;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    UPDATE public.legal_acceptances SET version = 'tampered'
      WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_pass := (v_rows = 0);
    v_msg := 'owner UPDATE affected '||v_rows||' row(s) (expect 0 — no UPDATE policy = immutable)';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE IN ('42501','P0001') THEN v_pass := true; v_msg := 'denied ['||SQLSTATE||']';
    ELSE v_msg := 'unexpected ['||SQLSTATE||']: '||SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p1 VALUES ('P1.17_legal_append_only', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P1.18 (HAPPY): handle_new_user populated C's board/bio + legal acceptances at signup ───
-- Reads student C (created with rich metadata, never mutated by other tests).
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_board text; v_bio text; v_legal int;
BEGIN
  SELECT board, bio INTO v_board, v_bio FROM public.students WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  SELECT count(*) INTO v_legal FROM public.legal_acceptances
    WHERE user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' AND doc_type IN ('terms','privacy');
  v_pass := (v_board = 'CBSE' AND v_bio = 'aspiring engineer' AND v_legal >= 2);
  v_msg := 'signup populated board='||coalesce(v_board,'<null>')||' bio='||coalesce(v_bio,'<null>')||' legal(terms+privacy) rows='||v_legal;
  INSERT INTO _p1 VALUES ('P1.18_handle_new_user_populates', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P1.19 (HAPPY): student uploads to own prefix in student-photos bucket ───
DO $$
DECLARE v_pass boolean := false; v_msg text := '';
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    INSERT INTO storage.objects (bucket_id, name)
    VALUES ('student-photos', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/avatar.jpg');
    v_pass := true; v_msg := 'owner uploaded to own prefix';
  EXCEPTION WHEN OTHERS THEN v_msg := 'unexpected denial ['||SQLSTATE||']: '||SQLERRM; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p1 VALUES ('P1.19_student_photos_owner_upload', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P1.20 (REJECTION): student cannot upload to another student's photo prefix ───
DO $$
DECLARE v_pass boolean := false; v_msg text := '';
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    INSERT INTO storage.objects (bucket_id, name)
    VALUES ('student-photos', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/avatar.jpg');
    v_msg := 'cross-owner upload ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE IN ('42501','P0001') THEN v_pass := true; v_msg := 'denied ['||SQLSTATE||']';
    ELSE v_msg := 'unexpected ['||SQLSTATE||']: '||SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p1 VALUES ('P1.20_student_photos_cross_owner_blocked', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

SELECT test_id, status, detail FROM _p1 ORDER BY test_id;

ROLLBACK;
