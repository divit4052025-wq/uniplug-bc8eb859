-- ============================================================================
-- P10a — bookings per-party column visibility (cross-party financial leak fix).
-- ============================================================================
-- THE LEAK: public.bookings carries BOTH parties' financial identifiers on one
-- row — payout_id (the MENTOR's weekly payout accrual) and razorpay_order_id /
-- razorpay_payment_id (the payment refs). The two SELECT RLS policies
-- ("Students can view own bookings" USING auth.uid()=student_id, "Mentors can
-- view their bookings" USING auth.uid()=mentor_id) gate ROWS, not COLUMNS, and
-- bookings had NO column-level lock + Supabase's default table-wide SELECT grant.
-- So a student doing `from('bookings').select('*')` (or naming the column) on
-- THEIR OWN row could read the mentor's payout_id — a cross-party leak — and the
-- raw Razorpay identifiers reach the browser for no legitimate client need.
--
-- INVESTIGATION — every read/write path to the three sensitive columns:
--   • payout_id            — written ONLY by run_weekly_payout_batch / apply_refund
--                            (SECURITY DEFINER). Read by apply_refund (DEFINER).
--                            NO client SELECTs it (verified: grep src/).
--   • razorpay_order_id     — written by the payments-order server fn via
--                            supabaseAdmin (service_role). NO client SELECTs it.
--   • razorpay_payment_id   — read by the payments-refund server fn via
--                            supabaseAdmin (service_role). NO client SELECTs it.
--   Every authenticated client caller names EXPLICIT safe columns already
--   (id, student_id, mentor_id, date, time_slot, duration, price, status,
--    reschedule_count, …) — none uses select('*'); the only select('*') is the
--   service-role data-export (export.functions.ts), unaffected by this REVOKE.
--
-- FIX (privilege layer — same non-forgeable pattern as consent_column_lock
-- 20260604000060): end-user roles lose SELECT on the three sensitive columns.
-- A table-level grant overrides a column REVOKE, so we REVOKE the table grant
-- and re-GRANT SELECT on every OTHER column. The lock is SYMMETRIC — neither the
-- student NOR the mentor can read the raw trio directly (a half-measure that
-- left the mentor a direct read would be a per-role footgun). The MENTOR's
-- legitimate access to THEIR OWN payout_id is restored through a postgres-owned
-- SECURITY DEFINER accessor (get_my_bookings_as_mentor) that re-exposes
-- mentor-relevant columns for rows the caller owns as mentor — and deliberately
-- still omits the student's razorpay_* refs (the mentor has no need of them).
--
-- service_role / postgres are untouched (webhook capture, payout batch, refund,
-- data export keep full access). ADDITIVE to behaviour for every legitimate
-- path; only the cross-party / browser exposure of the financial trio is removed.
--
-- Verification: supabase/dev-seeds/p10a-bookings-column-lock-verification.sql
-- ============================================================================

-- 1. Strip the table-wide SELECT and re-grant every column EXCEPT the three
--    sensitive financial identifiers. PostgREST/SQL now raises 42501 for a
--    SELECT that names payout_id / razorpay_order_id / razorpay_payment_id —
--    for BOTH end-user roles. (anon never legitimately reads bookings: the two
--    SELECT policies are auth.uid()-gated and yield no rows for anon, so anon
--    gets no re-grant — mirrors consent_column_lock.)
REVOKE SELECT ON public.bookings FROM authenticated, anon;
GRANT SELECT (
  id, student_id, mentor_id, date, time_slot, duration, price, status,
  created_at, paid_at, subject_id, description, reschedule_count, slot_range
) ON public.bookings TO authenticated;

COMMENT ON COLUMN public.bookings.payout_id IS
  'P10a (2026-06-11): the mentor''s weekly payout accrual this booking was swept into. SELECT REVOKEd from end-user roles (cross-party financial column). Mentors read their own via get_my_bookings_as_mentor() / get_mentor_earnings() (SECURITY DEFINER); service_role keeps direct access.';
COMMENT ON COLUMN public.bookings.razorpay_order_id IS
  'P10a (2026-06-11): SELECT REVOKEd from end-user roles. Razorpay order ref; written/read only by the service-role payments server fns. Never needed in the browser.';
COMMENT ON COLUMN public.bookings.razorpay_payment_id IS
  'P10a (2026-06-11): SELECT REVOKEd from end-user roles. Razorpay payment ref; written/read only by the service-role payments server fns. Never needed in the browser.';

-- 2. Per-party SECURITY DEFINER accessor: a mentor reads THEIR OWN bookings with
--    the mentor-relevant column set — including payout_id (restored), excluding
--    the student's razorpay_* refs. auth.uid()=mentor_id is enforced inside, so a
--    student calling this gets only rows where THEY are the mentor (none for a
--    pure student) — never another party's row. DEFINER (owner postgres) bypasses
--    the column REVOKE above; the WHERE clause is the only authorization.
CREATE OR REPLACE FUNCTION public.get_my_bookings_as_mentor()
RETURNS TABLE (
  id               uuid,
  student_id       uuid,
  date             date,
  time_slot        text,
  duration         integer,
  price            integer,
  status           text,
  created_at       timestamptz,
  paid_at          timestamptz,
  subject_id       uuid,
  description      text,
  reschedule_count integer,
  payout_id        uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT
    b.id, b.student_id, b.date, b.time_slot, b.duration, b.price, b.status,
    b.created_at, b.paid_at, b.subject_id, b.description, b.reschedule_count,
    b.payout_id
  FROM public.bookings b
  WHERE auth.uid() IS NOT NULL
    AND b.mentor_id = auth.uid();
$function$;

-- Only authenticated mentors call this; anon never does. Lock EXECUTE down to
-- authenticated (revoke the implicit PUBLIC grant a new function carries).
REVOKE ALL ON FUNCTION public.get_my_bookings_as_mentor() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_bookings_as_mentor() TO authenticated;

COMMENT ON FUNCTION public.get_my_bookings_as_mentor() IS
  'P10a (2026-06-11): per-party booking accessor. Returns the caller''s bookings (auth.uid()=mentor_id) with the mentor-relevant column set INCLUDING payout_id, EXCLUDING the student''s razorpay_* refs. The sanctioned path by which a mentor reads their own payout_id after the column REVOKE; a student gets no rows. SECURITY DEFINER over an explicit ownership predicate (no other authorization).';
