-- RLS Risk 4 (minimal): require mentor.status = 'approved' on booking INSERT.
--
-- Background: audits/2026-05-14/rls-audit.md Risk 4 flagged three holes in
-- the bookings INSERT policy: (a) no mentor approval check, (b) no
-- availability check, (c) client-controlled price. (a) is currently
-- exploitable; (b) and (c) are structural but inert until the Razorpay
-- payments work lands. The audit's recommended fix is a full
-- book_session(_mentor_id, _date, _time_slot) RPC that validates all three
-- server-side and replaces the direct INSERT policy entirely.
--
-- That full RPC is deferred to land alongside payments. This migration ships
-- the minimal fix — tightening the WITH CHECK to require an approved mentor
-- — so the live policy can no longer be bypassed to create a booking
-- against a pending or rejected mentor.
--
-- Verification: supabase/dev-seeds/bug-audit-rls-risk4-verification.sql

DROP POLICY IF EXISTS "Students can create own bookings" ON public.bookings;

CREATE POLICY "Students can create own bookings"
  ON public.bookings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = student_id
    AND EXISTS (
      SELECT 1 FROM public.mentors m
      WHERE m.id     = bookings.mentor_id
        AND m.status = 'approved'
    )
  );

COMMENT ON POLICY "Students can create own bookings" ON public.bookings IS
  'Risk 4 minimal (2026-05-14): students may only book mentors whose status is approved. Availability and price-integrity checks are deferred to the book_session RPC that will land alongside the Razorpay payments work.';
