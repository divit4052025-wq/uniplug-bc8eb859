-- ════════════════════════════════════════════════════════════════════════════
-- Phase 3 dev-seed: booking detail + private mentor notes + flat price
-- ════════════════════════════════════════════════════════════════════════════
--
-- Pairs with supabase/migrations/20260603000007_p3_booking_detail_private_notes_price.sql.
-- Setup (bootstrap role) creates an APPROVED mentor M (+ availability), a second
-- mentor M2, and two ADULT students S1/S2, then exercises:
--   booking detail (subject + description via book_session; 3-arg backward-compat;
--   unknown subject → NULL), private-notes owner-only access (incl. the explicit
--   "student the note is about cannot read it" + "another mentor cannot read it"),
--   and the price default/backfill.
--
-- Run: docker exec -i supabase_db_<ref> psql "postgresql://postgres:postgres@localhost:5432/postgres" \
--        -v ON_ERROR_STOP=1 < this-file.sql
-- PASS CRITERIA: every row status = 'PASS'.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- M (approved mentor), M2 (mentor), S1/S2 (adult students). handle_new_user cascades.
INSERT INTO auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  created_at, updated_at, instance_id
) VALUES
('a3a3a3a3-0000-0000-0000-0000000000a1'::uuid,'authenticated','authenticated','p3-mentor-a@example.com',
  crypt('p3-pw',gen_salt('bf')),now(),'{"provider":"email"}'::jsonb,
  jsonb_build_object('role','mentor','full_name','P3 Mentor A','university','IIT Bombay','course','CS','year','3rd Year','date_of_birth','2000-01-01'),
  '','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
('a3a3a3a3-0000-0000-0000-0000000000a2'::uuid,'authenticated','authenticated','p3-mentor-b@example.com',
  crypt('p3-pw',gen_salt('bf')),now(),'{"provider":"email"}'::jsonb,
  jsonb_build_object('role','mentor','full_name','P3 Mentor B','university','IIT Delhi','course','ME','year','2nd Year','date_of_birth','2000-01-01'),
  '','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
('a3a3a3a3-0000-0000-0000-0000000000b1'::uuid,'authenticated','authenticated','p3-student-1@example.com',
  crypt('p3-pw',gen_salt('bf')),now(),'{"provider":"email"}'::jsonb,
  jsonb_build_object('role','student','full_name','P3 Student One','phone','+91-1','school','Sch','grade','Grade 12','date_of_birth','2000-01-01'),
  '','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
('a3a3a3a3-0000-0000-0000-0000000000b2'::uuid,'authenticated','authenticated','p3-student-2@example.com',
  crypt('p3-pw',gen_salt('bf')),now(),'{"provider":"email"}'::jsonb,
  jsonb_build_object('role','student','full_name','P3 Student Two','phone','+91-2','school','Sch','grade','Grade 12','date_of_birth','2000-01-01'),
  '','','','',now(),now(),'00000000-0000-0000-0000-000000000000')
ON CONFLICT (id) DO NOTHING;

-- Approve M (service_role claim is set → passes prevent_mentor_self_approval).
UPDATE public.mentors SET status = 'approved' WHERE id = 'a3a3a3a3-0000-0000-0000-0000000000a1';

-- Availability for M at the booked weekday, hours 10/11/12 (date = today+7, future).
INSERT INTO public.mentor_availability (mentor_id, day_of_week, start_hour)
SELECT 'a3a3a3a3-0000-0000-0000-0000000000a1'::uuid,
       EXTRACT(ISODOW FROM (CURRENT_DATE + 7))::smallint, h
FROM unnest(ARRAY[10,11,12]::smallint[]) AS h
ON CONFLICT (mentor_id, day_of_week, start_hour) DO NOTHING;

CREATE TEMP TABLE _p3ids AS SELECT (SELECT id FROM public.ref_subjects LIMIT 1) AS subject_id;

CREATE TEMP TABLE _p3 (test_id text PRIMARY KEY, status text NOT NULL, detail text NOT NULL);

-- ─── P3.01 (HAPPY): book_session with subject + description (owner sets) ───
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_bid uuid; v_subj uuid; v_desc text; v_want uuid;
BEGIN
  SELECT subject_id INTO v_want FROM _p3ids;
  PERFORM set_config('request.jwt.claims','{"sub":"a3a3a3a3-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    v_bid := public.book_session('a3a3a3a3-0000-0000-0000-0000000000a1', CURRENT_DATE + 7, '10:00', v_want, 'Need help with my essays');
  EXCEPTION WHEN OTHERS THEN v_msg := 'book errored ['||SQLSTATE||']: '||SQLERRM; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  IF v_bid IS NOT NULL THEN
    SELECT subject_id, description INTO v_subj, v_desc FROM public.bookings WHERE id = v_bid;
    v_pass := (v_subj = v_want AND v_desc = 'Need help with my essays');
    v_msg := 'subject_id '||CASE WHEN v_subj = v_want THEN 'set' ELSE coalesce(v_subj::text,'<null>') END||' description='||coalesce(v_desc,'<null>');
  END IF;
  INSERT INTO _p3 VALUES ('P3.01_book_with_subject_description', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P3.02 (HAPPY, backward-compat): existing 3-arg book_session still works ───
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_bid uuid; v_subj uuid; v_desc text;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"a3a3a3a3-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    v_bid := public.book_session('a3a3a3a3-0000-0000-0000-0000000000a1', CURRENT_DATE + 7, '11:00');
  EXCEPTION WHEN OTHERS THEN v_msg := '3-arg book errored ['||SQLSTATE||']: '||SQLERRM; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  IF v_bid IS NOT NULL THEN
    SELECT subject_id, description INTO v_subj, v_desc FROM public.bookings WHERE id = v_bid;
    v_pass := (v_subj IS NULL AND v_desc IS NULL);
    v_msg := '3-arg call booked id='||left(v_bid::text,8)||'… subject_id='||coalesce(v_subj::text,'NULL')||' description='||coalesce(v_desc,'NULL');
  END IF;
  INSERT INTO _p3 VALUES ('P3.02_threearg_backward_compatible', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P3.03 (HAPPY): unknown subject_id resolves to NULL, never breaks the booking ───
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_bid uuid; v_subj uuid; v_desc text;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"a3a3a3a3-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    v_bid := public.book_session('a3a3a3a3-0000-0000-0000-0000000000a1', CURRENT_DATE + 7, '12:00',
                                 '00000000-0000-0000-0000-0000deadbeef'::uuid, 'desc with stale subject');
  EXCEPTION WHEN OTHERS THEN v_msg := 'book errored ['||SQLSTATE||']: '||SQLERRM; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  IF v_bid IS NOT NULL THEN
    SELECT subject_id, description INTO v_subj, v_desc FROM public.bookings WHERE id = v_bid;
    v_pass := (v_subj IS NULL AND v_desc = 'desc with stale subject');
    v_msg := 'booked despite unknown subject; subject_id='||coalesce(v_subj::text,'NULL')||' description='||coalesce(v_desc,'<null>');
  END IF;
  INSERT INTO _p3 VALUES ('P3.03_unknown_subject_to_null', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P3.04 (REJECTION): a non-owner student cannot write detail on another's booking ───
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_bid uuid; v_rows int;
BEGIN
  SELECT id INTO v_bid FROM public.bookings
    WHERE student_id='a3a3a3a3-0000-0000-0000-0000000000b1' AND time_slot='10:00' ORDER BY created_at DESC LIMIT 1;
  PERFORM set_config('request.jwt.claims','{"sub":"a3a3a3a3-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    UPDATE public.bookings SET description='hijack' WHERE id = v_bid;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_pass := (v_rows = 0);
    v_msg := 'non-owner detail UPDATE affected '||v_rows||' row(s) (expect 0)';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE IN ('42501','P0001') THEN v_pass := true; v_msg := 'denied ['||SQLSTATE||']';
    ELSE v_msg := 'unexpected ['||SQLSTATE||']: '||SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p3 VALUES ('P3.04_nonowner_detail_write_blocked', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P3.05 (HAPPY): mentor inserts + reads OWN private note ───
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_cnt int; v_acted boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"a3a3a3a3-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    INSERT INTO public.mentor_private_notes (mentor_id, student_id, body)
    VALUES ('a3a3a3a3-0000-0000-0000-0000000000a1','a3a3a3a3-0000-0000-0000-0000000000b1','confidential observation');
    SELECT count(*) INTO v_cnt FROM public.mentor_private_notes WHERE mentor_id='a3a3a3a3-0000-0000-0000-0000000000a1';
    v_acted := true; v_pass := (v_cnt = 1);
    v_msg := 'owner inserted + reads own private notes = '||v_cnt;
  EXCEPTION WHEN OTHERS THEN v_msg := 'unexpected ['||SQLSTATE||']: '||SQLERRM; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p3 VALUES ('P3.05_private_note_owner_rw', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P3.06 (REJECTION — KEY): the student the note is about CANNOT read it ───
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_cnt int;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"a3a3a3a3-0000-0000-0000-0000000000b1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    -- Student S1 tries every angle: by their own student_id and by the mentor's id.
    SELECT count(*) INTO v_cnt FROM public.mentor_private_notes
      WHERE student_id='a3a3a3a3-0000-0000-0000-0000000000b1'
         OR mentor_id ='a3a3a3a3-0000-0000-0000-0000000000a1';
    v_pass := (v_cnt = 0);
    v_msg := 'student sees '||v_cnt||' private note(s) about them (expect 0 — no student read path)';
  EXCEPTION WHEN OTHERS THEN v_msg := 'unexpected ['||SQLSTATE||']: '||SQLERRM; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p3 VALUES ('P3.06_subject_student_cannot_read', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P3.07 (REJECTION): another mentor cannot read it ───
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_cnt int;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"a3a3a3a3-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    SELECT count(*) INTO v_cnt FROM public.mentor_private_notes
      WHERE mentor_id='a3a3a3a3-0000-0000-0000-0000000000a1';
    v_pass := (v_cnt = 0);
    v_msg := 'other mentor sees '||v_cnt||' of M''s private notes (expect 0)';
  EXCEPTION WHEN OTHERS THEN v_msg := 'unexpected ['||SQLSTATE||']: '||SQLERRM; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p3 VALUES ('P3.07_other_mentor_cannot_read', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P3.08 (REJECTION): a mentor cannot insert a private note under another mentor's id ───
DO $$
DECLARE v_pass boolean := false; v_msg text := '';
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"a3a3a3a3-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    INSERT INTO public.mentor_private_notes (mentor_id, student_id, body)
    VALUES ('a3a3a3a3-0000-0000-0000-0000000000a1','a3a3a3a3-0000-0000-0000-0000000000b1','spoofed');
    v_msg := 'cross-mentor private-note insert ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE IN ('42501','P0001') THEN v_pass := true; v_msg := 'denied ['||SQLSTATE||']';
    ELSE v_msg := 'unexpected ['||SQLSTATE||']: '||SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p3 VALUES ('P3.08_private_note_cross_mentor_insert_blocked', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P3.09 (PRICE): mentors.price_inr default is now 1000 ───
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_def text;
BEGIN
  SELECT column_default INTO v_def FROM information_schema.columns
    WHERE table_schema='public' AND table_name='mentors' AND column_name='price_inr';
  v_pass := (v_def LIKE '%1000%');
  v_msg := 'price_inr column_default = '||coalesce(v_def,'<null>');
  INSERT INTO _p3 VALUES ('P3.09_price_default_1000', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P3.10 (PRICE): every mentor row sits at the flat 1000 (backfill invariant) ───
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_off int; v_total int;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE price_inr <> 1000) INTO v_total, v_off FROM public.mentors;
  v_pass := (v_off = 0);
  v_msg := 'mentors total='||v_total||' off-1000='||v_off||' (expect 0)';
  INSERT INTO _p3 VALUES ('P3.10_all_mentors_flat_1000', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

SELECT test_id, status, detail FROM _p3 ORDER BY test_id;

ROLLBACK;
