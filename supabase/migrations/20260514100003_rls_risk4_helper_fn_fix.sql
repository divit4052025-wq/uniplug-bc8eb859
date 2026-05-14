-- Risk 4 follow-up: SECURITY DEFINER helper to make the booking-approval
-- check work under RLS.
--
-- The previous migration (20260514100002) added a WITH CHECK clause with an
-- inline EXISTS subquery against public.mentors. When evaluated for a
-- student-authenticated caller, the subquery is *itself* subject to the
-- mentors SELECT policy ("Mentors can view own row" — auth.uid() = id).
-- Students aren't mentors, so the subquery returned zero rows and even
-- legitimate bookings of approved mentors were denied.
--
-- The dev-seed for R4.3 ("book APPROVED mentor → succeed") flagged this as
-- a FAIL on its first run. This migration fixes it by introducing
-- public.is_approved_mentor(uuid) — a SECURITY DEFINER helper that runs as
-- the function owner, bypassing the mentors RLS — and rewriting the WITH
-- CHECK to use it.
--
-- Idempotent: a fresh database can apply both 100002 and 100003 in sequence
-- and end up with the correct policy in place.

CREATE OR REPLACE FUNCTION public.is_approved_mentor(_mentor_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.mentors
    WHERE id     = _mentor_id
      AND status = 'approved'
  );
$$;

REVOKE ALL ON FUNCTION public.is_approved_mentor(uuid) FROM public;
REVOKE EXECUTE ON FUNCTION public.is_approved_mentor(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_approved_mentor(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Students can create own bookings" ON public.bookings;

CREATE POLICY "Students can create own bookings"
  ON public.bookings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = student_id
    AND public.is_approved_mentor(mentor_id)
  );

COMMENT ON FUNCTION public.is_approved_mentor(uuid) IS
  'SECURITY DEFINER helper for the bookings INSERT WITH CHECK. Returns true iff the target mentor exists with status = approved. Bypasses RLS on public.mentors so a student caller can validate without being able to read the mentor row directly.';

COMMENT ON POLICY "Students can create own bookings" ON public.bookings IS
  'Risk 4 minimal (2026-05-14): students may only book mentors whose status is approved, via SECURITY DEFINER helper public.is_approved_mentor. Availability and price-integrity checks are deferred to the book_session RPC that will land alongside Razorpay payments.';
