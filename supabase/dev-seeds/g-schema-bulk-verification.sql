-- ════════════════════════════════════════════════════════════════════════════
-- Phase G dev-seed (non-G4): G1 + G2 + G3 + G5 + G6 schema verification
-- ════════════════════════════════════════════════════════════════════════════
--
-- Pure schema-existence checks for the bulk migration:
--   20260523000007_g_schema_bulk.sql
--
-- G4 has its own dev-seed (g4-safeguarding-verification.sql) with
-- functional rejection + happy-path tests.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TEMP TABLE _g_results (test_id text PRIMARY KEY, status text NOT NULL, detail text NOT NULL) ON COMMIT DROP;

-- G1
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_body text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='students' AND column_name='first_session_used') THEN
    v_msg := 'students.first_session_used not found';
  ELSE
    SELECT pg_get_functiondef(oid) INTO v_body FROM pg_proc WHERE proname='book_session' AND pronamespace='public'::regnamespace LIMIT 1;
    IF v_body NOT ILIKE '%first_session_used%' THEN v_msg := 'book_session not extended to flip first_session_used';
    ELSE v_pass := true; v_msg := 'first_session_used column + book_session extension present'; END IF;
  END IF;
  INSERT INTO _g_results VALUES ('G1_first_session_used', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- G2
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_n integer;
BEGIN
  SELECT count(*) INTO v_n FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('referral_codes','referral_credits');
  IF v_n != 2 THEN v_msg := 'expected 2 tables, got '||v_n;
  ELSE v_pass := true; v_msg := 'referral_codes + referral_credits present'; END IF;
  INSERT INTO _g_results VALUES ('G2_referral_tables', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_n integer;
BEGIN
  SELECT count(*) INTO v_n FROM pg_policies WHERE tablename IN ('referral_codes','referral_credits') AND cmd IN ('INSERT','UPDATE','DELETE');
  IF v_n = 0 THEN v_pass := true; v_msg := 'no client write policies on referral tables';
  ELSE v_msg := 'unexpected '||v_n||' client write policies'; END IF;
  INSERT INTO _g_results VALUES ('G2_referral_no_write_policies', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- G3
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_check text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='mentor_training_completions') THEN
    v_msg := 'mentor_training_completions not found';
  ELSE
    SELECT pg_get_constraintdef(oid) INTO v_check FROM pg_constraint WHERE conname='mentor_training_completions_section_key_check' LIMIT 1;
    IF v_check IS NULL OR v_check NOT ILIKE '%safeguarding%code_of_conduct%' THEN v_msg := 'section_key CHECK: '||coalesce(v_check,'NULL');
    ELSE v_pass := true; v_msg := 'table + CHECK present'; END IF;
  END IF;
  INSERT INTO _g_results VALUES ('G3_mentor_training_table', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

DO $$
DECLARE v_pass boolean := false; v_msg text := '';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='mentor_training_complete' AND pronamespace='public'::regnamespace) THEN
    v_msg := 'mentor_training_complete fn not found';
  ELSE v_pass := true; v_msg := 'mentor_training_complete fn present'; END IF;
  INSERT INTO _g_results VALUES ('G3_mentor_training_helper', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- G5
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_s boolean; v_m boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='students' AND column_name='code_of_conduct_accepted_at') INTO v_s;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='mentors' AND column_name='code_of_conduct_accepted_at') INTO v_m;
  IF NOT v_s THEN v_msg := 'missing on students';
  ELSIF NOT v_m THEN v_msg := 'missing on mentors';
  ELSE v_pass := true; v_msg := 'CoC column on both students+mentors'; END IF;
  INSERT INTO _g_results VALUES ('G5_code_of_conduct_columns', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- G6
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_check text; v_n integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='disputes') THEN
    v_msg := 'disputes table not found';
  ELSE
    SELECT pg_get_constraintdef(oid) INTO v_check FROM pg_constraint WHERE conname='disputes_status_check' LIMIT 1;
    SELECT count(*) INTO v_n FROM pg_policies WHERE tablename='disputes' AND cmd='INSERT';
    IF v_check NOT ILIKE '%open%reviewing%resolved%dismissed%' THEN v_msg := 'status CHECK: '||v_check;
    ELSIF v_n != 0 THEN v_msg := 'unexpected INSERT policy on disputes (should be none for V1)';
    ELSE v_pass := true; v_msg := 'disputes table + status CHECK + no client INSERT policy'; END IF;
  END IF;
  INSERT INTO _g_results VALUES ('G6_disputes_schema', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

SELECT test_id, status, detail FROM _g_results ORDER BY test_id;
