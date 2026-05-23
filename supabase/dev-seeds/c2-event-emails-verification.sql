-- ════════════════════════════════════════════════════════════════════════════
-- Phase C2 dev-seed: event-email triggers + notify_event_email + 1h cron
-- ════════════════════════════════════════════════════════════════════════════
--
-- WHAT THIS FILE IS
--   Verification queries for the four triggers, the shared
--   notify_event_email helper, and the send_reminders_1h pg_cron job
--   introduced in 20260523000004_c2_event_emails_and_1h_cron.sql.
--
--   Pure read-only (no BEGIN..ROLLBACK needed — only SELECTs). The HTTP
--   layer (Resend dispatch from send-event-email) cannot be tested from
--   SQL; the dev-seed header for send-reminders documented the curl
--   pattern, the same pattern smoke-tests send-event-email.
--
-- PASS CRITERIA
--   Each test row ends with status = 'PASS'.
--
-- MANUAL SMOKE (run after migration applied + secrets set):
--   # POST a fake booking_cancelled event with the vault secret; expect 404
--   # because the booking_id doesn't exist, but 401 would indicate Bearer
--   # auth broken.
--   curl -s -o - -w '\nHTTP %{http_code}\n' \
--     -X POST 'https://uniplug.app/api/public/hooks/send-event-email' \
--     -H "Authorization: Bearer $CRON_SECRET" \
--     -H 'Content-Type: application/json' \
--     -d '{"type":"booking_cancelled","booking_id":"00000000-0000-0000-0000-000000000000"}'
-- ════════════════════════════════════════════════════════════════════════════

CREATE TEMP TABLE _c2_results (
  test_id text PRIMARY KEY,
  status  text NOT NULL,
  detail  text NOT NULL
) ON COMMIT DROP;

-- ─── C2.1: notify_event_email exists, SECURITY DEFINER, locked search_path ─
DO $$
DECLARE v_pass boolean := false; v_msg text := '';
  v_def text; v_config text;
