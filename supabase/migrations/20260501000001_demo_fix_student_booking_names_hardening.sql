-- Fix 5: Harden get_student_booking_names.
-- Three gaps closed:
--   1. No ownership gate — any caller could look up any student by UUID.
--   2. anon had EXECUTE — unauthenticated callers could enumerate student profiles.
--   3. search_path missing pg_temp — open to temp-schema substitution.
--
-- New body silently filters the input array to IDs the caller has at least one
-- confirmed or completed booking with. Unauthorised IDs are dropped, not raised.

CREATE OR REPLACE FUNCTION public.get_student_booking_names(_ids uuid[])
RETURNS TABLE(id uuid, full_name text, grade text, school text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT s.id, s.full_name, s.grade, s.school
  FROM public.students s
  WHERE s.id = ANY(_ids)
    AND EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.mentor_id  = auth.uid()
        AND b.student_id = s.id
        AND b.status IN ('confirmed', 'completed')
    );
$$;

REVOKE ALL ON FUNCTION public.get_student_booking_names(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_student_booking_names(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_student_booking_names(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_student_booking_names(uuid[]) TO service_role;
