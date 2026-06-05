-- ════════════════════════════════════════════════════════════════════════════
-- Phase 8 dev-seed: mentor submit/resubmit + the extended self-approval lock
-- ════════════════════════════════════════════════════════════════════════════
--
-- Proves migration 20260605000001: submit_mentor_application(),
-- resubmit_mentor_application(), the extended prevent_mentor_self_approval lock,
-- and admin_list_mentors' new column. NOT a migration.
--
-- HOW TO RUN
--   docker exec -i supabase_db_<ref> psql \
--     "postgresql://postgres:postgres@localhost:5432/postgres" \
--     -v ON_ERROR_STOP=1 < this-file.sql
--
-- PASS CRITERIA: every row status='PASS'. Any '| FAIL |' fails CI.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- Admin (is_admin() matches this fixed email) + four mentors. handle_new_user
-- cascades the public rows (mentors land status='pending').
INSERT INTO auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  created_at, updated_at, instance_id
) VALUES
( 'd8000000-0000-0000-0000-00000000ad11'::uuid, 'authenticated','authenticated','divitfatehpuria7@gmail.com',
  crypt('x',gen_salt('bf')), now(), '{"provider":"email"}'::jsonb,
  jsonb_build_object('role','student','full_name','Admin User','phone','+91-0','school','T','grade','Grade 11'),
  '','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
( 'd8000000-0000-0000-0000-0000000000aa'::uuid, 'authenticated','authenticated','p8-mentor-a@example.com',
  crypt('x',gen_salt('bf')), now(), '{"provider":"email"}'::jsonb,
  jsonb_build_object('role','mentor','full_name','Mentor A','university','IIT Bombay','course','CS','year','3rd Year'),
  '','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
( 'd8000000-0000-0000-0000-0000000000bb'::uuid, 'authenticated','authenticated','p8-mentor-b@example.com',
  crypt('x',gen_salt('bf')), now(), '{"provider":"email"}'::jsonb,
  jsonb_build_object('role','mentor','full_name','Mentor B','university','IIT Delhi','course','ME','year','2nd Year'),
  '','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
( 'd8000000-0000-0000-0000-0000000000cc'::uuid, 'authenticated','authenticated','p8-mentor-c@example.com',
  crypt('x',gen_salt('bf')), now(), '{"provider":"email"}'::jsonb,
  jsonb_build_object('role','mentor','full_name','Mentor C','university','Stanford University','course','Econ','year','Final Year'),
  '','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
( 'd8000000-0000-0000-0000-0000000000dd'::uuid, 'authenticated','authenticated','p8-mentor-d@example.com',
  crypt('x',gen_salt('bf')), now(), '{"provider":"email"}'::jsonb,
  jsonb_build_object('role','mentor','full_name','Mentor D','university','MIT','course','Physics','year','1st Year'),
  '','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
( 'd8000000-0000-0000-0000-0000000000ee'::uuid, 'authenticated','authenticated','p8-mentor-e@example.com',
  crypt('x',gen_salt('bf')), now(), '{"provider":"email"}'::jsonb,
  jsonb_build_object('role','mentor','full_name','Mentor E','university','Yale','course','History','year','3rd Year'),
  '','','','',now(),now(),'00000000-0000-0000-0000-000000000000')
ON CONFLICT (id) DO NOTHING;

-- Setup (service_role context bypasses the lock): A/C/D get an ID doc; C is
-- rejected with a reason (the resubmit fixture).
UPDATE public.mentors SET id_document_path = 'd8000000-0000-0000-0000-0000000000aa/id.jpg' WHERE id = 'd8000000-0000-0000-0000-0000000000aa';
UPDATE public.mentors SET id_document_path = 'd8000000-0000-0000-0000-0000000000cc/id.jpg', status = 'rejected'::public.mentor_status, verification_notes = 'Please upload a clearer ID' WHERE id = 'd8000000-0000-0000-0000-0000000000cc';
UPDATE public.mentors SET id_document_path = 'd8000000-0000-0000-0000-0000000000dd/id.jpg' WHERE id = 'd8000000-0000-0000-0000-0000000000dd';
-- E: rejected with an ID doc — the fixture for the raw-UPDATE conjunction attacks.
UPDATE public.mentors SET id_document_path = 'd8000000-0000-0000-0000-0000000000ee/id.jpg', status = 'rejected'::public.mentor_status, verification_notes = 'Need a clearer proof' WHERE id = 'd8000000-0000-0000-0000-0000000000ee';
-- B deliberately has NO id_document_path.

CREATE TEMP TABLE _p8 (test_id text PRIMARY KEY, status text NOT NULL, detail text NOT NULL);

-- helper: act as a given mentor
-- (inlined per block to match repo idiom)

-- ─── M.01 (HAPPY): A submits (has ID) → stamped, status stays pending ───
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_ts timestamptz; v_status text;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"d8000000-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    v_ts := public.submit_mentor_application();
  EXCEPTION WHEN OTHERS THEN v_msg := 'unexpected ['||SQLSTATE||']: '||SQLERRM; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  SELECT application_submitted_at, status::text INTO v_ts, v_status FROM public.mentors WHERE id='d8000000-0000-0000-0000-0000000000aa';
  v_pass := (v_ts IS NOT NULL AND v_status='pending');
  v_msg := coalesce(v_msg,'')||' submitted_at='||coalesce(v_ts::text,'<null>')||' status='||v_status;
  INSERT INTO _p8 VALUES ('M.01_submit_happy', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── M.02 (REJECT): B submits without an ID → blocked ───
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_ts timestamptz;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"d8000000-0000-0000-0000-0000000000bb","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    v_ts := public.submit_mentor_application();
    v_msg := 'submit ACCEPTED without ID (returned '||coalesce(v_ts::text,'<null>')||')';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE='P0001' THEN v_pass := true; v_msg := 'blocked [P0001]: '||SQLERRM;
    ELSE v_msg := 'unexpected ['||SQLSTATE||']: '||SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p8 VALUES ('M.02_submit_blocked_no_id', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── M.03 (HAPPY): C resubmits (rejected→pending, notes cleared, re-stamped) ───
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_status text; v_notes text; v_ts timestamptz;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"d8000000-0000-0000-0000-0000000000cc","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    v_ts := public.resubmit_mentor_application();
  EXCEPTION WHEN OTHERS THEN v_msg := 'unexpected ['||SQLSTATE||']: '||SQLERRM; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  SELECT status::text, verification_notes, application_submitted_at INTO v_status, v_notes, v_ts FROM public.mentors WHERE id='d8000000-0000-0000-0000-0000000000cc';
  v_pass := (v_status='pending' AND v_notes IS NULL AND v_ts IS NOT NULL);
  v_msg := coalesce(v_msg,'')||' status='||v_status||' notes='||coalesce(v_notes,'<null>')||' submitted_at='||coalesce(v_ts::text,'<null>');
  INSERT INTO _p8 VALUES ('M.03_resubmit_happy', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── M.04 (REJECT): A (pending) resubmits → blocked (only rejected) ───
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_ts timestamptz;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"d8000000-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    v_ts := public.resubmit_mentor_application();
    v_msg := 'resubmit ACCEPTED on a pending app';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE='P0001' THEN v_pass := true; v_msg := 'blocked [P0001]: '||SQLERRM;
    ELSE v_msg := 'unexpected ['||SQLSTATE||']: '||SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p8 VALUES ('M.04_resubmit_blocked_not_rejected', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── M.05 (SECURITY): mentor cannot raw-UPDATE own status → 'approved' ───
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_rows int; v_status text;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"d8000000-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    UPDATE public.mentors SET status='approved'::public.mentor_status WHERE id='d8000000-0000-0000-0000-0000000000aa';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_msg := 'self-approve UPDATE affected '||v_rows||' row(s) (expected denial)';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE IN ('P0001','42501') THEN v_pass := true; v_msg := 'denied ['||SQLSTATE||']';
    ELSE v_msg := 'unexpected ['||SQLSTATE||']: '||SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  SELECT status::text INTO v_status FROM public.mentors WHERE id='d8000000-0000-0000-0000-0000000000aa';
  v_pass := v_pass AND (v_status <> 'approved');
  INSERT INTO _p8 VALUES ('M.05_self_approve_blocked', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg||' final_status='||v_status);
END $$;

-- ─── M.06 (SECURITY): mentor cannot raw-UPDATE own price_inr ───
DO $$
DECLARE v_pass boolean := false; v_msg text := '';
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"d8000000-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    UPDATE public.mentors SET price_inr=99 WHERE id='d8000000-0000-0000-0000-0000000000aa';
    v_msg := 'price self-edit ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE IN ('P0001','42501') THEN v_pass := true; v_msg := 'denied ['||SQLSTATE||']';
    ELSE v_msg := 'unexpected ['||SQLSTATE||']: '||SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p8 VALUES ('M.06_price_self_edit_blocked', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── M.07 (SECURITY): mentor cannot raw-set application_submitted_at without ID (B) ───
DO $$
DECLARE v_pass boolean := false; v_msg text := '';
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"d8000000-0000-0000-0000-0000000000bb","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    UPDATE public.mentors SET application_submitted_at=now() WHERE id='d8000000-0000-0000-0000-0000000000bb';
    v_msg := 'submitted_at raw-set WITHOUT id_document_path ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE IN ('P0001','42501') THEN v_pass := true; v_msg := 'denied ['||SQLSTATE||']';
    ELSE v_msg := 'unexpected ['||SQLSTATE||']: '||SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p8 VALUES ('M.07_submitted_raw_no_id_blocked', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── M.08 (SECURITY): mentor cannot self-write verification_notes ───
DO $$
DECLARE v_pass boolean := false; v_msg text := '';
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"d8000000-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    UPDATE public.mentors SET verification_notes='I approve myself' WHERE id='d8000000-0000-0000-0000-0000000000aa';
    v_msg := 'verification_notes self-write ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE IN ('P0001','42501') THEN v_pass := true; v_msg := 'denied ['||SQLSTATE||']';
    ELSE v_msg := 'unexpected ['||SQLSTATE||']: '||SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p8 VALUES ('M.08_notes_self_write_blocked', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── M.09 (HAPPY): a normal mentor self-edit (bio) still works ───
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_rows int;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"d8000000-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    UPDATE public.mentors SET bio='Updated bio' WHERE id='d8000000-0000-0000-0000-0000000000aa';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_pass := (v_rows = 1); v_msg := 'bio self-edit affected '||v_rows||' row(s)';
  EXCEPTION WHEN OTHERS THEN v_msg := 'unexpected denial ['||SQLSTATE||']: '||SQLERRM; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p8 VALUES ('M.09_normal_edit_allowed', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── M.10 (HAPPY): admin path still works — reject_mentor(D, reason) ───
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_status text; v_notes text;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"d8000000-0000-0000-0000-00000000ad11","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.reject_mentor('d8000000-0000-0000-0000-0000000000dd', 'Need a clearer enrollment proof');
  EXCEPTION WHEN OTHERS THEN v_msg := 'unexpected ['||SQLSTATE||']: '||SQLERRM; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  SELECT status::text, verification_notes INTO v_status, v_notes FROM public.mentors WHERE id='d8000000-0000-0000-0000-0000000000dd';
  v_pass := (v_status='rejected' AND v_notes='Need a clearer enrollment proof');
  v_msg := coalesce(v_msg,'')||' status='||v_status||' notes='||coalesce(v_notes,'<null>');
  INSERT INTO _p8 VALUES ('M.10_admin_reject_works', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── M.11 (HAPPY): admin_list_mentors returns application_submitted_at; A (submitted) present ───
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_ts timestamptz;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"d8000000-0000-0000-0000-00000000ad11","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    SELECT application_submitted_at INTO v_ts FROM public.admin_list_mentors('pending')
    WHERE id='d8000000-0000-0000-0000-0000000000aa';
    v_pass := (v_ts IS NOT NULL);
    v_msg := 'A application_submitted_at via admin_list_mentors = '||coalesce(v_ts::text,'<null>');
  EXCEPTION WHEN OTHERS THEN v_msg := 'unexpected ['||SQLSTATE||']: '||SQLERRM; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p8 VALUES ('M.11_admin_list_has_submitted_at', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── M.12 (SECURITY): admin_list_mentors forbidden to a non-admin ───
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_n int;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"d8000000-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    SELECT count(*) INTO v_n FROM public.admin_list_mentors(NULL);
    v_msg := 'non-admin read admin_list_mentors ('||v_n||' rows) — ACCEPTED';
  EXCEPTION WHEN OTHERS THEN v_pass := true; v_msg := 'forbidden ['||SQLSTATE||']'; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p8 VALUES ('M.12_admin_list_non_admin_forbidden', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── M.13 (ISOLATION): C's resubmit did not disturb A's status ───
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_a text;
BEGIN
  SELECT status::text INTO v_a FROM public.mentors WHERE id='d8000000-0000-0000-0000-0000000000aa';
  v_pass := (v_a = 'pending');
  v_msg := 'A status after C resubmit = '||v_a||' (expect pending)';
  INSERT INTO _p8 VALUES ('M.13_resubmit_isolation', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── M.14 (SECURITY/CONJUNCTION): A has an ID doc → a raw UPDATE that BOTH sets
-- application_submitted_at AND status='approved' must be denied (case-4 status-pin). ───
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_status text;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"d8000000-0000-0000-0000-0000000000aa","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    UPDATE public.mentors SET application_submitted_at=now(), status='approved'::public.mentor_status WHERE id='d8000000-0000-0000-0000-0000000000aa';
    v_msg := 'submit+approve conjunction ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE IN ('P0001','42501') THEN v_pass := true; v_msg := 'denied ['||SQLSTATE||']';
    ELSE v_msg := 'unexpected ['||SQLSTATE||']: '||SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  SELECT status::text INTO v_status FROM public.mentors WHERE id='d8000000-0000-0000-0000-0000000000aa';
  v_pass := v_pass AND (v_status='pending');
  INSERT INTO _p8 VALUES ('M.14_conjunction_submit_approve_blocked', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg||' final_status='||v_status);
END $$;

-- ─── M.15 (SECURITY/CONJUNCTION): E (rejected) resubmit-shape but ALSO flips
-- verified_at → denied (case-5 verified pin). ───
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_status text;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"d8000000-0000-0000-0000-0000000000ee","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    UPDATE public.mentors SET status='pending'::public.mentor_status, verification_notes=NULL, application_submitted_at=now(), verified_at=now() WHERE id='d8000000-0000-0000-0000-0000000000ee';
    v_msg := 'resubmit+verified conjunction ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE IN ('P0001','42501') THEN v_pass := true; v_msg := 'denied ['||SQLSTATE||']';
    ELSE v_msg := 'unexpected ['||SQLSTATE||']: '||SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  SELECT status::text INTO v_status FROM public.mentors WHERE id='d8000000-0000-0000-0000-0000000000ee';
  v_pass := v_pass AND (v_status='rejected');
  INSERT INTO _p8 VALUES ('M.15_conjunction_resubmit_verified_blocked', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg||' final_status='||v_status);
END $$;

-- ─── M.16 (SECURITY): E raw rejected→approved → denied (case-5 forbids approved). ───
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_status text;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"d8000000-0000-0000-0000-0000000000ee","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    UPDATE public.mentors SET status='approved'::public.mentor_status WHERE id='d8000000-0000-0000-0000-0000000000ee';
    v_msg := 'rejected→approved ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE IN ('P0001','42501') THEN v_pass := true; v_msg := 'denied ['||SQLSTATE||']';
    ELSE v_msg := 'unexpected ['||SQLSTATE||']: '||SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  SELECT status::text INTO v_status FROM public.mentors WHERE id='d8000000-0000-0000-0000-0000000000ee';
  v_pass := v_pass AND (v_status='rejected');
  INSERT INTO _p8 VALUES ('M.16_raw_rejected_to_approved_blocked', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg||' final_status='||v_status);
END $$;

-- ─── M.17 (SECURITY): E resubmit-shape but WITHOUT re-stamping submitted_at →
-- denied (case-5 now requires the re-stamp). ───
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_status text;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"d8000000-0000-0000-0000-0000000000ee","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    UPDATE public.mentors SET status='pending'::public.mentor_status, verification_notes=NULL WHERE id='d8000000-0000-0000-0000-0000000000ee';
    v_msg := 'resubmit WITHOUT re-stamp ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE IN ('P0001','42501') THEN v_pass := true; v_msg := 'denied ['||SQLSTATE||']';
    ELSE v_msg := 'unexpected ['||SQLSTATE||']: '||SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  SELECT status::text INTO v_status FROM public.mentors WHERE id='d8000000-0000-0000-0000-0000000000ee';
  v_pass := v_pass AND (v_status='rejected');
  INSERT INTO _p8 VALUES ('M.17_resubmit_must_restamp', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg||' final_status='||v_status);
END $$;

-- ─── M.18 (HAPPY): E legitimate raw resubmit shape (rejected→pending, notes NULL,
-- id doc present, re-stamped) → allowed by the trigger directly. ───
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_status text; v_notes text;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"d8000000-0000-0000-0000-0000000000ee","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    UPDATE public.mentors SET status='pending'::public.mentor_status, verification_notes=NULL, application_submitted_at=now() WHERE id='d8000000-0000-0000-0000-0000000000ee';
    v_pass := true; v_msg := 'legit raw resubmit shape allowed';
  EXCEPTION WHEN OTHERS THEN v_msg := 'unexpected denial ['||SQLSTATE||']: '||SQLERRM; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  SELECT status::text, verification_notes INTO v_status, v_notes FROM public.mentors WHERE id='d8000000-0000-0000-0000-0000000000ee';
  v_pass := v_pass AND (v_status='pending' AND v_notes IS NULL);
  INSERT INTO _p8 VALUES ('M.18_legit_raw_resubmit_allowed', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg||' status='||v_status);
END $$;

SELECT test_id, status, detail FROM _p8 ORDER BY test_id;

ROLLBACK;
