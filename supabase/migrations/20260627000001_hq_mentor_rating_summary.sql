-- ============================================================================
-- get_mentor_rating_summary() — read-only avg/count + star1..star5 breakdown.
-- ============================================================================
-- WHY: the mentor profile page already reads avg_rating/review_count from
-- get_mentor_public_profile (20260604000020_b_profile_masking.sql). This adds a
-- sibling, single-purpose accessor that ALSO returns the per-star distribution
-- (star1..star5) to power a ratings histogram, reusing the exact same aggregate
-- idiom (round(avg(rating),1) / count(*)) and the same SECURITY DEFINER + grant
-- posture so the two numbers never disagree.
--
-- POSTURE: reviews.SELECT is authenticated-only (no anon policy); the public
-- profile RPC already exposes avg_rating/review_count for APPROVED mentors to
-- anon via SECURITY DEFINER. This function exposes the SAME aggregate + the star
-- distribution to the same audience — counts only, no reviewer ids, no text, no
-- PII. The approved-mentor gate makes a pending/rejected/unknown _mentor_id
-- return zeros/NULL avg, indistinguishable from an approved-but-unreviewed
-- mentor (no leak of un-approved mentors' existence or review volume).
--
-- Always returns EXACTLY ONE row (bare aggregate, no GROUP BY): a mentor with no
-- reviews yields avg_rating=NULL, review_count=0, star1..star5=0. Callers .single().
--
-- ADDITIVE: brand-new function (no DROP/ALTER of any existing object).
-- Verification: supabase/dev-seeds/get-mentor-rating-summary-verification.sql
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_mentor_rating_summary(_mentor_id uuid)
RETURNS TABLE(
  avg_rating   numeric,
  review_count integer,
  star1        integer,
  star2        integer,
  star3        integer,
  star4        integer,
  star5        integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT
    round(avg(rv.rating)::numeric, 1)               AS avg_rating,
    count(*)::integer                               AS review_count,
    count(*) FILTER (WHERE rv.rating = 1)::integer  AS star1,
    count(*) FILTER (WHERE rv.rating = 2)::integer  AS star2,
    count(*) FILTER (WHERE rv.rating = 3)::integer  AS star3,
    count(*) FILTER (WHERE rv.rating = 4)::integer  AS star4,
    count(*) FILTER (WHERE rv.rating = 5)::integer  AS star5
  FROM public.reviews rv
  WHERE rv.mentor_id = _mentor_id
    AND EXISTS (
      SELECT 1 FROM public.mentors m
      WHERE m.id = _mentor_id
        AND m.status = 'approved'::public.mentor_status
    );
$function$;

COMMENT ON FUNCTION public.get_mentor_rating_summary(uuid) IS
  '2026-06-26: read-only avg_rating/review_count + star1..star5 distribution for an APPROVED mentor''s public.reviews, powering the profile ratings histogram. SECURITY DEFINER (reviews SELECT is authenticated-only); exposes the SAME aggregate already public via get_mentor_public_profile, plus the per-star breakdown, to anon/authenticated. Approved-mentor gate: a non-approved/unknown _mentor_id returns zeros/NULL avg (no leak). Always returns exactly one row; counts only — no reviewer ids, no review text, no PII.';

REVOKE ALL ON FUNCTION public.get_mentor_rating_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_mentor_rating_summary(uuid) TO anon, authenticated, service_role;
