-- ════════════════════════════════════════════════════════════════════════════
-- A4 dev-seed (child-safety) — lock the reviews table.
-- Pairs with 20260630000004_a4_reviews_scoped_access.sql.
--
-- WHY: today reviews.SELECT is USING(true) for the authenticated role — ANY
-- signed-in user (incl. a minor) can raw-query EVERY review row of every
-- student/mentor: the raw reviewer UUID (student_id), mentor_id, rating, and the
-- full free-text review. The fix tightens the table SELECT to OWN ROWS and routes
-- the public per-mentor list through get_mentor_reviews() — a SECURITY DEFINER
-- RPC gated on APPROVED mentors that NEVER returns student_id (reviewer first
-- name only). The UUID->first-name oracle get_review_student_names is also
-- revoked from public callers.
--
-- ASSERTIONS (each pinned to its specific condition; a wrong reason re-raises a
-- WRONG-REASON marker so a green run can't be a false pass):
--   A4.a  REJECT — as authenticated student B, selecting student A's review rows
--                  returns 0 rows (own-rows RLS). This is the RED proof:
--                  pre-migration USING(true) lets B read them →
--                  'A4-FAIL: cross-student read allowed'.
--   A4.b  HAPPY  — get_mentor_reviews(approved) returns A's review WITH a
--                  non-null reviewer_first_name ("Aanya", first name only).
--   A4.b2 HAPPY  — that same RPC result exposes NO student_id column (oracle
--                  closed) — a raw SELECT of student_id raises undefined_column.
--   A4.c  REJECT — get_mentor_reviews(pending) returns 0 rows (approved gate),
--                  even though a real review row for that mentor exists.
--
-- Convention: real signup path (INSERT auth.users -> on_auth_user_created ->
-- handle_new_user) for students + mentors (mirrors a1/a2 seeds). The approved
-- mentor carries an 18+ DOB so A2's approve-trigger passes; the two minor
-- students carry DISTINCT parent emails so A1's parent!=self trigger passes.
-- Review rows are inserted as service_role (RLS bypassed) so we needn't seed a
-- completed booking just to satisfy the reviews INSERT policy.
--
-- Single BEGIN..ROLLBACK. Run:
--   docker exec -i supabase_db_ncfhmbugjeuerchleegq psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/dev-seeds/a4-reviews-scoped-access-verification.sql
-- Expected (post-migration / GREEN): four "A4 ok:" NOTICEs then "A4 PASS".
-- Expected (pre-migration / RED): aborts with "A4-FAIL: cross-student read allowed".
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;
SET LOCAL client_min_messages = NOTICE;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ── Fixtures: two minor students, one approved mentor, one pending mentor ──
DO $$
DECLARE
  s_a   constant uuid := '00000000-0000-0000-0000-00000000a4a1';  -- student A (reviewer)
  s_b   constant uuid := '00000000-0000-0000-0000-00000000a4b2';  -- student B (non-owner)
  m_app constant uuid := '00000000-0000-0000-0000-00000000a4c3';  -- approved mentor
  m_pen constant uuid := '00000000-0000-0000-0000-00000000a4d4';  -- pending mentor
BEGIN
  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    created_at, updated_at, instance_id
  ) VALUES
    (s_a,'authenticated','authenticated','a4_studenta@uniplug-a4.local',
     crypt('pw',gen_salt('bf')),now(),'{"provider":"email"}'::jsonb,
     jsonb_build_object('role','student','full_name','Aanya Sharma','phone','+91 90000 04401',
       'school','S','grade','Grade 10','date_of_birth','2012-01-01','parent_email','parenta@uniplug-a4.local'),
     '','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
    (s_b,'authenticated','authenticated','a4_studentb@uniplug-a4.local',
     crypt('pw',gen_salt('bf')),now(),'{"provider":"email"}'::jsonb,
     jsonb_build_object('role','student','full_name','Bharat Verma','phone','+91 90000 04402',
       'school','S','grade','Grade 11','date_of_birth','2011-01-01','parent_email','parentb@uniplug-a4.local'),
     '','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
    (m_app,'authenticated','authenticated','a4_mentorapproved@uniplug-a4.local',
     crypt('pw',gen_salt('bf')),now(),'{"provider":"email"}'::jsonb,
     jsonb_build_object('role','mentor','full_name','Mona Approved','university','Real U',
       'course','CS','year','2nd Year','date_of_birth','2000-01-01'),
     '','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
    (m_pen,'authenticated','authenticated','a4_mentorpending@uniplug-a4.local',
     crypt('pw',gen_salt('bf')),now(),'{"provider":"email"}'::jsonb,
     jsonb_build_object('role','mentor','full_name','Pavan Pending','university','Real U',
       'course','CS','year','2nd Year','date_of_birth','2000-01-01'),
     '','','','',now(),now(),'00000000-0000-0000-0000-000000000000');

  -- Approve the approved mentor (18+ DOB → A2's approve-trigger passes); m_pen
  -- stays at the default 'pending'.
  UPDATE public.mentors SET status='approved' WHERE id=m_app;

  -- Review rows. service_role bypasses RLS + the completed-booking INSERT gate,
  -- so we can seed reviews without also seeding bookings.
  INSERT INTO public.reviews (mentor_id, student_id, rating, review) VALUES
    (m_app, s_a, 5, 'Brilliant mentor, very helpful.'),
    (m_pen, s_a, 4, 'Pending mentor review — must stay hidden from the public list.');
END $$;

-- ─── A4.a: authenticated student B cannot read student A's review rows ────────
DO $$
DECLARE v_seen int;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-00000000a4b2","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO v_seen FROM public.reviews
   WHERE student_id = '00000000-0000-0000-0000-00000000a4a1';
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  IF v_seen <> 0 THEN
    RAISE EXCEPTION 'A4-FAIL: cross-student read allowed — student B saw % of student A''s review rows', v_seen;
  END IF;
  RAISE NOTICE 'A4 ok: own-rows RLS — student B saw 0 of student A''s review rows.';
END $$;

-- ─── A4.b: get_mentor_reviews(approved) — first name present, exactly one row ──
DO $$
DECLARE v_cnt int; v_name text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-00000000a4b2","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*), max(reviewer_first_name) INTO v_cnt, v_name
    FROM public.get_mentor_reviews('00000000-0000-0000-0000-00000000a4c3');
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'A4-FAIL: get_mentor_reviews(approved) returned % rows, expected 1', v_cnt;
  END IF;
  IF v_name IS DISTINCT FROM 'Aanya' THEN
    RAISE EXCEPTION 'A4-FAIL: reviewer_first_name was % (expected first-name only "Aanya")', coalesce(v_name,'<null>');
  END IF;
  RAISE NOTICE 'A4 ok: get_mentor_reviews(approved) → 1 row, reviewer_first_name=% (first name only).', v_name;
END $$;

-- ─── A4.b2: the RPC result exposes NO student_id column (UUID oracle closed) ──
DO $$
DECLARE v_dummy uuid;
BEGIN
  BEGIN
    EXECUTE 'SELECT student_id FROM public.get_mentor_reviews(''00000000-0000-0000-0000-00000000a4c3''::uuid) LIMIT 1'
      INTO v_dummy;
    RAISE EXCEPTION 'A4-FAIL: get_mentor_reviews exposed a student_id column';
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE 'A4-FAIL%' THEN RAISE; END IF;
    IF SQLSTATE <> '42703' THEN  -- undefined_column
      RAISE EXCEPTION 'A4-FAIL: student_id absence check failed for the WRONG reason [%]: %', SQLSTATE, SQLERRM;
    END IF;
    RAISE NOTICE 'A4 ok: get_mentor_reviews exposes no student_id column (%).', SQLERRM;
  END;
END $$;

-- ─── A4.c: get_mentor_reviews(pending) returns 0 rows (approved-mentor gate) ──
DO $$
DECLARE v_cnt int;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"00000000-0000-0000-0000-00000000a4b2","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO v_cnt
    FROM public.get_mentor_reviews('00000000-0000-0000-0000-00000000a4d4');
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION 'A4-FAIL: get_mentor_reviews(pending) returned % rows (a pending mentor''s reviews must not surface)', v_cnt;
  END IF;
  RAISE NOTICE 'A4 ok: get_mentor_reviews(pending) → 0 rows (approved-mentor gate holds).';
END $$;

SELECT 'A4 PASS' AS result;
ROLLBACK;
