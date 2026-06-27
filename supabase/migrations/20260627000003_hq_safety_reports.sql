-- ════════════════════════════════════════════════════════════════════════════
-- 20260627000001_child_safety_reporting.sql
-- Additive LOCAL child-safety reporting channel.
--
-- HIGH-STAKES / CHILD-SAFETY. This migration installs CAPTURE plumbing only:
--   - public.safety_reports  : fully RLS-locked ledger (admin / service_role only)
--   - submit_safety_report() : SECURITY DEFINER write, any authenticated user,
--                              from ANYWHERE (no conversation/booking required)
--   - admin_list_safety_reports() : is_admin()-gated SECURITY DEFINER reader
--
-- It is ADDITIVE (new table + new functions; no DROP/ALTER of existing objects)
-- and mirrors the existing fully-locked safeguarding-table idiom used for
-- public.message_reports / public.safeguarding_events (20260530000004) and the
-- is_admin() admin-RPC convention (20260604000030).
--
-- ⚠️  GATING (do NOT skip): this channel must stay gated to real minors until
-- (1) a monitored safeguarding inbox, (2) lawyer-confirmed POCSO escalation, and
-- (3) an adversarial child-safety review are all confirmed. NO auto-email /
-- escalation is wired here: a submitted report is silent until an admin polls
-- admin_list_safety_reports(). The status field exists so triage is explicit and
-- exposure stays HUMAN-GATED. Pairs with dev-seed
-- supabase/dev-seeds/child-safety-reporting-verification.sql.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Table ────────────────────────────────────────────────────────────────
-- reporter_id / subject_user_id / booking_id / handled_by are plain uuid (NO FK)
-- — same "safeguarding durability" choice as message_reports: a report must
-- survive deletion of the subject/booking, and must be fileable from anywhere
-- about anyone (the reporter may not know exact ids; admin triages manually).
CREATE TABLE IF NOT EXISTS public.safety_reports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id     uuid NOT NULL,
  subject_user_id uuid,
  booking_id      uuid,
  category        text NOT NULL
                    CHECK (category IN ('grooming','harassment','inappropriate_content','safety_threat','other')),
  body            text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 5000),
  status          text NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','triaging','actioned','closed')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  handled_by      uuid,
  handled_at      timestamptz,
  admin_notes     text
);

CREATE INDEX IF NOT EXISTS safety_reports_status_idx
  ON public.safety_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS safety_reports_created_idx
  ON public.safety_reports (created_at DESC);
CREATE INDEX IF NOT EXISTS safety_reports_reporter_idx
  ON public.safety_reports (reporter_id, created_at DESC);
CREATE INDEX IF NOT EXISTS safety_reports_subject_idx
  ON public.safety_reports (subject_user_id)
  WHERE subject_user_id IS NOT NULL;

-- ── RLS: fully locked (admin / service_role only) ───────────────────────────
-- Enable RLS AND strip every default table grant from anon/authenticated, so a
-- client has NO direct read OR write path (no INSERT/SELECT/UPDATE/DELETE, and
-- not TRUNCATE/REFERENCES/TRIGGER either). NO policies are added on purpose:
-- with grants revoked a policy would be dead. Writes flow ONLY through
-- submit_safety_report (SECURITY DEFINER); reads ONLY through
-- admin_list_safety_reports (is_admin-gated) or service_role (RLS-bypass, for
-- server-side triage). Reporters cannot read ANY report — including their own
-- triage state — because surfacing status/admin_notes to a reporter is a
-- safeguarding hazard (a groomer could probe the queue) and no "my reports" UI
-- is required. Exposure stays human-gated.
ALTER TABLE public.safety_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.safety_reports FROM anon, authenticated;

COMMENT ON TABLE public.safety_reports IS
  'Child-safety (2026-06-27): append-style safeguarding report ledger. RLS-on + REVOKE ALL (admin/service_role only) — NO client read/write policy. Written ONLY by submit_safety_report (any authenticated user, from anywhere); read by admin_list_safety_reports (is_admin) or service_role. status/handled_by/handled_at/admin_notes are triage fields (service_role/admin tooling only today; no admin write RPC yet). Plain-uuid reporter/subject/booking ids (no FK) for durability. CAPTURE ONLY: no auto-email/escalation wired — must stay gated to real minors until a monitored inbox + POCSO escalation + adversarial review exist.';

-- ── 2. submit_safety_report — the write gate ────────────────────────────────
-- SECURITY DEFINER: re-derives reporter_id from auth.uid() (never trusts a
-- client value), validates, inserts, returns the new id. Callable by ANY
-- authenticated user with NO conversation/booking precondition.
CREATE OR REPLACE FUNCTION public.submit_safety_report(
  _category        text,
  _body            text,
  _subject_user_id uuid DEFAULT NULL,
  _booking_id      uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_reporter uuid := auth.uid();
  v_id       uuid;
BEGIN
  IF v_reporter IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF _category IS NULL
     OR _category NOT IN ('grooming','harassment','inappropriate_content','safety_threat','other') THEN
    RAISE EXCEPTION 'invalid_category' USING ERRCODE = 'P0001';
  END IF;
  IF btrim(coalesce(_body, '')) = '' THEN
    RAISE EXCEPTION 'empty_body' USING ERRCODE = 'P0001';
  END IF;
  IF char_length(btrim(_body)) > 5000 THEN
    RAISE EXCEPTION 'body_too_long' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.safety_reports
    (reporter_id, subject_user_id, booking_id, category, body)
  VALUES
    (v_reporter, _subject_user_id, _booking_id, _category, btrim(_body))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- anon explicitly denied (a report requires an authenticated identity);
-- service_role intentionally NOT granted (it has no auth.uid()).
REVOKE ALL     ON FUNCTION public.submit_safety_report(text, text, uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.submit_safety_report(text, text, uuid, uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.submit_safety_report(text, text, uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.submit_safety_report(text, text, uuid, uuid) IS
  'Child-safety (2026-06-27): SECURITY DEFINER write gate for public.safety_reports. Re-derives reporter_id=auth.uid(); validates category + non-empty/<=5000-char body; inserts status=open; returns the new id. Callable by ANY authenticated user from anywhere (no conversation/booking required). anon denied; service_role not granted (no auth.uid()). NO email/escalation side effect — capture only.';

-- ── 3. admin_list_safety_reports — admin-gated reader ───────────────────────
CREATE OR REPLACE FUNCTION public.admin_list_safety_reports()
RETURNS TABLE (
  id              uuid,
  reporter_id     uuid,
  subject_user_id uuid,
  booking_id      uuid,
  category        text,
  body            text,
  status          text,
  created_at      timestamptz,
  handled_by      uuid,
  handled_at      timestamptz,
  admin_notes     text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
    SELECT r.id, r.reporter_id, r.subject_user_id, r.booking_id, r.category,
           r.body, r.status, r.created_at, r.handled_by, r.handled_at, r.admin_notes
    FROM public.safety_reports r
    ORDER BY r.created_at DESC;
END;
$$;

REVOKE ALL    ON FUNCTION public.admin_list_safety_reports() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_safety_reports() TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_list_safety_reports() IS
  'Child-safety (2026-06-27): admin-only (is_admin()) SECURITY DEFINER reader for public.safety_reports, newest-first. The ONLY non-service_role read path — reporters cannot read their own or others'' reports. Pairs with submit_safety_report.';
