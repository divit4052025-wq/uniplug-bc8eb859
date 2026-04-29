-- Bug 4 / Step 1: convention alignment for the booking calendar rebuild.
--   * bookings.duration default: 30 → 60 (existing rows untouched)
--   * mentor_availability.day_of_week: switch range to ISO 1..7 (1=Mon..7=Sun)
--   * Foreign keys on mentor_availability + bookings (none existed)
--   * Drop redundant SELECT policy on mentor_availability

-- 1.1 New default duration for fresh bookings
ALTER TABLE public.bookings
  ALTER COLUMN duration SET DEFAULT 60;

-- 1.2 mentor_availability.mentor_id → mentors(id) ON DELETE CASCADE
ALTER TABLE public.mentor_availability
  ADD CONSTRAINT mentor_availability_mentor_id_fkey
    FOREIGN KEY (mentor_id) REFERENCES public.mentors(id) ON DELETE CASCADE;

-- 1.3 bookings.mentor_id → mentors(id) ON DELETE SET NULL (column made nullable)
ALTER TABLE public.bookings
  ALTER COLUMN mentor_id DROP NOT NULL;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_mentor_id_fkey
    FOREIGN KEY (mentor_id) REFERENCES public.mentors(id) ON DELETE SET NULL;

-- 1.4 bookings.student_id → students(id) ON DELETE SET NULL (column made nullable)
ALTER TABLE public.bookings
  ALTER COLUMN student_id DROP NOT NULL;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_student_id_fkey
    FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE SET NULL;

-- 1.5 day_of_week: switch from 0..6 to ISO 1..7
--   The investigation prompt expected no range constraint, but one already exists
--   (BETWEEN 0 AND 6). Drop it first, then add the new ISO constraint. The table
--   is empty (verified) so no row migration is needed.
ALTER TABLE public.mentor_availability
  DROP CONSTRAINT mentor_availability_day_of_week_check;

ALTER TABLE public.mentor_availability
  ADD CONSTRAINT mentor_availability_day_of_week_check
    CHECK (day_of_week BETWEEN 1 AND 7);

-- 1.6 (no change to bookings_status_valid — confirmed/cancelled/completed only)

-- 1.7 Drop the redundant per-mentor SELECT policy (broader policy already covers it)
DROP POLICY IF EXISTS "Mentors view own availability" ON public.mentor_availability;
