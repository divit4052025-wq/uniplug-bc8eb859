-- Fix 2 (initial attempt): Policy form with self-referential WITH CHECK.
-- SUPERSEDED by 20260430000004_demo_fix_bookings_mentor_update_rpc.sql
-- Postgres re-aliases the correlated subquery (bookings.id → bookings_1.id = bookings_1.id),
-- turning the column-immutability checks into tautologies. RPC fallback required.

DROP POLICY IF EXISTS "Mentors can update their bookings" ON public.bookings;

CREATE POLICY "Mentors can update status of their bookings"
ON public.bookings
FOR UPDATE
TO authenticated
USING (auth.uid() = mentor_id)
WITH CHECK (
  auth.uid() = mentor_id
  AND mentor_id  = (SELECT mentor_id  FROM public.bookings WHERE id = bookings.id)
  AND student_id = (SELECT student_id FROM public.bookings WHERE id = bookings.id)
  AND date       = (SELECT date       FROM public.bookings WHERE id = bookings.id)
  AND time_slot  = (SELECT time_slot  FROM public.bookings WHERE id = bookings.id)
  AND duration   = (SELECT duration   FROM public.bookings WHERE id = bookings.id)
  AND price      = (SELECT price      FROM public.bookings WHERE id = bookings.id)
  AND status IN ('cancelled', 'completed')
);
