CREATE OR REPLACE FUNCTION public.list_approved_mentor_profiles()
RETURNS TABLE (
  id uuid,
  full_name text,
  university text,
  countries text[],
  course text,
  year text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id, m.full_name, m.university, m.countries, m.course, m.year
  FROM public.mentors m
  WHERE m.status = 'approved'::public.mentor_status
  ORDER BY m.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_mentor_booking_names(_ids uuid[])
RETURNS TABLE (
  id uuid,
  full_name text,
  university text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id, m.full_name, m.university
  FROM public.mentors m
  WHERE m.id = ANY(_ids);
$$;

CREATE OR REPLACE FUNCTION public.get_student_booking_names(_ids uuid[])
RETURNS TABLE (
  id uuid,
  full_name text,
  grade text,
  school text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.full_name, s.grade, s.school
  FROM public.students s
  WHERE s.id = ANY(_ids);
$$;

REVOKE ALL ON FUNCTION public.list_approved_mentor_profiles() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_mentor_booking_names(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_student_booking_names(uuid[]) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.list_approved_mentor_profiles() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_mentor_booking_names(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_student_booking_names(uuid[]) TO authenticated;