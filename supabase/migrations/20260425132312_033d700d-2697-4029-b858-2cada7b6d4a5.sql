
-- Helper: check whether current auth user is the admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = auth.uid()
      AND lower(u.email) = lower('divitfatehpuria7@gmail.com')
  );
$$;

-- Admin RPCs ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_list_mentors(_status text DEFAULT NULL)
RETURNS TABLE (
  id uuid,
  full_name text,
  email text,
  university text,
  course text,
  year text,
  status text,
  created_at timestamptz
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
    SELECT m.id, m.full_name, m.email, m.university, m.course, m.year,
           m.status::text, m.created_at
    FROM public.mentors m
    WHERE _status IS NULL OR m.status::text = _status
    ORDER BY m.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_students()
RETURNS TABLE (
  id uuid,
  full_name text,
  email text,
  grade text,
  school text,
  created_at timestamptz
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
    SELECT s.id, s.full_name, s.email, s.grade, s.school, s.created_at
    FROM public.students s
    ORDER BY s.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_mentor_status(_mentor_id uuid, _status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _status NOT IN ('approved', 'rejected', 'pending') THEN
    RAISE EXCEPTION 'invalid status';
  END IF;
  UPDATE public.mentors SET status = _status::public.mentor_status WHERE id = _mentor_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_bookings()
RETURNS TABLE (
  id uuid,
  student_id uuid,
  student_name text,
  mentor_id uuid,
  mentor_name text,
  date date,
  time_slot text,
  status text,
  price integer,
  created_at timestamptz
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
    SELECT b.id, b.student_id, s.full_name, b.mentor_id, m.full_name,
           b.date, b.time_slot, b.status, b.price, b.created_at
    FROM public.bookings b
    LEFT JOIN public.students s ON s.id = b.student_id
    LEFT JOIN public.mentors m ON m.id = b.mentor_id
    ORDER BY b.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_stats()
RETURNS TABLE (
  total_students bigint,
  total_mentors bigint,
  sessions_this_month bigint,
  revenue_this_month bigint,
  total_revenue_all_time bigint,
  total_sessions_all_time bigint
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
      (SELECT count(*) FROM public.students),
      (SELECT count(*) FROM public.mentors),
      (SELECT count(*) FROM public.bookings WHERE date_trunc('month', created_at) = date_trunc('month', now())),
      (SELECT COALESCE(sum(price), 0) FROM public.bookings WHERE date_trunc('month', created_at) = date_trunc('month', now())),
      (SELECT COALESCE(sum(price), 0) FROM public.bookings),
      (SELECT count(*) FROM public.bookings);
END;
$$;
