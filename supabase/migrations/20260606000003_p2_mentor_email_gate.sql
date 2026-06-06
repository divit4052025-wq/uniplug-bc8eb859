-- ════════════════════════════════════════════════════════════════════════════
-- Phase 2 — two-track mentor email gate (minor-vetting layer). LOCAL-only; HOLD.
-- ════════════════════════════════════════════════════════════════════════════
-- A mentor's college email is classified at signup into a tier:
--   standard — a positively-recognized institutional domain (TLD pattern OR a
--              ref_academic_domains hit). Lighter path (college-ID only).
--   enhanced — EVERYTHING ELSE (gmail/personal/unknown/ambiguous/NULL/malformed).
--              Must also upload an enrollment proof before submitting.
--
-- SECURITY INVARIANTS (this gates who mentors minors):
--  • FAIL-CLOSED CLASSIFIER: validate_college_email() returns 'standard' ONLY on a
--    positive institutional match; every uncertainty (NULL/malformed/unknown) → 'enhanced'.
--  • FAIL-CLOSED ENFORCEMENT (server-side, the gate): submit_mentor_application() AND
--    resubmit_mentor_application() refuse an 'enhanced' applicant with no enrollment
--    proof — AND prevent_mentor_self_approval enforces the SAME at the data layer (cases
--    4/5), so a direct UPDATE (not just the RPC) cannot move an enhanced application to
--    submitted/pending without the proof. The M1 client nudge is advisory, never the gate.
--  • TIER IS SERVER-DERIVED, NEVER CLIENT-SET: a BEFORE INSERT trigger computes
--    tier := validate_college_email(college_email); client signup metadata cannot set tier.
--  • NO TIER DRIFT: prevent_mentor_self_approval now locks BOTH tier AND college_email
--    (a mentor can't self-downgrade enhanced→standard, nor change the email the tier
--    was derived from — the DOB-immutable precedent). Admin/service_role still set both.
--
-- DEVIATION FROM THE APPROVED PLAN (flagged): tier is set at signup via a focused
--   BEFORE INSERT trigger on mentors (set_mentor_tier) rather than by rewriting the
--   222-line, signup-critical handle_new_user. Same outcome (tier server-derived from
--   college_email at signup); far lower blast radius; covers every insert path. The
--   dev-seed proves both student AND mentor signup still succeed.
--
-- Paired dev-seed: supabase/dev-seeds/p2-mentor-email-gate-verification.sql
-- Ordering matters: the backfill (4) runs BEFORE the trigger gains the tier lock (6).
-- ════════════════════════════════════════════════════════════════════════════

-- ─── (1) tier enum ───
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'mentor_tier') THEN
    CREATE TYPE public.mentor_tier AS ENUM ('standard', 'enhanced');
  END IF;
END $$;

-- ─── (2) classifier — fail-closed to 'enhanced'; 'standard' only on a positive match ───
CREATE OR REPLACE FUNCTION public.validate_college_email(_email text)
RETURNS public.mentor_tier
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    -- NULL / malformed (no single @, no dotted domain, whitespace) → fail-closed
    WHEN _email IS NULL
      OR _email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
      THEN 'enhanced'::public.mentor_tier
    -- institutional TLD pattern
    WHEN lower(split_part(_email, '@', 2)) ~ '\.(ac\.in|edu\.in|edu|res\.in)$'
      THEN 'standard'::public.mentor_tier
    -- explicit allowlist (exact domain or a sub-domain of an allowlisted domain)
    WHEN EXISTS (
      SELECT 1 FROM public.ref_academic_domains d
      WHERE lower(split_part(_email, '@', 2)) = d.domain
         OR lower(split_part(_email, '@', 2)) LIKE '%.' || d.domain
    ) THEN 'standard'::public.mentor_tier
    ELSE 'enhanced'::public.mentor_tier
  END;
$$;
-- server-internal only (signup trigger / backfill / never the client) — minimal surface
REVOKE ALL     ON FUNCTION public.validate_college_email(text) FROM PUBLIC;
-- REVOKE-from-PUBLIC does NOT remove Supabase's default per-role grants to anon /
-- authenticated, so revoke those explicitly (server-internal function).
REVOKE EXECUTE ON FUNCTION public.validate_college_email(text) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.validate_college_email(text) TO service_role;
COMMENT ON FUNCTION public.validate_college_email(text) IS
  'Phase 2 (2026-06-06): classifies a mentor college email into mentor_tier. STANDARD only on a positive institutional match (.ac.in/.edu.in/.edu/.res.in TLD OR a ref_academic_domains hit incl. sub-domains); EVERYTHING else (NULL/malformed/unknown) → ENHANCED (fail-closed). Never raises, never blocks. Server-internal (anon/PUBLIC revoked).';

