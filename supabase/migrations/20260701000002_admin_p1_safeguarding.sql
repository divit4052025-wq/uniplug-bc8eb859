-- ============================================================================
-- ADMIN CONSOLE — PHASE 1: SAFEGUARDING QUEUE. Additive, reversible, LOCAL-only.
-- ============================================================================
-- Turns the two capture-only report ledgers (message_reports, safety_reports)
-- into a triageable, actionable safeguarding queue, and adds the account-state
-- moderation the platform never had. Every admin RPC gates on is_admin() and
-- writes an admin_audit_log row INLINE (atomic action+trail). Reports themselves
-- stay immutable — triage/moderation live in NEW side tables, never by mutating
-- the append-only ledgers.
--
-- WHAT THIS ADDS
--   • report_triage         — unified triage (status/severity/notes) for BOTH
--                             message_reports and safety_reports (source+id key).
--   • account_moderation    — per-user active/suspended/banned state (greenfield;
--                             no such field existed) + account_is_blocked() helper
--                             + BEFORE-INSERT enforcement triggers on bookings &
--                             messages (a blocked user genuinely cannot act).
--   • user_warnings         — append-only warn log.
--   • bookings.frozen_at     + admin_freeze_or_cancel_booking() (cancel UNPAID /
--                             freeze PAID in place, NO refund asserted — respects
--                             the A3 policy) + authorize_video_join() re-gated so a
--                             frozen booking is not joinable.
--   • escalation_records     + admin_record_escalation() (Childline 1098 /
--                             cyber-crime portal / law-enforcement referrals).
--   • admin_list_safeguarding_queue() — unified reader, PII-masked by default.
--   • admin_get_report_case()         — one-screen case bundle; logs the view.
--   • admin_reveal_contact()          — explicit, logged PII reveal.
--   • masked_user_label()             — server-side masking helper.
--
-- Mirrors house idioms: fully-locked tables (RLS-on + REVOKE ALL + no policies),
-- SECURITY DEFINER + SET search_path = public, pg_temp + REVOKE/GRANT with full
-- signature + COMMENT. is_admin() is the coarse gate today (P0 note); scoped
-- safeguarding_reviewer is reserved but not yet grantable.
--
-- Pairs with dev-seed supabase/dev-seeds/admin-p1-safeguarding-verification.sql
-- ============================================================================

-- ── 1. report_triage — unified triage state for both report ledgers ─────────
CREATE TABLE IF NOT EXISTS public.report_triage (
  source      text NOT NULL CHECK (source IN ('message', 'safety')),
  report_id   uuid NOT NULL,
  status      text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_review', 'actioned', 'closed')),
  severity    text CHECK (severity IS NULL OR severity IN ('low', 'medium', 'high', 'critical')),
  notes       text CHECK (notes IS NULL OR char_length(notes) <= 4000),
  assigned_to uuid,
  updated_by  uuid,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source, report_id)
);
CREATE INDEX IF NOT EXISTS report_triage_status_idx ON public.report_triage (status, updated_at DESC);
ALTER TABLE public.report_triage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.report_triage FROM anon, authenticated;
COMMENT ON TABLE public.report_triage IS
  'Admin P1 (2026-07-01): unified triage state (status/severity/notes) keyed by (source, report_id) over the immutable message_reports/safety_reports ledgers. Absence of a row = status ''new''. RLS-locked; written only via admin_set_report_triage().';

-- ── 2. account_moderation + enforcement (greenfield ban/suspend) ────────────
CREATE TABLE IF NOT EXISTS public.account_moderation (
  user_id    uuid PRIMARY KEY,
  state      text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'suspended', 'banned')),
  reason     text CHECK (reason IS NULL OR char_length(reason) <= 2000),
  actor_id   uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.account_moderation ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.account_moderation FROM anon, authenticated;
