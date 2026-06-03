-- Child-safety hotfix: remove student email + phone from get_student_overview_for_mentor.
--
-- WHY: this booking-gated SECURITY DEFINER RPC (added in
-- 20260430000002_demo_fix_mentor_student_access.sql) returned the student's
-- email AND phone to the mentor. Many students are MINORS, so this is a live
-- path for an adult to retrieve a minor's direct contact details via a raw RPC
-- call (the fields were serialized over the wire even though no UI rendered
-- them). Rule: contact details must NEVER appear in any cross-party payload.
--
-- WHAT: drop email + phone from BOTH the RETURNS TABLE and the SELECT. Everything
-- else is preserved VERBATIM — the confirmed/completed-booking access gate and
-- every other returned field (full_name, school, grade, documents, schools).
-- No client reads the removed fields: the only two callers
-- (src/components/mentor-dashboard/sections/MyStudentsSection.tsx and
-- MentorUpcomingSessions.tsx) consume only `documents` + `schools`, so this is
-- non-breaking.
--
-- MECHANICS: removing OUT columns changes the function's return type, which
-- CREATE OR REPLACE cannot do ("cannot change return type of existing
-- function"), so this DROPs + re-CREATEs — the same pattern the original
-- migration used. Grants are re-stated to preserve the exact posture
-- (PUBLIC/anon revoked, authenticated granted; service_role retains via
-- Supabase default privileges).
--
-- Idempotent (DROP FUNCTION IF EXISTS; CREATE; REVOKE/GRANT restated).
--
-- Verification: supabase/dev-seeds/hotfix-student-contact-leak-verification.sql

DROP FUNCTION IF EXISTS public.get_student_overview_for_mentor(uuid);

CREATE FUNCTION public.get_student_overview_for_mentor(_student_id uuid)
RETURNS TABLE(
  student_id   uuid,
  full_name    text,
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

REVOKE ALL    ON FUNCTION public.get_student_overview_for_mentor(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_student_overview_for_mentor(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_student_overview_for_mentor(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_student_overview_for_mentor(uuid) IS
  'Child-safety hotfix (2026-06-03): booking-gated mentor view of a student (docs + schools + full_name/school/grade). Student email + phone REMOVED — contact details must never cross the party boundary. Returns zero rows unless the caller has a confirmed/completed booking with the student.';
