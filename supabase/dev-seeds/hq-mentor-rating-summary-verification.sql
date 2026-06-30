-- ════════════════════════════════════════════════════════════════════════════
-- Dev-seed: get_mentor_rating_summary — avg/count + star1..star5 distribution.
-- Pairs with 20260626000001_get_mentor_rating_summary.sql.
-- ════════════════════════════════════════════════════════════════════════════
-- WHAT THIS FILE IS
--   Runnable rejection + happy-path tests for the new read-only aggregate RPC.
--   Everything ROLLBACKs at the end — DB state unchanged.
--
-- PASS CRITERIA  Each row ends status = 'PASS'.
--   RS.1 (reject) a PENDING (non-approved) mentor that HAS reviews → the
--                 approved-mentor gate returns zeros / NULL avg (no leak).
--   RS.2 (edge)   an APPROVED mentor with ZERO reviews → exactly one row of
--                 zeros / NULL avg (the empty-state contract the client reads).
--   RS.3 (happy)  an APPROVED mentor with 5 varying-star reviews (5,5,4,3,1) →
--                 avg=3.6, count=5, star5=2 star4=1 star3=1 star2=0 star1=1.
--   RS.4 (grants) anon + authenticated + service_role hold EXECUTE (matches the
--                 public-profile RPC posture).
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- service_role during setup so inserts/the status flip bypass RLS + column locks.
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

DO $$
DECLARE
  m_app  constant uuid := '11111111-1111-1111-1111-1111119901a1'; -- approved, 5 reviews
  m_zero constant uuid := '11111111-1111-1111-1111-1111119901a2'; -- approved, 0 reviews
  m_pend constant uuid := '11111111-1111-1111-1111-1111119901a3'; -- PENDING, has reviews
  s1 constant uuid := '22222222-2222-2222-2222-2222229901a1';
  s2 constant uuid := '22222222-2222-2222-2222-2222229901a2';
  s3 constant uuid := '22222222-2222-2222-2222-2222229901a3';
  s4 constant uuid := '22222222-2222-2222-2222-2222229901a4';
  s5 constant uuid := '22222222-2222-2222-2222-2222229901a5';
BEGIN
  INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
     raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token,
     email_change, email_change_token_new, created_at, updated_at, instance_id) VALUES
    (m_app,'authenticated','authenticated','m_app@rs.local',crypt('pw',gen_salt('bf')),now(),
     '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','mentor','date_of_birth','2000-01-01','full_name','Mentor Rated','university','T','course','T','year','2nd Year'),
     '','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
    (m_zero,'authenticated','authenticated','m_zero@rs.local',crypt('pw',gen_salt('bf')),now(),
     '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','mentor','date_of_birth','2000-01-01','full_name','Mentor NoReviews','university','T','course','T','year','2nd Year'),
     '','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
    (m_pend,'authenticated','authenticated','m_pend@rs.local',crypt('pw',gen_salt('bf')),now(),
     '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','mentor','date_of_birth','2000-01-01','full_name','Mentor Pending','university','T','course','T','year','2nd Year'),
     '','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
    (s1,'authenticated','authenticated','s1@rs.local',crypt('pw',gen_salt('bf')),now(),
     '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','student','full_name','Stu One','phone','+91-0','school','T','grade','Undergraduate'),
     '','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
    (s2,'authenticated','authenticated','s2@rs.local',crypt('pw',gen_salt('bf')),now(),
     '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','student','full_name','Stu Two','phone','+91-0','school','T','grade','Undergraduate'),
     '','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
    (s3,'authenticated','authenticated','s3@rs.local',crypt('pw',gen_salt('bf')),now(),
     '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','student','full_name','Stu Three','phone','+91-0','school','T','grade','Undergraduate'),
     '','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
    (s4,'authenticated','authenticated','s4@rs.local',crypt('pw',gen_salt('bf')),now(),
     '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','student','full_name','Stu Four','phone','+91-0','school','T','grade','Undergraduate'),
     '','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
    (s5,'authenticated','authenticated','s5@rs.local',crypt('pw',gen_salt('bf')),now(),
     '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','student','full_name','Stu Five','phone','+91-0','school','T','grade','Undergraduate'),
     '','','','',now(),now(),'00000000-0000-0000-0000-000000000000');

  -- Approve the two mentors that should expose aggregates; m_pend stays 'pending'.
  UPDATE public.mentors SET status='approved' WHERE id IN (m_app, m_zero);

  -- m_app: five reviews 5,5,4,3,1 → avg 3.6, count 5, dist 5:2 4:1 3:1 2:0 1:1.
  -- (reviews UNIQUE(mentor_id,student_id) → one distinct student per row.)
  INSERT INTO public.reviews (mentor_id, student_id, rating, review) VALUES
    (m_app, s1, 5, 'excellent'),
    (m_app, s2, 5, 'top'),
    (m_app, s3, 4, 'good'),
    (m_app, s4, 3, 'ok'),
    (m_app, s5, 1, 'poor');

  -- m_pend (still pending): reviews that must NOT surface through the gate.
  INSERT INTO public.reviews (mentor_id, student_id, rating, review) VALUES
    (m_pend, s1, 5, 'hidden'),
    (m_pend, s2, 5, 'hidden');
