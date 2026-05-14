-- RLS write-gating hardening — Risks 1, 2, 3, 5 + mentor self-approval.
--
-- Background: audits/2026-05-14/rls-audit.md. Each policy below today only
-- verifies the actor's identity (auth.uid() = mentor_id / student_id) but
-- not the underlying business relationship — so a logged-in mentor can
-- write a session note for any student, a logged-in student can review any
-- mentor, etc. This migration adds the missing EXISTS check on
-- public.bookings (or session_notes ownership) to each WITH CHECK clause,
-- plus a BEFORE UPDATE trigger on public.mentors that blocks self-approval.
--
-- Out of scope: Risk 4 (bookings INSERT → book_session RPC) is intentionally
-- not addressed here — tracked as a separate decision.
--
-- Verification: supabase/dev-seeds/bug-audit-rls-write-gating-verification.sql

-- ──────────────────────────────────────────────────────────────────────────
-- Risk 1: session_notes — mentor must have a booking with the target student
-- ──────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Mentor insert notes" ON public.session_notes;
DROP POLICY IF EXISTS "Mentor update notes" ON public.session_notes;

CREATE POLICY "Mentor insert notes"
  ON public.session_notes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = mentor_id
    AND EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.mentor_id  = auth.uid()
        AND b.student_id = session_notes.student_id
        AND b.status IN ('confirmed', 'completed')
    )
  );

CREATE POLICY "Mentor update notes"
  ON public.session_notes
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = mentor_id)
  WITH CHECK (
    auth.uid() = mentor_id
    AND EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.mentor_id  = auth.uid()
        AND b.student_id = session_notes.student_id
        AND b.status IN ('confirmed', 'completed')
    )
  );

COMMENT ON POLICY "Mentor insert notes" ON public.session_notes IS
  'Risk 1 of the 2026-05-14 RLS audit. Mentor may author a session note only when an underlying confirmed or completed booking with the target student exists.';
COMMENT ON POLICY "Mentor update notes" ON public.session_notes IS
  'See "Mentor insert notes". UPDATE applies the same booking-check gate to the NEW row.';

-- ──────────────────────────────────────────────────────────────────────────
-- Risk 2: session_action_points (legacy table — frontend has moved to
-- session_notes.action_points JSON). Paired check is added until the
-- table is dropped in a follow-up.
-- ──────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Mentor insert action points" ON public.session_action_points;
DROP POLICY IF EXISTS "Mentor update action points" ON public.session_action_points;

CREATE POLICY "Mentor insert action points"
  ON public.session_action_points
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = mentor_id
    AND EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.mentor_id  = auth.uid()
        AND b.student_id = session_action_points.student_id
        AND b.status IN ('confirmed', 'completed')
    )
  );

CREATE POLICY "Mentor update action points"
  ON public.session_action_points
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = mentor_id)
  WITH CHECK (
    auth.uid() = mentor_id
    AND EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.mentor_id  = auth.uid()
        AND b.student_id = session_action_points.student_id
        AND b.status IN ('confirmed', 'completed')
    )
  );

COMMENT ON POLICY "Mentor insert action points" ON public.session_action_points IS
  'Risk 2 of the 2026-05-14 RLS audit. Same shape as Risk 1; the table is legacy and slated for removal in a follow-up.';

-- ──────────────────────────────────────────────────────────────────────────
-- Risk 3: action_point_completions — student may only mark completion for
-- a session_note that belongs to them.
-- ──────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Students insert own completions" ON public.action_point_completions;
DROP POLICY IF EXISTS "Students update own completions" ON public.action_point_completions;

CREATE POLICY "Students insert own completions"
  ON public.action_point_completions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = student_id
    AND EXISTS (
      SELECT 1 FROM public.session_notes n
      WHERE n.id         = action_point_completions.session_note_id
        AND n.student_id = auth.uid()
    )
  );

CREATE POLICY "Students update own completions"
  ON public.action_point_completions
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = student_id)
  WITH CHECK (
    auth.uid() = student_id
    AND EXISTS (
      SELECT 1 FROM public.session_notes n
      WHERE n.id         = action_point_completions.session_note_id
        AND n.student_id = auth.uid()
    )
  );

COMMENT ON POLICY "Students insert own completions" ON public.action_point_completions IS
  'Risk 3 of the 2026-05-14 RLS audit. Student may only mark an action point complete when the parent session_note is theirs.';
COMMENT ON POLICY "Students update own completions" ON public.action_point_completions IS
  'See "Students insert own completions". UPDATE applies the same note-ownership gate.';

-- ──────────────────────────────────────────────────────────────────────────
-- Risk 5: reviews — student may only review a mentor they have a
-- *completed* booking with.
-- ──────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Students insert own reviews" ON public.reviews;
DROP POLICY IF EXISTS "Students update own reviews" ON public.reviews;

CREATE POLICY "Students insert own reviews"
  ON public.reviews
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = student_id
    AND EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.student_id = auth.uid()
        AND b.mentor_id  = reviews.mentor_id
        AND b.status     = 'completed'
    )
  );

CREATE POLICY "Students update own reviews"
  ON public.reviews
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = student_id)
  WITH CHECK (
    auth.uid() = student_id
    AND EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.student_id = auth.uid()
        AND b.mentor_id  = reviews.mentor_id
        AND b.status     = 'completed'
    )
  );

COMMENT ON POLICY "Students insert own reviews" ON public.reviews IS
  'Risk 5 of the 2026-05-14 RLS audit. Reviews require an underlying completed booking — prevents fake ratings on a mentor''s public profile.';
COMMENT ON POLICY "Students update own reviews" ON public.reviews IS
  'See "Students insert own reviews".';

-- ──────────────────────────────────────────────────────────────────────────
-- Mentor self-approval: BEFORE UPDATE trigger on public.mentors blocking
-- status changes by non-admin callers.
--
-- Why a trigger instead of a tighter WITH CHECK: the alias-rewrite tautology
-- bug from the April 30 demo demonstrated that WITH CHECK clauses comparing
-- a column to itself via a subquery can be inadvertently true-everywhere. A
-- trigger comparing OLD.status to NEW.status is unambiguous.
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.prevent_mentor_self_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Allow no-op (status unchanged) — mentors can still update other fields.
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- Service-role calls (server-side scripts, seed) bypass the trigger.
  IF coalesce(auth.jwt() ->> 'role', '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Admin callers (including admin_set_mentor_status, which runs as
  -- SECURITY DEFINER but preserves the original auth.uid()) are allowed.
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Mentor status can only be changed by an administrator.'
    USING ERRCODE = 'P0001';
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_mentor_self_approval() FROM public;
REVOKE EXECUTE ON FUNCTION public.prevent_mentor_self_approval() FROM anon;
GRANT EXECUTE ON FUNCTION public.prevent_mentor_self_approval() TO authenticated, service_role;

DROP TRIGGER IF EXISTS mentors_prevent_self_approval ON public.mentors;
CREATE TRIGGER mentors_prevent_self_approval
  BEFORE UPDATE ON public.mentors
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_mentor_self_approval();

COMMENT ON FUNCTION public.prevent_mentor_self_approval() IS
  'BEFORE UPDATE trigger on public.mentors. Blocks any change to the status column unless the caller is_admin() or service_role. Admin updates via admin_set_mentor_status pass because the trigger evaluates is_admin() against auth.uid() of the original caller.';
