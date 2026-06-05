-- ════════════════════════════════════════════════════════════════════════════
-- Phase 8: mentor application submit / resubmit — the lifecycle gap
-- ════════════════════════════════════════════════════════════════════════════
--
-- WHY: the mentor signup wizard collects everything, but two lifecycle moves
-- have no mechanism today:
--   (1) "Submit for review" — distinguish "account created, still uploading
--       docs" from "submitted, ready for admin review" (the P7 profile_completed_at
--       analog). status DEFAULT 'pending' alone can't tell them apart, so the
--       admin queue would show docless/abandoned signups.
--   (2) "Resubmit" — a rejected mentor fixing their docs needs status
--       rejected→pending, but prevent_mentor_self_approval LOCKS status to
--       admin/service. A SECURITY DEFINER RPC does NOT bypass that trigger
--       (auth.jwt()/is_admin() read the CALLER, unchanged by DEFINER), so the
--       trigger must be TAUGHT to permit exactly the submit + resubmit shapes.
--
-- ADDITIVE ONLY — nothing dropped/renamed/behaviour-changed except the two
-- deliberate, reviewed items:
--   - mentors: + application_submitted_at timestamptz (nullable). mentors is
--     owner-only SELECT (no column allowlist) so the owner reads it directly; it
--     is treated as admin/self-service-controlled by the lock below (a bare
--     mentor UPDATE can't set it without the ID document).
--   - prevent_mentor_self_approval: CREATE OR REPLACE — KEEPS the existing
--     no-op + service_role + is_admin bypasses AND the self-approval block, and
--     ADDS two narrowly-shaped mentor self-service allowances (SUBMIT, RESUBMIT).
--     Neither can ever reach 'approved' or change price/verified_*; both require
--     id_document_path IS NOT NULL. This is the documented "two-trigger fight"
--     fix — SECURITY-REVIEWER GATED. INVARIANT for future editors: submit/resubmit
--     deliberately do NOT write re_review_pending, so the sibling
--     prevent_mentor_re_review_tamper trigger short-circuits and needs no new
--     allowance — keep it that way if you extend these RPCs.
--   - admin_list_mentors: DROP+CREATE to ADD application_submitted_at to the
--     return (so the admin queue can show submitted apps only). Grants restated
--     to the prior PUBLIC default (function is is_admin()-gated internally).
--   - submit_mentor_application() / resubmit_mentor_application(): NEW owner-gated
--     SECURITY DEFINER RPCs producing exactly the trigger-allowed shapes.
--
-- price_inr is NOT touched anywhere (platform-controlled). No money, no consent
-- columns — but it edits the verification status lock → db-reviewer + security-
-- reviewer.
--
-- Idempotent (ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE, DROP FUNCTION IF
-- EXISTS before the return-type-changing re-CREATE).
--
-- Verification: supabase/dev-seeds/p8-mentor-application-verification.sql
-- ════════════════════════════════════════════════════════════════════════════

-- ─── the submitted flag ───
ALTER TABLE public.mentors
  ADD COLUMN IF NOT EXISTS application_submitted_at timestamptz;

COMMENT ON COLUMN public.mentors.application_submitted_at IS
  'Phase 8 (2026-06-05): set when the mentor finishes the post-verify finalize step (college-ID photo + admits uploaded) and submits for review. NULL = account created but not yet submitted → routed to /mentor-signup/finalize. Set ONLY via submit_mentor_application()/resubmit_mentor_application() (the lock requires id_document_path). The admin review queue shows status=pending AND application_submitted_at IS NOT NULL.';

-- ════════════════════════════════════════════════════════════════════════════
-- prevent_mentor_self_approval — extend to permit the mentor SUBMIT + RESUBMIT
-- self-service shapes. Everything else (esp. any path to 'approved', or a
-- price/verified_* change) stays admin/service-only.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.prevent_mentor_self_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- (1) No-op: no admin-controlled column changed (incl. the new submitted flag).
  IF OLD.status                  IS NOT DISTINCT FROM NEW.status
     AND OLD.price_inr           IS NOT DISTINCT FROM NEW.price_inr
     AND OLD.verified_at         IS NOT DISTINCT FROM NEW.verified_at
     AND OLD.verified_by         IS NOT DISTINCT FROM NEW.verified_by
     AND OLD.verification_notes  IS NOT DISTINCT FROM NEW.verification_notes
     AND OLD.application_submitted_at IS NOT DISTINCT FROM NEW.application_submitted_at
  THEN
    RETURN NEW;
  END IF;

  -- (2)/(3) service_role / admin bypass (admin approve/reject/set-status).
  IF coalesce(auth.jwt() ->> 'role', '') = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  -- (4) Mentor SUBMIT (own row, via submit_mentor_application): ONLY
  --     application_submitted_at moves; status/price/verified/notes unchanged;
  --     the college-ID document must be present. Never approves anyone.
  IF OLD.status                  IS NOT DISTINCT FROM NEW.status
     AND OLD.price_inr           IS NOT DISTINCT FROM NEW.price_inr
     AND OLD.verified_at         IS NOT DISTINCT FROM NEW.verified_at
     AND OLD.verified_by         IS NOT DISTINCT FROM NEW.verified_by
     AND OLD.verification_notes  IS NOT DISTINCT FROM NEW.verification_notes
     AND NEW.application_submitted_at IS DISTINCT FROM OLD.application_submitted_at
     AND NEW.id_document_path IS NOT NULL
  THEN
    RETURN NEW;
  END IF;

  -- (5) Mentor RESUBMIT (own row, via resubmit_mentor_application): rejected →
  --     pending ONLY, clearing the rejection note + re-stamping; price/verified
  --     untouched; ID document present. NEVER reaches 'approved'.
  IF OLD.status = 'rejected'::public.mentor_status
     AND NEW.status = 'pending'::public.mentor_status
     AND OLD.price_inr           IS NOT DISTINCT FROM NEW.price_inr
     AND OLD.verified_at         IS NOT DISTINCT FROM NEW.verified_at
     AND OLD.verified_by         IS NOT DISTINCT FROM NEW.verified_by
     AND NEW.verification_notes IS NULL
     AND NEW.id_document_path IS NOT NULL
     -- A resubmit MUST re-stamp, so a re-pending app stays visible in the admin
     -- queue (status=pending AND application_submitted_at IS NOT NULL).
     AND NEW.application_submitted_at IS DISTINCT FROM OLD.application_submitted_at
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Mentor status, pricing, and verification fields can only be changed by an administrator.'
    USING ERRCODE = 'P0001';
END;
$$;

COMMENT ON FUNCTION public.prevent_mentor_self_approval() IS
  'BEFORE UPDATE on public.mentors. F1 locked status/price_inr/verified_*/verification_notes to admin/service. Phase 8 (2026-06-05) ALSO treats application_submitted_at as controlled and adds two narrowly-shaped mentor self-service allowances: SUBMIT (only application_submitted_at moves + id_document_path present) and RESUBMIT (rejected→pending + notes cleared + id_document_path present). Neither can reach approved or change price/verified_*. Bypass: service_role / is_admin().';

-- ════════════════════════════════════════════════════════════════════════════
-- submit_mentor_application — stamp application_submitted_at (requires ID doc)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.submit_mentor_application()
RETURNS timestamptz
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_id_doc text;
  v_ts     timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT id_document_path INTO v_id_doc
  FROM public.mentors WHERE id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no mentor profile for the current user' USING ERRCODE = 'P0001';
  END IF;
  IF v_id_doc IS NULL THEN
    RAISE EXCEPTION 'upload your college ID before submitting your application' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.mentors
  SET application_submitted_at = now()
  WHERE id = v_uid
  RETURNING application_submitted_at INTO v_ts;

  RETURN v_ts;
END;
$$;

REVOKE ALL     ON FUNCTION public.submit_mentor_application() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.submit_mentor_application() FROM anon;
GRANT  EXECUTE ON FUNCTION public.submit_mentor_application() TO authenticated, service_role;

COMMENT ON FUNCTION public.submit_mentor_application() IS
  'Phase 8 (2026-06-05): the calling mentor (auth.uid()) marks their application submitted — stamps application_submitted_at = now(). Requires id_document_path IS NOT NULL (42501 unauth / P0001 no-row or no-ID). Does NOT change status (stays pending). The trigger permits the resulting shape; anon REVOKEd.';

-- ════════════════════════════════════════════════════════════════════════════
-- resubmit_mentor_application — rejected → pending ONLY (never approved)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.resubmit_mentor_application()
RETURNS timestamptz
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_status public.mentor_status;
  v_id_doc text;
  v_ts     timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT status, id_document_path INTO v_status, v_id_doc
  FROM public.mentors WHERE id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no mentor profile for the current user' USING ERRCODE = 'P0001';
  END IF;
  IF v_status <> 'rejected'::public.mentor_status THEN
    RAISE EXCEPTION 'only a rejected application can be resubmitted (current status: %)', v_status
      USING ERRCODE = 'P0001';
  END IF;
  IF v_id_doc IS NULL THEN
    RAISE EXCEPTION 'upload your college ID before resubmitting' USING ERRCODE = 'P0001';
  END IF;

  -- The WHERE re-asserts rejected (race guard). Produces the trigger's case-5
  -- shape: rejected→pending, notes cleared, re-stamped. NEVER 'approved'.
  UPDATE public.mentors
  SET status = 'pending'::public.mentor_status,
      verification_notes = NULL,
      application_submitted_at = now()
  WHERE id = v_uid AND status = 'rejected'::public.mentor_status
  RETURNING application_submitted_at INTO v_ts;

  RETURN v_ts;
END;
$$;

REVOKE ALL     ON FUNCTION public.resubmit_mentor_application() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.resubmit_mentor_application() FROM anon;
GRANT  EXECUTE ON FUNCTION public.resubmit_mentor_application() TO authenticated, service_role;

COMMENT ON FUNCTION public.resubmit_mentor_application() IS
  'Phase 8 (2026-06-05): a REJECTED mentor (auth.uid(), own row) resubmits — flips status rejected→pending ONLY, clears verification_notes, re-stamps application_submitted_at. Raises if status<>rejected or no ID doc. Can NEVER reach approved and never touches another user''s row (no params, keyed on auth.uid()). anon REVOKEd.';

-- ════════════════════════════════════════════════════════════════════════════
-- admin_list_mentors — ADD application_submitted_at to the return so the admin
-- queue can show submitted apps only. DROP+CREATE (return-type change). Grants
-- preserved at the prior PUBLIC default (function is is_admin()-gated).
-- ════════════════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.admin_list_mentors(text);

CREATE FUNCTION public.admin_list_mentors(_status text DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  full_name text,
  email text,
  university text,
  course text,
  year text,
  status text,
  created_at timestamptz,
  application_submitted_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
    SELECT m.id, m.full_name, m.email, m.university, m.course, m.year,
           m.status::text, m.created_at, m.application_submitted_at
    FROM public.mentors m
    WHERE _status IS NULL OR m.status::text = _status
    ORDER BY m.created_at DESC;
END;
$$;

COMMENT ON FUNCTION public.admin_list_mentors(text) IS
  'Admin-only (is_admin()) mentor list. Phase 8 (2026-06-05) adds application_submitted_at to the return so the admin queue can filter to submitted applications (status=pending AND application_submitted_at IS NOT NULL).';
