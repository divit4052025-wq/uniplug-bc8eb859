-- ════════════════════════════════════════════════════════════════════════════
-- Phase 2 dev-seed: two-track mentor email gate
-- ════════════════════════════════════════════════════════════════════════════
-- Proves 20260606000003: validate_college_email (fail-closed), the tier column +
-- set_mentor_tier insert trigger, submit/resubmit enhanced enforcement, the
-- tier+college_email self-tamper lock, and admin_list_mentors' tier column.
-- NOT a migration.  Run:
--   docker exec -i supabase_db_<ref> psql "postgresql://postgres:postgres@localhost:5432/postgres" \
--     -v ON_ERROR_STOP=1 < this-file.sql
-- PASS CRITERIA: every row status='PASS'.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

CREATE TEMP TABLE _e (test_id text PRIMARY KEY, status text NOT NULL, detail text NOT NULL);

-- Fixtures: admin + 5 mentors with distinct college emails. handle_new_user cascades
-- the mentors rows; the set_mentor_tier BEFORE INSERT trigger sets tier from the email.
INSERT INTO auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  created_at, updated_at, instance_id
) VALUES
( 'e2000000-0000-0000-0000-00000000ad11'::uuid,'authenticated','authenticated','divitfatehpuria7@gmail.com',
  crypt('x',gen_salt('bf')),now(),'{"provider":"email"}'::jsonb,
  jsonb_build_object('role','student','full_name','Admin User','phone','+91-0','school','T','grade','Grade 11'),
  '','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
( 'e2000000-0000-0000-0000-0000000000aa'::uuid,'authenticated','authenticated','p2-mentor-a@example.com',
  crypt('x',gen_salt('bf')),now(),'{"provider":"email"}'::jsonb,
  jsonb_build_object('role','mentor','full_name','Mentor A','university','IIT Bombay','course','CS','year','3rd Year','college_email','a@gmail.com'),
  '','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
( 'e2000000-0000-0000-0000-0000000000bb'::uuid,'authenticated','authenticated','p2-mentor-b@example.com',
  crypt('x',gen_salt('bf')),now(),'{"provider":"email"}'::jsonb,
  jsonb_build_object('role','mentor','full_name','Mentor B','university','IIT Delhi','course','ME','year','2nd Year','college_email','b@gmail.com'),
  '','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
( 'e2000000-0000-0000-0000-0000000000cc'::uuid,'authenticated','authenticated','p2-mentor-c@example.com',
  crypt('x',gen_salt('bf')),now(),'{"provider":"email"}'::jsonb,
  jsonb_build_object('role','mentor','full_name','Mentor C','university','IIT Madras','course','Econ','year','Final Year','college_email','c@iitb.ac.in'),
  '','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
( 'e2000000-0000-0000-0000-0000000000dd'::uuid,'authenticated','authenticated','p2-mentor-d@example.com',
  crypt('x',gen_salt('bf')),now(),'{"provider":"email"}'::jsonb,
  jsonb_build_object('role','mentor','full_name','Mentor D','university','MIT','course','Physics','year','1st Year','college_email','d@gmail.com'),
  '','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
( 'e2000000-0000-0000-0000-0000000000ee'::uuid,'authenticated','authenticated','p2-mentor-e@example.com',
  crypt('x',gen_salt('bf')),now(),'{"provider":"email"}'::jsonb,
  jsonb_build_object('role','mentor','full_name','Mentor E','university','Yale','course','History','year','3rd Year','college_email','e@gmail.com'),
  '','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
( 'e2000000-0000-0000-0000-0000000000ff'::uuid,'authenticated','authenticated','p2-mentor-f@example.com',
  crypt('x',gen_salt('bf')),now(),'{"provider":"email"}'::jsonb,
  jsonb_build_object('role','mentor','full_name','Mentor F','university','NIT Trichy','course','EE','year','2nd Year','college_email','f@gmail.com'),
  '','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
( 'e2000000-0000-0000-0000-0000000000a1'::uuid,'authenticated','authenticated','p2-mentor-g@example.com',
  crypt('x',gen_salt('bf')),now(),'{"provider":"email"}'::jsonb,
  jsonb_build_object('role','mentor','full_name','Mentor G','university','NIT Surat','course','CE','year','1st Year','college_email','g@gmail.com'),
  '','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
( 'e2000000-0000-0000-0000-0000000000a2'::uuid,'authenticated','authenticated','p2-mentor-h@example.com',
  crypt('x',gen_salt('bf')),now(),'{"provider":"email"}'::jsonb,
  jsonb_build_object('role','mentor','full_name','Mentor H','university','NIT Goa','course','IT','year','4th Year','college_email','h@gmail.com'),
  '','','','',now(),now(),'00000000-0000-0000-0000-000000000000')
ON CONFLICT (id) DO NOTHING;

-- Setup (service_role context bypasses the lock): docs + D rejected.
UPDATE public.mentors SET id_document_path='e2000000-0000-0000-0000-0000000000aa/id.jpg' WHERE id='e2000000-0000-0000-0000-0000000000aa';                            -- A: enhanced, id only
UPDATE public.mentors SET id_document_path='e2000000-0000-0000-0000-0000000000bb/id.jpg', enrollment_letter_path='e2000000-0000-0000-0000-0000000000bb/enroll.pdf' WHERE id='e2000000-0000-0000-0000-0000000000bb'; -- B: enhanced, id+enroll
UPDATE public.mentors SET id_document_path='e2000000-0000-0000-0000-0000000000cc/id.jpg' WHERE id='e2000000-0000-0000-0000-0000000000cc';                            -- C: standard, id only
UPDATE public.mentors SET id_document_path='e2000000-0000-0000-0000-0000000000dd/id.jpg', status='rejected'::public.mentor_status, verification_notes='clearer ID please' WHERE id='e2000000-0000-0000-0000-0000000000dd'; -- D: enhanced, rejected
UPDATE public.mentors SET id_document_path='e2000000-0000-0000-0000-0000000000ff/id.jpg' WHERE id='e2000000-0000-0000-0000-0000000000ff'; -- F: enhanced, id only (direct-UPDATE bypass test)
UPDATE public.mentors SET id_document_path='e2000000-0000-0000-0000-0000000000a1/id.jpg', enrollment_letter_path='' WHERE id='e2000000-0000-0000-0000-0000000000a1';                                                            -- G: enhanced, EMPTY enrollment (submit)
UPDATE public.mentors SET id_document_path='e2000000-0000-0000-0000-0000000000a2/id.jpg', enrollment_letter_path='   ', status='rejected'::public.mentor_status, verification_notes='clearer ID please' WHERE id='e2000000-0000-0000-0000-0000000000a2'; -- H: enhanced, WHITESPACE enrollment, rejected (resubmit)

-- ─── E.01 classifier (fail-closed) ───
DO $$
DECLARE ok boolean;
BEGIN
  ok := public.validate_college_email('x@iitb.ac.in')='standard'
    AND public.validate_college_email('x@foo.edu.in')='standard'
    AND public.validate_college_email('x@foo.edu')='standard'
    AND public.validate_college_email('x@foo.res.in')='standard'
    AND public.validate_college_email('s@students.iitb.ac.in')='standard'   -- sub-domain
    AND public.validate_college_email('x@christuniversity.in')='standard'    -- ref_academic_domains hit
    AND public.validate_college_email('x@gmail.com')='enhanced'
    AND public.validate_college_email('x@randomstartup.io')='enhanced'
    AND public.validate_college_email(NULL)='enhanced'
    AND public.validate_college_email('')='enhanced'
    AND public.validate_college_email('notanemail')='enhanced'
    AND public.validate_college_email('a@b')='enhanced';
  INSERT INTO _e VALUES ('E.01_classifier_fail_closed', CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END, 'standard only on positive match; NULL/malformed/unknown -> enhanced');
END $$;

-- ─── E.02 insert trigger set tier from email (A=enhanced gmail, C=standard .ac.in) ───
DO $$
DECLARE a text; c text;
BEGIN
  SELECT tier::text INTO a FROM public.mentors WHERE id='e2000000-0000-0000-0000-0000000000aa';
  SELECT tier::text INTO c FROM public.mentors WHERE id='e2000000-0000-0000-0000-0000000000cc';
  INSERT INTO _e VALUES ('E.02_tier_set_at_signup', CASE WHEN a='enhanced' AND c='standard' THEN 'PASS' ELSE 'FAIL' END, 'A(gmail)='||a||' C(iitb.ac.in)='||c);
END $$;

-- ─── E.03 submit ENHANCED without enrollment proof -> DENIED (the gate) ───
DO $$
DECLARE v_pass boolean := false; v_msg text:='';
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"e2000000-0000-0000-0000-0000000000aa","role":"authenticated"}',true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN PERFORM public.submit_mentor_application(); v_msg:='ACCEPTED (should deny)';
  EXCEPTION WHEN OTHERS THEN IF SQLSTATE='P0001' THEN v_pass:=true; v_msg:='denied: '||SQLERRM; ELSE v_msg:='unexpected ['||SQLSTATE||']: '||SQLERRM; END IF; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  INSERT INTO _e VALUES ('E.03_submit_enhanced_no_proof_denied', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── E.04 submit ENHANCED with enrollment proof -> ALLOWED ───
DO $$
DECLARE v_pass boolean := false; v_msg text:='';
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"e2000000-0000-0000-0000-0000000000bb","role":"authenticated"}',true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN PERFORM public.submit_mentor_application(); v_pass:=true; v_msg:='allowed';
  EXCEPTION WHEN OTHERS THEN v_msg:='unexpected denial ['||SQLSTATE||']: '||SQLERRM; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  INSERT INTO _e VALUES ('E.04_submit_enhanced_with_proof_allowed', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── E.05 submit STANDARD without enrollment -> ALLOWED (unchanged path) ───
DO $$
DECLARE v_pass boolean := false; v_msg text:='';
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"e2000000-0000-0000-0000-0000000000cc","role":"authenticated"}',true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN PERFORM public.submit_mentor_application(); v_pass:=true; v_msg:='allowed';
  EXCEPTION WHEN OTHERS THEN v_msg:='unexpected denial ['||SQLSTATE||']: '||SQLERRM; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  INSERT INTO _e VALUES ('E.05_submit_standard_no_proof_allowed', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── E.06 resubmit ENHANCED (rejected) without enrollment -> DENIED ───
DO $$
DECLARE v_pass boolean := false; v_msg text:='';
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"e2000000-0000-0000-0000-0000000000dd","role":"authenticated"}',true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN PERFORM public.resubmit_mentor_application(); v_msg:='ACCEPTED (should deny)';
  EXCEPTION WHEN OTHERS THEN IF SQLSTATE='P0001' THEN v_pass:=true; v_msg:='denied: '||SQLERRM; ELSE v_msg:='unexpected ['||SQLSTATE||']: '||SQLERRM; END IF; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  INSERT INTO _e VALUES ('E.06_resubmit_enhanced_no_proof_denied', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── E.07 mentor self-DOWNGRADE tier (enhanced->standard) -> DENIED ───
DO $$
DECLARE v_pass boolean := false; v_msg text:=''; v_tier text;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"e2000000-0000-0000-0000-0000000000ee","role":"authenticated"}',true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN UPDATE public.mentors SET tier='standard'::public.mentor_tier WHERE id='e2000000-0000-0000-0000-0000000000ee'; v_msg:='ACCEPTED (should deny)';
  EXCEPTION WHEN OTHERS THEN IF SQLSTATE='P0001' THEN v_pass:=true; v_msg:='denied: '||SQLERRM; ELSE v_msg:='unexpected ['||SQLSTATE||']: '||SQLERRM; END IF; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  SELECT tier::text INTO v_tier FROM public.mentors WHERE id='e2000000-0000-0000-0000-0000000000ee';
  v_pass := v_pass AND (v_tier='enhanced');
  INSERT INTO _e VALUES ('E.07_self_downgrade_tier_denied', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg||' final_tier='||v_tier);
END $$;

-- ─── E.08 mentor self-CHANGE college_email -> DENIED (no tier drift) ───
DO $$
DECLARE v_pass boolean := false; v_msg text:=''; v_em text;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"e2000000-0000-0000-0000-0000000000ee","role":"authenticated"}',true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN UPDATE public.mentors SET college_email='e@iitb.ac.in' WHERE id='e2000000-0000-0000-0000-0000000000ee'; v_msg:='ACCEPTED (should deny)';
  EXCEPTION WHEN OTHERS THEN IF SQLSTATE='P0001' THEN v_pass:=true; v_msg:='denied: '||SQLERRM; ELSE v_msg:='unexpected ['||SQLSTATE||']: '||SQLERRM; END IF; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  SELECT college_email INTO v_em FROM public.mentors WHERE id='e2000000-0000-0000-0000-0000000000ee';
  v_pass := v_pass AND (v_em='e@gmail.com');
  INSERT INTO _e VALUES ('E.08_self_change_email_denied', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg||' final_email='||v_em);
END $$;

-- ─── E.09 admin/service change of tier + email -> ALLOWED ───
DO $$
DECLARE v_pass boolean := false; v_msg text:='';
BEGIN
  -- service_role claims (already set) bypass the lock
  BEGIN
    UPDATE public.mentors SET tier='standard'::public.mentor_tier, college_email='e2@iitb.ac.in' WHERE id='e2000000-0000-0000-0000-0000000000ee';
    v_pass:=true; v_msg:='allowed (service_role)';
  EXCEPTION WHEN OTHERS THEN v_msg:='unexpected denial ['||SQLSTATE||']: '||SQLERRM; END;
  INSERT INTO _e VALUES ('E.09_admin_change_allowed', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── E.10 mentor writes enrollment_letter_path (NOT locked) -> ALLOWED ───
DO $$
DECLARE v_pass boolean := false; v_msg text:='';
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"e2000000-0000-0000-0000-0000000000aa","role":"authenticated"}',true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN UPDATE public.mentors SET enrollment_letter_path='e2000000-0000-0000-0000-0000000000aa/enroll.pdf' WHERE id='e2000000-0000-0000-0000-0000000000aa'; v_pass:=true; v_msg:='allowed';
  EXCEPTION WHEN OTHERS THEN v_msg:='unexpected denial ['||SQLSTATE||']: '||SQLERRM; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  INSERT INTO _e VALUES ('E.10_mentor_writes_enrollment_allowed', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── E.11 admin_list_mentors exposes tier ───
DO $$
DECLARE v_tier text;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"e2000000-0000-0000-0000-00000000ad11","role":"authenticated","email":"divitfatehpuria7@gmail.com"}',true);
  SELECT tier INTO v_tier FROM public.admin_list_mentors(NULL) WHERE id='e2000000-0000-0000-0000-0000000000aa';
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  INSERT INTO _e VALUES ('E.11_admin_list_has_tier', CASE WHEN v_tier='enhanced' THEN 'PASS' ELSE 'FAIL' END, 'A tier via admin_list_mentors = '||coalesce(v_tier,'<null>'));
END $$;

-- ─── E.12 student signup unaffected by the mentors insert trigger ───
DO $$
DECLARE v_exists boolean;
BEGIN
  INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token, email_change, email_change_token_new, created_at, updated_at, instance_id)
  VALUES ('e2000000-0000-0000-0000-0000000000f5'::uuid,'authenticated','authenticated','p2-student@example.com',crypt('x',gen_salt('bf')),now(),'{"provider":"email"}'::jsonb,
    jsonb_build_object('role','student','full_name','Stu Dent','phone','+91-1','school','DPS','grade','Grade 12'),'','','','',now(),now(),'00000000-0000-0000-0000-000000000000')
  ON CONFLICT (id) DO NOTHING;
  SELECT EXISTS(SELECT 1 FROM public.students WHERE id='e2000000-0000-0000-0000-0000000000f5') INTO v_exists;
  INSERT INTO _e VALUES ('E.12_student_signup_unaffected', CASE WHEN v_exists THEN 'PASS' ELSE 'FAIL' END, 'student row created = '||v_exists);
END $$;

-- ─── E.13 DIRECT-UPDATE submit bypass: enhanced, no proof, raw UPDATE app_submitted -> DENIED ───
DO $$
DECLARE v_pass boolean := false; v_msg text:=''; v_ts timestamptz;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"e2000000-0000-0000-0000-0000000000ff","role":"authenticated"}',true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN UPDATE public.mentors SET application_submitted_at=now() WHERE id='e2000000-0000-0000-0000-0000000000ff'; v_msg:='ACCEPTED (direct submit bypass!)';
  EXCEPTION WHEN OTHERS THEN IF SQLSTATE='P0001' THEN v_pass:=true; v_msg:='denied: '||SQLERRM; ELSE v_msg:='unexpected ['||SQLSTATE||']: '||SQLERRM; END IF; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  SELECT application_submitted_at INTO v_ts FROM public.mentors WHERE id='e2000000-0000-0000-0000-0000000000ff';
  v_pass := v_pass AND (v_ts IS NULL);
  INSERT INTO _e VALUES ('E.13_direct_submit_enhanced_no_proof_denied', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg||' submitted='||coalesce(v_ts::text,'<null>'));
END $$;

-- ─── E.14 DIRECT-UPDATE resubmit bypass: enhanced rejected, no proof, raw rejected->pending -> DENIED ───
DO $$
DECLARE v_pass boolean := false; v_msg text:=''; v_status text;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"e2000000-0000-0000-0000-0000000000dd","role":"authenticated"}',true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN UPDATE public.mentors SET status='pending'::public.mentor_status, verification_notes=NULL, application_submitted_at=now() WHERE id='e2000000-0000-0000-0000-0000000000dd'; v_msg:='ACCEPTED (direct resubmit bypass!)';
  EXCEPTION WHEN OTHERS THEN IF SQLSTATE='P0001' THEN v_pass:=true; v_msg:='denied: '||SQLERRM; ELSE v_msg:='unexpected ['||SQLSTATE||']: '||SQLERRM; END IF; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  SELECT status::text INTO v_status FROM public.mentors WHERE id='e2000000-0000-0000-0000-0000000000dd';
  v_pass := v_pass AND (v_status='rejected');
  INSERT INTO _e VALUES ('E.14_direct_resubmit_enhanced_no_proof_denied', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg||' final_status='||v_status);
END $$;

-- ─── E.15 submit with EMPTY-string enrollment proof -> DENIED (non-NULL but blank) ───
DO $$
DECLARE v_pass boolean := false; v_msg text:='';
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"e2000000-0000-0000-0000-0000000000a1","role":"authenticated"}',true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN PERFORM public.submit_mentor_application(); v_msg:='ACCEPTED (empty proof should deny)';
  EXCEPTION WHEN OTHERS THEN IF SQLSTATE='P0001' THEN v_pass:=true; v_msg:='denied: '||SQLERRM; ELSE v_msg:='unexpected ['||SQLSTATE||']: '||SQLERRM; END IF; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  INSERT INTO _e VALUES ('E.15_submit_empty_proof_denied', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── E.16 resubmit with WHITESPACE enrollment proof -> DENIED ───
DO $$
DECLARE v_pass boolean := false; v_msg text:='';
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"e2000000-0000-0000-0000-0000000000a2","role":"authenticated"}',true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN PERFORM public.resubmit_mentor_application(); v_msg:='ACCEPTED (whitespace proof should deny)';
  EXCEPTION WHEN OTHERS THEN IF SQLSTATE='P0001' THEN v_pass:=true; v_msg:='denied: '||SQLERRM; ELSE v_msg:='unexpected ['||SQLSTATE||']: '||SQLERRM; END IF; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
  INSERT INTO _e VALUES ('E.16_resubmit_whitespace_proof_denied', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

SELECT test_id, status, detail FROM _e ORDER BY test_id;

ROLLBACK;
