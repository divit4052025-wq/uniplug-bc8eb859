-- ════════════════════════════════════════════════════════════════════════════
-- Phase 7: student profile finalize — the completion flag + idempotent stamp RPC
-- ════════════════════════════════════════════════════════════════════════════
--
-- WHY: the P1 plan specified a profile-completion gate (students.profile_completed_at
-- + finalize_student_profile()) for the post-verification finalize step, but the
-- column + RPC were missed in the P1 migration. This closes that gap so the P7
-- student signup wizard can:
--   - route an authenticated student whose profile_completed_at IS NULL to the
--     "complete your profile" (finalize) screen, and
--   - stamp completion once the rich profile (the six join tables) + photo have
--     been written client-side via the existing owner-gated RLS paths.
--
-- ADDITIVE ONLY — nothing existing is dropped, renamed, or behaviour-changed:
--   - students: + profile_completed_at timestamptz (nullable; existing INSERT
--     paths, handle_new_user, and every current read keep working untouched —
--     legacy rows simply read NULL until they finalize).
--   - finalize_student_profile(): NEW SECURITY DEFINER RPC. Owner-gated on
--     auth.uid(); idempotent (once set, never overwritten); sets ONLY
--     profile_completed_at. It does NOT touch the join tables or photo_url —
--     those are written by the authenticated client first (owner RLS), and this
--     RPC is the final "mark complete" stamp.
--
-- This RPC moves no money and touches no consent / minor-gating column, so it is
-- a normal db-reviewer item (paired dev-seed below), NOT an adversarial-review
-- gate.
--
-- Idempotent migration (ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE FUNCTION).
--
-- Verification: supabase/dev-seeds/p7-finalize-student-profile-verification.sql
-- ════════════════════════════════════════════════════════════════════════════

-- ─── students: the completion flag (nullable — legacy rows read NULL) ───

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS profile_completed_at timestamptz;

COMMENT ON COLUMN public.students.profile_completed_at IS
  'Phase 7 (2026-06-04): set once the student finishes the post-verification finalize step (rich profile join tables + photo written first). NULL = not yet finalized → the app routes the student to /student-signup/finalize. Set ONLY via finalize_student_profile(); idempotent — never overwritten once stamped.';

-- The consent column-lock (20260604000060) replaced table-wide SELECT on students
-- with a column allowlist for `authenticated`; profile_completed_at post-dates it,
-- so without this grant the client (the finalize redirect gate, which runs as
-- `authenticated`) could not read its OWN completion flag. Grant column-level
-- SELECT — RLS still restricts reads to the owner's row. Deliberately NO UPDATE
-- grant: the column is written only via finalize_student_profile() (DEFINER), so
-- a client cannot self-stamp completion, mirroring the consent-lock posture.
GRANT SELECT (profile_completed_at) ON public.students TO authenticated;

-- ─── finalize_student_profile() — idempotent completion stamp (owner-gated) ───
-- SECURITY DEFINER: the function only ever finalizes the CALLER's own row
-- (auth.uid()); there is no table UPDATE policy that would let a client set this
-- column directly, so DEFINER is the single, audited write path. Idempotent:
-- once profile_completed_at is set it is preserved (the original completion time
-- is the source of truth), so a re-run / double-submit is a safe no-op.
CREATE OR REPLACE FUNCTION public.finalize_student_profile()
RETURNS timestamptz
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_existing timestamptz;
  v_result   timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  -- Must be a real student row — the RPC only finalizes the caller's own profile.
  SELECT profile_completed_at INTO v_existing
  FROM public.students
  WHERE id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no student profile for the current user'
      USING ERRCODE = 'P0001';
  END IF;

  -- Idempotent: once set, never overwritten (preserve the original stamp).
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  UPDATE public.students
  SET profile_completed_at = now()
  WHERE id = v_uid AND profile_completed_at IS NULL
  RETURNING profile_completed_at INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL     ON FUNCTION public.finalize_student_profile() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.finalize_student_profile() FROM anon;
GRANT  EXECUTE ON FUNCTION public.finalize_student_profile() TO authenticated, service_role;

COMMENT ON FUNCTION public.finalize_student_profile() IS
  'Phase 7 (2026-06-04): stamps students.profile_completed_at = now() for the calling student (auth.uid()). Idempotent — returns the existing stamp unchanged if already set, so a double-submit is a safe no-op. Sets ONLY profile_completed_at; the rich-profile join tables + photo are written client-side (owner RLS) before this is called. Raises 42501 if unauthenticated, P0001 if the caller has no student row. EXECUTE granted to authenticated + service_role; REVOKEd from anon.';
