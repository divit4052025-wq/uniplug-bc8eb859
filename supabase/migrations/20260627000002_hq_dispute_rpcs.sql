-- ════════════════════════════════════════════════════════════════════════════
-- G6 follow-up (LOCAL ONLY, ADDITIVE — functions only, no table change):
--   dispute RPCs over the existing public.disputes table
--   (supabase/migrations/20260523000007_g_schema_bulk.sql:235).
--
--   open_dispute(_booking_id, _reason)  — party-gated INSERT. Caller (auth.uid())
--       must be the student_id OR mentor_id on _booking_id. status='open'.
--   admin_list_disputes()               — is_admin()-gated reader (same guard as
--       approve_mentor / admin_list_add_requests in 20260604000030).
--
-- An open/reviewing dispute on a booking withholds that booking from the weekly
-- payout batch (20260531120007_payments_5_payout_batch.sql:75-78). Conventions
-- (SECURITY DEFINER + SET search_path + REVOKE/GRANT) match the recent admin RPCs.
-- ════════════════════════════════════════════════════════════════════════════

-- ── open_dispute ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.open_dispute(_booking_id uuid, _reason text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_caller     uuid := auth.uid();
  v_student_id uuid;
  v_mentor_id  uuid;
  v_dispute_id uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  IF _reason IS NULL OR btrim(_reason) = '' THEN
    RAISE EXCEPTION 'a dispute reason is required' USING ERRCODE = '22023';
  END IF;

  -- Lock the booking row so concurrent open_dispute calls on the SAME booking
  -- serialize; the duplicate-active check below is then race-safe even though an
  -- additive migration cannot add a partial unique index.
  SELECT b.student_id, b.mentor_id
    INTO v_student_id, v_mentor_id
    FROM public.bookings b
   WHERE b.id = _booking_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking not found: %', _booking_id USING ERRCODE = 'P0001';
  END IF;

  -- Party gate: only the student or the mentor ON THIS booking may open one.
  IF v_caller <> v_student_id AND v_caller <> v_mentor_id THEN
    RAISE EXCEPTION 'forbidden: caller is not a party to this booking'
      USING ERRCODE = '42501';
  END IF;

  -- One active dispute per booking. 'open'/'reviewing' are the non-terminal
  -- states that also gate the weekly payout (20260531120007); a party may open a
  -- fresh dispute only after the prior one is resolved/dismissed.
  IF EXISTS (
    SELECT 1 FROM public.disputes d
     WHERE d.booking_id = _booking_id
       AND d.status IN ('open','reviewing')
  ) THEN
    RAISE EXCEPTION 'an active dispute already exists for this booking'
      USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.disputes (booking_id, opened_by, reason, status)
  VALUES (_booking_id, v_caller, btrim(_reason), 'open')
  RETURNING id INTO v_dispute_id;

  RETURN v_dispute_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.open_dispute(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_dispute(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.open_dispute(uuid, text) IS
  'G6 follow-up (LOCAL, additive): party-gated dispute opener over public.disputes. SECURITY DEFINER; caller (auth.uid()) must be the student_id OR mentor_id on _booking_id. Inserts status=open with opened_by=caller and a trimmed reason; rejects a non-party, a missing booking, an empty reason, and a duplicate while an open/reviewing dispute already exists (booking row FOR UPDATE serializes concurrent opens). Returns the new dispute id. NOTE: an open/reviewing dispute withholds that booking from run_weekly_payout_batch (20260531120007).';

-- ── admin_list_disputes ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_list_disputes()
RETURNS TABLE(
  id          uuid,
  booking_id  uuid,
  opened_by   uuid,
  reason      text,
  status      text,
  admin_notes text,
  created_at  timestamptz,
  resolved_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT d.id, d.booking_id, d.opened_by, d.reason, d.status,
         d.admin_notes, d.created_at, d.resolved_at
    FROM public.disputes d
   ORDER BY (d.status IN ('open','reviewing')) DESC, d.created_at DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_list_disputes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_disputes() TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_list_disputes() IS
  'G6 follow-up (LOCAL, additive): admin-only dispute queue reader. SECURITY DEFINER, gated by public.is_admin() (raises forbidden otherwise) — same guard as approve_mentor / admin_list_add_requests (20260604000030). Returns every disputes row, active (open/reviewing) first then newest-first.';
