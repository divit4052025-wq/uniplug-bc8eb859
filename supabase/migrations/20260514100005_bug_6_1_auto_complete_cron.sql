-- Bug 6.1: auto-complete past confirmed bookings via a pg_cron job.
--
-- Background: bookings never transition from 'confirmed' to 'completed' on
-- their own. Every consumer that reads `status = 'completed'` (Earnings,
-- admin_stats.total_sessions_*, mentor PostSessionNotes dropdown) is
-- therefore always empty, and the "Upcoming Sessions" surfaces leak past
-- sessions until a mentor manually clears them. Audit recommended a 15-min
-- pg_cron job as the simplest fix; that's what this migration ships.
--
-- The job runs in the cron schema as the role that scheduled it (postgres
-- in this case), which bypasses RLS. It only touches rows that already
-- meet two conditions:
--   1. status = 'confirmed' (untouched cancelled/completed rows)
--   2. (date + time_slot + 1 hour) interpreted as IST is <= now()
-- so it cannot undo a cancellation, modify future bookings, or affect any
-- non-confirmed status.
--
-- Verification: supabase/dev-seeds/bug-audit-time-completion-verification.sql
-- runs the same UPDATE directly (without waiting for the cron interval).

SELECT cron.schedule(
  'auto_complete_past_bookings',
  '*/15 * * * *',
  $job$
    UPDATE public.bookings
    SET    status = 'completed'
    WHERE  status = 'confirmed'
      AND  ((date::timestamp + time_slot::time + interval '1 hour')
              AT TIME ZONE 'Asia/Kolkata') <= now();
  $job$
);
