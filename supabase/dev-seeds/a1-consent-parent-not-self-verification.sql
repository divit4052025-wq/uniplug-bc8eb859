-- ════════════════════════════════════════════════════════════════════════════
-- A1 dev-seed (child-safety) — parent != self + consent-approval hardening
-- Pairs with 20260630000001_a1_consent_parent_not_self.sql.
--
-- Proves, server-side, that a minor can never route parental consent to
-- themselves and that a stale/self-routed token can never approve consent:
--   A1.1 REJECT  — signup (handle_new_user INSERT) where parent_email == own
--                  email is blocked by the BEFORE INSERT trigger.
--   A1.2 HAPPY   — a genuine distinct-parent minor signs up fine; the token is
--                  minted AND parental_consent_token_issued_at is stamped.
--   A1.3 REJECT  — post-signup self-UPDATE of parental_consent_email to own
--                  email is blocked by the BEFORE UPDATE trigger.
--   A1.4 REJECT  — post-signup parent_phone == own phone (digits) is blocked.
--   A1.5 HAPPY   — an adult signup (parental_consent_email NULL) is unaffected.
--   A1.6 REJECT  — record_parental_consent refuses a self-routed token
--                  (parent_email == student email) [defense-in-depth].
--   A1.7 REJECT  — record_parental_consent refuses a stale token (>30d TTL).
--   A1.8 HAPPY   — the legitimate parent flow (anon + fresh token) still records
--                  consent + one audit row (the hardening doesn't over-block).
--
-- Convention: real signup path (INSERT auth.users -> on_auth_user_created ->
-- handle_new_user -> INSERT public.students) so the trigger fires exactly as it
-- does for real users (mirrors parental-consent-verification.sql). Rejection
-- assertions key on OUR guard's message (parent_email_must_differ /
-- parent_phone_must_differ), never an incidental FK/NOT-NULL error.
--
-- RED (no migration): A1.1's self-email signup succeeds -> the block RAISEs
-- 'A1-FAIL: self-email signup was allowed' and the script aborts (no 'A1 PASS').
-- GREEN (migration applied): each reject prints an "A1 ok:" NOTICE and the script
-- ends with the 'A1 PASS' row.
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;
SET LOCAL client_min_messages = NOTICE;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ─── A1.1 REJECT: self-email minor signup (case-insensitive) ────────────────
DO $$
BEGIN
  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    created_at, updated_at, instance_id
  ) VALUES (
    '00000000-0000-0000-0000-00000000a113','authenticated','authenticated','kidself@x.com',
    crypt('x', gen_salt('bf')), now(), '{"provider":"email"}'::jsonb,
    jsonb_build_object('role','student','full_name','Self Kid','phone','+91 90000 00099',
      'school','S','grade','Grade 10','date_of_birth','2012-01-01','parent_email','KIDSELF@x.com'),
    '','','','', now(), now(), '00000000-0000-0000-0000-000000000000');
  RAISE EXCEPTION 'A1-FAIL: self-email signup was allowed';
EXCEPTION WHEN others THEN
  IF SQLERRM LIKE 'A1-FAIL%' THEN RAISE; END IF;
  IF SQLERRM LIKE '%parent_email_must_differ%' THEN
    RAISE NOTICE 'A1 ok: self-email signup rejected (%).', SQLERRM;
  ELSE
    RAISE EXCEPTION 'A1-FAIL: self-email signup rejected for the WRONG reason: %', SQLERRM;
  END IF;
END $$;

-- ─── A1.2 HAPPY: distinct-parent minor signs up; token + issued_at stamped ───
DO $$
DECLARE v_tok uuid; v_issued timestamptz; v_pe text;
BEGIN
  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    created_at, updated_at, instance_id
  ) VALUES (
    '00000000-0000-0000-0000-00000000a101','authenticated','authenticated','kid@x.com',
    crypt('x', gen_salt('bf')), now(), '{"provider":"email"}'::jsonb,
    jsonb_build_object('role','student','full_name','Real Kid','phone','+91 90000 00001',
      'school','S','grade','Grade 10','date_of_birth','2012-01-01',
      'parent_email','mum@y.com','parent_phone','+91 98888 11111'),
    '','','','', now(), now(), '00000000-0000-0000-0000-000000000000');
  SELECT parental_consent_token, parental_consent_token_issued_at, parental_consent_email
    INTO v_tok, v_issued, v_pe
    FROM public.students WHERE id = '00000000-0000-0000-0000-00000000a101';
  IF v_tok IS NULL THEN RAISE EXCEPTION 'A1-FAIL: happy minor signup minted no token'; END IF;
  IF v_issued IS NULL THEN RAISE EXCEPTION 'A1-FAIL: parental_consent_token_issued_at not stamped at mint'; END IF;
  IF v_pe IS DISTINCT FROM 'mum@y.com' THEN RAISE EXCEPTION 'A1-FAIL: parent_email not persisted (got %)', v_pe; END IF;
  RAISE NOTICE 'A1 ok: distinct-parent minor signup created (token minted, issued_at stamped, parent_email=%).', v_pe;
