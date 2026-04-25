DROP POLICY IF EXISTS "Authenticated users view mentor availability" ON public.mentor_availability;
CREATE POLICY "Authenticated users view mentor availability"
ON public.mentor_availability
FOR SELECT
TO authenticated
USING (true);