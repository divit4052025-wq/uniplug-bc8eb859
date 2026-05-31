-- ════════════════════════════════════════════════════════════════════════════
-- Payments Stage 1b: immutable payment_ledger (append-only audit spine).
-- ════════════════════════════════════════════════════════════════════════════
--
-- WHY: Razorpay is the source of truth for money; payment_ledger is OUR
-- append-only mirror of every money event (order created, captured, failed,
-- refunded, clawback owed). It is the idempotency spine (idempotency_key UNIQUE)
-- and the audit record. Immutability is enforced exactly like
-- parental_consent_records (20260530000001): RLS ON + NO policies + REVOKE from
-- anon/authenticated + no UPDATE/DELETE path anywhere. The only writer is the
-- service-role webhook handler / SECURITY DEFINER RPCs (added in later stages).
--
-- This is SCHEMA ONLY. Nothing writes to this table yet.
--
-- Verification: supabase/dev-seeds/payments-1b-ledger-verification.sql
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.payment_ledger (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id          uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  event_type          text NOT NULL CHECK (event_type IN (
                        'order_created','order_create_failed','payment_captured',
                        'payment_failed','refund_created','refund_processed',
                        'clawback_owed')),
  idempotency_key     text NOT NULL UNIQUE,       -- dedupe spine, e.g. 'captured:pay_xxx'
  razorpay_order_id   text,
  razorpay_payment_id text,
  razorpay_refund_id  text,
  amount_inr          integer,                    -- gross INR as stored
  mentor_share_inr    integer,                    -- 80% snapshot (capture rows)
  platform_fee_inr    integer,                    -- 20% (absorbs MDR)
  payload             jsonb,                       -- raw event for audit
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_ledger_booking_idx
  ON public.payment_ledger (booking_id);

-- Immutability: RLS ON, NO policies → no anon/authenticated SELECT/INSERT/
-- UPDATE/DELETE. REVOKE strips Supabase's default public-function-style grants.
-- There is deliberately no UPDATE/DELETE path → append-only / immutable audit.
-- Sole writer is the service-role webhook + SECURITY DEFINER RPCs (later stages),
-- which bypass RLS.
ALTER TABLE public.payment_ledger ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.payment_ledger FROM anon, authenticated;

COMMENT ON TABLE public.payment_ledger IS
  'Payments V1 (2026-05-31): append-only immutable mirror of every Razorpay money event for a booking. idempotency_key UNIQUE is the dedupe spine (webhook inserts ON CONFLICT DO NOTHING). RLS-on-no-policies + no UPDATE/DELETE path = immutable. Written ONLY by the service-role webhook handler / SECURITY DEFINER RPCs. Mirrors the parental_consent_records immutability pattern.';