COMMENT ON TABLE public.account_moderation IS
  'Admin P1 (2026-07-01): per-user moderation state. No row OR state=active => not blocked; suspended/banned => blocked. RLS-locked; written only via admin_set_account_state(). Enforced by BEFORE-INSERT triggers on bookings/messages.';

CREATE OR REPLACE FUNCTION public.account_is_blocked(_uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.account_moderation m
    WHERE m.user_id = _uid AND m.state IN ('suspended', 'banned')
  );
$$;
COMMENT ON FUNCTION public.account_is_blocked(uuid) IS
  'Admin P1 (2026-07-01): TRUE iff the user is suspended or banned. Server-internal (used by the enforcement triggers and admin readers).';
REVOKE ALL ON FUNCTION public.account_is_blocked(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.account_is_blocked(uuid) TO service_role;

-- Enforcement: a blocked party genuinely cannot create bookings or send messages.
-- BEFORE INSERT catches EVERY path (RPCs are SECURITY DEFINER so an RLS predicate
-- would not gate them; a trigger on the base table does).
CREATE OR REPLACE FUNCTION public.enforce_not_blocked_booking()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF public.account_is_blocked(NEW.student_id) OR public.account_is_blocked(NEW.mentor_id) THEN
    RAISE EXCEPTION 'account_blocked' USING ERRCODE = '42501',
      DETAIL = 'A suspended or banned account cannot be party to a new booking.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS bookings_block_moderated ON public.bookings;
CREATE TRIGGER bookings_block_moderated
  BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_not_blocked_booking();

CREATE OR REPLACE FUNCTION public.enforce_not_blocked_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF public.account_is_blocked(NEW.sender_id) THEN
    RAISE EXCEPTION 'account_blocked' USING ERRCODE = '42501',
      DETAIL = 'A suspended or banned account cannot send messages.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS messages_block_moderated ON public.messages;
CREATE TRIGGER messages_block_moderated
  BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.enforce_not_blocked_message();

CREATE OR REPLACE FUNCTION public.admin_set_account_state(_user_id uuid, _state text, _reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_actor uuid := auth.uid();
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF _state NOT IN ('active', 'suspended', 'banned') THEN RAISE EXCEPTION 'invalid_state' USING ERRCODE = 'P0001'; END IF;
  IF _user_id IS NULL THEN RAISE EXCEPTION 'user_required' USING ERRCODE = 'P0001'; END IF;
  INSERT INTO public.account_moderation (user_id, state, reason, actor_id, updated_at)
  VALUES (_user_id, _state, _reason, v_actor, now())
  ON CONFLICT (user_id) DO UPDATE SET state = EXCLUDED.state, reason = EXCLUDED.reason,
    actor_id = v_actor, updated_at = now();
  INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id, justification, detail)
  VALUES (v_actor, 'set_account_state', 'user', _user_id, _reason, jsonb_build_object('state', _state));
END $$;
REVOKE ALL ON FUNCTION public.admin_set_account_state(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_account_state(uuid, text, text) TO authenticated, service_role;
COMMENT ON FUNCTION public.admin_set_account_state(uuid, text, text) IS
  'Admin P1 (2026-07-01): is_admin-gated. Sets a user active/suspended/banned (suspend/ban/restore) + audits. Enforced by the bookings/messages block triggers.';

-- ── 3. user_warnings + admin_warn_user ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_warnings (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL,
  reason     text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 2000),
  actor_id   uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_warnings_user_idx ON public.user_warnings (user_id, created_at DESC);
ALTER TABLE public.user_warnings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_warnings FROM anon, authenticated;
COMMENT ON TABLE public.user_warnings IS
  'Admin P1 (2026-07-01): append-only warn log. RLS-locked; written only via admin_warn_user().';

CREATE OR REPLACE FUNCTION public.admin_warn_user(_user_id uuid, _reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_actor uuid := auth.uid(); v_id uuid;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF _user_id IS NULL THEN RAISE EXCEPTION 'user_required' USING ERRCODE = 'P0001'; END IF;
  IF _reason IS NULL OR char_length(btrim(_reason)) = 0 THEN RAISE EXCEPTION 'reason_required' USING ERRCODE = 'P0001'; END IF;
  INSERT INTO public.user_warnings (user_id, reason, actor_id) VALUES (_user_id, btrim(_reason), v_actor) RETURNING id INTO v_id;
  INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id, justification)
  VALUES (v_actor, 'warn_user', 'user', _user_id, btrim(_reason));
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.admin_warn_user(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_warn_user(uuid, text) TO authenticated, service_role;
COMMENT ON FUNCTION public.admin_warn_user(uuid, text) IS
  'Admin P1 (2026-07-01): is_admin-gated. Records a warning (append-only) + audits.';

-- ── 4. booking freeze/cancel (respects A3: cancel unpaid / freeze paid, NO refund) ─
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS frozen_at timestamptz;
COMMENT ON COLUMN public.bookings.frozen_at IS
  'Admin P1 (2026-07-01): set by a safeguarding admin to freeze a PAID/confirmed booking in place (status untouched, NO refund). authorize_video_join() blocks a frozen booking.';

CREATE OR REPLACE FUNCTION public.admin_freeze_or_cancel_booking(_booking_id uuid, _reason text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_actor uuid := auth.uid(); v_status text; v_action text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  SELECT status INTO v_status FROM public.bookings WHERE id = _booking_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'booking_not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_status IN ('pending_payment', 'reserved') THEN
    -- UNPAID: cancel outright. No money taken => no refund implied.
    UPDATE public.bookings SET status = 'cancelled' WHERE id = _booking_id;
    v_action := 'cancel_unpaid_booking';
  ELSIF v_status = 'confirmed' THEN
    -- PAID (per A3's status proxy): freeze IN PLACE (status untouched, no refund).
    UPDATE public.bookings SET frozen_at = COALESCE(frozen_at, now()) WHERE id = _booking_id;
    v_action := 'freeze_paid_booking';
  ELSE
    RAISE EXCEPTION 'booking_not_freezable' USING ERRCODE = 'P0001';  -- completed/cancelled/payment_failed/expired
  END IF;
  INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id, justification, detail)
  VALUES (v_actor, v_action, 'booking', _booking_id, _reason, jsonb_build_object('prior_status', v_status));
  RETURN v_action;
END $$;
REVOKE ALL ON FUNCTION public.admin_freeze_or_cancel_booking(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_freeze_or_cancel_booking(uuid, text) TO authenticated, service_role;
COMMENT ON FUNCTION public.admin_freeze_or_cancel_booking(uuid, text) IS
  'Admin P1 (2026-07-01): is_admin-gated. Cancels an UNPAID booking (pending_payment/reserved) or freezes a PAID confirmed one in place (frozen_at). Never asserts a refund (respects the A3 no-refund-executor policy). Audits.';

-- authorize_video_join re-gated so a frozen booking is not joinable. Verbatim A3
-- body (20260630000003:56-139) with ONLY the [P1] frozen guard added after the
-- state check; every A3 gate (participation, live-consent, window) is preserved.
CREATE OR REPLACE FUNCTION public.authorize_video_join(_booking_id uuid)
RETURNS TABLE (role text, window_end timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller     uuid := auth.uid();
  v_student_id uuid;
  v_mentor_id  uuid;
  v_status     text;
  v_frozen     timestamptz;
  v_date       date;
  v_time_slot  text;
  v_duration    integer;
  v_eff_minutes integer;
  v_role        text;
  v_start       timestamptz;
  v_end         timestamptz;
  v_open        timestamptz;
  v_close       timestamptz;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT b.student_id, b.mentor_id, b.status, b.date, b.time_slot, b.duration, b.frozen_at
    INTO v_student_id, v_mentor_id, v_status, v_date, v_time_slot, v_duration, v_frozen
    FROM public.bookings b
   WHERE b.id = _booking_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_caller = v_student_id THEN
    v_role := 'student';
  ELSIF v_caller = v_mentor_id THEN
    v_role := 'mentor';
  ELSE
    RAISE EXCEPTION 'not_a_participant' USING ERRCODE = '42501';
  END IF;

  -- [P1] account moderation — a SUSPENDED/BANNED party may not join a live 1:1
  --      session. Checked after participation (so a non-party never learns the
  --      moderation state) and before the other gates: a ban must immediately
  --      close the highest-risk channel (live video with a minor) for EXISTING
  --      confirmed bookings, not just block new ones.
  IF public.account_is_blocked(v_student_id) OR public.account_is_blocked(v_mentor_id) THEN
    RAISE EXCEPTION 'account_blocked' USING ERRCODE = '42501';
  END IF;

  -- [A3] live consent — neither party may join once consent is not current.
  IF NOT public.student_has_consent(v_student_id) THEN
    RAISE EXCEPTION 'consent_revoked' USING ERRCODE = 'P0001';
  END IF;

  -- State — only confirmed bookings are joinable.
  IF v_status <> 'confirmed' THEN
    RAISE EXCEPTION 'not_joinable_status' USING ERRCODE = 'P0001';
  END IF;

  -- [P1] a safeguarding-frozen booking is not joinable (keeps status='confirmed',
  --      no refund; access blocked here). Checked after participation so consent/
  --      freeze state never leaks to a non-party.
  IF v_frozen IS NOT NULL THEN
    RAISE EXCEPTION 'booking_frozen' USING ERRCODE = 'P0001';
  END IF;

  v_eff_minutes := LEAST(GREATEST(v_duration, 1), 120);
  v_start := (v_date::timestamp + v_time_slot::time) AT TIME ZONE 'Asia/Kolkata';
  v_end   := (v_date::timestamp + v_time_slot::time + make_interval(mins => v_eff_minutes))
               AT TIME ZONE 'Asia/Kolkata';
  v_open  := v_start - interval '10 minutes';
  v_close := v_end   + interval '15 minutes';

  IF now() < v_open OR now() > v_close THEN
    RAISE EXCEPTION 'outside_window' USING ERRCODE = 'P0001';
  END IF;

  role        := v_role;
  window_end  := v_close;
  RETURN NEXT;
END;
$$;
COMMENT ON FUNCTION public.authorize_video_join(uuid) IS
  'V1 video join gate (A3 2026-06-30 + P1 2026-07-01): participation + NOT-account-blocked (either party) + live-consent + confirmed-status + NOT-frozen + time-window, all re-derived from auth.uid(). P1 adds account_blocked (42501, so a ban immediately closes existing confirmed sessions) and booking_frozen (P0001) gates.';

-- ── 5. escalation_records + admin_record_escalation ─────────────────────────
CREATE TABLE IF NOT EXISTS public.escalation_records (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source          text CHECK (source IS NULL OR source IN ('message', 'safety')),
  report_id       uuid,
  subject_user_id uuid,
  channel         text NOT NULL CHECK (channel IN ('childline_1098', 'cyber_crime_portal', 'law_enforcement', 'other')),
  reference_note  text CHECK (reference_note IS NULL OR char_length(reference_note) <= 4000),
  actor_id        uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS escalation_records_report_idx ON public.escalation_records (source, report_id, created_at DESC) WHERE report_id IS NOT NULL;
ALTER TABLE public.escalation_records ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.escalation_records FROM anon, authenticated;
COMMENT ON TABLE public.escalation_records IS
  'Admin P1 (2026-07-01): append-only record of external safeguarding escalations (Childline 1098 / cyber-crime portal / law enforcement). RLS-locked; written only via admin_record_escalation().';

CREATE OR REPLACE FUNCTION public.admin_record_escalation(
  _channel text, _subject_user_id uuid DEFAULT NULL, _source text DEFAULT NULL,
  _report_id uuid DEFAULT NULL, _note text DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_actor uuid := auth.uid(); v_id uuid;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF _channel NOT IN ('childline_1098', 'cyber_crime_portal', 'law_enforcement', 'other') THEN
    RAISE EXCEPTION 'invalid_channel' USING ERRCODE = 'P0001'; END IF;
  IF _source IS NOT NULL AND _source NOT IN ('message', 'safety') THEN
    RAISE EXCEPTION 'invalid_source' USING ERRCODE = 'P0001'; END IF;
  INSERT INTO public.escalation_records (source, report_id, subject_user_id, channel, reference_note, actor_id)
  VALUES (_source, _report_id, _subject_user_id, _channel, _note, v_actor) RETURNING id INTO v_id;
  INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id, justification, detail)
  VALUES (v_actor, 'record_escalation', 'user', _subject_user_id, _note,
          jsonb_build_object('channel', _channel, 'source', _source, 'report_id', _report_id));
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.admin_record_escalation(text, uuid, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_record_escalation(text, uuid, text, uuid, text) TO authenticated, service_role;
COMMENT ON FUNCTION public.admin_record_escalation(text, uuid, text, uuid, text) IS
  'Admin P1 (2026-07-01): is_admin-gated. Records an external escalation referral (Childline 1098 / cyber-crime / law enforcement) + audits.';

-- ── 6. masking helper + queue reader + case reader + logged reveal ──────────
CREATE OR REPLACE FUNCTION public.masked_user_label(_uid uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_name text; v_role text;
BEGIN
  IF _uid IS NULL THEN RETURN 'unknown'; END IF;
  SELECT full_name INTO v_name FROM public.students WHERE id = _uid;
  IF FOUND THEN v_role := 'student';
  ELSE
    SELECT full_name INTO v_name FROM public.mentors WHERE id = _uid;
    IF FOUND THEN v_role := 'mentor'; ELSE RETURN 'unknown'; END IF;
  END IF;
  -- masked: first initial + bullets + role. No raw name/PII.
  RETURN COALESCE(NULLIF(left(btrim(v_name), 1), ''), '?') || '••• (' || v_role || ')';
END $$;
REVOKE ALL ON FUNCTION public.masked_user_label(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.masked_user_label(uuid) TO service_role;
COMMENT ON FUNCTION public.masked_user_label(uuid) IS
  'Admin P1 (2026-07-01): PII-masked display label (initial + role) for a student/mentor uuid. Used by the safeguarding readers so the default queue/case view never shows a raw name.';

CREATE OR REPLACE FUNCTION public.admin_list_safeguarding_queue(
  _status text DEFAULT NULL, _limit integer DEFAULT 100, _offset integer DEFAULT 0
)
RETURNS TABLE (
  source text, report_id uuid, created_at timestamptz, category text,
  reporter_id uuid, reporter_label text, subject_user_id uuid, subject_label text,
  status text, severity text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  -- NB: the reporter-authored free text (reason/body) is deliberately NOT in the
  -- queue — it can embed a real minor/third-party name, and the queue read is not
  -- individually audited. Full report content is deferred to admin_get_report_case,
  -- which logs a view_report_case audit row. The queue carries only category /
  -- severity / status / age / MASKED party labels — enough to triage, no raw PII.
  RETURN QUERY
  WITH unified AS (
    SELECT 'message'::text AS source, mr.id AS report_id, mr.created_at,
           'chat_report'::text AS category, mr.reporter_id, mr.reported_user_id AS subject_user_id
      FROM public.message_reports mr
    UNION ALL
    SELECT 'safety'::text, sr.id, sr.created_at, sr.category, sr.reporter_id, sr.subject_user_id
      FROM public.safety_reports sr
  )
  SELECT u.source, u.report_id, u.created_at, u.category,
         u.reporter_id, public.masked_user_label(u.reporter_id),
         u.subject_user_id, public.masked_user_label(u.subject_user_id),
         COALESCE(t.status, 'new'), t.severity
    FROM unified u
    LEFT JOIN public.report_triage t ON t.source = u.source AND t.report_id = u.report_id
   WHERE (_status IS NULL OR COALESCE(t.status, 'new') = _status)
   ORDER BY (COALESCE(t.status, 'new') = 'closed'),  -- open items first
            u.created_at DESC
   LIMIT GREATEST(0, LEAST(_limit, 500)) OFFSET GREATEST(0, _offset);
END $$;
REVOKE ALL ON FUNCTION public.admin_list_safeguarding_queue(text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_safeguarding_queue(text, integer, integer) TO authenticated, service_role;
COMMENT ON FUNCTION public.admin_list_safeguarding_queue(text, integer, integer) IS
  'Admin P1 (2026-07-01): is_admin-gated unified queue of message_reports + safety_reports — category/severity/status/age + PII-MASKED party labels only. Report free-text is intentionally NOT surfaced here (un-audited bulk read); full content + raw names are behind the audited admin_get_report_case / admin_reveal_contact. Open items first, newest first.';

CREATE OR REPLACE FUNCTION public.admin_get_report_case(_source text, _report_id uuid)
RETURNS TABLE (
  source text, report_id uuid, created_at timestamptz, category text, content text,
  reporter_id uuid, reporter_label text, subject_user_id uuid, subject_label text,
  conversation_id uuid, reported_message_id uuid, booking_id uuid,
  status text, severity text, notes text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_actor uuid := auth.uid();
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF _source NOT IN ('message', 'safety') THEN RAISE EXCEPTION 'invalid_source' USING ERRCODE = 'P0001'; END IF;
  -- Opening a case surfaces a minor's report/conversation context => log the view.
  INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id, detail)
  VALUES (v_actor, 'view_report_case', 'report', _report_id, jsonb_build_object('source', _source));

  IF _source = 'message' THEN
    RETURN QUERY
    SELECT 'message'::text, mr.id, mr.created_at, 'chat_report'::text, mr.reason,
           mr.reporter_id, public.masked_user_label(mr.reporter_id),
           mr.reported_user_id, public.masked_user_label(mr.reported_user_id),
           mr.conversation_id, mr.reported_message_id, NULL::uuid,
           COALESCE(t.status, 'new'), t.severity, t.notes
      FROM public.message_reports mr
      LEFT JOIN public.report_triage t ON t.source = 'message' AND t.report_id = mr.id
     WHERE mr.id = _report_id;
  ELSE
    RETURN QUERY
    SELECT 'safety'::text, sr.id, sr.created_at, sr.category, sr.body,
           sr.reporter_id, public.masked_user_label(sr.reporter_id),
           sr.subject_user_id, public.masked_user_label(sr.subject_user_id),
           NULL::uuid, NULL::uuid, sr.booking_id,
           COALESCE(t.status, 'new'), t.severity, t.notes
      FROM public.safety_reports sr
      LEFT JOIN public.report_triage t ON t.source = 'safety' AND t.report_id = sr.id
     WHERE sr.id = _report_id;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.admin_get_report_case(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_report_case(text, uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.admin_get_report_case(text, uuid) IS
  'Admin P1 (2026-07-01): is_admin-gated case bundle for ONE report (report content + masked parties + conversation_id/booking_id + triage). Writes a view_report_case audit row (opening a case reads a minor''s context). Message bodies are fetched separately via the existing is_admin() RLS path.';

CREATE OR REPLACE FUNCTION public.admin_set_report_triage(
  _source text, _report_id uuid, _status text DEFAULT NULL, _severity text DEFAULT NULL, _notes text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_actor uuid := auth.uid();
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF _source NOT IN ('message', 'safety') THEN RAISE EXCEPTION 'invalid_source' USING ERRCODE = 'P0001'; END IF;
  IF _status IS NOT NULL AND _status NOT IN ('new', 'in_review', 'actioned', 'closed') THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = 'P0001'; END IF;
  IF _severity IS NOT NULL AND _severity NOT IN ('low', 'medium', 'high', 'critical') THEN
    RAISE EXCEPTION 'invalid_severity' USING ERRCODE = 'P0001'; END IF;
  INSERT INTO public.report_triage (source, report_id, status, severity, notes, updated_by, updated_at)
  VALUES (_source, _report_id, COALESCE(_status, 'new'), _severity, _notes, v_actor, now())
  ON CONFLICT (source, report_id) DO UPDATE SET
    status   = COALESCE(_status, public.report_triage.status),
    severity = COALESCE(_severity, public.report_triage.severity),
    notes    = COALESCE(_notes, public.report_triage.notes),
    updated_by = v_actor, updated_at = now();
  INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id, detail)
  VALUES (v_actor, 'set_report_triage', 'report', _report_id,
          jsonb_build_object('source', _source, 'status', _status, 'severity', _severity));
END $$;
REVOKE ALL ON FUNCTION public.admin_set_report_triage(text, uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_report_triage(text, uuid, text, text, text) TO authenticated, service_role;
COMMENT ON FUNCTION public.admin_set_report_triage(text, uuid, text, text, text) IS
  'Admin P1 (2026-07-01): is_admin-gated upsert of triage status/severity/notes for a report + audits. NOTE: severity/notes are set-or-change only (NULL arg = keep existing, via COALESCE) — clearing a severity/note back to empty is intentionally not supported in V1; change status/severity to correct, not blank.';

CREATE OR REPLACE FUNCTION public.admin_list_escalations(_source text, _report_id uuid)
RETURNS TABLE (id uuid, channel text, reference_note text, actor_id uuid, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
    SELECT e.id, e.channel, e.reference_note, e.actor_id, e.created_at
      FROM public.escalation_records e
     WHERE e.source IS NOT DISTINCT FROM _source AND e.report_id = _report_id
     ORDER BY e.created_at DESC;
END $$;
REVOKE ALL ON FUNCTION public.admin_list_escalations(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_escalations(text, uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.admin_list_escalations(text, uuid) IS
  'Admin P1 (2026-07-01): is_admin-gated reader of escalations recorded against a report.';

CREATE OR REPLACE FUNCTION public.admin_reveal_contact(_user_id uuid, _justification text DEFAULT NULL)
RETURNS TABLE (
  user_id uuid, role text, full_name text, email text, phone text,
  parent_phone text, parent_email text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_actor uuid := auth.uid(); v_found boolean := false;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  -- Revealing a minor's / parent's raw contact is an explicit, logged action.
  INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id, justification)
  VALUES (v_actor, 'reveal_contact', 'user', _user_id, _justification);

  RETURN QUERY
    SELECT s.id, 'student'::text, s.full_name, s.email, s.phone,
           s.parent_phone, s.parental_consent_email
      FROM public.students s WHERE s.id = _user_id;
  GET DIAGNOSTICS v_found = ROW_COUNT;
  IF NOT v_found THEN
    RETURN QUERY
      SELECT m.id, 'mentor'::text, m.full_name, m.email, m.phone, NULL::text, NULL::text
        FROM public.mentors m WHERE m.id = _user_id;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.admin_reveal_contact(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reveal_contact(uuid, text) TO authenticated, service_role;
COMMENT ON FUNCTION public.admin_reveal_contact(uuid, text) IS
  'Admin P1 (2026-07-01): is_admin-gated. Returns a user''s RAW contact (student incl. parent phone/email; mentor email/phone) and ALWAYS writes a reveal_contact audit row first — the explicit, logged un-masking action. PRE-LAUNCH HARDENING: today is_admin() is coarse (only super_admin is grantable), so this is effectively super-admin-only; before scoped admin roles become grantable, re-gate this (and admin_get_report_case content) on a narrower safeguarding_reviewer predicate so growth/finance/support admins get masked-only.';
