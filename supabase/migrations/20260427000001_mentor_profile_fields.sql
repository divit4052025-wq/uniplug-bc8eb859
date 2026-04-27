-- Add bio, topics, photo_url to the mentors table
ALTER TABLE public.mentors
  ADD COLUMN IF NOT EXISTS bio       text,
  ADD COLUMN IF NOT EXISTS topics    text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS photo_url text;

-- Update get_mentor_public_profile RPC to expose the new fields
-- Must drop first because the return type changes (new columns added)
DROP FUNCTION IF EXISTS public.get_mentor_public_profile(uuid);
CREATE OR REPLACE FUNCTION public.get_mentor_public_profile(_mentor_id uuid)
RETURNS TABLE(
  id         uuid,
  full_name  text,
  university text,
  countries  text[],
  course     text,
  year       text,
  price_inr  int,
  bio        text,
  topics     text[],
  photo_url  text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT m.id, m.full_name, m.university, m.countries, m.course, m.year,
         m.price_inr, m.bio, m.topics, m.photo_url
  FROM public.mentors m
  WHERE m.id = _mentor_id
    AND m.status = 'approved'::public.mentor_status;
$$;

-- Storage bucket for mentor profile photos (public so <img src> works without signed URLs)
INSERT INTO storage.buckets (id, name, public)
  VALUES ('mentor-photos', 'mentor-photos', true)
  ON CONFLICT (id) DO NOTHING;

-- RLS for mentor-photos bucket
DROP POLICY IF EXISTS "Mentors upload own photo"   ON storage.objects;
DROP POLICY IF EXISTS "Mentors update own photo"   ON storage.objects;
DROP POLICY IF EXISTS "Mentors delete own photo"   ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view mentor photos" ON storage.objects;

CREATE POLICY "Mentors upload own photo"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'mentor-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Mentors update own photo"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'mentor-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Mentors delete own photo"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'mentor-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Anyone can view mentor photos"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'mentor-photos');
