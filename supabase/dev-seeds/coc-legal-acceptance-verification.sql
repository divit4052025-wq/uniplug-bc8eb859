-- ════════════════════════════════════════════════════════════════════════════
-- Dev-seed: Code of Conduct legal acceptance (student-signup v2)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Tests migration 20260621000000_coc_legal_acceptance.sql by simulating real
-- signups (INSERT auth.users with metadata → handle_new_user cascades the
-- students/mentors row + legal_acceptances rows). All inside BEGIN..ROLLBACK —
-- live state unchanged.
--
-- HOW TO RUN: supabase db reset, then pipe via docker exec into the local
-- Postgres container (or paste into the SQL editor). All changes ROLLBACK.
--
-- COVERAGE
--   CoC.1  HAPPY PATH (student) — signup WITH code_of_conduct_version → all
--          THREE acceptances (terms + privacy + code_of_conduct) recorded @ 1.0.
--   CoC.2  BACKWARD COMPAT (student) — signup WITHOUT the key → terms + privacy
--          recorded, NO code_of_conduct row (existing clients unaffected).
--   CoC.3  REJECTION — a bogus doc_type is STILL rejected by the widened CHECK.
--   CoC.4  CONSTRAINT — a direct 'code_of_conduct' insert is now allowed.
--   CoC.5  ROLE-AGNOSTIC (mentor) — a MENTOR signup WITH the key also gets a
--          code_of_conduct row (the capture moved out of the student-only path).
--   CoC.6  ROLE-AGNOSTIC negative (mentor) — a mentor WITHOUT the key gets none.
--
-- PASS CRITERIA: every row status='PASS'.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

DO $$
DECLARE
  s_coc   constant uuid := '22222222-2222-2222-2222-2222222209c1';  -- student WITH code_of_conduct_version
  s_nococ constant uuid := '22222222-2222-2222-2222-2222222209c2';  -- student WITHOUT it (backward compat)
  m_coc   constant uuid := '11111111-1111-1111-1111-1111111109c1';  -- mentor WITH it (role-agnostic)
  m_nococ constant uuid := '11111111-1111-1111-1111-1111111109c2';  -- mentor WITHOUT it
BEGIN
  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    created_at, updated_at, instance_id
  ) VALUES
    (s_coc, 'authenticated', 'authenticated', 's_coc@coc.local',
     crypt('pw', gen_salt('bf')), now(), '{"provider":"email"}'::jsonb,
     jsonb_build_object(
       'role','student','full_name','CoC S','phone','+91-0','school','T','grade','Grade 12',
       'date_of_birth', (current_date - interval '20 years')::date::text,
       'terms_version','1.0','privacy_version','1.0','code_of_conduct_version','1.0'),
     '', '', '', '', now(), now(), '00000000-0000-0000-0000-000000000000'),
    (s_nococ, 'authenticated', 'authenticated', 's_nococ@coc.local',
     crypt('pw', gen_salt('bf')), now(), '{"provider":"email"}'::jsonb,
     jsonb_build_object(
       'role','student','full_name','NoCoC S','phone','+91-0','school','T','grade','Grade 12',
       'date_of_birth', (current_date - interval '20 years')::date::text,
       'terms_version','1.0','privacy_version','1.0'),
     '', '', '', '', now(), now(), '00000000-0000-0000-0000-000000000000'),
    (m_coc, 'authenticated', 'authenticated', 'm_coc@coc.local',
     crypt('pw', gen_salt('bf')), now(), '{"provider":"email"}'::jsonb,
     jsonb_build_object(
       'role','mentor','full_name','CoC M','university','Test U','course','CS','year','2',
       'date_of_birth','2000-01-01',
       'terms_version','1.0','privacy_version','1.0','code_of_conduct_version','1.0'),
     '', '', '', '', now(), now(), '00000000-0000-0000-0000-000000000000'),
    (m_nococ, 'authenticated', 'authenticated', 'm_nococ@coc.local',
     crypt('pw', gen_salt('bf')), now(), '{"provider":"email"}'::jsonb,
     jsonb_build_object(
       'role','mentor','full_name','NoCoC M','university','Test U','course','CS','year','2',
       'date_of_birth','2000-01-01',
       'terms_version','1.0','privacy_version','1.0'),
     '', '', '', '', now(), now(), '00000000-0000-0000-0000-000000000000');
END $$;

CREATE TEMP TABLE _coc_results (test_id text PRIMARY KEY, status text NOT NULL, detail text NOT NULL);

-- ─── CoC.1: student WITH key → all three acceptances @ 1.0 ──────────────────
DO $$
DECLARE v_pass boolean := false; v_msg text := '';
        v_terms int; v_priv int; v_coc int; v_ver text; v_tp_ver text;