END $$;

-- ─── A1.3 REJECT: post-signup self-UPDATE of parental_consent_email ──────────
DO $$
BEGIN
  UPDATE public.students SET parental_consent_email = 'KID@x.com'
   WHERE id = '00000000-0000-0000-0000-00000000a101';
  RAISE EXCEPTION 'A1-FAIL: self-email UPDATE was allowed';
EXCEPTION WHEN others THEN
  IF SQLERRM LIKE 'A1-FAIL%' THEN RAISE; END IF;
  IF SQLERRM LIKE '%parent_email_must_differ%' THEN
    RAISE NOTICE 'A1 ok: self-email UPDATE rejected (%).', SQLERRM;
  ELSE
    RAISE EXCEPTION 'A1-FAIL: self-email UPDATE rejected for the WRONG reason: %', SQLERRM;
  END IF;
END $$;

-- ─── A1.4 REJECT: post-signup parent_phone == own phone (digits-only) ────────
DO $$
BEGIN
  UPDATE public.students SET parent_phone = '+91-90000-00001'   -- same digits as own phone
   WHERE id = '00000000-0000-0000-0000-00000000a101';
  RAISE EXCEPTION 'A1-FAIL: self-phone UPDATE was allowed';
EXCEPTION WHEN others THEN
  IF SQLERRM LIKE 'A1-FAIL%' THEN RAISE; END IF;
  IF SQLERRM LIKE '%parent_phone_must_differ%' THEN
    RAISE NOTICE 'A1 ok: self-phone UPDATE rejected (%).', SQLERRM;
  ELSE
    RAISE EXCEPTION 'A1-FAIL: self-phone UPDATE rejected for the WRONG reason: %', SQLERRM;
  END IF;
END $$;

-- ─── A1.5 HAPPY: adult signup (no parent contact) is unaffected ──────────────
DO $$
DECLARE v_ok boolean;
BEGIN
  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    created_at, updated_at, instance_id
  ) VALUES (
    '00000000-0000-0000-0000-00000000a102','authenticated','authenticated','adult@x.com',
    crypt('x', gen_salt('bf')), now(), '{"provider":"email"}'::jsonb,
    jsonb_build_object('role','student','full_name','Adult Student','phone','+91 90000 00002',
      'school','S','grade','Grade 12','date_of_birth','2000-01-01'),
    '','','','', now(), now(), '00000000-0000-0000-0000-000000000000');
  SELECT EXISTS (
    SELECT 1 FROM public.students
     WHERE id = '00000000-0000-0000-0000-00000000a102' AND parental_consent_email IS NULL
  ) INTO v_ok;
  IF NOT v_ok THEN RAISE EXCEPTION 'A1-FAIL: adult signup did not create a clean (consent-NULL) row'; END IF;
  RAISE NOTICE 'A1 ok: adult signup created (parental_consent_email NULL, trigger passes).';
END $$;

-- ─── A1.6 REJECT: record_parental_consent refuses a self-routed token ────────
-- A self-routed row can only exist if the trigger is bypassed; we briefly
-- DISABLE it to manufacture the bad state, then prove the RPC guard still blocks.
INSERT INTO auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  created_at, updated_at, instance_id
) VALUES (
  '00000000-0000-0000-0000-00000000a104','authenticated','authenticated','kid4@x.com',
  crypt('x', gen_salt('bf')), now(), '{"provider":"email"}'::jsonb,
  jsonb_build_object('role','student','full_name','Kid Four','phone','+91 90000 00004',
    'school','S','grade','Grade 10','date_of_birth','2012-01-01','parent_email','mum4@y.com'),
  '','','','', now(), now(), '00000000-0000-0000-0000-000000000000');
ALTER TABLE public.students DISABLE TRIGGER students_parent_not_self;
UPDATE public.students SET parental_consent_email = 'kid4@x.com'   -- forced self-routed
 WHERE id = '00000000-0000-0000-0000-00000000a104';
