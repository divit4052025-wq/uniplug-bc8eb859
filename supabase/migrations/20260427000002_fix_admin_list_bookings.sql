-- Fix admin_list_bookings: never return NULL for student_name or mentor_name.
-- Student fallback chain: students.full_name → auth.users.email → student_id::text
-- Mentor  fallback chain: mentors.full_name  → mentors.email        → mentor_id::text
--
-- The LEFT JOIN on auth.users (schema: auth) is safe here because the function
-- runs as SECURITY DEFINER (owner = postgres) which has SELECT on auth.users.

CREATE OR REPLACE FUNCTION public.admin_list_bookings()
RETURNS TABLE (
  id          uuid,
  student_id  uuid,
  student_name text,
  mentor_id   uuid,
  mentor_name text,
  date        date,
  time_slot   text,
  status      text,
  price       integer,
  created_at  timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
    SELECT
      b.id,
      b.student_id,
      COALESCE(s.full_name, u.email, b.student_id::text) AS student_name,
      b.mentor_id,
      COALESCE(m.full_name, m.email, b.mentor_id::text)  AS mentor_name,
      b.date,
      b.time_slot,
      b.status,
      b.price,
      b.created_at
    FROM public.bookings b
    LEFT JOIN public.students s  ON s.id = b.student_id
    LEFT JOIN auth.users      u  ON u.id = b.student_id
    LEFT JOIN public.mentors  m  ON m.id = b.mentor_id
    ORDER BY b.created_at DESC;
END;
$$;