-- ─── (3) tier column (fail-closed default) ───
ALTER TABLE public.mentors ADD COLUMN IF NOT EXISTS tier public.mentor_tier NOT NULL DEFAULT 'enhanced';

-- ─── (4) backfill existing/legacy rows: run the validator on the stored email.
--          Recognized institutional email → standard; NULL/legacy/unknown stay enhanced.
--          Runs before step (6), so the self-approval trigger does not yet lock tier
--          (the existing case-1 no-op permits it — status/price/verified/notes/submitted
--          all unchanged). On re-apply, tier is already correct → a same-value UPDATE,
--          which case-1 also permits. ───
UPDATE public.mentors SET tier = public.validate_college_email(college_email);

-- ─── (5) tier set at signup, SERVER-SIDE, from the email (never client metadata) ───
CREATE OR REPLACE FUNCTION public.set_mentor_tier()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.tier := public.validate_college_email(NEW.college_email);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS mentors_set_tier ON public.mentors;
CREATE TRIGGER mentors_set_tier
  BEFORE INSERT ON public.mentors
  FOR EACH ROW EXECUTE FUNCTION public.set_mentor_tier();

-- ─── (6) lock tier + college_email in the self-approval guard (no drift, no self-downgrade) ───
CREATE OR REPLACE FUNCTION public.prevent_mentor_self_approval()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- (1) No-op: no admin-controlled column changed (incl. submitted flag, tier, email).
  IF OLD.status                  IS NOT DISTINCT FROM NEW.status
     AND OLD.price_inr           IS NOT DISTINCT FROM NEW.price_inr
     AND OLD.verified_at         IS NOT DISTINCT FROM NEW.verified_at
     AND OLD.verified_by         IS NOT DISTINCT FROM NEW.verified_by
     AND OLD.verification_notes  IS NOT DISTINCT FROM NEW.verification_notes
     AND OLD.application_submitted_at IS NOT DISTINCT FROM NEW.application_submitted_at
     AND OLD.tier                IS NOT DISTINCT FROM NEW.tier
     AND OLD.college_email       IS NOT DISTINCT FROM NEW.college_email
  THEN
    RETURN NEW;
  END IF;

  -- (2)/(3) service_role / admin bypass (admin approve/reject/set-status/email/tier).
  IF coalesce(auth.jwt() ->> 'role', '') = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  -- (4) Mentor SUBMIT: ONLY application_submitted_at moves; status/price/verified/
  --     notes/tier/email unchanged; college-ID present. Never approves anyone.
  IF OLD.status                  IS NOT DISTINCT FROM NEW.status
     AND OLD.price_inr           IS NOT DISTINCT FROM NEW.price_inr
     AND OLD.verified_at         IS NOT DISTINCT FROM NEW.verified_at
     AND OLD.verified_by         IS NOT DISTINCT FROM NEW.verified_by
     AND OLD.verification_notes  IS NOT DISTINCT FROM NEW.verification_notes
     AND OLD.tier                IS NOT DISTINCT FROM NEW.tier
     AND OLD.college_email       IS NOT DISTINCT FROM NEW.college_email
     AND NEW.application_submitted_at IS DISTINCT FROM OLD.application_submitted_at
     AND NEW.id_document_path IS NOT NULL
     -- ENHANCED track: the enrollment proof is mandatory even on a direct UPDATE
     -- (the gate must hold at the data layer, not only inside the RPC).
     AND (NEW.tier <> 'enhanced'::public.mentor_tier OR NEW.enrollment_letter_path IS NOT NULL)
  THEN
    RETURN NEW;
  END IF;

  -- (5) Mentor RESUBMIT: rejected → pending ONLY, clearing the note + re-stamping;
  --     price/verified/tier/email untouched; ID present. NEVER reaches 'approved'.
  IF OLD.status = 'rejected'::public.mentor_status
     AND NEW.status = 'pending'::public.mentor_status
     AND OLD.price_inr           IS NOT DISTINCT FROM NEW.price_inr
     AND OLD.verified_at         IS NOT DISTINCT FROM NEW.verified_at
     AND OLD.verified_by         IS NOT DISTINCT FROM NEW.verified_by
     AND OLD.tier                IS NOT DISTINCT FROM NEW.tier
     AND OLD.college_email       IS NOT DISTINCT FROM NEW.college_email
     AND NEW.verification_notes IS NULL
     AND NEW.id_document_path IS NOT NULL
     AND NEW.application_submitted_at IS DISTINCT FROM OLD.application_submitted_at
     -- ENHANCED track: enrollment proof mandatory on resubmit too (direct-UPDATE-safe).
     AND (NEW.tier <> 'enhanced'::public.mentor_tier OR NEW.enrollment_letter_path IS NOT NULL)
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Mentor status, pricing, verification, tier, and college email can only be changed by an administrator.'
    USING ERRCODE = 'P0001';
