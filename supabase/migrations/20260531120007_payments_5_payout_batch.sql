-- ════════════════════════════════════════════════════════════════════════════
-- Payments Stage 5: Friday payout batch + eligibility query (accrual only).
-- ════════════════════════════════════════════════════════════════════════════
--
-- WHY: mentors are paid 80% of collected fees weekly. This installs the batch RPC
-- run_weekly_payout_batch() and the pg_cron job that calls it every Friday. The
-- RPC accrues — it creates one payout_batches row per run and one mentor_payouts
-- row per eligible mentor (amount = Σ that mentor's eligible 80% shares), and
-- stamps each swept booking with payout_id. REAL DISBURSEMENT IS DEFERRED: payouts
-- stop at status='scheduled'; no money leaves. The disbursement seam (a future
-- authed Worker route reading 'scheduled' rows and calling RazorpayX) is described
-- at the bottom and MUST skip amount_inr=0 rows.
--
-- ELIGIBILITY (the core query) — a booking is paid out iff ALL hold:
--   status = 'completed'                      (session happened, auto-complete cron)
--   paid_at IS NOT NULL                       ← THE MONEY GATE. Only mark_booking_paid
--                                               (a real payment.captured) sets paid_at.
--                                               Without this, the ~6 legacy ₹0
--                                               confirmed bookings — and any
--                                               zero-price/never-paid booking — would
--                                               pay mentors 80% of a fee never charged.
--   payout_id IS NULL                         (not already swept — double-pay guard)
--   session-end (IST) <= _cutoff              (Thursday 23:59 IST)
--   no open/reviewing dispute
--
-- mentor_share = round(price * 0.80) (mentor clean); platform keeps the rest +
-- absorbs MDR. _buffer_hours (default 0) is a parameterized post-session dispute
-- buffer, OFF per the confirmed decision; a non-zero value delays every payout by
-- that many hours in exchange for a wider window to catch post-session disputes.
--
-- IDEMPOTENT / DOUBLE-PAY-PROOF: the payout_id stamp + the `payout_id IS NULL`
-- filter mean a re-run (or a double-fired cron) pays nothing for an already-swept
-- booking. The whole RPC is one transaction.
--
-- Verification: supabase/dev-seeds/payments-5-payout-batch-verification.sql
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.run_weekly_payout_batch(_buffer_hours integer DEFAULT 0)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now      timestamptz := now();
  v_cutoff   timestamptz;
  v_batch_id uuid;
  v_payout_id uuid;
  r          record;
BEGIN
  -- Most recent Thursday 23:59:59 IST, in UTC. ISODOW: Mon=1 … Thu=4 … Sun=7.
  -- Compute "today" in IST, step back to the most recent Thursday, set 23:59:59 IST.
  v_cutoff := (
    (((v_now AT TIME ZONE 'Asia/Kolkata')::date
      - (((EXTRACT(ISODOW FROM (v_now AT TIME ZONE 'Asia/Kolkata'))::int - 4) + 7) % 7))::text
      || ' 23:59:59')::timestamp
  ) AT TIME ZONE 'Asia/Kolkata'
  - make_interval(hours => _buffer_hours);

  INSERT INTO public.payout_batches (cutoff_at, status)
  VALUES (v_cutoff, 'accrued')
  RETURNING id INTO v_batch_id;

  -- One mentor_payouts row per eligible mentor.
  FOR r IN
    SELECT b.mentor_id,
           sum( round(b.price * 0.80) )::int AS amount_inr,
           array_agg(b.id)                   AS booking_ids
      FROM public.bookings b
     WHERE b.status    = 'completed'
       AND b.paid_at IS NOT NULL                                   -- MONEY ACTUALLY COLLECTED
       AND b.payout_id IS NULL                                     -- not already swept
       AND ( (b.date::timestamp + b.time_slot::time + (b.duration || ' min')::interval)
               AT TIME ZONE 'Asia/Kolkata' ) <= v_cutoff           -- session-end ≤ cutoff
       AND NOT EXISTS (                                            -- no live dispute
             SELECT 1 FROM public.disputes d
              WHERE d.booking_id = b.id
                AND d.status IN ('open','reviewing') )
     GROUP BY b.mentor_id
  LOOP
    INSERT INTO public.mentor_payouts (mentor_id, amount_inr, payout_date, status, batch_id, period_end)
    VALUES (r.mentor_id, r.amount_inr,
            (v_now AT TIME ZONE 'Asia/Kolkata')::date,  -- the Friday this runs (IST)
            'scheduled', v_batch_id, v_cutoff)
    RETURNING id INTO v_payout_id;

    UPDATE public.bookings
       SET payout_id = v_payout_id
     WHERE id = ANY(r.booking_ids);
  END LOOP;

  RETURN v_batch_id;
END;
$$;

REVOKE ALL ON FUNCTION public.run_weekly_payout_batch(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.run_weekly_payout_batch(integer) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.run_weekly_payout_batch(integer) TO service_role;

COMMENT ON FUNCTION public.run_weekly_payout_batch(integer) IS
  'Payments Stage 5 (2026-05-31): service_role-only, single transaction. Accrues mentor payouts for the week: one payout_batches row + one mentor_payouts row per eligible mentor (80% of collected fees), stamping each swept booking with payout_id. Eligibility requires status=completed AND paid_at IS NOT NULL (money actually collected) AND payout_id IS NULL (double-pay guard) AND session-end ≤ Thursday 23:59 IST cutoff AND no open/reviewing dispute. Accrual only — disbursement (RazorpayX) deferred; payouts stay status=scheduled.';

-- ─── Friday cron: Fri 12:00 UTC = 17:30 IST ─────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'run_weekly_payouts') THEN
    PERFORM cron.unschedule('run_weekly_payouts');
  END IF;
END $$;

SELECT cron.schedule(
  'run_weekly_payouts',
  '0 12 * * 5',
  $job$ SELECT public.run_weekly_payout_batch(); $job$
);

-- ─── Disbursement seam (DEFERRED — no code here) ────────────────────────────
-- When real RazorpayX lands, replace the accrual-only model with a net.http_post
-- (Bearer from vault.decrypted_secrets, like send_reminders_cron) to a new authed
-- Worker route that reads status='scheduled' mentor_payouts rows, calls RazorpayX,
-- and flips scheduled → paid/failed. THAT reader MUST skip amount_inr = 0 rows
-- (a payout fully clawed back to ₹0 by a Stage-6 refund) — never disburse ₹0;
-- mark such rows cancelled/skipped instead. Noted so the seam carries the
-- constraint forward.
