-- ════════════════════════════════════════════════════════════════════════════
-- A2 dev-seed: server-side mentor 18+ gate on approval.
-- ════════════════════════════════════════════════════════════════════════════
-- Proves no under-18 / DOB-null mentor can reach status='approved' via ANY write
-- path — the authoritative BEFORE INSERT OR UPDATE trigger
-- mentors_require_adult_on_approve covers approve_mentor + admin_set_mentor_status
-- + a raw UPDATE alike — and that a legitimate 18+ mentor still approves.
--
-- Convention: mentors.id FKs auth.users(id) and the mentor row is born via
-- handle_new_user (the on_auth_user_created trigger) — so we create an auth.users
-- row (mirroring p10e-mentor-identity-lock-verification.sql), NOT a bare mentors
-- INSERT (which would fail the FK + the NOT NULL columns). The mentor is created
-- 18+ (the A2 creation guard requires a non-under-18 DOB at signup); we then mutate
-- date_of_birth as service_role (the prevent_mentor_* triggers bypass for
-- service_role) to set up each rejection case while status stays 'pending' — the
-- approve-trigger only bites the transition INTO 'approved'.
--
-- Rejection assertions are pinned to OUR error ('mentor_must_be_18_plus'); any
-- other failure (FK / NOT NULL / is_admin / identity-lock) re-raises a WRONG-REASON
-- marker so a green run cannot be a false pass.
--
-- Single BEGIN..ROLLBACK. Run:
--   docker exec -i supabase_db_ncfhmbugjeuerchleegq psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/dev-seeds/a2-mentor-age-gate-verification.sql
-- Expected (post-migration): two "A2 ok:" NOTICEs then "A2 PASS | approved".
-- Expected (pre-migration / RED): aborts with "A2-FAIL: under-18 approval allowed".
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;
SET LOCAL client_min_messages = NOTICE;

-- Admin/service context so the status + DOB writes pass prevent_mentor_self_approval
-- and prevent_mentor_identity_change (both bypass for service_role); the ONLY gate
-- left to bite the approve is A2's mentors_require_adult_on_approve.
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- Create the mentor 18+ so the A2 handle_new_user creation guard passes (and so the
-- pre-migration RED run starts from a clean pending row too).
DO $$
DECLARE m constant uuid := '00000000-0000-0000-0000-0000000a2001';
BEGIN
  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    created_at, updated_at, instance_id
  ) VALUES (
    m,'authenticated','authenticated','a2_mentor@uniplug-a2.local',crypt('pw',gen_salt('bf')),now(),
    '{"provider":"email"}'::jsonb,
    jsonb_build_object('role','mentor','full_name','A2 Mentor','university','Real U',
                       'course','CS','year','2nd Year','date_of_birth','2000-01-01'),
    '','','','',now(),now(),'00000000-0000-0000-0000-000000000000'
  );
END $$;

-- ─── REJECTION 1: under-18 cannot be approved (covers raw UPDATE / both RPCs) ───
UPDATE public.mentors SET date_of_birth='2010-01-01'  -- 16 yo; status still pending → allowed
 WHERE id='00000000-0000-0000-0000-0000000a2001';
DO $$
BEGIN
  UPDATE public.mentors SET status='approved' WHERE id='00000000-0000-0000-0000-0000000a2001';
  RAISE EXCEPTION 'A2-FAIL: under-18 approval allowed';
EXCEPTION WHEN others THEN
  IF SQLERRM LIKE 'A2-FAIL%' THEN RAISE; END IF;
  IF SQLERRM NOT LIKE '%mentor_must_be_18_plus%' THEN
    RAISE EXCEPTION 'A2-FAIL: under-18 approval rejected for the WRONG reason: %', SQLERRM;
  END IF;
  RAISE NOTICE 'A2 ok: under-18 approval rejected (%).', SQLERRM;
END $$;

-- ─── REJECTION 2: DOB null cannot be approved ───
UPDATE public.mentors SET date_of_birth=NULL WHERE id='00000000-0000-0000-0000-0000000a2001';
DO $$
BEGIN
  UPDATE public.mentors SET status='approved' WHERE id='00000000-0000-0000-0000-0000000a2001';
  RAISE EXCEPTION 'A2-FAIL: dob-null approval allowed';
EXCEPTION WHEN others THEN
  IF SQLERRM LIKE 'A2-FAIL%' THEN RAISE; END IF;
  IF SQLERRM NOT LIKE '%mentor_must_be_18_plus%' THEN
    RAISE EXCEPTION 'A2-FAIL: dob-null approval rejected for the WRONG reason: %', SQLERRM;
  END IF;
  RAISE NOTICE 'A2 ok: dob-null approval rejected (%).', SQLERRM;
END $$;

-- ─── HAPPY PATH: an 18+ mentor approves fine ───
UPDATE public.mentors SET date_of_birth='2000-01-01' WHERE id='00000000-0000-0000-0000-0000000a2001';
UPDATE public.mentors SET status='approved' WHERE id='00000000-0000-0000-0000-0000000a2001';

SELECT 'A2 PASS' AS result, status FROM public.mentors WHERE id='00000000-0000-0000-0000-0000000a2001';
ROLLBACK;
