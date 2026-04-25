ALTER TABLE public.mentors
ADD COLUMN IF NOT EXISTS price_inr integer NOT NULL DEFAULT 1800;

DROP FUNCTION IF EXISTS public.list_approved_mentor_profiles();

CREATE FUNCTION public.list_approved_mentor_profiles()
RETURNS TABLE (
  id uuid,
  full_name text,
  university text,
  countries text[],
  course text,
  year text,
  price_inr integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id, m.full_name, m.university, m.countries, m.course, m.year, m.price_inr
  FROM public.mentors m
  WHERE m.status = 'approved'::public.mentor_status
  ORDER BY m.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.list_approved_mentor_profiles() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_approved_mentor_profiles() TO authenticated;