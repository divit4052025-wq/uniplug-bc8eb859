
-- Students table
CREATE TABLE public.students (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  school TEXT NOT NULL,
  grade TEXT NOT NULL,
  countries TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can view own row" ON public.students
  FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Students can insert own row" ON public.students
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Students can update own row" ON public.students
  FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Mentors table
CREATE TYPE public.mentor_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE public.mentors (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  university TEXT NOT NULL,
  course TEXT NOT NULL,
  year TEXT NOT NULL,
  countries TEXT[] NOT NULL DEFAULT '{}',
  status public.mentor_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.mentors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Mentors can view own row" ON public.mentors
  FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Mentors can insert own row" ON public.mentors
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Mentors can update own row" ON public.mentors
  FOR UPDATE TO authenticated USING (auth.uid() = id);
