-- Fix 2 (corrective): Drop the broken policy form, replace with SECURITY DEFINER RPC.
-- The self-referential WITH CHECK policy was a tautology (Postgres alias rewriting).
-- Mentors must now call update_booking_status_as_mentor() — no direct UPDATE path exists.

DROP POLICY IF EXISTS "Mentors can update status of their bookings" ON public.bookings;

CREATE OR REPLACE FUNCTION public.update_booking_status_as_mentor(
  _booking_id  uuid,
  _new_status  text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF _new_status NOT IN ('cancelled', 'completed') THEN
    RAISE EXCEPTION 'status must be cancelled or completed';
  END IF;

  UPDATE public.bookings
  SET    status = _new_status
  WHERE  id        = _booking_id
    AND  mentor_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking not found or not owned by caller';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.update_booking_status_as_mentor(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_booking_status_as_mentor(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_booking_status_as_mentor(uuid, text) TO authenticated;
