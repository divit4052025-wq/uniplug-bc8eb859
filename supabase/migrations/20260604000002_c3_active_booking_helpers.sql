-- ============================================================================
-- C-3 — Canonical "active booking" helpers (phase-5-6-plan.md §1, C-3)
-- ============================================================================
-- Two SECURITY DEFINER read helpers so every gate shares ONE definition and the
-- status sets cannot drift across book_session / reserve_slot / the masking
-- unlock / the cancel + cap logic. The two sets are DELIBERATELY different:
--
--   booking_relationship_is_active  → status IN ('confirmed','completed')
--       the IDENTITY-UNLOCK / messaging-uncap set. A 'pending_payment' or
--       'reserved' row must NEVER unlock a mentor's full name/photo or lift a
--       cap — the relationship only counts once money has actually been taken.
--
--   count_active_mentees            → status IN ('reserved','pending_payment','confirmed')
--       the SLOT-OCCUPYING / capacity set (matches the bookings_no_overlap guard
--       predicate). A held/pending/confirmed student is a live concurrent load;
--       terminal rows (cancelled/expired/payment_failed) and past-only
--       'completed' relationships do NOT consume a concurrent slot.
--
-- Both are SECURITY DEFINER so they read across both parties' bookings
-- regardless of the caller's RLS view, and are invoked from other DEFINER RPCs.
-- Additive: new functions only.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.booking_relationship_is_active(_student_id uuid, _mentor_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.student_id = _student_id
      AND b.mentor_id  = _mentor_id
      AND b.status IN ('confirmed', 'completed')
  );
$function$;

COMMENT ON FUNCTION public.booking_relationship_is_active(uuid, uuid) IS
  'C-3: TRUE iff a confirmed/completed booking links this student↔mentor. The canonical identity-unlock / messaging-uncap predicate. pending_payment/reserved deliberately do NOT count (no money taken yet).';

CREATE OR REPLACE FUNCTION public.count_active_mentees(_mentor_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT count(DISTINCT b.student_id)::integer
  FROM public.bookings b
  WHERE b.mentor_id = _mentor_id
    AND b.status IN ('reserved', 'pending_payment', 'confirmed');
$function$;

COMMENT ON FUNCTION public.count_active_mentees(uuid) IS
  'C-3: count of DISTINCT students holding a slot-occupying booking (reserved/pending_payment/confirmed) with this mentor — the max_active_mentees cap set (matches the bookings_no_overlap predicate). Counts distinct students, not rows.';

REVOKE ALL ON FUNCTION public.booking_relationship_is_active(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.count_active_mentees(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.booking_relationship_is_active(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.count_active_mentees(uuid) TO authenticated, service_role;
