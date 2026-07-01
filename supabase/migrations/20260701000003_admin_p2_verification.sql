-- ============================================================================
-- ADMIN CONSOLE — PHASE 2: MENTOR VERIFICATION. Additive, reversible, LOCAL-only.
-- ============================================================================
-- The existing approval RPCs (approve_mentor / reject_mentor / admin_set_mentor_
-- status) predate the Phase 0 audit log and write NO trail; admin_list_mentors
-- exposes no DOB/adulthood. Phase 2 adds an is_admin()-gated applications reader
-- that surfaces the SERVER-SIDE mentor_is_adult() result (the A2 18+ check), and
-- thin audited wrappers around approve/reject so every verification decision is
-- captured in admin_audit_log. Mentor ID documents stay super-admin-only + logged
-- (the signed-URL server fn is tightened separately in TS).
--
-- WHAT THIS ADDS
--   • admin_list_mentor_applications(_status,_mentor_id) — reader with is_adult +
--     doc-presence flags (mentor_is_adult is server_role-only, so we compute it
--     inside this SECURITY DEFINER reader).
--   • admin_approve_mentor(_mentor_id)  — is_admin-gated: PERFORM approve_mentor
--     (mutation + email + the authoritative 18+ trigger) then audit.
--   • admin_reject_mentor(_mentor_id,_reason) — is_admin-gated: reason required,
--     PERFORM reject_mentor (stores reason + email) then audit. Reject IS the
--     "request resubmit" path — the mentor then self-resubmits via HQ Forge.
--
-- Nothing here bypasses the authoritative gate: enforce_mentor_adult_on_approve
-- still blocks any transition INTO approved for a DOB-null/under-18 mentor, so
-- admin_approve_mentor rolls back (no audit row) if the mentor is not 18+.
--
-- Pairs with dev-seed supabase/dev-seeds/admin-p2-verification-verification.sql
-- ============================================================================

-- ── 1. applications reader (adds server-side is_adult + doc flags) ──────────
CREATE OR REPLACE FUNCTION public.admin_list_mentor_applications(
  _status text DEFAULT NULL, _mentor_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid, full_name text, email text, university text, course text, year text,
  college_email text, status text, tier text, date_of_birth date, is_adult boolean,
  verified_at timestamptz, verification_notes text, application_submitted_at timestamptz,
  has_id_doc boolean, has_enrollment_doc boolean, created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
    SELECT m.id, m.full_name, m.email, m.university, m.course, m.year, m.college_email,
           m.status::text, m.tier::text, m.date_of_birth,
           public.mentor_is_adult(m.date_of_birth) AS is_adult,
           m.verified_at, m.verification_notes, m.application_submitted_at,
           (m.id_document_path IS NOT NULL) AS has_id_doc,
           (m.enrollment_letter_path IS NOT NULL) AS has_enrollment_doc,
           m.created_at
      FROM public.mentors m
     WHERE (_mentor_id IS NULL OR m.id = _mentor_id)
       AND (_status IS NULL OR m.status::text = _status)
     ORDER BY (m.status <> 'pending'::public.mentor_status),        -- pending first
              m.application_submitted_at DESC NULLS LAST, m.created_at DESC;
END $$;
REVOKE ALL     ON FUNCTION public.admin_list_mentor_applications(text, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_list_mentor_applications(text, uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.admin_list_mentor_applications(text, uuid) IS
  'Admin P2 (2026-07-01): is_admin-gated mentor-applications reader. Adds the server-side mentor_is_adult(date_of_birth) 18+ result (A2) and id/enrollment doc-presence flags that admin_list_mentors lacks. Pending first. Raw ID-document bytes are NOT here — those are super-admin-only + logged via the signed-URL server fn.';

-- ── 2. audited approve / reject wrappers ────────────────────────────────────
-- These wrap the pre-Phase-0 approve_mentor / reject_mentor (which do the state
-- change + decision email but no audit) so the verification decision + its trail
-- are one atomic transaction. If approve_mentor raises (mentor not found, or the
-- enforce_mentor_adult_on_approve 18+ trigger), the whole tx — including the audit
-- row — rolls back, so no false "approved" trail is left.
CREATE OR REPLACE FUNCTION public.admin_approve_mentor(_mentor_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_actor uuid := auth.uid();
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  PERFORM public.approve_mentor(_mentor_id);
  INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id)
  VALUES (v_actor, 'approve_mentor', 'mentor', _mentor_id);
END $$;
REVOKE ALL     ON FUNCTION public.admin_approve_mentor(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_approve_mentor(uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.admin_approve_mentor(uuid) IS
  'Admin P2 (2026-07-01): is_admin-gated audited wrapper — PERFORMs approve_mentor (status=approved + verified_at/by + clears re_review + email; the 18+ trigger still gates) then writes an approve_mentor audit row atomically.';

CREATE OR REPLACE FUNCTION public.admin_reject_mentor(_mentor_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_actor uuid := auth.uid();
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF _reason IS NULL OR char_length(btrim(_reason)) = 0 THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = 'P0001';
  END IF;
  PERFORM public.reject_mentor(_mentor_id, btrim(_reason));
  INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id, justification)
  VALUES (v_actor, 'reject_mentor', 'mentor', _mentor_id, btrim(_reason));
END $$;
REVOKE ALL     ON FUNCTION public.admin_reject_mentor(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_reject_mentor(uuid, text) TO authenticated, service_role;
COMMENT ON FUNCTION public.admin_reject_mentor(uuid, text) IS
  'Admin P2 (2026-07-01): is_admin-gated audited wrapper — requires a reason, PERFORMs reject_mentor (status=rejected + stores reason in verification_notes + email) then writes a reject_mentor audit row. This is the "request resubmit" path; the mentor then self-resubmits via HQ Forge (resubmit_mentor_application).';

-- ── 3. close the un-audited direct paths ────────────────────────────────────
-- The pre-Phase-0 primitives change verification status but write NO audit row.
-- They were reachable directly over the client RPC surface (browser holds the anon
-- key + an admin JWT), so an admin could approve/reject with no trail — defeating
-- "every verification decision is audited". Make the AUDITED wrappers the only
-- authenticated path: revoke the primitives from authenticated/anon. The wrappers
-- still call them because a SECURITY DEFINER body executes as the owner (which
-- retains EXECUTE regardless of these grants); service_role keeps access for any
-- server-side use.
REVOKE EXECUTE ON FUNCTION public.approve_mentor(uuid)           FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reject_mentor(uuid, text)      FROM authenticated, anon, PUBLIC;
REVOKE ALL     ON FUNCTION public.admin_set_mentor_status(uuid, text) FROM authenticated, anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.approve_mentor(uuid)           TO service_role;
GRANT  EXECUTE ON FUNCTION public.reject_mentor(uuid, text)      TO service_role;
GRANT  EXECUTE ON FUNCTION public.admin_set_mentor_status(uuid, text) TO service_role;

-- PRE-LAUNCH HARDENING (data minimization): admin_list_mentor_applications returns
-- the raw date_of_birth to every is_admin() caller, while the ID doc that validates
-- it is super-admin-only. Today only super_admin is grantable so is_admin ==
-- super_admin; when scoped admin roles become grantable, surface raw date_of_birth
-- only to super_admins (regular reviewers get just the is_adult flag / an age band).
