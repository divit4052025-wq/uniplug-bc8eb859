-- ════════════════════════════════════════════════════════════════════════════
-- A4 — Lock the reviews table.
-- ════════════════════════════════════════════════════════════════════════════
-- PROBLEM: reviews.SELECT was "Authenticated can view reviews" USING(true)
--   (20260425130746:13-14) — ANY signed-in user (incl. a minor) could raw-query
--   EVERY review row: the raw reviewer UUID (student_id), mentor_id, rating, and
--   full free-text review. UI masking did not restrict table-level access, and
--   get_review_student_names(uuid[]) (20260604000020:230-238) let any caller turn
--   a reviewer UUID into a first name — a de-anonymisation oracle for minors.
--
-- FIX (all ADDITIVE / reversible — no table or column drops):
--   1. Public per-mentor review LIST goes through a NEW SECURITY DEFINER RPC
--      get_mentor_reviews(_mentor_id) gated on APPROVED mentors that NEVER
--      returns student_id (reviewer first name only, mirroring the masking idiom
--      in get_review_student_names). Granted to anon + authenticated.
--   2. Close the UUID->first-name oracle: revoke EXECUTE on
--      get_review_student_names from public callers. The function stays defined;
--      after this migration the app no longer calls it (the mentor profile reads
--      get_mentor_reviews), so it is revoked from anon + authenticated too.
--   3. Tighten the table SELECT to OWN ROWS only (auth.uid() = student_id). This
--      still covers the "already reviewed"/eligibility own-rows reads in
--      mentor.$id.tsx and PastSessionsSection.tsx.
--
-- Aggregates are unchanged: get_mentor_rating_summary / get_mentor_public_profile
-- already expose avg/count for approved mentors via SECURITY DEFINER.
-- INSERT/UPDATE (20260514100001:142-169, completed-booking gate) and DELETE
-- (20260425130746:24-26) policies are deliberately left untouched.
--
-- Verification: supabase/dev-seeds/a4-reviews-scoped-access-verification.sql
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Public per-mentor review list — approved mentors only, never returns
--    student_id; reviewer first name resolved from students.full_name.
CREATE OR REPLACE FUNCTION public.get_mentor_reviews(_mentor_id uuid)
RETURNS TABLE (id uuid, rating smallint, review text, created_at timestamptz, reviewer_first_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT r.id, r.rating, r.review, r.created_at,
         split_part(COALESCE(s.full_name, ''), ' ', 1) AS reviewer_first_name
    FROM public.reviews r
    JOIN public.mentors m ON m.id = r.mentor_id AND m.status = 'approved'
    LEFT JOIN public.students s ON s.id = r.student_id
   WHERE r.mentor_id = _mentor_id
   ORDER BY r.created_at DESC;
$$;
REVOKE ALL ON FUNCTION public.get_mentor_reviews(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_mentor_reviews(uuid) TO anon, authenticated;

-- 2. Close the UUID->first-name oracle. No app caller remains after step 3's
--    repoint (the mentor profile now reads get_mentor_reviews), so revoke from
--    every grantee. The function itself is kept (additive, no DROP).
REVOKE EXECUTE ON FUNCTION public.get_review_student_names(uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_review_student_names(uuid[]) FROM anon, authenticated;

-- 3. Tighten the table SELECT to own rows. Public/aggregate reads now go through
--    the SECURITY DEFINER RPCs above.
DROP POLICY IF EXISTS "Authenticated can view reviews" ON public.reviews;
CREATE POLICY "Students view own reviews" ON public.reviews
  FOR SELECT TO authenticated USING (auth.uid() = student_id);

COMMENT ON POLICY "Students view own reviews" ON public.reviews IS
  'A4 (child-safety): reviews are own-rows only at the table level; the public '
  'per-mentor list is served by get_mentor_reviews() (approved-mentor gated, no '
  'student_id). Replaces the prior USING(true) policy that leaked every review '
  'row + raw reviewer UUID to any authenticated user, including minors.';

COMMENT ON FUNCTION public.get_mentor_reviews(uuid) IS
  'A4 (child-safety): public per-mentor review list for APPROVED mentors only. '
  'Returns reviewer first name (never student_id) so a minor reviewer cannot be '
  'de-anonymised. SECURITY DEFINER over the own-rows reviews SELECT policy.';