END $$;

CREATE TEMP TABLE _rs (test_id text PRIMARY KEY, status text NOT NULL, detail text NOT NULL);

-- ─── RS.1 (reject): pending mentor w/ reviews → gate returns zeros/NULL ──────
DO $$
DECLARE v_pass boolean; r record;
BEGIN
  SELECT * INTO r FROM public.get_mentor_rating_summary('11111111-1111-1111-1111-1111119901a3');
  v_pass := (r.avg_rating IS NULL AND r.review_count = 0
             AND r.star1=0 AND r.star2=0 AND r.star3=0 AND r.star4=0 AND r.star5=0);
  INSERT INTO _rs VALUES ('RS.1_pending_mentor_gated',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END,
    'avg='||COALESCE(r.avg_rating::text,'NULL')||' count='||r.review_count||
    ' stars(1..5)='||r.star1||'/'||r.star2||'/'||r.star3||'/'||r.star4||'/'||r.star5);
END $$;

-- ─── RS.2 (edge): approved mentor, zero reviews → one row of zeros/NULL ──────
DO $$
DECLARE v_pass boolean; v_rows int; r record;
BEGIN
  SELECT count(*) INTO v_rows FROM public.get_mentor_rating_summary('11111111-1111-1111-1111-1111119901a2');
  SELECT *        INTO r      FROM public.get_mentor_rating_summary('11111111-1111-1111-1111-1111119901a2');
  v_pass := (v_rows = 1 AND r.avg_rating IS NULL AND r.review_count = 0
             AND r.star1=0 AND r.star2=0 AND r.star3=0 AND r.star4=0 AND r.star5=0);
  INSERT INTO _rs VALUES ('RS.2_zero_reviews_zeros',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END,
    'rows='||v_rows||' avg='||COALESCE(r.avg_rating::text,'NULL')||' count='||r.review_count);
END $$;

-- ─── RS.3 (happy): approved mentor, 5,5,4,3,1 → avg 3.6, count 5, dist ───────
DO $$
DECLARE v_pass boolean; r record;
BEGIN
  SELECT * INTO r FROM public.get_mentor_rating_summary('11111111-1111-1111-1111-1111119901a1');
  v_pass := (r.avg_rating = 3.6 AND r.review_count = 5
             AND r.star1=1 AND r.star2=0 AND r.star3=1 AND r.star4=1 AND r.star5=2);
  INSERT INTO _rs VALUES ('RS.3_distribution_correct',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END,
    'avg='||r.avg_rating||' count='||r.review_count||
    ' stars(1..5)='||r.star1||'/'||r.star2||'/'||r.star3||'/'||r.star4||'/'||r.star5);
END $$;

-- ─── RS.4 (grants): anon/authenticated/service_role hold EXECUTE ─────────────
DO $$
DECLARE v_pass boolean; v_anon boolean; v_auth boolean; v_svc boolean;
BEGIN
  v_anon := has_function_privilege('anon',         'public.get_mentor_rating_summary(uuid)', 'execute');
  v_auth := has_function_privilege('authenticated','public.get_mentor_rating_summary(uuid)', 'execute');
  v_svc  := has_function_privilege('service_role', 'public.get_mentor_rating_summary(uuid)', 'execute');
  v_pass := (v_anon AND v_auth AND v_svc);
  INSERT INTO _rs VALUES ('RS.4_execute_grants',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END,
    'anon='||v_anon::text||' auth='||v_auth::text||' service='||v_svc::text);
END $$;

-- Final report — must be all PASS before merge.
SELECT test_id, status, detail FROM _rs ORDER BY test_id;

ROLLBACK;