END;
$function$;

-- ─── (7) enhanced enrollment-proof enforcement (server-side, fail-closed) ───
CREATE OR REPLACE FUNCTION public.submit_mentor_application()
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_id_doc text;
  v_tier   public.mentor_tier;
  v_enroll text;
  v_ts     timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  SELECT id_document_path, tier, enrollment_letter_path
    INTO v_id_doc, v_tier, v_enroll
  FROM public.mentors WHERE id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no mentor profile for the current user' USING ERRCODE = 'P0001';
  END IF;
  IF v_id_doc IS NULL THEN
    RAISE EXCEPTION 'upload your college ID before submitting your application' USING ERRCODE = 'P0001';
  END IF;
  IF v_tier = 'enhanced'::public.mentor_tier AND v_enroll IS NULL THEN
    RAISE EXCEPTION 'upload your enrollment proof before submitting (enhanced review)' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.mentors SET application_submitted_at = now()
  WHERE id = v_uid RETURNING application_submitted_at INTO v_ts;
  RETURN v_ts;
END;
$$;
REVOKE ALL     ON FUNCTION public.submit_mentor_application() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.submit_mentor_application() FROM anon;
GRANT  EXECUTE ON FUNCTION public.submit_mentor_application() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.resubmit_mentor_application()
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_status public.mentor_status;
  v_id_doc text;
  v_tier   public.mentor_tier;
  v_enroll text;
  v_ts     timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  SELECT status, id_document_path, tier, enrollment_letter_path
    INTO v_status, v_id_doc, v_tier, v_enroll
  FROM public.mentors WHERE id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no mentor profile for the current user' USING ERRCODE = 'P0001';
  END IF;
  IF v_status <> 'rejected'::public.mentor_status THEN
    RAISE EXCEPTION 'only a rejected application can be resubmitted (current status: %)', v_status USING ERRCODE = 'P0001';
  END IF;
  IF v_id_doc IS NULL THEN
    RAISE EXCEPTION 'upload your college ID before resubmitting' USING ERRCODE = 'P0001';
  END IF;
  IF v_tier = 'enhanced'::public.mentor_tier AND v_enroll IS NULL THEN
    RAISE EXCEPTION 'upload your enrollment proof before resubmitting (enhanced review)' USING ERRCODE = 'P0001';
  END IF;
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

-- ─── (8) admin queue surfaces the track (DROP+CREATE adds tier to the return) ───
DROP FUNCTION IF EXISTS public.admin_list_mentors(text);
CREATE FUNCTION public.admin_list_mentors(_status text DEFAULT NULL::text)
RETURNS TABLE(id uuid, full_name text, email text, university text, course text,
              year text, status text, tier text, created_at timestamptz,
              application_submitted_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
    SELECT m.id, m.full_name, m.email, m.university, m.course, m.year,
           m.status::text, m.tier::text, m.created_at, m.application_submitted_at
    FROM public.mentors m
    WHERE _status IS NULL OR m.status::text = _status
    ORDER BY m.created_at DESC;
END;
$function$;
COMMENT ON FUNCTION public.admin_list_mentors(text) IS
  'Phase 2 (2026-06-06): admin-only mentor queue. Adds tier (standard|enhanced) so the queue can flag enhanced-review applicants. is_admin()-gated.';
