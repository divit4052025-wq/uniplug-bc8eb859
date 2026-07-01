-- ============================================================================
-- ADMIN CONSOLE — PHASE 6: PAYMENTS VIEW (READ-ONLY). Additive, LOCAL-only.
-- ============================================================================
-- Read-only operator visibility into the money layer: a reconciliation summary,
-- the payment_ledger event feed, the refund_intents (owed) and mentor_payouts
-- (accrued) queues. All is_admin()-gated SECURITY DEFINER readers over tables that
-- are RLS-locked + REVOKE ALL (service_role only) — the DEFINER (owner) reads them
-- for is_admin without opening them to clients. NO mutation: Phase 6 issues no
-- refund/payout (that path is app-layer + adversarial-review — out of scope). No
-- action => nothing to audit here; the reads are operational bulk browse like the
-- P5 bookings ledger.
--
-- MONEY facts (from the ledger):
--   * whole RUPEES (integer, despite _inr), ALWAYS POSITIVE — direction is event_type.
--   * event_type (7): order_created, order_create_failed, payment_captured,
--     payment_failed, refund_created, refund_processed, clawback_owed.
--   * only payment_captured = money collected. 80/20 split snapshotted there
--     (mentor_share_inr / platform_fee_inr). refund_created carries the refund amount;
--     refund_processed has amount_inr NULL (it is the async "money left" confirmation).
--   * no mentor_id on the ledger — reach the mentor via JOIN bookings.
--
-- HONESTY: the platform does NOT yet disburse. refund_intents.status stays 'pending'
-- (no executor worker) and mentor_payouts.status stays 'scheduled' (no RazorpayX
-- seam). So pending refunds = OWED and scheduled payouts = ACCRUED — money has NOT
-- left. The UI must never call these "paid"/"refunded to the customer".
--
-- PRE-LAUNCH (review): before real money flows — (a) narrow read-access from coarse
-- is_admin() to a dedicated FINANCE scope (today every admin sees all money), and
-- (b) make the money reads ATTRIBUTABLE — add an admin_audit_log write (e.g.
-- 'view_payment_ledger') at the top of admin_list_payment_ledger so who-viewed-
-- customer-amounts is recoverable for incident forensics. Left unlogged now for
-- parity with the other operational bulk ledgers (P4 consent / P5 bookings).
--
-- Pairs with supabase/dev-seeds/admin-p6-payments-verification.sql
-- ============================================================================

