-- ════════════════════════════════════════════════════════════════════════════
-- P10e dev-seed: mentor identity / document tamper lock.
-- ════════════════════════════════════════════════════════════════════════════
--
-- Tests migration 20260611000003_p10e_mentor_identity_lock.sql. ROLLBACKs at end.
--
-- PASS CRITERIA — every row 'PASS'. A 'FAIL' means a mentor can tamper with their
-- verified identity / documents (rejection tests), OR a legitimate path broke
-- (the editor's safe columns / pending document upload — happy-path tests).
--
-- Run: docker exec -i <supabase_db_container> psql -U postgres -d postgres \
--        < supabase/dev-seeds/p10e-mentor-identity-lock-verification.sql
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

DO $$
DECLARE
  m_app constant uuid := '11111111-1111-1111-1111-1111111130e1';  -- approved mentor
  m_pen constant uuid := '11111111-1111-1111-1111-1111111130e2';  -- pending mentor
BEGIN
  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    created_at, updated_at, instance_id
  ) VALUES
    (m_app,'authenticated','authenticated','m_app@uniplug-p10e.local',crypt('pw',gen_salt('bf')),now(),
     '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','mentor','full_name','Approved M','university','Real U','course','CS','year','2nd Year'),
     '','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
    (m_pen,'authenticated','authenticated','m_pen@uniplug-p10e.local',crypt('pw',gen_salt('bf')),now(),
     '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','mentor','full_name','Pending M','university','Real U','course','CS','year','2nd Year'),
     '','','','',now(),now(),'00000000-0000-0000-0000-000000000000');

  UPDATE public.mentors SET status='approved', id_document_path='m_app/id.png' WHERE id = m_app;
  -- m_pen stays 'pending' with an already-uploaded ID (mid-finalize, can re-upload).
  UPDATE public.mentors SET id_document_path='m_pen/id-v1.png' WHERE id = m_pen;
END $$;

CREATE TEMP TABLE _p10e_results (
  test_id text PRIMARY KEY, status text NOT NULL, detail text NOT NULL
);

-- helper: run an UPDATE as a given authenticated mentor, expect REJECT (P0001).
-- (inlined per-test for clarity, following the repo dev-seed style.)

-- ─── E1: approved mentor changes university → REJECT ────────────────────────
DO $$
DECLARE v_pass boolean := false; v_msg text := '';
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-1111111130e1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    UPDATE public.mentors SET university = 'Harvard (forged)'
     WHERE id = '11111111-1111-1111-1111-1111111130e1';
    v_msg := 'mentor CHANGED university (tamper)';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = 'P0001' THEN v_pass := true; v_msg := 'denied: '||SQLERRM;
    ELSE v_msg := 'unexpected '||SQLSTATE||': '||SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _p10e_results VALUES ('E1_university_locked',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── E2: approved mentor swaps id_document_path → REJECT ─────────────────────
DO $$
DECLARE v_pass boolean := false; v_msg text := '';
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-1111111130e1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    UPDATE public.mentors SET id_document_path = 'm_app/swapped.png'
     WHERE id = '11111111-1111-1111-1111-1111111130e1';
    v_msg := 'approved mentor SWAPPED id_document_path (tamper)';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = 'P0001' THEN v_pass := true; v_msg := 'denied: '||SQLERRM;
    ELSE v_msg := 'unexpected '||SQLSTATE||': '||SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _p10e_results VALUES ('E2_approved_doc_frozen',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── E3: mentor changes date_of_birth / max_active_mentees → REJECT ─────────
DO $$
DECLARE v_pass boolean := false; v_msg text := '';
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-1111111130e1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    UPDATE public.mentors SET max_active_mentees = 9999
     WHERE id = '11111111-1111-1111-1111-1111111130e1';
    v_msg := 'mentor RAISED max_active_mentees (tamper)';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = 'P0001' THEN v_pass := true; v_msg := 'denied: '||SQLERRM;
    ELSE v_msg := 'unexpected '||SQLSTATE||': '||SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _p10e_results VALUES ('E3_capacity_locked',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── E4: mentor edits the SAFE editor columns (bio/topics/photo/phone) → OK ──
DO $$
DECLARE v_pass boolean := false; v_msg text := '';
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-1111111130e1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    UPDATE public.mentors
       SET bio = 'Updated bio', topics = ARRAY['Essays'], photo_url = 'p.png', phone = '+91-99999'
     WHERE id = '11111111-1111-1111-1111-1111111130e1';
    v_pass := true; v_msg := 'safe editor columns updated';
  EXCEPTION WHEN OTHERS THEN
    v_msg := 'editor save unexpectedly denied ['||SQLSTATE||']: '||SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _p10e_results VALUES ('E4_safe_editor_columns_ok',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── E5: PENDING mentor re-uploads id_document_path (finalize) → OK ─────────
DO $$
DECLARE v_pass boolean := false; v_msg text := '';
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-1111111130e2","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    UPDATE public.mentors SET id_document_path = 'm_pen/id-v2.png'
     WHERE id = '11111111-1111-1111-1111-1111111130e2';
    v_pass := true; v_msg := 'pending mentor re-uploaded ID (finalize path intact)';
  EXCEPTION WHEN OTHERS THEN
    v_msg := 'finalize upload unexpectedly denied ['||SQLSTATE||']: '||SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _p10e_results VALUES ('E5_pending_doc_upload_ok',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── E6: service_role may change identity (admin verification/ops) → OK ─────
DO $$
DECLARE v_pass boolean := false; v_msg text := '';
BEGIN
  -- already service_role
  BEGIN
    UPDATE public.mentors SET university = 'Admin-corrected U'
     WHERE id = '11111111-1111-1111-1111-1111111130e1';
    v_pass := true; v_msg := 'service_role updated identity (bypass intact)';
  EXCEPTION WHEN OTHERS THEN
    v_msg := 'service_role unexpectedly denied ['||SQLSTATE||']: '||SQLERRM;
  END;
  INSERT INTO _p10e_results VALUES ('E6_service_role_bypass_ok',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

SELECT test_id, status, detail FROM _p10e_results ORDER BY test_id;

ROLLBACK;