ALTER TABLE public.students ENABLE TRIGGER students_parent_not_self;
DO $$
DECLARE v_tok uuid; v_ret uuid; v_at timestamptz;
BEGIN
  SELECT parental_consent_token INTO v_tok FROM public.students
   WHERE id = '00000000-0000-0000-0000-00000000a104';
  PERFORM set_config('request.jwt.claims','{"role":"anon"}', true);
  EXECUTE 'SET LOCAL ROLE anon';
  v_ret := public.record_parental_consent(v_tok);
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  SELECT parental_consent_at INTO v_at FROM public.students
   WHERE id = '00000000-0000-0000-0000-00000000a104';
  IF v_ret IS NOT NULL OR v_at IS NOT NULL THEN
    RAISE EXCEPTION 'A1-FAIL: self-routed consent token accepted (ret=%, consent_at=%)', v_ret, v_at;
  END IF;
  RAISE NOTICE 'A1 ok: self-routed consent token rejected by record_parental_consent (ret NULL, consent NULL).';
END $$;

-- ─── A1.7 REJECT: record_parental_consent refuses a stale token (>30d) ───────
INSERT INTO auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  created_at, updated_at, instance_id
) VALUES (
  '00000000-0000-0000-0000-00000000a105','authenticated','authenticated','kid5@x.com',
  crypt('x', gen_salt('bf')), now(), '{"provider":"email"}'::jsonb,
  jsonb_build_object('role','student','full_name','Kid Five','phone','+91 90000 00005',
    'school','S','grade','Grade 10','date_of_birth','2012-01-01','parent_email','mum5@y.com'),
  '','','','', now(), now(), '00000000-0000-0000-0000-000000000000');
UPDATE public.students SET parental_consent_token_issued_at = now() - interval '31 days'
 WHERE id = '00000000-0000-0000-0000-00000000a105';
DO $$
DECLARE v_tok uuid; v_ret uuid; v_at timestamptz;
BEGIN
  SELECT parental_consent_token INTO v_tok FROM public.students
   WHERE id = '00000000-0000-0000-0000-00000000a105';
  PERFORM set_config('request.jwt.claims','{"role":"anon"}', true);
  EXECUTE 'SET LOCAL ROLE anon';
  v_ret := public.record_parental_consent(v_tok);
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  SELECT parental_consent_at INTO v_at FROM public.students
   WHERE id = '00000000-0000-0000-0000-00000000a105';
  IF v_ret IS NOT NULL OR v_at IS NOT NULL THEN
    RAISE EXCEPTION 'A1-FAIL: stale (>30d) consent token accepted (ret=%, consent_at=%)', v_ret, v_at;
  END IF;
  RAISE NOTICE 'A1 ok: stale consent token (>30d) rejected by TTL guard (ret NULL, consent NULL).';
END $$;

-- ─── A1.8 HAPPY: legitimate parent flow (anon + fresh token) still works ─────
INSERT INTO auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  created_at, updated_at, instance_id
) VALUES (
  '00000000-0000-0000-0000-00000000a106','authenticated','authenticated','kid6@x.com',
  crypt('x', gen_salt('bf')), now(), '{"provider":"email"}'::jsonb,
  jsonb_build_object('role','student','full_name','Kid Six','phone','+91 90000 00006',
    'school','S','grade','Grade 10','date_of_birth','2012-01-01','parent_email','mum6@y.com'),
  '','','','', now(), now(), '00000000-0000-0000-0000-000000000000');
DO $$
DECLARE v_tok uuid; v_ret uuid; v_at timestamptz; v_recs int;
BEGIN
  SELECT parental_consent_token INTO v_tok FROM public.students
   WHERE id = '00000000-0000-0000-0000-00000000a106';
  PERFORM set_config('request.jwt.claims','{"role":"anon"}', true);
  EXECUTE 'SET LOCAL ROLE anon';
  v_ret := public.record_parental_consent(v_tok);
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  SELECT parental_consent_at INTO v_at FROM public.students
   WHERE id = '00000000-0000-0000-0000-00000000a106';
  SELECT count(*) INTO v_recs FROM public.parental_consent_records
   WHERE student_id = '00000000-0000-0000-0000-00000000a106';
  IF v_ret IS DISTINCT FROM '00000000-0000-0000-0000-00000000a106'::uuid
     OR v_at IS NULL OR v_recs <> 1 THEN
    RAISE EXCEPTION 'A1-FAIL: legit parent consent flow broke (ret=%, consent_at=%, audit_rows=%)', v_ret, v_at, v_recs;
  END IF;
  RAISE NOTICE 'A1 ok: legit parent consent flow still works (consent set, 1 audit row).';
END $$;

SELECT 'A1 PASS' AS result;
ROLLBACK;
