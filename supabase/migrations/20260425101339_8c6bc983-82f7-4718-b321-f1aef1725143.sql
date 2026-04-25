-- Weekly availability (recurring)
CREATE TABLE public.mentor_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mentor_id uuid NOT NULL,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_hour smallint NOT NULL CHECK (start_hour BETWEEN 8 AND 22),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mentor_id, day_of_week, start_hour)
);
ALTER TABLE public.mentor_availability ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Mentors view own availability" ON public.mentor_availability FOR SELECT TO authenticated USING (auth.uid() = mentor_id);
CREATE POLICY "Mentors insert own availability" ON public.mentor_availability FOR INSERT TO authenticated WITH CHECK (auth.uid() = mentor_id);
CREATE POLICY "Mentors delete own availability" ON public.mentor_availability FOR DELETE TO authenticated USING (auth.uid() = mentor_id);

-- Sessions
CREATE TYPE public.session_status AS ENUM ('upcoming', 'completed', 'cancelled');

CREATE TABLE public.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mentor_id uuid NOT NULL,
  student_id uuid NOT NULL,
  scheduled_at timestamptz NOT NULL,
  duration_minutes int NOT NULL DEFAULT 45,
  amount_inr int NOT NULL DEFAULT 0,
  status public.session_status NOT NULL DEFAULT 'upcoming',
  call_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Mentor or student view session" ON public.sessions FOR SELECT TO authenticated USING (auth.uid() = mentor_id OR auth.uid() = student_id);
CREATE POLICY "Mentor update session" ON public.sessions FOR UPDATE TO authenticated USING (auth.uid() = mentor_id);
CREATE POLICY "Student insert session" ON public.sessions FOR INSERT TO authenticated WITH CHECK (auth.uid() = student_id);

CREATE INDEX sessions_mentor_idx ON public.sessions (mentor_id, scheduled_at);
CREATE INDEX sessions_student_idx ON public.sessions (student_id, scheduled_at);

-- Session notes (one per session, written by mentor)
CREATE TABLE public.session_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL UNIQUE,
  mentor_id uuid NOT NULL,
  student_id uuid NOT NULL,
  summary text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.session_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Mentor or student view notes" ON public.session_notes FOR SELECT TO authenticated USING (auth.uid() = mentor_id OR auth.uid() = student_id);
CREATE POLICY "Mentor insert notes" ON public.session_notes FOR INSERT TO authenticated WITH CHECK (auth.uid() = mentor_id);
CREATE POLICY "Mentor update notes" ON public.session_notes FOR UPDATE TO authenticated USING (auth.uid() = mentor_id);
CREATE POLICY "Mentor delete notes" ON public.session_notes FOR DELETE TO authenticated USING (auth.uid() = mentor_id);

-- Action points
CREATE TABLE public.session_action_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id uuid NOT NULL REFERENCES public.session_notes(id) ON DELETE CASCADE,
  mentor_id uuid NOT NULL,
  student_id uuid NOT NULL,
  content text NOT NULL,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.session_action_points ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Mentor or student view action points" ON public.session_action_points FOR SELECT TO authenticated USING (auth.uid() = mentor_id OR auth.uid() = student_id);
CREATE POLICY "Mentor insert action points" ON public.session_action_points FOR INSERT TO authenticated WITH CHECK (auth.uid() = mentor_id);
CREATE POLICY "Mentor update action points" ON public.session_action_points FOR UPDATE TO authenticated USING (auth.uid() = mentor_id);
CREATE POLICY "Mentor delete action points" ON public.session_action_points FOR DELETE TO authenticated USING (auth.uid() = mentor_id);

-- Payouts
CREATE TABLE public.mentor_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mentor_id uuid NOT NULL,
  amount_inr int NOT NULL,
  payout_date date NOT NULL,
  status text NOT NULL DEFAULT 'scheduled',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.mentor_payouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Mentor view payouts" ON public.mentor_payouts FOR SELECT TO authenticated USING (auth.uid() = mentor_id);

-- Trigger to keep session_notes.updated_at fresh
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER session_notes_touch
BEFORE UPDATE ON public.session_notes
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();