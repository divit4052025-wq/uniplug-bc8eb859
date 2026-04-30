-- Bug 12: Notifications system (mentor-only V1).
-- Creates the notifications table, RLS, and an AFTER INSERT trigger on bookings
-- that fires one notification per confirmed booking for the mentor.

-- 1.1 Table
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'booking_confirmed',
  student_name text NOT NULL,
  booking_date date NOT NULL,
  booking_time_slot text NOT NULL,
  read_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notifications_kind_check CHECK (kind IN ('booking_confirmed'))
);

-- 1.2 Recipient FK to auth.users
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_recipient_id_fkey
  FOREIGN KEY (recipient_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 1.3 Unique (booking_id, kind) — NULL booking_id values bypass the constraint by SQL semantics, which is intended.
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_booking_kind_unique UNIQUE (booking_id, kind);

-- 1.4 Indexes
CREATE INDEX notifications_recipient_unread_idx
  ON public.notifications (recipient_id)
  WHERE read_at IS NULL;

CREATE INDEX notifications_recipient_created_idx
  ON public.notifications (recipient_id, created_at DESC);

-- 1.5 RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- 1.6 Policies — SELECT and UPDATE only. No client-side INSERT or DELETE.
CREATE POLICY "Recipients can view their own notifications"
  ON public.notifications
  FOR SELECT
  USING (auth.uid() = recipient_id);

CREATE POLICY "Recipients can update their own notifications"
  ON public.notifications
  FOR UPDATE
  USING (auth.uid() = recipient_id)
  WITH CHECK (auth.uid() = recipient_id);

-- 1.7 Trigger function
CREATE OR REPLACE FUNCTION public.create_booking_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_student_name text;
BEGIN
  IF NEW.status IS DISTINCT FROM 'confirmed' THEN
    RETURN NEW;
  END IF;

  IF NEW.mentor_id IS NULL OR NEW.student_id IS NULL THEN
    RAISE WARNING 'create_booking_notification: booking % has null mentor_id or student_id, skipping notification', NEW.id;
    RETURN NEW;
  END IF;

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
      booking_date,
      booking_time_slot
    ) VALUES (
      NEW.mentor_id,
      NEW.id,
      'booking_confirmed',
      v_student_name,
      NEW.date,
      NEW.time_slot
    );
  EXCEPTION
    WHEN unique_violation THEN
      NULL;
    WHEN OTHERS THEN
      RAISE WARNING 'create_booking_notification: failed to insert notification for booking %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

-- 1.8 Function permissions
-- Supabase default privileges grant EXECUTE on new public functions to anon as well, so revoke explicitly.
REVOKE ALL ON FUNCTION public.create_booking_notification() FROM public;
REVOKE EXECUTE ON FUNCTION public.create_booking_notification() FROM anon;
GRANT EXECUTE ON FUNCTION public.create_booking_notification() TO authenticated, service_role;

-- 1.9 Trigger
CREATE TRIGGER create_booking_notification_trigger
  AFTER INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.create_booking_notification();

-- 1.10 Comments
COMMENT ON TABLE public.notifications IS 'V1 mentor-facing notifications. Written exclusively by the create_booking_notification trigger. Mentors read and mark-as-read via RLS-protected SELECT/UPDATE.';
COMMENT ON FUNCTION public.create_booking_notification() IS 'AFTER INSERT trigger on bookings. Creates one notification per confirmed booking for the mentor. Snapshots student name and booking details. Errors are swallowed to ensure notifications never abort bookings.';