BEGIN
  SELECT prosecdef::text || '|' || coalesce(array_to_string(proconfig, ','), ''),
         pg_get_functiondef(oid)
    INTO v_config, v_def
    FROM pg_proc WHERE proname = 'notify_event_email' AND pronamespace = 'public'::regnamespace
    LIMIT 1;
  IF v_def IS NULL THEN
    v_msg := 'notify_event_email function not found';
  ELSIF v_config NOT LIKE 'true|%search_path%' THEN
    v_msg := 'expected SECURITY DEFINER with locked search_path, got: '||v_config;
  ELSE
    v_pass := true; v_msg := 'fn present, SECURITY DEFINER, search_path locked';
  END IF;
  INSERT INTO _c2_results VALUES ('C2.1_notify_event_email_shape',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── C2.2: notify_event_email NOT executable by anon / authenticated ───────
DO $$
DECLARE v_pass boolean := false; v_msg text := '';
BEGIN
  IF has_function_privilege('anon', 'public.notify_event_email(jsonb)', 'execute')
     OR has_function_privilege('authenticated', 'public.notify_event_email(jsonb)', 'execute') THEN
    v_msg := 'notify_event_email is callable by anon or authenticated — should not be';
  ELSE
    v_pass := true; v_msg := 'notify_event_email correctly revoked from anon/authenticated';
  END IF;
  INSERT INTO _c2_results VALUES ('C2.2_notify_event_email_grants',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── C2.3: bookings cancelled trigger exists ───────────────────────────────
DO $$
DECLARE v_pass boolean := false; v_msg text := '';
  v_tgcount integer;
BEGIN
  SELECT count(*) INTO v_tgcount
    FROM pg_trigger
   WHERE tgname = 'bookings_cancelled_email'
     AND tgrelid = 'public.bookings'::regclass
     AND NOT tgisinternal;
  IF v_tgcount = 1 THEN
    v_pass := true; v_msg := 'bookings_cancelled_email trigger present';
  ELSE
    v_msg := 'expected 1 trigger row, got '||v_tgcount;
  END IF;
  INSERT INTO _c2_results VALUES ('C2.3_trigger_booking_cancelled',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── C2.4: bookings session_completed trigger exists ───────────────────────
DO $$
DECLARE v_pass boolean := false; v_msg text := '';
  v_tgcount integer;
BEGIN
  SELECT count(*) INTO v_tgcount
    FROM pg_trigger
   WHERE tgname = 'bookings_session_completed_email'
     AND tgrelid = 'public.bookings'::regclass
     AND NOT tgisinternal;
  IF v_tgcount = 1 THEN
    v_pass := true; v_msg := 'bookings_session_completed_email trigger present';
  ELSE
    v_msg := 'expected 1 trigger row, got '||v_tgcount;
  END IF;
  INSERT INTO _c2_results VALUES ('C2.4_trigger_session_completed',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── C2.5: reviews insert trigger exists ───────────────────────────────────
DO $$
DECLARE v_pass boolean := false; v_msg text := '';
  v_tgcount integer;
BEGIN
  SELECT count(*) INTO v_tgcount
    FROM pg_trigger
   WHERE tgname = 'reviews_received_email'
     AND tgrelid = 'public.reviews'::regclass
     AND NOT tgisinternal;
  IF v_tgcount = 1 THEN
    v_pass := true; v_msg := 'reviews_received_email trigger present';
  ELSE
    v_msg := 'expected 1 trigger row, got '||v_tgcount;
  END IF;
  INSERT INTO _c2_results VALUES ('C2.5_trigger_review_received',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── C2.6: admin_set_mentor_status body contains notify_event_email ────────
DO $$
DECLARE v_pass boolean := false; v_msg text := '';
  v_body text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_body
    FROM pg_proc WHERE proname = 'admin_set_mentor_status' AND pronamespace = 'public'::regnamespace
    LIMIT 1;
  IF v_body IS NULL THEN
    v_msg := 'admin_set_mentor_status not found';
  ELSIF v_body NOT ILIKE '%notify_event_email%mentor_approved%' THEN
    v_msg := 'admin_set_mentor_status missing mentor_approved dispatch';
  ELSIF v_body NOT ILIKE '%mentor_rejected%' THEN
    v_msg := 'admin_set_mentor_status missing mentor_rejected dispatch';
  ELSE
    v_pass := true; v_msg := 'admin_set_mentor_status extended for approved+rejected emails';
  END IF;
  INSERT INTO _c2_results VALUES ('C2.6_admin_set_mentor_status_extended',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── C2.7: send_reminders_1h cron exists with correct schedule + command ──
DO $$
DECLARE v_pass boolean := false; v_msg text := '';
  v_active boolean; v_schedule text; v_cmd text;
BEGIN
  SELECT active, schedule, command INTO v_active, v_schedule, v_cmd
    FROM cron.job
   WHERE jobname = 'send_reminders_1h'
   LIMIT 1;
  IF v_active IS NULL THEN
    v_msg := 'send_reminders_1h not scheduled';
  ELSIF NOT v_active THEN
    v_msg := 'job exists but inactive';
  ELSIF v_schedule != '*/30 * * * *' THEN
    v_msg := 'schedule mismatch: '||v_schedule||' (expected */30 * * * *)';
  ELSIF v_cmd NOT ILIKE '%window=1h%' THEN
    v_msg := 'command body missing window=1h';
  ELSIF v_cmd NOT ILIKE '%vault.decrypted_secrets%' THEN
    v_msg := 'command body does not read from vault.decrypted_secrets';
  ELSE
    v_pass := true; v_msg := 'send_reminders_1h scheduled */30, window=1h, vault-backed';
  END IF;
  INSERT INTO _c2_results VALUES ('C2.7_cron_1h_scheduled',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── C2.8: send_reminders_24h still present (regression check) ─────────────
DO $$
DECLARE v_pass boolean := false; v_msg text := '';
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM cron.job WHERE jobname = 'send_reminders_24h' AND active;
  IF v_count = 1 THEN
    v_pass := true; v_msg := 'send_reminders_24h still active (regression for A3)';
  ELSE
    v_msg := 'expected 1 active send_reminders_24h, got '||v_count;
  END IF;
  INSERT INTO _c2_results VALUES ('C2.8_cron_24h_regression',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

SELECT test_id, status, detail FROM _c2_results ORDER BY test_id;