-- ── 1. reconciliation summary (aggregate, no PII) ───────────────────────────
CREATE OR REPLACE FUNCTION public.admin_payments_summary()
RETURNS TABLE (
  gross_captured_inr bigint, mentor_share_accrued_inr bigint, platform_fee_inr bigint, captured_count bigint,
  total_refunded_inr bigint, clawback_owed_inr bigint,
  refund_owed_inr bigint, refund_owed_count bigint, refund_processed_count bigint, refund_failed_count bigint,
  payout_scheduled_inr bigint, payout_scheduled_count bigint, payout_paid_inr bigint, payout_paid_count bigint, payout_failed_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  -- subqueries aliased (pl/ri/mp): the RETURNS TABLE OUT column platform_fee_inr
  -- would otherwise shadow the unqualified payment_ledger column.
  RETURN QUERY SELECT
    COALESCE((SELECT sum(pl.amount_inr)       FROM public.payment_ledger pl WHERE pl.event_type='payment_captured'), 0)::bigint,
    COALESCE((SELECT sum(pl.mentor_share_inr) FROM public.payment_ledger pl WHERE pl.event_type='payment_captured'), 0)::bigint,
    COALESCE((SELECT sum(pl.platform_fee_inr) FROM public.payment_ledger pl WHERE pl.event_type='payment_captured'), 0)::bigint,
    COALESCE((SELECT count(*)                 FROM public.payment_ledger pl WHERE pl.event_type='payment_captured'), 0)::bigint,
    COALESCE((SELECT sum(pl.amount_inr)       FROM public.payment_ledger pl WHERE pl.event_type='refund_created'),   0)::bigint,
    COALESCE((SELECT sum(pl.mentor_share_inr) FROM public.payment_ledger pl WHERE pl.event_type='clawback_owed'),    0)::bigint,
    COALESCE((SELECT sum(ri.amount_inr) FROM public.refund_intents ri WHERE ri.status='pending'),   0)::bigint,
    COALESCE((SELECT count(*)           FROM public.refund_intents ri WHERE ri.status='pending'),   0)::bigint,
    COALESCE((SELECT count(*)           FROM public.refund_intents ri WHERE ri.status='processed'), 0)::bigint,
    COALESCE((SELECT count(*)           FROM public.refund_intents ri WHERE ri.status='failed'),    0)::bigint,
    COALESCE((SELECT sum(mp.amount_inr) FROM public.mentor_payouts mp WHERE mp.status='scheduled'), 0)::bigint,
    COALESCE((SELECT count(*)           FROM public.mentor_payouts mp WHERE mp.status='scheduled'), 0)::bigint,
    COALESCE((SELECT sum(mp.amount_inr) FROM public.mentor_payouts mp WHERE mp.status='paid'),      0)::bigint,
    COALESCE((SELECT count(*)           FROM public.mentor_payouts mp WHERE mp.status='paid'),      0)::bigint,
    COALESCE((SELECT count(*)           FROM public.mentor_payouts mp WHERE mp.status='failed'),    0)::bigint;
END $$;
REVOKE ALL     ON FUNCTION public.admin_payments_summary() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_payments_summary() TO authenticated, service_role;
COMMENT ON FUNCTION public.admin_payments_summary() IS
  'Admin P6 (2026-07-01): is_admin-gated aggregate reconciliation (rupees). Captured/mentor-share/platform-fee/refunded/clawback from payment_ledger by event_type; refund OWED (pending refund_intents) + payout ACCRUED (scheduled mentor_payouts) — money not yet disbursed.';

-- ── 2. payment_ledger event feed (masked parties) ───────────────────────────
CREATE OR REPLACE FUNCTION public.admin_list_payment_ledger(
  _event_type text DEFAULT NULL, _from date DEFAULT NULL, _to date DEFAULT NULL, _limit integer DEFAULT 100
)
RETURNS TABLE (
  id uuid, created_at timestamptz, event_type text, booking_id uuid,
  student_label text, mentor_label text,
  amount_inr integer, mentor_share_inr integer, platform_fee_inr integer,
  razorpay_payment_id text, razorpay_refund_id text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF _event_type IS NOT NULL AND _event_type NOT IN
     ('order_created','order_create_failed','payment_captured','payment_failed','refund_created','refund_processed','clawback_owed') THEN
    RAISE EXCEPTION 'invalid_event_type: %', _event_type;
  END IF;
  RETURN QUERY
    SELECT pl.id, pl.created_at, pl.event_type, pl.booking_id,
           CASE WHEN b.student_id IS NULL THEN NULL ELSE public.masked_user_label(b.student_id) END,
           CASE WHEN b.mentor_id  IS NULL THEN NULL ELSE public.masked_user_label(b.mentor_id)  END,
           pl.amount_inr, pl.mentor_share_inr, pl.platform_fee_inr,
           pl.razorpay_payment_id, pl.razorpay_refund_id
      FROM public.payment_ledger pl
      LEFT JOIN public.bookings b ON b.id = pl.booking_id
     WHERE (_event_type IS NULL OR pl.event_type = _event_type)
       AND (_from IS NULL OR pl.created_at::date >= _from)
       AND (_to   IS NULL OR pl.created_at::date <= _to)
     ORDER BY pl.created_at DESC
     LIMIT GREATEST(0, LEAST(COALESCE(_limit, 100), 500));
END $$;
REVOKE ALL     ON FUNCTION public.admin_list_payment_ledger(text, date, date, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_list_payment_ledger(text, date, date, integer) TO authenticated, service_role;
COMMENT ON FUNCTION public.admin_list_payment_ledger(text, date, date, integer) IS
  'Admin P6 (2026-07-01): is_admin-gated payment_ledger event feed (filter event_type/date), MASKED parties via booking, rupee amounts + razorpay refs. Read-only.';

-- ── 3. refund_intents (owed) ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_list_refund_intents(_status text DEFAULT NULL, _limit integer DEFAULT 100)
RETURNS TABLE (
  id uuid, booking_id uuid, student_label text, mentor_label text,
  amount_inr integer, tier text, reason text, source text, status text, created_at timestamptz, processed_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF _status IS NOT NULL AND _status NOT IN ('pending','processed','failed') THEN
    RAISE EXCEPTION 'invalid_status: %', _status;
  END IF;
  RETURN QUERY
    SELECT ri.id, ri.booking_id,
           CASE WHEN b.student_id IS NULL THEN NULL ELSE public.masked_user_label(b.student_id) END,
           CASE WHEN b.mentor_id  IS NULL THEN NULL ELSE public.masked_user_label(b.mentor_id)  END,
           ri.amount_inr, ri.tier, ri.reason, ri.source, ri.status, ri.created_at, ri.processed_at
      FROM public.refund_intents ri
      LEFT JOIN public.bookings b ON b.id = ri.booking_id
     WHERE (_status IS NULL OR ri.status = _status)
     ORDER BY (ri.status = 'pending') DESC, ri.created_at DESC
     LIMIT GREATEST(0, LEAST(COALESCE(_limit, 100), 500));
END $$;
REVOKE ALL     ON FUNCTION public.admin_list_refund_intents(text, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_list_refund_intents(text, integer) TO authenticated, service_role;
COMMENT ON FUNCTION public.admin_list_refund_intents(text, integer) IS
  'Admin P6 (2026-07-01): is_admin-gated refund_intents — pending = the platform OWES this refund (no executor worker yet). MASKED parties. Read-only.';

-- ── 4. mentor_payouts (accrued) ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_list_mentor_payouts(_status text DEFAULT NULL, _limit integer DEFAULT 100)
RETURNS TABLE (
  id uuid, mentor_id uuid, mentor_label text, amount_inr integer,
  payout_date date, period_end timestamptz, status text, batch_id uuid, created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF _status IS NOT NULL AND _status NOT IN ('scheduled','paid','failed') THEN
    RAISE EXCEPTION 'invalid_status: %', _status;
  END IF;
  RETURN QUERY
    SELECT mp.id, mp.mentor_id,
           CASE WHEN mp.mentor_id IS NULL THEN NULL ELSE public.masked_user_label(mp.mentor_id) END,
           mp.amount_inr, mp.payout_date, mp.period_end, mp.status, mp.batch_id, mp.created_at
      FROM public.mentor_payouts mp
     WHERE (_status IS NULL OR mp.status = _status)
     ORDER BY (mp.status = 'scheduled') DESC, mp.created_at DESC
     LIMIT GREATEST(0, LEAST(COALESCE(_limit, 100), 500));
END $$;
REVOKE ALL     ON FUNCTION public.admin_list_mentor_payouts(text, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_list_mentor_payouts(text, integer) TO authenticated, service_role;
COMMENT ON FUNCTION public.admin_list_mentor_payouts(text, integer) IS
  'Admin P6 (2026-07-01): is_admin-gated mentor_payouts — scheduled = ACCRUED (owed to the mentor, not yet disbursed; no RazorpayX seam). MASKED mentor. Read-only.';
