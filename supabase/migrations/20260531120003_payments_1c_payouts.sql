-- ════════════════════════════════════════════════════════════════════════════
-- Payments Stage 1c: payout-batch schema (weekly Friday accrual model).
-- ════════════════════════════════════════════════════════════════════════════
--
-- WHY: Mentors are paid 80% of collected fees in a weekly Friday batch. The
-- model: one payout_batches row per Friday run; one mentor_payouts row per
-- mentor per batch (amount_inr = Σ that mentor's eligible 80% shares); each
-- settled booking is stamped with payout_id pointing at its payout row. That
-- stamp + a `payout_id IS NULL` eligibility filter is the double-pay guard (a
-- re-run / double-fired cron can never pay the same booking twice).
--
-- This is SCHEMA ONLY. The batch RPC + cron + eligibility query land in Stage 5;
-- nothing writes these tables/columns yet.
--
-- NOTE on mentor_payouts.status: defined as free text DEFAULT 'scheduled' in
-- 20260425101339 with NO CHECK (verified). We pin it here. Existing live rows
-- (if any) must already be in {scheduled,paid,failed} for the CHECK to validate;
-- the pre-apply gate below confirms this.
--
-- ⚠ PRE-APPLY GATE (run against live before applying):
--     SELECT DISTINCT status FROM public.mentor_payouts;          -- must ⊆ {scheduled,paid,failed}
--     SELECT conname FROM pg_constraint
--       WHERE conrelid='public.mentor_payouts'::regclass AND contype='c'; -- expect none
--   If a stray status value exists, reconcile it BEFORE applying (the ADD
--   CONSTRAINT will otherwise fail loud, which is the desired safe behaviour).
--
-- Verification: supabase/dev-seeds/payments-1c-payouts-verification.sql
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1. Friday batch header ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payout_batches (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cutoff_at timestamptz NOT NULL,                  -- Thursday 23:59 IST
  run_at    timestamptz NOT NULL DEFAULT now(),
  status    text NOT NULL DEFAULT 'accrued'
              CHECK (status IN ('accrued','disbursed','failed'))
);

ALTER TABLE public.payout_batches ENABLE ROW LEVEL SECURITY;
-- No policies: batch headers are operator-internal. service_role (BYPASSRLS) and
-- the SECURITY DEFINER batch RPC are the only accessors. Mentors see their money
-- via mentor_payouts (which keeps its existing "Mentor view payouts" policy).
REVOKE ALL ON TABLE public.payout_batches FROM anon, authenticated;

-- ─── 2. Link existing mentor_payouts to a batch + record the period ──────────
ALTER TABLE public.mentor_payouts
  ADD COLUMN IF NOT EXISTS batch_id   uuid REFERENCES public.payout_batches(id),
  ADD COLUMN IF NOT EXISTS period_end timestamptz;

-- Pin the previously free-text status to a known set.
ALTER TABLE public.mentor_payouts DROP CONSTRAINT IF EXISTS mentor_payouts_status_valid;
ALTER TABLE public.mentor_payouts
  ADD CONSTRAINT mentor_payouts_status_valid
  CHECK (status IN ('scheduled','paid','failed'));

-- ─── 3. Per-booking double-pay stamp ─────────────────────────────────────────
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS payout_id uuid REFERENCES public.mentor_payouts(id)
                                          ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS bookings_payout_idx ON public.bookings (payout_id);

COMMENT ON TABLE public.payout_batches IS
  'Payments V1 (2026-05-31): one row per weekly Friday payout run. cutoff_at = the preceding Thursday 23:59 IST; eligible completed+paid bookings up to the cutoff accrue into one mentor_payouts row per mentor per batch. status stays ''accrued'' in V1 (real RazorpayX disbursement deferred).';
COMMENT ON COLUMN public.bookings.payout_id IS
  'Payments V1 (2026-05-31): set when a completed+paid booking is swept into a mentor_payouts accrual. The eligibility query excludes payout_id IS NOT NULL, making the weekly batch idempotent / double-pay-proof.';
COMMENT ON COLUMN public.mentor_payouts.batch_id IS
  'Payments V1 (2026-05-31): the payout_batches row this accrual belongs to (one mentor_payouts row per mentor per weekly Friday batch).';
COMMENT ON COLUMN public.mentor_payouts.period_end IS
  'Payments V1 (2026-05-31): the batch cutoff (Thursday 23:59 IST) this accrual covers; mirrors payout_batches.cutoff_at for the row.';
