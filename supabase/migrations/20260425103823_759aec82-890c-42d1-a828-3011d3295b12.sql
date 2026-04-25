CREATE TABLE IF NOT EXISTS public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  mentor_id uuid NOT NULL,
  date date NOT NULL,
  time_slot text NOT NULL,
  duration integer NOT NULL DEFAULT 30,
  price integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'confirmed',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT bookings_duration_positive CHECK (duration > 0),
  CONSTRAINT bookings_status_valid CHECK (status IN ('confirmed', 'cancelled', 'completed')),
  CONSTRAINT bookings_time_slot_format CHECK (time_slot ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
);

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS bookings_confirmed_slot_unique
ON public.bookings (mentor_id, date, time_slot)
WHERE status = 'confirmed';

CREATE INDEX IF NOT EXISTS idx_bookings_student_upcoming
ON public.bookings (student_id, status, date);

CREATE INDEX IF NOT EXISTS idx_bookings_mentor_date
ON public.bookings (mentor_id, date);

DROP POLICY IF EXISTS "Students can create own bookings" ON public.bookings;
CREATE POLICY "Students can create own bookings"
ON public.bookings
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = student_id);

DROP POLICY IF EXISTS "Students can view own bookings" ON public.bookings;
CREATE POLICY "Students can view own bookings"
ON public.bookings
FOR SELECT
TO authenticated
USING (auth.uid() = student_id);

DROP POLICY IF EXISTS "Mentors can view their bookings" ON public.bookings;
CREATE POLICY "Mentors can view their bookings"
ON public.bookings
FOR SELECT
TO authenticated
USING (auth.uid() = mentor_id);

DROP POLICY IF EXISTS "Students can cancel own confirmed bookings" ON public.bookings;
CREATE POLICY "Students can cancel own confirmed bookings"
ON public.bookings
FOR UPDATE
TO authenticated
USING (auth.uid() = student_id AND status = 'confirmed')
WITH CHECK (auth.uid() = student_id AND status = 'cancelled');

DROP POLICY IF EXISTS "Mentors can update their bookings" ON public.bookings;
CREATE POLICY "Mentors can update their bookings"
ON public.bookings
FOR UPDATE
TO authenticated
USING (auth.uid() = mentor_id)
WITH CHECK (auth.uid() = mentor_id);