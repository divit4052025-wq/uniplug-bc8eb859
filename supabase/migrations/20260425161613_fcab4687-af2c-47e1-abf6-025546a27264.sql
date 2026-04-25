-- 1) Extend session_notes
ALTER TABLE public.session_notes
  ADD COLUMN IF NOT EXISTS booking_id uuid,
  ADD COLUMN IF NOT EXISTS action_points jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_session_notes_booking_id ON public.session_notes(booking_id);
CREATE INDEX IF NOT EXISTS idx_session_notes_student_id ON public.session_notes(student_id);
CREATE INDEX IF NOT EXISTS idx_session_notes_mentor_id ON public.session_notes(mentor_id);

-- session_id was previously NOT NULL; relax it so booking-based notes work without a sessions row
ALTER TABLE public.session_notes ALTER COLUMN session_id DROP NOT NULL;

-- 2) action_point_completions table
CREATE TABLE IF NOT EXISTS public.action_point_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_note_id uuid NOT NULL REFERENCES public.session_notes(id) ON DELETE CASCADE,
  action_point_index integer NOT NULL,
  completed boolean NOT NULL DEFAULT false,
  student_id uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_note_id, action_point_index)
);

ALTER TABLE public.action_point_completions ENABLE ROW LEVEL SECURITY;

-- Students manage their own completions
DROP POLICY IF EXISTS "Students view own completions" ON public.action_point_completions;
CREATE POLICY "Students view own completions"
  ON public.action_point_completions
  FOR SELECT TO authenticated
  USING (auth.uid() = student_id);

DROP POLICY IF EXISTS "Students insert own completions" ON public.action_point_completions;
CREATE POLICY "Students insert own completions"
  ON public.action_point_completions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = student_id);

DROP POLICY IF EXISTS "Students update own completions" ON public.action_point_completions;
CREATE POLICY "Students update own completions"
  ON public.action_point_completions
  FOR UPDATE TO authenticated
  USING (auth.uid() = student_id)
  WITH CHECK (auth.uid() = student_id);

-- Mentors can view completions for notes they authored
DROP POLICY IF EXISTS "Mentors view completions for their notes" ON public.action_point_completions;
CREATE POLICY "Mentors view completions for their notes"
  ON public.action_point_completions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.session_notes n
    WHERE n.id = action_point_completions.session_note_id
      AND n.mentor_id = auth.uid()
  ));

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_action_point_completions_touch ON public.action_point_completions;
CREATE TRIGGER trg_action_point_completions_touch
  BEFORE UPDATE ON public.action_point_completions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();