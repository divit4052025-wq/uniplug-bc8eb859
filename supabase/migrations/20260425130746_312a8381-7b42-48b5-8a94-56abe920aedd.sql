CREATE TABLE public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mentor_id uuid NOT NULL,
  student_id uuid NOT NULL,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mentor_id, student_id)
);

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view reviews"
  ON public.reviews FOR SELECT TO authenticated USING (true);

CREATE POLICY "Students insert own reviews"
  ON public.reviews FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = student_id);

CREATE POLICY "Students update own reviews"
  ON public.reviews FOR UPDATE TO authenticated
  USING (auth.uid() = student_id);

CREATE POLICY "Students delete own reviews"
  ON public.reviews FOR DELETE TO authenticated
  USING (auth.uid() = student_id);

CREATE INDEX idx_reviews_mentor ON public.reviews(mentor_id);

CREATE OR REPLACE FUNCTION public.get_mentor_public_profile(_mentor_id uuid)
RETURNS TABLE(id uuid, full_name text, university text, countries text[], course text, year text, price_inr int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT m.id, m.full_name, m.university, m.countries, m.course, m.year, m.price_inr
  FROM public.mentors m
  WHERE m.id = _mentor_id AND m.status = 'approved'::public.mentor_status;
$$;

CREATE OR REPLACE FUNCTION public.get_review_student_names(_ids uuid[])
RETURNS TABLE(id uuid, full_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT s.id, s.full_name FROM public.students s WHERE s.id = ANY(_ids);
$$;