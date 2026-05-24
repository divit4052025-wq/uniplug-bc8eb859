-- ════════════════════════════════════════════════════════════════════════════
-- Phase D0 dev-seed: AI infrastructure tables + RLS
-- ════════════════════════════════════════════════════════════════════════════
--
-- Verifies the three new tables (ai_rate_limit_events,
-- session_prep_questions, mentor_match_suggestions) introduced in
--   20260523000005_d0_ai_infrastructure.sql
-- exist with RLS enabled, the right policies, and CHECK constraints.
--
-- PASS CRITERIA
--   Each row status='PASS'.
-- ════════════════════════════════════════════════════════════════════════════

-- Plain TEMP TABLE (no ON COMMIT DROP): this dev-seed has no outer
-- BEGIN..COMMIT, and psql autocommits each statement — ON COMMIT
-- DROP would fire on the CREATE TABLE's implicit txn and the table
-- would vanish before the next DO block could INSERT into it. Temp
-- tables die at psql session end anyway.
CREATE TEMP TABLE _d0_results (
  test_id text PRIMARY KEY,
  status  text NOT NULL,
  detail  text NOT NULL
);

-- ─── D0.1: ai_rate_limit_events table exists with RLS + feature CHECK ──────
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_rls boolean; v_check text;
BEGIN
  SELECT relrowsecurity INTO v_rls FROM pg_class
   WHERE relname = 'ai_rate_limit_events' AND relnamespace = 'public'::regnamespace;
  IF v_rls IS NULL THEN
    v_msg := 'table not found';
  ELSIF NOT v_rls THEN
    v_msg := 'RLS not enabled';
  ELSE
    SELECT pg_get_constraintdef(oid) INTO v_check
      FROM pg_constraint
     WHERE conname = 'ai_rate_limit_events_feature_check' LIMIT 1;
    IF v_check IS NULL OR v_check NOT ILIKE '%matching%prep_questions%note_expansion%' THEN
      v_msg := 'feature CHECK missing or wrong: '||coalesce(v_check,'NULL');
    ELSE
      v_pass := true; v_msg := 'table+RLS+CHECK present';
    END IF;
  END IF;
  INSERT INTO _d0_results VALUES ('D0.1_rate_limit_events_table',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── D0.2: ai_rate_limit_events SELECT policy gates on own user_id ─────────
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_qual text;
BEGIN
  SELECT qual INTO v_qual FROM pg_policies
   WHERE tablename = 'ai_rate_limit_events' AND cmd = 'SELECT'
     AND policyname = 'Users can view own ai rate limit events' LIMIT 1;
  IF v_qual IS NULL THEN
    v_msg := 'SELECT policy not found';
  ELSIF v_qual NOT ILIKE '%auth.uid()%user_id%' THEN
    v_msg := 'policy qual: '||v_qual;
  ELSE
    v_pass := true; v_msg := 'SELECT policy gates on auth.uid()=user_id';
  END IF;
  INSERT INTO _d0_results VALUES ('D0.2_rate_limit_events_select_policy',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── D0.3: ai_rate_limit_events has NO client INSERT/UPDATE/DELETE policy ──
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_n integer;
BEGIN
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE tablename = 'ai_rate_limit_events' AND cmd IN ('INSERT','UPDATE','DELETE');
  IF v_n = 0 THEN
    v_pass := true; v_msg := 'no client write policies — service-role only';
  ELSE
    v_msg := 'unexpected client write policies: '||v_n;
  END IF;
  INSERT INTO _d0_results VALUES ('D0.3_rate_limit_events_write_policies',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── D0.4: session_prep_questions table + UNIQUE booking_id + RLS ──────────
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_rls boolean; v_unique boolean;
BEGIN
  SELECT relrowsecurity INTO v_rls FROM pg_class
   WHERE relname = 'session_prep_questions' AND relnamespace = 'public'::regnamespace;
  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = 'session_prep_questions'
       AND indexdef ILIKE '%UNIQUE%booking_id%'
  ) INTO v_unique;
  IF v_rls IS NULL THEN v_msg := 'table not found';
  ELSIF NOT v_rls THEN v_msg := 'RLS not enabled';
  ELSIF NOT v_unique THEN v_msg := 'no UNIQUE index on booking_id';
  ELSE v_pass := true; v_msg := 'table+RLS+UNIQUE(booking_id) present';
  END IF;
  INSERT INTO _d0_results VALUES ('D0.4_prep_questions_table',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── D0.5: session_prep_questions SELECT policy gates via booking ownership ─
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_qual text;
BEGIN
  SELECT qual INTO v_qual FROM pg_policies
   WHERE tablename = 'session_prep_questions' AND cmd = 'SELECT' LIMIT 1;
  IF v_qual IS NULL THEN v_msg := 'no SELECT policy';
  ELSIF v_qual NOT ILIKE '%bookings%student_id = auth.uid()%' THEN v_msg := 'qual: '||v_qual;
  ELSE v_pass := true; v_msg := 'SELECT gated on booking ownership';
  END IF;
  INSERT INTO _d0_results VALUES ('D0.5_prep_questions_select_policy',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── D0.6: mentor_match_suggestions table + UNIQUE(student_id, generated_on) ─
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_rls boolean; v_unique boolean;
BEGIN
  SELECT relrowsecurity INTO v_rls FROM pg_class
   WHERE relname = 'mentor_match_suggestions' AND relnamespace = 'public'::regnamespace;
  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = 'mentor_match_suggestions'
       AND indexdef ILIKE '%UNIQUE%student_id%generated_on%'
  ) INTO v_unique;
  IF v_rls IS NULL THEN v_msg := 'table not found';
  ELSIF NOT v_rls THEN v_msg := 'RLS not enabled';
  ELSIF NOT v_unique THEN v_msg := 'no UNIQUE (student_id, generated_on)';
  ELSE v_pass := true; v_msg := 'table+RLS+UNIQUE present';
  END IF;
  INSERT INTO _d0_results VALUES ('D0.6_match_suggestions_table',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── D0.7: mentor_match_suggestions SELECT policy gates on auth.uid() ──────
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_qual text;
BEGIN
  SELECT qual INTO v_qual FROM pg_policies
   WHERE tablename = 'mentor_match_suggestions' AND cmd = 'SELECT' LIMIT 1;
  IF v_qual IS NULL THEN v_msg := 'no SELECT policy';
  ELSIF v_qual NOT ILIKE '%auth.uid()%student_id%' THEN v_msg := 'qual: '||v_qual;
  ELSE v_pass := true; v_msg := 'SELECT gated on auth.uid()=student_id';
  END IF;
  INSERT INTO _d0_results VALUES ('D0.7_match_suggestions_select_policy',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

SELECT test_id, status, detail FROM _d0_results ORDER BY test_id;
