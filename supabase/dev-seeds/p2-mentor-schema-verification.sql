-- ════════════════════════════════════════════════════════════════════════════
-- Phase 2 dev-seed: mentor schema verification
-- ════════════════════════════════════════════════════════════════════════════
--
-- WHAT THIS FILE IS
--   Rejection + happy-path tests for the columns, the mentor_admits join, the
--   re_review_pending lock, and the read-privacy posture added/relied-on by
--   supabase/migrations/20260603000005_p2_mentor_schema.sql. NOT a migration.
--
-- HOW IT WORKS
--   Single BEGIN..ROLLBACK. Setup (bootstrap role) creates mentors M_A, M_B,
--   M_C (M_C carries rich signup metadata and is NEVER mutated → proves
--   handle_new_user population), a student S (to prove a student-role caller
--   can't read a mentor), and the canonical admin. Each test switches role +
--   request.jwt.claims so auth.uid()/RLS/is_admin() evaluate for real.
--
-- HOW TO RUN
--   docker exec -i supabase_db_<ref> psql "postgresql://postgres:postgres@localhost:5432/postgres" \
--     -v ON_ERROR_STOP=1 < this-file.sql
--
-- PASS CRITERIA
--   Final SELECT: one row per test, status = 'PASS'. Any '| FAIL |' fails CI.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- Canonical admin (for admin_set_mentor_status). Same id/email as is_admin().
INSERT INTO auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  created_at, updated_at, instance_id
) VALUES (
  'db74f8e5-5511-4aec-a9a4-79ae2b535b9f'::uuid,
  'authenticated', 'authenticated', 'divitfatehpuria7@gmail.com',
  crypt('p2-fixture-pw', gen_salt('bf')), now(),
  '{"provider":"email"}'::jsonb,
  jsonb_build_object('role','student','full_name','Admin User','phone','+91-0','school','T','grade','Grade 11'),
  '', '', '', '', now(), now(), '00000000-0000-0000-0000-000000000000'
) ON CONFLICT (id) DO NOTHING;

-- Mentors M_A (mutated), M_B (minimal; cross-owner + non-owner reader),
-- M_C (rich metadata, never mutated), and student S. handle_new_user cascades
-- the public.mentors / public.students rows.
INSERT INTO auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  created_at, updated_at, instance_id
) VALUES
(
  'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1'::uuid,
  'authenticated', 'authenticated', 'p2-mentor-a@example.com',
  crypt('p2-fixture-pw', gen_salt('bf')), now(), '{"provider":"email"}'::jsonb,
  jsonb_build_object('role','mentor','full_name','Mentor A','university','IIT Bombay','course','Computer Science','year','3rd Year'),
  '', '', '', '', now(), now(), '00000000-0000-0000-0000-000000000000'
),
(
  'b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2'::uuid,
  'authenticated', 'authenticated', 'p2-mentor-b@example.com',
  crypt('p2-fixture-pw', gen_salt('bf')), now(), '{"provider":"email"}'::jsonb,
  jsonb_build_object('role','mentor','full_name','Mentor B','university','IIT Delhi','course','Mechanical Engineering','year','2nd Year'),
  '', '', '', '', now(), now(), '00000000-0000-0000-0000-000000000000'
),
(
  'c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3'::uuid,
  'authenticated', 'authenticated', 'p2-mentor-c@example.com',
  crypt('p2-fixture-pw', gen_salt('bf')), now(), '{"provider":"email"}'::jsonb,
  jsonb_build_object(
    'role','mentor','full_name','Mentor C','university','Stanford University','course','Economics','year','Final Year',
    'phone','+91-999','college_email','c@stanford.edu','bio','I mentor essays',
    'specialty','essays',
    'university_id',(SELECT id::text FROM public.ref_universities LIMIT 1),
    'course_id',(SELECT id::text FROM public.ref_courses LIMIT 1),
    'mentor_agreement_version','2026-06-01','terms_version','2026-06-01','privacy_version','2026-06-01'
  ),
  '', '', '', '', now(), now(), '00000000-0000-0000-0000-000000000000'
),
(
  'd4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d4d4'::uuid,
  'authenticated', 'authenticated', 'p2-student-s@example.com',
  crypt('p2-fixture-pw', gen_salt('bf')), now(), '{"provider":"email"}'::jsonb,
  jsonb_build_object('role','student','full_name','Student S','phone','+91-500','school','Test School','grade','Grade 12'),
  '', '', '', '', now(), now(), '00000000-0000-0000-0000-000000000000'
)
ON CONFLICT (id) DO NOTHING;

CREATE TEMP TABLE _p2ids AS
SELECT
  (SELECT id FROM public.ref_universities ORDER BY name LIMIT 1)                AS university_id,
  (SELECT id FROM public.ref_universities ORDER BY name OFFSET 1 LIMIT 1)       AS university_id_2,
  (SELECT id FROM public.ref_courses LIMIT 1)                                   AS course_id,
  (SELECT id FROM public.ref_specialties WHERE key = 'essays')                  AS essays_specialty_id;

