-- Fix 1: SECURITY DEFINER RPC so mentors can read docs/schools for their booked students.
-- Direct RLS SELECT on student_documents/student_schools blocks all cross-user reads;
-- this gate checks booking ownership before projecting the data.

DROP FUNCTION IF EXISTS public.get_student_overview_for_mentor(uuid);

CREATE FUNCTION public.get_student_overview_for_mentor(_student_id uuid)
RETURNS TABLE(
  student_id   uuid,
  full_name    text,
  email        text,
  phone        text,
  school       text,
  grade        text,
  documents    jsonb,
  schools      jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Return zero rows unless caller has a confirmed/completed booking with this student.
  IF NOT EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.mentor_id  = auth.uid()
      AND b.student_id = _student_id
      AND b.status IN ('confirmed', 'completed')
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    s.id        AS student_id,
    s.full_name,
    s.email,
    s.phone,
    s.school,
    s.grade,
    COALESCE(
      (SELECT jsonb_agg(
          jsonb_build_object(
            'id',           d.id,
            'file_name',    d.file_name,
            'storage_path', d.storage_path,
            'size_bytes',   d.size_bytes,
            'created_at',   d.created_at
          ) ORDER BY d.created_at DESC
        )
        FROM public.student_documents d
        WHERE d.student_id = _student_id
      ),
      '[]'::jsonb
    ) AS documents,
    COALESCE(
      (SELECT jsonb_agg(
          jsonb_build_object(
            'id',         sc.id,
            'name',       sc.name,
            'category',   sc.category,
            'created_at', sc.created_at
          ) ORDER BY sc.created_at DESC
        )
        FROM public.student_schools sc
        WHERE sc.student_id = _student_id
      ),
      '[]'::jsonb
    ) AS schools
  FROM public.students s
  WHERE s.id = _student_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_student_overview_for_mentor(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_student_overview_for_mentor(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_student_overview_for_mentor(uuid) TO authenticated;