BEGIN
  SELECT count(*) FILTER (WHERE doc_type='terms'),
         count(*) FILTER (WHERE doc_type='privacy'),
         count(*) FILTER (WHERE doc_type='code_of_conduct'),
         max(version) FILTER (WHERE doc_type='code_of_conduct'),
         max(version) FILTER (WHERE doc_type IN ('terms','privacy'))
    INTO v_terms, v_priv, v_coc, v_ver, v_tp_ver
    FROM public.legal_acceptances WHERE user_id = '22222222-2222-2222-2222-2222222209c1'::uuid;
  IF v_terms <> 1 THEN v_msg := 'terms rows='||v_terms;
  ELSIF v_priv <> 1 THEN v_msg := 'privacy rows='||v_priv;
  ELSIF v_coc <> 1 THEN v_msg := 'code_of_conduct rows='||v_coc||' (expected 1)';
  ELSIF v_ver IS DISTINCT FROM '1.0' THEN v_msg := 'coc version='||coalesce(v_ver,'NULL');
  ELSIF v_tp_ver IS DISTINCT FROM '1.0' THEN v_msg := 'terms/privacy version='||coalesce(v_tp_ver,'NULL');
  ELSE v_pass := true; v_msg := 'terms+privacy+code_of_conduct all recorded @ 1.0'; END IF;
  INSERT INTO _coc_results VALUES ('CoC.1_student_all_three_recorded',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── CoC.2: student WITHOUT the key → NO code_of_conduct row (backward compat) ─
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_terms int; v_priv int; v_coc int;
BEGIN
  SELECT count(*) FILTER (WHERE doc_type='terms'),
         count(*) FILTER (WHERE doc_type='privacy'),
         count(*) FILTER (WHERE doc_type='code_of_conduct')
    INTO v_terms, v_priv, v_coc
    FROM public.legal_acceptances WHERE user_id = '22222222-2222-2222-2222-2222222209c2'::uuid;
  IF v_coc <> 0 THEN v_msg := 'code_of_conduct WRONGLY recorded without the key (rows='||v_coc||')';
  ELSIF v_terms <> 1 OR v_priv <> 1 THEN v_msg := 'terms/privacy regressed: terms='||v_terms||' privacy='||v_priv;
  ELSE v_pass := true; v_msg := 'absent key → no coc row; terms+privacy intact'; END IF;
  INSERT INTO _coc_results VALUES ('CoC.2_student_backward_compat_no_key',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── CoC.3: REJECTION — a bogus doc_type is still blocked by the CHECK ───────
--     Robust handler: catch WHEN OTHERS and inspect SQLSTATE so a wrong error
--     fails LOUDLY (recorded) instead of escaping and aborting the script.
DO $$
DECLARE v_blocked boolean := false; v_msg text := '';
BEGIN
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub','22222222-2222-2222-2222-2222222209c1','role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.legal_acceptances (user_id, doc_type, version)
    VALUES ('22222222-2222-2222-2222-2222222209c1'::uuid, 'not_a_real_doc', '1.0');
    v_msg := 'bogus doc_type was ACCEPTED — CHECK too loose';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = '23514' THEN v_blocked := true; v_msg := 'widened CHECK still rejects unknown doc_type (23514)';
    ELSE v_msg := 'unexpected error ['||SQLSTATE||']: '||SQLERRM; END IF;
  END;
  RESET ROLE;
  INSERT INTO _coc_results VALUES ('CoC.3_bogus_doc_type_rejected',
    CASE WHEN v_blocked THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── CoC.4: CONSTRAINT — a direct 'code_of_conduct' insert is now allowed ────
DO $$
DECLARE v_ok boolean := false; v_msg text := '';
BEGIN
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub','22222222-2222-2222-2222-2222222209c1','role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.legal_acceptances (user_id, doc_type, version)
    VALUES ('22222222-2222-2222-2222-2222222209c1'::uuid, 'code_of_conduct', '1.0');
    v_ok := true; v_msg := 'direct code_of_conduct insert accepted by widened CHECK';
  EXCEPTION WHEN OTHERS THEN
    v_ok := false; v_msg := 'rejected ['||SQLSTATE||']: '||SQLERRM;
  END;
  RESET ROLE;
  INSERT INTO _coc_results VALUES ('CoC.4_code_of_conduct_now_allowed',
    CASE WHEN v_ok THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── CoC.5: ROLE-AGNOSTIC — a MENTOR signup WITH the key also gets a CoC row ─
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_coc int; v_ver text; v_is_mentor boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.mentors WHERE id = '11111111-1111-1111-1111-1111111109c1'::uuid)
    INTO v_is_mentor;
  SELECT count(*) FILTER (WHERE doc_type='code_of_conduct'),
         max(version) FILTER (WHERE doc_type='code_of_conduct')
    INTO v_coc, v_ver
    FROM public.legal_acceptances WHERE user_id = '11111111-1111-1111-1111-1111111109c1'::uuid;
  IF NOT v_is_mentor THEN v_msg := 'mentor row not created — signup failed';
  ELSIF v_coc <> 1 THEN v_msg := 'mentor code_of_conduct rows='||v_coc||' (expected 1 — capture not role-agnostic)';
  ELSIF v_ver IS DISTINCT FROM '1.0' THEN v_msg := 'mentor coc version='||coalesce(v_ver,'NULL');
  ELSE v_pass := true; v_msg := 'mentor with key → 1 code_of_conduct row @ 1.0 (role-agnostic confirmed)'; END IF;
  INSERT INTO _coc_results VALUES ('CoC.5_mentor_with_key_gets_coc',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── CoC.6: ROLE-AGNOSTIC negative — a mentor WITHOUT the key gets none ──────
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_coc int;
BEGIN
  SELECT count(*) FILTER (WHERE doc_type='code_of_conduct') INTO v_coc
    FROM public.legal_acceptances WHERE user_id = '11111111-1111-1111-1111-1111111109c2'::uuid;
  IF v_coc <> 0 THEN v_msg := 'mentor WRONGLY got code_of_conduct without the key (rows='||v_coc||')';
  ELSE v_pass := true; v_msg := 'mentor without key → no coc row'; END IF;
  INSERT INTO _coc_results VALUES ('CoC.6_mentor_no_key_no_coc',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

SELECT test_id, status, detail FROM _coc_results ORDER BY test_id;

ROLLBACK;
