-- ============================================================================
-- ADMIN CONSOLE — PHASE 7: OVERVIEW STATS. Additive, LOCAL-only.
-- ============================================================================
-- One is_admin()-gated AGGREGATE reader for the operator Overview. Returns COUNTS
-- only (+ two money totals) — no identities, no PII — so it needs no audit log, same
-- posture as admin_payments_summary. Every count mirrors the EXACT open/pending
-- definition its module uses, so the dashboard number equals what the operator sees
-- when they click into that module (honesty rule — no invented metrics):
--
--   open_safeguarding      = message_reports + safety_reports that are NOT closed
--                            (triage status new/in_review/actioned; absence of a
--                            report_triage row = 'new'). Matches admin_list_safeguarding_
--                            queue's "open items first" = everything except closed, and
--                            the queue's default "Open" tab reproduces exactly this set.
--                            (Counting non-closed — not just new/in_review — because an
--                            actioned-but-unclosed safeguarding report still needs eyes;
--                            under-counting is the child-safety-riskier direction.)
--   pending_verifications  = mentors.status = 'pending' (admin_list_mentor_applications default).
--   consent_pending        = consent-required minors with no consent on file and no
--                            revocation row (the P4 admin_list_consent 'pending' bucket).
--   consent_fallout_open   = booking-level consent_revocation_events not yet resolved.
--   refunds_owed_*         = refund_intents.status = 'pending' (money OWED, undisbursed).
--   payouts_accrued_*      = mentor_payouts.status = 'scheduled' (ACCRUED, undisbursed).
--   accounts_moderated     = account_moderation.state in (suspended, banned).
--
-- Pairs with supabase/dev-seeds/admin-p7-overview-verification.sql
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_overview_stats()
RETURNS TABLE (
  open_safeguarding bigint,
  pending_verifications bigint,
  consent_pending bigint,
  consent_fallout_open bigint,
  accounts_moderated bigint,
  refunds_owed_count bigint, refunds_owed_inr bigint,
  payouts_accrued_count bigint, payouts_accrued_inr bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT
    -- open safeguarding: reports NOT closed (no triage row => 'new'); matches the
    -- safeguarding queue's "open items first" = every non-closed status.
    (
      (SELECT count(*) FROM public.message_reports mr
         LEFT JOIN public.report_triage t ON t.source='message' AND t.report_id=mr.id
        WHERE COALESCE(t.status,'new') <> 'closed')
      +
      (SELECT count(*) FROM public.safety_reports sr
         LEFT JOIN public.report_triage t ON t.source='safety' AND t.report_id=sr.id
        WHERE COALESCE(t.status,'new') <> 'closed')
    )::bigint,
    (SELECT count(*) FROM public.mentors m WHERE m.status='pending')::bigint,
    -- consent pending: consent-required minor, no consent on file, no revocation row
    (SELECT count(*) FROM public.students s
       WHERE (public.requires_consent_base(s.date_of_birth, s.grade) OR s.date_of_birth IS NULL)
         AND s.parental_consent_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM public.consent_revocation_events r WHERE r.student_id=s.id))::bigint,
    (SELECT count(*) FROM public.consent_revocation_events r
       WHERE r.booking_id IS NOT NULL AND r.resolved_at IS NULL)::bigint,
    (SELECT count(*) FROM public.account_moderation am WHERE am.state IN ('suspended','banned'))::bigint,
    (SELECT count(*)              FROM public.refund_intents ri WHERE ri.status='pending')::bigint,
    COALESCE((SELECT sum(ri.amount_inr) FROM public.refund_intents ri WHERE ri.status='pending'), 0)::bigint,
    (SELECT count(*)              FROM public.mentor_payouts mp WHERE mp.status='scheduled')::bigint,
    COALESCE((SELECT sum(mp.amount_inr) FROM public.mentor_payouts mp WHERE mp.status='scheduled'), 0)::bigint;
END $$;
REVOKE ALL     ON FUNCTION public.admin_overview_stats() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_overview_stats() TO authenticated, service_role;
COMMENT ON FUNCTION public.admin_overview_stats() IS
  'Admin P7 (2026-07-01): is_admin-gated aggregate Overview counts (+2 money totals). No PII — counts only, each matching its module''s open/pending filter. Not audit-logged (aggregate, like admin_payments_summary).';
