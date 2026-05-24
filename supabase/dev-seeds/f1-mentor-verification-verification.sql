-- ════════════════════════════════════════════════════════════════════════════
-- Phase F1 dev-seed: mentor verification columns + storage bucket + lock ext
-- ════════════════════════════════════════════════════════════════════════════
--
-- Verifies the 5 new columns, the storage bucket, the 3 storage RLS
-- policies, and the extended prevent_mentor_self_approval trigger from
--   20260523000006_f1_mentor_verification.sql
--
-- PASS CRITERIA
--   Each row status='PASS'.
-- ════════════════════════════════════════════════════════════════════════════

-- Plain TEMP TABLE (no ON COMMIT DROP): this dev-seed has no outer
-- BEGIN..COMMIT, and psql autocommits each statement — ON COMMIT
-- DROP would fire on the CREATE TABLE's implicit txn and the table
-- would vanish before the next DO block could INSERT into it. Temp
-- tables die at psql session end anyway.
CREATE TEMP TABLE _f1_results (
  test_id text PRIMARY KEY,
  status  text NOT NULL,
  detail  text NOT NULL
);

-- ─── F1.1: all 5 new columns present on public.mentors ──────────────────────
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_missing text[];
BEGIN
  SELECT array_agg(c) INTO v_missing FROM (
    SELECT c FROM unnest(ARRAY['id_document_path','enrollment_letter_path','verified_at','verified_by','verification_notes']) AS c
    WHERE c NOT IN (
      SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'mentors'
    )
  ) s;
  IF v_missing IS NULL OR array_length(v_missing, 1) IS NULL THEN
    v_pass := true; v_msg := 'all 5 columns present';
  ELSE
    v_msg := 'missing columns: '||array_to_string(v_missing, ', ');
  END IF;
  INSERT INTO _f1_results VALUES ('F1.1_mentor_verification_columns',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── F1.2: mentor-documents storage bucket exists, private ──────────────────
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_public boolean;
BEGIN
  SELECT public INTO v_public FROM storage.buckets WHERE id = 'mentor-documents' LIMIT 1;
  IF v_public IS NULL THEN
    v_msg := 'bucket not found';
  ELSIF v_public THEN
    v_msg := 'bucket exists but is PUBLIC — should be private';
  ELSE
    v_pass := true; v_msg := 'mentor-documents bucket present + private';
  END IF;
  INSERT INTO _f1_results VALUES ('F1.2_mentor_documents_bucket',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── F1.3: 3 storage RLS policies (SELECT, INSERT, DELETE) for mentor prefix ─
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_n integer;
BEGIN
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname = 'storage' AND tablename = 'objects'
     AND policyname IN ('Mentors view own documents','Mentors upload own documents','Mentors delete own documents');
  IF v_n = 3 THEN
    v_pass := true; v_msg := 'all 3 storage policies present';
  ELSE
    v_msg := 'expected 3 policies, got '||v_n;
  END IF;
  INSERT INTO _f1_results VALUES ('F1.3_storage_rls_policies',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── F1.4: storage policies use auth.uid()=prefix pattern ──────────────────
--          Postgres stores the policy expression as `(auth.uid())::text`
--          (extra parens) — match with that exact shape so the pattern
--          doesn't silently drift.
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_n integer;
BEGIN
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname = 'storage' AND tablename = 'objects'
     AND policyname IN ('Mentors view own documents','Mentors upload own documents','Mentors delete own documents')
     AND (coalesce(qual, '')       ILIKE '%(auth.uid())::text = (storage.foldername%'
       OR coalesce(with_check, '') ILIKE '%(auth.uid())::text = (storage.foldername%');
  IF v_n = 3 THEN
    v_pass := true; v_msg := 'all 3 policies gate on auth.uid()=prefix';
  ELSE
    v_msg := 'only '||v_n||'/3 policies use the prefix pattern';
  END IF;
  INSERT INTO _f1_results VALUES ('F1.4_storage_prefix_pattern',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── F1.5: NO UPDATE policy on the mentor-documents bucket ─────────────────
--          (re-upload = DELETE+INSERT). Scope to the bucket — the
--          unrelated `Mentors update own photo` policy on mentor-photos
--          is from migration 20260427000001 and is out of F1's scope.
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_n integer;
BEGIN
  SELECT count(*) INTO v_n FROM pg_policies
   WHERE schemaname = 'storage' AND tablename = 'objects' AND cmd = 'UPDATE'
     AND (coalesce(qual, '')       ILIKE '%mentor-documents%'
       OR coalesce(with_check, '') ILIKE '%mentor-documents%');
  IF v_n = 0 THEN
    v_pass := true; v_msg := 'no UPDATE policy on mentor-documents bucket (as designed)';
  ELSE
    v_msg := 'unexpected '||v_n||' UPDATE policies on mentor-documents';
  END IF;
  INSERT INTO _f1_results VALUES ('F1.5_no_storage_update_policy',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── F1.6: prevent_mentor_self_approval body locks all 3 new admin cols ───
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_body text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_body FROM pg_proc
   WHERE proname = 'prevent_mentor_self_approval' AND pronamespace = 'public'::regnamespace LIMIT 1;
  IF v_body IS NULL THEN
    v_msg := 'function not found';
  ELSIF v_body NOT ILIKE '%verified_at%' THEN v_msg := 'lock missing verified_at';
  ELSIF v_body NOT ILIKE '%verified_by%' THEN v_msg := 'lock missing verified_by';
  ELSIF v_body NOT ILIKE '%verification_notes%' THEN v_msg := 'lock missing verification_notes';
  ELSIF v_body NOT ILIKE '%price_inr%' THEN v_msg := 'lock missing price_inr (A2 regression!)';
  ELSIF v_body NOT ILIKE '%status%' THEN v_msg := 'lock missing status (May 14 regression!)';
  ELSE v_pass := true; v_msg := 'lock covers status, price_inr, verified_at, verified_by, verification_notes';
  END IF;
  INSERT INTO _f1_results VALUES ('F1.6_trigger_lock_extended',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

SELECT test_id, status, detail FROM _f1_results ORDER BY test_id;