CREATE TEMP TABLE _p2 (test_id text PRIMARY KEY, status text NOT NULL, detail text NOT NULL);

-- M_A = a1a1..., M_B = b2b2..., M_C = c3c3..., S = d4d4..., admin = db74f8e5...

-- ─── P2.01 (HAPPY): mentor updates own editable profile fields ───
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_rows int; v_uni uuid; v_course uuid; v_spec uuid;
BEGIN
  SELECT university_id, course_id, essays_specialty_id INTO v_uni, v_course, v_spec FROM _p2ids;
  PERFORM set_config('request.jwt.claims','{"sub":"a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    UPDATE public.mentors
      SET bio='Updated bio', phone='+91-111', college_email='a@iitb.ac.in',
          specialty_id=v_spec, ref_university_id=v_uni, ref_course_id=v_course, max_active_mentees=5
      WHERE id='a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_pass := (v_rows = 1);
    v_msg := 'owner profile update affected '||v_rows||' row(s) (expect 1)';
  EXCEPTION WHEN OTHERS THEN
    v_msg := 'unexpected ['||SQLSTATE||']: '||SQLERRM;
  END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p2 VALUES ('P2.01_mentor_owner_update', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P2.02 (REJECTION): mentor cannot update another mentor's row ───
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_rows int;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    UPDATE public.mentors SET bio='hacked' WHERE id='b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_pass := (v_rows = 0);
    v_msg := 'cross-owner update affected '||v_rows||' row(s) (expect 0)';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE IN ('42501','P0001') THEN v_pass := true; v_msg := 'denied ['||SQLSTATE||']';
    ELSE v_msg := 'unexpected ['||SQLSTATE||']: '||SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p2 VALUES ('P2.02_mentor_cross_owner_update_blocked', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P2.03 (REJECTION): mentor cannot self-approve (status is admin-locked) ───
DO $$
DECLARE v_pass boolean := false; v_msg text := '';
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    UPDATE public.mentors SET status='approved' WHERE id='a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1';
    v_msg := 'mentor self-approval ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = 'P0001' AND SQLERRM ILIKE '%administrator%' THEN v_pass := true; v_msg := 'denied: '||SQLERRM;
    ELSE v_msg := 'unexpected ['||SQLSTATE||']: '||SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p2 VALUES ('P2.03_mentor_self_approve_blocked', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P2.04 (REJECTION): mentor cannot set own price_inr (admin-locked) ───
DO $$
DECLARE v_pass boolean := false; v_msg text := '';
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    UPDATE public.mentors SET price_inr=1 WHERE id='a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1';
    v_msg := 'mentor price_inr self-set ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = 'P0001' THEN v_pass := true; v_msg := 'denied: '||SQLERRM;
    ELSE v_msg := 'unexpected ['||SQLSTATE||']: '||SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p2 VALUES ('P2.04_mentor_self_price_blocked', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P2.05 (REJECTION): mentor cannot set own re_review_pending (new lock trigger) ───
DO $$
DECLARE v_pass boolean := false; v_msg text := '';
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    UPDATE public.mentors SET re_review_pending=true WHERE id='a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1';
    v_msg := 'mentor re_review_pending self-set ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = 'P0001' AND SQLERRM ILIKE '%re_review_pending%' THEN v_pass := true; v_msg := 'denied: '||SQLERRM;
    ELSE v_msg := 'unexpected ['||SQLSTATE||']: '||SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p2 VALUES ('P2.05_mentor_self_re_review_blocked', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P2.06 (HAPPY): admin approves via admin_set_mentor_status (admin-controlled) ───
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_status text; v_vat timestamptz; v_acted boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"db74f8e5-5511-4aec-a9a4-79ae2b535b9f","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.admin_set_mentor_status('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'approved');
    v_acted := true;
  EXCEPTION WHEN OTHERS THEN
    v_msg := 'admin_set_mentor_status errored ['||SQLSTATE||']: '||SQLERRM;
  END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  IF v_acted THEN
    SELECT status::text, verified_at INTO v_status, v_vat FROM public.mentors WHERE id='a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1';
    v_pass := (v_status = 'approved' AND v_vat IS NOT NULL);
    v_msg := 'admin approve → status='||coalesce(v_status,'<null>')||' verified_at '||CASE WHEN v_vat IS NULL THEN 'NULL' ELSE 'set' END;
  END IF;
  INSERT INTO _p2 VALUES ('P2.06_admin_set_status_approve', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P2.07 (REJECTION): a NON-OWNER mentor cannot read another mentor's row ───
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_cnt int;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    SELECT count(*) INTO v_cnt FROM public.mentors WHERE id='a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1';
    v_pass := (v_cnt = 0);
    v_msg := 'non-owner mentor sees '||v_cnt||' row(s) of another mentor (expect 0)';
  EXCEPTION WHEN OTHERS THEN v_msg := 'unexpected ['||SQLSTATE||']: '||SQLERRM; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p2 VALUES ('P2.07_nonowner_mentor_read_blocked', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P2.08 (REJECTION): a STUDENT-role caller cannot read a mentor's private row ───
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_cnt int;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"d4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d4d4","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    SELECT count(*) INTO v_cnt FROM public.mentors WHERE id='a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1';
    v_pass := (v_cnt = 0);
    v_msg := 'student sees '||v_cnt||' mentor row(s) directly (expect 0 — browse is via column-narrowed RPC only)';
  EXCEPTION WHEN OTHERS THEN v_msg := 'unexpected ['||SQLSTATE||']: '||SQLERRM; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p2 VALUES ('P2.08_student_mentor_read_blocked', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P2.09 (HAPPY): mentor adds own admit (matching key) ───
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_uni uuid;
BEGIN
  SELECT university_id INTO v_uni FROM _p2ids;
  PERFORM set_config('request.jwt.claims','{"sub":"a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    INSERT INTO public.mentor_admits (mentor_id, ref_university_id)
    VALUES ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', v_uni);
    v_pass := true; v_msg := 'owner inserted own admit (proof_path NULL until finalize)';
  EXCEPTION WHEN OTHERS THEN v_msg := 'unexpected denial ['||SQLSTATE||']: '||SQLERRM; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p2 VALUES ('P2.09_admits_owner_insert', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P2.10 (REJECTION): mentor cannot add an admit for another mentor ───
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_uni uuid;
BEGIN
  SELECT university_id_2 INTO v_uni FROM _p2ids;
  PERFORM set_config('request.jwt.claims','{"sub":"a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    INSERT INTO public.mentor_admits (mentor_id, ref_university_id)
    VALUES ('b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2', v_uni);
    v_msg := 'cross-owner admit insert ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE IN ('42501','P0001') THEN v_pass := true; v_msg := 'denied ['||SQLSTATE||']';
    ELSE v_msg := 'unexpected ['||SQLSTATE||']: '||SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p2 VALUES ('P2.10_admits_cross_owner_blocked', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P2.11 (HAPPY): mentor fills proof_path on own admit (finalize step) ───
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_rows int;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    UPDATE public.mentor_admits
      SET proof_path = 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1/admit-1.pdf'
      WHERE mentor_id = 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_pass := (v_rows = 1);
    v_msg := 'owner filled proof_path on '||v_rows||' admit(s) (expect 1)';
  EXCEPTION WHEN OTHERS THEN v_msg := 'unexpected ['||SQLSTATE||']: '||SQLERRM; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p2 VALUES ('P2.11_admits_fill_proof', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P2.12 (REJECTION): a non-owner cannot read another mentor's admits ───
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_cnt int;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    SELECT count(*) INTO v_cnt FROM public.mentor_admits WHERE mentor_id='a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1';
    v_pass := (v_cnt = 0);
    v_msg := 'non-owner sees '||v_cnt||' of another mentor''s admits (expect 0)';
  EXCEPTION WHEN OTHERS THEN v_msg := 'unexpected ['||SQLSTATE||']: '||SQLERRM; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p2 VALUES ('P2.12_admits_nonowner_read_blocked', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P2.13 (HAPPY): mentor removes own admit (support remove) ───
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_rows int;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    DELETE FROM public.mentor_admits WHERE mentor_id='a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_pass := (v_rows >= 1);
    v_msg := 'owner removed '||v_rows||' own admit(s) (expect >=1)';
  EXCEPTION WHEN OTHERS THEN v_msg := 'unexpected ['||SQLSTATE||']: '||SQLERRM; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p2 VALUES ('P2.13_admits_owner_delete', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P2.14 (HAPPY): handle_new_user populated mentor C + mentor_agreement legal ───
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_phone text; v_cemail text; v_bio text; v_spec uuid; v_refuni uuid; v_essays uuid; v_legal int;
BEGIN
  SELECT essays_specialty_id INTO v_essays FROM _p2ids;
  SELECT phone, college_email, bio, specialty_id, ref_university_id
    INTO v_phone, v_cemail, v_bio, v_spec, v_refuni
    FROM public.mentors WHERE id='c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3';
  SELECT count(*) INTO v_legal FROM public.legal_acceptances
    WHERE user_id='c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3' AND doc_type='mentor_agreement';
  v_pass := (v_phone='+91-999' AND v_cemail='c@stanford.edu' AND v_bio='I mentor essays'
             AND v_spec = v_essays AND v_refuni IS NOT NULL AND v_legal = 1);
  v_msg := 'signup populated phone='||coalesce(v_phone,'<null>')||' college_email='||coalesce(v_cemail,'<null>')
           ||' specialty='||CASE WHEN v_spec = v_essays THEN 'essays' ELSE coalesce(v_spec::text,'<null>') END
           ||' ref_university '||CASE WHEN v_refuni IS NULL THEN 'NULL' ELSE 'set' END
           ||' mentor_agreement rows='||v_legal;
  INSERT INTO _p2 VALUES ('P2.14_handle_new_user_populates_mentor', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

SELECT test_id, status, detail FROM _p2 ORDER BY test_id;

ROLLBACK;
