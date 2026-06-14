-- ============================================================================
-- P10c — get_mentor_earnings(): authoritative read-only mentor earnings view.
-- ============================================================================
-- WHY: the mentor dashboard's EarningsSection previously summed bookings.price
-- (GROSS, the student's fee) and labelled it "earnings" — wrong on two counts:
--   (1) the mentor earns 80% (mentor_share), not the gross; and
--   (2) money must never be derived from the mutable bookings row (payments-ledger
--       rule). bookings.price can be the gross fee; the AUTHORITATIVE mentor money
--       is the immutable payment_ledger.mentor_share_inr snapshot at capture.
-- The mentor also cannot read payment_ledger at all (RLS-on-no-policies + REVOKE).
--
-- THIS FUNCTION is the single sanctioned mentor money accessor. SECURITY DEFINER
-- (owner postgres) so it can read the immutable ledger; authorization is the
-- hard predicate b.mentor_id = auth.uid() on every aggregate — a mentor sees
-- ONLY their own money, never another party's, and NO student PII (it returns
-- booking ids / dates / amounts only).
--
-- THE BUCKETS (every booking's share lands in exactly one; no double-count):
--   pending      — completed + captured + NOT yet swept (payout_id IS NULL).
--                  Σ ledger mentor_share for those captures. Goes into the next
--                  Friday batch (mirrors run_weekly_payout_batch eligibility).
--   scheduled    — swept into a mentor_payouts row, status 'scheduled'
--                  (V1: accrued, real RazorpayX disbursement deferred).
--   paid         — mentor_payouts status 'paid' (reserved for the disbursement seam).
--   clawback_owed — a paid-out booking later refunded/cancelled: apply_refund wrote
--                  a clawback_owed ledger row. Subtracted from the net (the share is
--                  still inside the 'paid' accrual, so net = paid − clawback nets out;
--                  a scheduled-stage reversal instead pulls the share out of the
--                  scheduled accrual directly, so it never reaches any bucket).
--   lifetime_net = paid + scheduled + pending − clawback_owed.
--
-- Mentor_payouts amounts are read directly (the mentor already has the "Mentor
-- view payouts" SELECT RLS on that table) but summed here as DEFINER for one
-- consistent snapshot.
--
-- Verification: supabase/dev-seeds/p10c-mentor-earnings-verification.sql
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_mentor_earnings()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_mentor          uuid := auth.uid();
  v_paid            integer;
  v_scheduled       integer;
  v_pending         integer;
  v_clawback        integer;
  v_paid_count      integer;
  v_next_payout     date;
  v_sessions        jsonb;
BEGIN
  IF v_mentor IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  -- Accrued buckets from the mentor's own payout rows.
  SELECT
    coalesce(sum(amount_inr) FILTER (WHERE status = 'paid'), 0),
    coalesce(sum(amount_inr) FILTER (WHERE status = 'scheduled'), 0),
    min(payout_date) FILTER (WHERE status = 'scheduled' AND payout_date >= current_date)
  INTO v_paid, v_scheduled, v_next_payout
  FROM public.mentor_payouts
  WHERE mentor_id = v_mentor;

  -- Pending = captured-but-unswept mentor_share from the IMMUTABLE ledger, for
  -- completed bookings not yet in a payout (the next-batch eligibility set).
  SELECT coalesce(sum(pl.mentor_share_inr), 0)
  INTO v_pending
  FROM public.payment_ledger pl
  JOIN public.bookings b ON b.id = pl.booking_id
  WHERE b.mentor_id = v_mentor
    AND pl.event_type = 'payment_captured'
    AND b.status = 'completed'
    AND b.payout_id IS NULL;

  -- Clawback owed = paid-out sessions later refunded (ledger clawback_owed rows).
  SELECT coalesce(sum(pl.mentor_share_inr), 0)
  INTO v_clawback
  FROM public.payment_ledger pl
  JOIN public.bookings b ON b.id = pl.booking_id
  WHERE b.mentor_id = v_mentor
    AND pl.event_type = 'clawback_owed';

  -- Count of sessions the mentor was actually paid for (a real captured payment
  -- exists), regardless of any later refund — so the count never reads 0 while
  -- paid_inr is non-zero. Net effect of a refund is reflected in the money
  -- buckets, not by hiding the session from the count.
  SELECT count(DISTINCT b.id)
  INTO v_paid_count
  FROM public.bookings b
  JOIN public.payment_ledger pl ON pl.booking_id = b.id AND pl.event_type = 'payment_captured'
  WHERE b.mentor_id = v_mentor;

  -- Per-session breakdown (most recent first), money from the ledger snapshot.
  -- payout_state is honest: refunded / pending / scheduled / paid. No student PII.
  SELECT coalesce(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.date DESC, t.time_slot DESC), '[]'::jsonb)
  INTO v_sessions
  FROM (
    SELECT
      b.id                                  AS booking_id,
      b.date                                AS date,
      b.time_slot                           AS time_slot,
      sum(pl.amount_inr)::integer           AS gross_inr,
      sum(pl.mentor_share_inr)::integer     AS mentor_share_inr,
      CASE
        WHEN b.status = 'cancelled' THEN 'refunded'
        WHEN b.payout_id IS NULL    THEN 'pending'
        WHEN mp.status = 'paid'     THEN 'paid'
        WHEN mp.status = 'scheduled' THEN 'scheduled'
        ELSE coalesce(mp.status, 'pending')
      END                                   AS payout_state
    FROM public.bookings b
    JOIN public.payment_ledger pl
      ON pl.booking_id = b.id AND pl.event_type = 'payment_captured'
    LEFT JOIN public.mentor_payouts mp ON mp.id = b.payout_id
    WHERE b.mentor_id = v_mentor
    GROUP BY b.id, b.date, b.time_slot, b.status, b.payout_id, mp.status
  ) t;

  RETURN jsonb_build_object(
    'currency', 'INR',
    'summary', jsonb_build_object(
      'lifetime_net_inr',  v_paid + v_scheduled + v_pending - v_clawback,
      'paid_inr',          v_paid,
      'scheduled_inr',     v_scheduled,
      'pending_inr',       v_pending,
      'clawback_owed_inr', v_clawback,
      'paid_session_count', v_paid_count
    ),
    'next_payout_date', v_next_payout,
    'sessions', v_sessions
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_mentor_earnings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_mentor_earnings() TO authenticated;

COMMENT ON FUNCTION public.get_mentor_earnings() IS
  'P10c (2026-06-11): authoritative read-only mentor earnings. SECURITY DEFINER over b.mentor_id=auth.uid(); reads mentor_share from the immutable payment_ledger (never bookings.price) + the mentor''s own mentor_payouts. Returns jsonb {currency, summary{lifetime_net/paid/scheduled/pending/clawback_owed/paid_session_count}, next_payout_date, sessions[]}. No student PII (booking ids/dates/amounts only). Raises 42501 if unauthenticated.';
