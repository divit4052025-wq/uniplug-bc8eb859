-- ════════════════════════════════════════════════════════════════════════════
-- Phase A3 dev-seed: send_reminders_24h pg_cron + Vault secret + bearer wiring
-- ════════════════════════════════════════════════════════════════════════════
--
-- WHAT THIS FILE IS
--   Verification queries for the pg_cron job + vault.cron_secret pair
--   introduced in migration
--     20260523000003_send_reminders_cron.sql
--
--   Pure SQL — no rollback needed (we only read). The HTTP layer (route
--   handler's Bearer check) cannot be tested from SQL; it is locked by
--   the Playwright smoke suite that lands in Phase B2.
--
-- PASS CRITERIA
--   Each test row ends with status = 'PASS'. Any 'FAIL' means a real
--   attacker could either POST the endpoint without a token (route
--   regression) or the cron is scheduled wrong (replay storm, wrong
--   URL, secret not loaded).
--
-- MANUAL SMOKE (run after migration applied + secrets set, before sign-off):
--   # 1. Without Bearer — must return 401
--   curl -s -o - -w '\nHTTP %{http_code}\n' \
--     -X POST 'https://uniplug.app/api/public/hooks/send-reminders?window=24h'
--   # 2. With wrong Bearer — must return 401
--   curl -s -o - -w '\nHTTP %{http_code}\n' \
--     -X POST 'https://uniplug.app/api/public/hooks/send-reminders?window=24h' \
--     -H 'Authorization: Bearer wrong'
--   # 3. With correct Bearer — must return 200 + JSON {ok:true,date:...}
--   curl -s -o - -w '\nHTTP %{http_code}\n' \
--     -X POST 'https://uniplug.app/api/public/hooks/send-reminders?window=24h' \
--     -H "Authorization: Bearer $CRON_SECRET"
--   # 4. With correct Bearer + unsupported window — must return 400
--   curl -s -o - -w '\nHTTP %{http_code}\n' \
--     -X POST 'https://uniplug.app/api/public/hooks/send-reminders?window=1h' \
--     -H "Authorization: Bearer $CRON_SECRET"
-- ════════════════════════════════════════════════════════════════════════════

CREATE TEMP TABLE _a3_results (
  test_id text PRIMARY KEY,
  status  text NOT NULL,
  detail  text NOT NULL
) ON COMMIT DROP;

-- ─── A3.1: cron.job has the new send_reminders_24h job, active ──────────────
DO $$
DECLARE
  v_pass boolean := false; v_msg text := '';
  v_active boolean; v_schedule text;
BEGIN
  SELECT active, schedule INTO v_active, v_schedule
    FROM cron.job
   WHERE jobname = 'send_reminders_24h'
   LIMIT 1;
  IF v_active IS NULL THEN
    v_msg := 'cron.job row for send_reminders_24h not found';
  ELSIF NOT v_active THEN
    v_msg := 'job exists but active=false';
  ELSIF v_schedule != '0 13 * * *' THEN
    v_msg := 'schedule mismatch: '||v_schedule||' (expected 0 13 * * *)';
  ELSE
    v_pass := true;
    v_msg := 'job present, active, schedule=0 13 * * *';
  END IF;
  INSERT INTO _a3_results VALUES ('A3.1_cron_job_scheduled',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── A3.2: cron command references vault.decrypted_secrets + correct URL ───
DO $$
DECLARE
  v_pass boolean := false; v_msg text := '';
  v_cmd text;
BEGIN
  SELECT command INTO v_cmd FROM cron.job WHERE jobname = 'send_reminders_24h';
  IF v_cmd IS NULL THEN
    v_msg := 'no command found';
  ELSIF v_cmd NOT ILIKE '%uniplug.app/api/public/hooks/send-reminders%' THEN
    v_msg := 'URL not in command body';
  ELSIF v_cmd NOT ILIKE '%vault.decrypted_secrets%' THEN
    v_msg := 'command does not read from vault.decrypted_secrets — secret would be in plaintext';
  ELSIF v_cmd NOT ILIKE '%window=24h%' THEN
    v_msg := 'window=24h query param missing from URL';
  ELSE
    v_pass := true;
    v_msg := 'command targets uniplug.app, reads vault.decrypted_secrets, window=24h';
  END IF;
  INSERT INTO _a3_results VALUES ('A3.2_cron_command_shape',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── A3.3: vault has the cron_secret entry with a non-empty value ───────────
--          If FAIL here, the operator forgot the `vault.create_secret(...)`
--          manual prereq documented in the migration header.
DO $$
DECLARE
  v_pass boolean := false; v_msg text := '';
  v_len integer;
BEGIN
  SELECT length(decrypted_secret) INTO v_len
    FROM vault.decrypted_secrets
   WHERE name = 'cron_secret'
   LIMIT 1;
  IF v_len IS NULL THEN
    v_msg := 'vault.cron_secret not found — set it with select vault.create_secret(<val>, ''cron_secret'', ''...'')';
  ELSIF v_len < 16 THEN
    v_msg := 'vault.cron_secret is suspiciously short (len='||v_len||') — use a 32+ char random token';
  ELSE
    v_pass := true;
    v_msg := 'vault.cron_secret present, length='||v_len;
  END IF;
  INSERT INTO _a3_results VALUES ('A3.3_vault_cron_secret_present',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── A3.4: pg_net extension enabled ─────────────────────────────────────────
DO $$
DECLARE
  v_pass boolean := false; v_msg text := '';
  v_version text;
BEGIN
  SELECT extversion INTO v_version FROM pg_extension WHERE extname = 'pg_net' LIMIT 1;
  IF v_version IS NULL THEN
    v_msg := 'pg_net not enabled — net.http_post would fail at cron tick';
  ELSE
    v_pass := true;
    v_msg := 'pg_net enabled, version='||v_version;
  END IF;
  INSERT INTO _a3_results VALUES ('A3.4_pg_net_enabled',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── A3.5: only one copy of the job exists (idempotency regression) ────────
DO $$
DECLARE
  v_pass boolean := false; v_msg text := '';
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM cron.job WHERE jobname = 'send_reminders_24h';
  IF v_count = 1 THEN
    v_pass := true;
    v_msg := 'exactly one job row (idempotent re-apply ok)';
  ELSE
    v_msg := 'unexpected job count: '||v_count;
  END IF;
  INSERT INTO _a3_results VALUES ('A3.5_cron_job_idempotent',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

SELECT test_id, status, detail FROM _a3_results ORDER BY test_id;
