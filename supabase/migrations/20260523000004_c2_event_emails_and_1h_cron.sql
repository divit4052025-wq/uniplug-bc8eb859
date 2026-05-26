-- Phase C2: event-driven email triggers + 1h reminder cron.
--
-- Adds four DB-side dispatchers that POST to the unified
-- /api/public/hooks/send-event-email endpoint via net.http_post, reusing
-- the same vault.cron_secret + CRON_SECRET pair that A3 introduced for
-- send-reminders:
--
--   1. tg_booking_cancelled_email   — AFTER UPDATE on bookings when
--      status transitions to 'cancelled'.
--   2. tg_booking_session_completed_email — AFTER UPDATE on bookings
--      when status transitions to 'completed'. Sibling to the
--      pre-existing create_session_completed_notification_trigger
--      (which writes a notification row); this one sends emails.
--   3. tg_review_received_email     — AFTER INSERT on reviews.
--   4. admin_set_mentor_status (extended) — emails approved or rejected
--      mentors at the end of the SECURITY DEFINER fn, inside the same
--      transaction as the status update so the row state is committed
--      by the time the email worker picks up the booking.
--
-- Plus a second pg_cron schedule:
--
--   send_reminders_1h — */30 * * * * UTC, POSTs to
--   /api/public/hooks/send-reminders?window=1h. The handler (extended
--   in this PR's TS changes) fetches confirmed bookings starting in
--   [now+45min, now+75min] IST and dispatches a single reminder per
--   booking. The 30-minute cron interval + 30-minute window means each
--   booking gets exactly one 1h-warning provided the cron doesn't skip
--   a tick. Phase H follow-up could add a `reminder_dispatch_log` for
--   strict de-dup, but for V1 a single retry budget is acceptable.
--
-- Shared helper: notify_event_email(_payload jsonb) — encapsulates the
-- net.http_post call so each trigger body stays a one-liner. SECURITY
-- DEFINER so non-superuser callers (the trigger context) can read
-- vault.decrypted_secrets.
--
-- Idempotent: CREATE OR REPLACE FUNCTION, DROP TRIGGER IF EXISTS,
-- cron.unschedule before schedule.
--
-- Verification: supabase/dev-seeds/c2-event-emails-verification.sql

CREATE EXTENSION IF NOT EXISTS pg_net;

-- ─── Shared helper ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_event_email(_payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets
   WHERE name = 'cron_secret'
   LIMIT 1;
  PERFORM net.http_post(
    url     := 'https://uniplug.app/api/public/hooks/send-event-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(v_secret, '')
    ),
    body    := _payload
  );
END;
$$;

REVOKE ALL ON FUNCTION public.notify_event_email(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_event_email(jsonb) FROM anon, authenticated;

COMMENT ON FUNCTION public.notify_event_email(jsonb) IS
  'Phase C2 (2026-05-23): fires the send-event-email endpoint with the given JSON payload. SECURITY DEFINER to read vault.cron_secret. Reused by all four event triggers below.';

-- ─── Trigger 1: booking cancelled ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_booking_cancelled_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.notify_event_email(jsonb_build_object(
      'type', 'booking_cancelled',
      'booking_id', NEW.id
    ));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bookings_cancelled_email ON public.bookings;
CREATE TRIGGER bookings_cancelled_email
  AFTER UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_booking_cancelled_email();

-- ─── Trigger 2: session completed (sibling to existing notification) ───────
CREATE OR REPLACE FUNCTION public.tg_booking_session_completed_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.notify_event_email(jsonb_build_object(
      'type', 'session_completed',
      'booking_id', NEW.id
    ));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bookings_session_completed_email ON public.bookings;
CREATE TRIGGER bookings_session_completed_email
  AFTER UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_booking_session_completed_email();

-- ─── Trigger 3: review received ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_review_received_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.notify_event_email(jsonb_build_object(
    'type', 'review_received',
    'review_id', NEW.id
  ));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reviews_received_email ON public.reviews;
CREATE TRIGGER reviews_received_email
  AFTER INSERT ON public.reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_review_received_email();

-- ─── Extend admin_set_mentor_status to email approved/rejected mentors ─────
CREATE OR REPLACE FUNCTION public.admin_set_mentor_status(_mentor_id uuid, _status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _status NOT IN ('approved','rejected','pending') THEN
    RAISE EXCEPTION 'invalid status';
  END IF;

  UPDATE public.mentors
     SET status = _status::public.mentor_status
   WHERE id = _mentor_id;

  -- Phase C2: dispatch approval / rejection emails. Pending → no email
  -- (admin reverting a status doesn't need to notify; rare event).
  IF _status = 'approved' THEN
    PERFORM public.notify_event_email(jsonb_build_object(
      'type', 'mentor_approved',
      'mentor_id', _mentor_id
    ));
  ELSIF _status = 'rejected' THEN
    PERFORM public.notify_event_email(jsonb_build_object(
      'type', 'mentor_rejected',
      'mentor_id', _mentor_id
    ));
  END IF;
END;
$$;

COMMENT ON FUNCTION public.admin_set_mentor_status(uuid, text) IS
  'Admin-only mentor status setter. Phase C2 (2026-05-23) extended to dispatch mentor_approved / mentor_rejected emails via notify_event_email after the status update lands.';

-- ─── 1h reminder cron ───────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send_reminders_1h') THEN
    PERFORM cron.unschedule('send_reminders_1h');
  END IF;
END $$;

SELECT cron.schedule(
  'send_reminders_1h',
  '*/30 * * * *',
  $job$
    SELECT net.http_post(
      url     := 'https://uniplug.app/api/public/hooks/send-reminders?window=1h',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(
          (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1),
          ''
        )
      ),
      body    := '{}'::jsonb
    );
  $job$
);
