-- Phase A3: pg_cron job for /api/public/hooks/send-reminders + Bearer wiring.
--
-- Background: send-reminders.ts was an unauthenticated POST under
-- /api/public/. Anyone could POST and trigger a full bookings scan +
-- Resend dispatch (cost + spam vector). Phase A3 added a Bearer-token
-- check in the route handler (`src/routes/api/public/hooks/send-reminders.ts`
-- via `src/lib/auth/bearer.ts`'s timingSafeEqual compare against
-- `process.env.CRON_SECRET`). This migration creates the corresponding
-- pg_cron job that does the only legitimate POST — at 13:00 UTC
-- (= 18:30 IST), once per day, sending reminders for bookings whose
-- `date = tomorrow IST`.
--
-- The Bearer value is read at job-run time from Supabase Vault. Vault is
-- already enabled (`supabase_vault` v0.3.1; precursor confirmed). The
-- secret value itself is NOT in this migration (migrations are committed,
-- secrets are not). Set it once, out-of-band, with:
--
--   select vault.create_secret(
--     '<secret-value>',
--     'cron_secret',
--     'Bearer token for /api/public/hooks/send-reminders pg_cron caller'
--   );
--
-- The same value must also be set as the Cloudflare Worker secret
-- `CRON_SECRET` (`wrangler secret put CRON_SECRET`). If either is
-- missing the cron fires but the endpoint returns 401 (vault NULL →
-- "Bearer " literal) or 500 (worker env missing) — and the warn-level
-- log makes either failure mode easy to spot.
--
-- Idempotent: the do-block unschedules any prior job with this name
-- before creating, so re-applying the migration replaces the job.
--
-- Out of scope: Phase C2 will add a 1h reminder cron alongside this one
-- (different schedule, ?window=1h). The route handler already validates
-- and accepts only the windows in its ALLOWED_WINDOWS set; C2 will
-- expand that set and add the dispatch branch.
--
-- Verification: supabase/dev-seeds/send-reminders-cron-verification.sql

-- Defensive: pg_net should already be enabled (precursor confirmed v0.20.0)
-- but the CREATE EXTENSION IF NOT EXISTS is harmless and self-documents
-- the dependency.
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Unschedule any prior copy of this job so the migration is idempotent.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send_reminders_24h') THEN
    PERFORM cron.unschedule('send_reminders_24h');
  END IF;
END $$;

SELECT cron.schedule(
  'send_reminders_24h',
  '0 13 * * *',  -- 13:00 UTC = 18:30 IST: evening-of-the-day-before
  $job$
    SELECT net.http_post(
      url     := 'https://uniplug.app/api/public/hooks/send-reminders?window=24h',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(
          (SELECT decrypted_secret
             FROM vault.decrypted_secrets
            WHERE name = 'cron_secret'
            LIMIT 1),
          ''
        )
      ),
      body    := '{}'::jsonb
    );
  $job$
);
