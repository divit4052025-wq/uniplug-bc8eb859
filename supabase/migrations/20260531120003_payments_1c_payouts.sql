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
-- mentor_payouts.status: created as free text DEFAULT 'scheduled' in 20260425101339
-- with NO CHECK. Re-verified live (ncfhmbugjeuerchleegq, 2026-05-31): the table has
-- ONLY its primary key (no status CHECK), status DEFAULT 'scheduled', 0 rows.
--
-- SELF-CORRECTING constraint pin (defense-in-depth, identical to the Stage-1a
-- pattern): section 2 discovers ANY existing status CHECK on mentor_payouts from
-- the catalog and drops it by its real name before adding the canonical one — so a
-- differently-named/legacy CHECK can never silently survive to shadow the new one.
-- Canonical value set is EXACTLY ('scheduled','paid','failed'): the only status any
-- write path emits is 'scheduled' (Stage 5 accrual INSERT); 'paid'/'failed' are
-- reserved for the deferred RazorpayX disbursement seam. Stage 6 refund clawback
-- adjusts amount_inr only — it never writes mentor_payouts.status.
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

-- Pin the free-text status to the canonical set. SELF-CORRECTING (Stage-1a pattern):
-- discover any existing status CHECK by its real catalog name, drop it, then add the
-- canonical one — no stale/renamed CHECK can survive. (Live currently has none.)
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'public.mentor_payouts'::regclass
       AND contype  = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.mentor_payouts DROP CONSTRAINT %I', r.conname);
  END LOOP;

  ALTER TABLE public.mentor_payouts
    ADD CONSTRAINT mentor_payouts_status_valid
    CHECK (status IN ('scheduled','paid','failed'));
END $$;

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
