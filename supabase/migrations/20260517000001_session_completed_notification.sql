-- session_completed notifications.
--
-- Background: the bookings auto-complete cron (migration 20260514100005)
-- transitions confirmed bookings to 'completed' fifteen minutes past their
-- end time. The student deserves a notification when that happens so they
-- can leave a review, revisit session notes, and see the booking surface in
-- the new PastSessionsSection on the dashboard.
--
-- Three changes packaged in one migration:
--   1. Widen notifications.kind CHECK to include 'session_completed'.
--   2. Add notifications.mentor_name TEXT column (nullable — booking_confirmed
--      rows pre-date the column and stay NULL there).
--   3. New AFTER UPDATE trigger on public.bookings that fires when
--      OLD.status IS DISTINCT FROM 'completed' AND NEW.status = 'completed'.
--      Inserts a notification row for the student.
--
-- Defensive pattern mirrors create_booking_notification: SECURITY DEFINER,
-- search_path locked to public + pg_temp, unique_violation swallowed,
-- WHEN OTHERS reduced to RAISE WARNING so a notification failure can never
-- abort the underlying status update.
--
-- Verification: supabase/dev-seeds/feature-batch-session-completed-verification.sql

-- ── 1. CHECK constraint replacement ────────────────────────────────────────
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_kind_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_kind_check
  CHECK (kind IN ('booking_confirmed', 'session_completed'));

-- ── 2. mentor_name column ──────────────────────────────────────────────────
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS mentor_name TEXT;

COMMENT ON COLUMN public.notifications.mentor_name IS
  'Snapshot of the mentor''s full_name at notification time. Populated for kind = ''session_completed''; NULL for the original kind = ''booking_confirmed'' rows.';

-- ── 3. Trigger function ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_session_completed_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_mentor_name  text;
  v_student_name text;
BEGIN
  -- Only fire on the confirmed → completed (or any-other → completed)
  -- transition. AFTER UPDATE so the row is committed-visible.
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM 'completed' THEN
    RETURN NEW;
  END IF;

  IF NEW.student_id IS NULL OR NEW.mentor_id IS NULL THEN
    RAISE WARNING 'create_session_completed_notification: booking % has null student_id or mentor_id, skipping notification', NEW.id;
    RETURN NEW;
  END IF;

  SELECT full_name INTO v_mentor_name
  FROM public.mentors
  WHERE id = NEW.mentor_id;
  v_mentor_name := COALESCE(v_mentor_name, 'Your mentor');

  SELECT full_name INTO v_student_name
  FROM public.students
  WHERE id = NEW.student_id;
  v_student_name := COALESCE(v_student_name, 'Student');

  BEGIN
    INSERT INTO public.notifications (
      recipient_id,
      booking_id,
      kind,
      student_name,
      mentor_name,
      booking_date,
      booking_time_slot
    ) VALUES (
      NEW.student_id,
      NEW.id,
      'session_completed',
      v_student_name,
      v_mentor_name,
      NEW.date,
      NEW.time_slot
    );
  EXCEPTION
    WHEN unique_violation THEN
      -- The (booking_id, kind) UNIQUE index already enforces one-per-pair;
      -- this guards against re-running the same completion UPDATE.
      NULL;
    WHEN OTHERS THEN
      RAISE WARNING 'create_session_completed_notification: failed to insert notification for booking %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.create_session_completed_notification() FROM public;
REVOKE EXECUTE ON FUNCTION public.create_session_completed_notification() FROM anon;
GRANT EXECUTE ON FUNCTION public.create_session_completed_notification()
  TO authenticated, service_role;

-- ── 4. Trigger ─────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS create_session_completed_notification_trigger ON public.bookings;

CREATE TRIGGER create_session_completed_notification_trigger
  AFTER UPDATE OF status ON public.bookings
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM 'completed' AND NEW.status = 'completed')
  EXECUTE FUNCTION public.create_session_completed_notification();

COMMENT ON FUNCTION public.create_session_completed_notification() IS
  'AFTER UPDATE trigger on public.bookings. Fires once per confirmed → completed transition; inserts a session_completed notification for the student with snapshotted mentor_name. Errors swallowed so notification failures cannot abort the underlying status update.';
