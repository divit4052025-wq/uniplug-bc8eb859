-- ════════════════════════════════════════════════════════════════════════════
-- Payments Stage 4: 30-minute unpaid-booking expiry cron.
-- ════════════════════════════════════════════════════════════════════════════
--
-- WHY: a pending_payment booking holds its slot (Stage 1a widened index). If the
-- student abandons Checkout, that slot must not stay locked forever. This pg_cron
-- job runs every 5 minutes and expires any pending_payment booking older than 30
-- minutes; flipping to 'expired' drops it out of bookings_confirmed_slot_unique,
-- freeing the slot. (5-min cadence is for promptness; the 30-min age predicate is
-- the real hold window, per the confirmed decision.) Mirrors the inline-SQL job
-- shape of 20260514100005_bug_6_1_auto_complete_cron.sql; the job runs as the
-- scheduling role and bypasses RLS.
--
-- It only ever touches status='pending_payment' rows older than 30 min, so it
-- cannot affect confirmed/completed/cancelled/failed/expired rows.
--
-- CAPTURE-AFTER-EXPIRY GUARDRAIL (no SQL here, documented for reviewers): a late
-- UPI capture can arrive after a booking is expired. mark_booking_paid (Stage 3)
-- will NOT confirm a non-pending row — it returns newly_confirmed=false with
-- booking_status='expired' while still recording the payment_captured ledger row.
-- The webhook worker, seeing that combination, emits an admin alert and enqueues
-- the Stage-6 auto-refund. Money is never silently kept.
--
-- Idempotent: cron.unschedule(...) guarded by existence, then cron.schedule(...).
--
-- Verification: supabase/dev-seeds/payments-4-expiry-verification.sql
--   (runs the same UPDATE directly, without waiting for the cron interval).
-- ════════════════════════════════════════════════════════════════════════════

-- Unschedule a prior copy if present (idempotent re-apply).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire_unpaid_bookings') THEN
    PERFORM cron.unschedule('expire_unpaid_bookings');
  END IF;
END $$;

SELECT cron.schedule(
  'expire_unpaid_bookings',
  '*/5 * * * *',
  $job$
    UPDATE public.bookings
       SET status = 'expired'
     WHERE status = 'pending_payment'
       AND created_at < now() - interval '30 minutes';
  $job$
);
