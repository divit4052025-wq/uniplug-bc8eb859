
-- Schools
CREATE TABLE public.student_schools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('dream', 'target', 'safety')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.student_schools ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Students view own schools" ON public.student_schools
  FOR SELECT TO authenticated USING (auth.uid() = student_id);
CREATE POLICY "Students insert own schools" ON public.student_schools
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = student_id);
CREATE POLICY "Students update own schools" ON public.student_schools
  FOR UPDATE TO authenticated USING (auth.uid() = student_id);
CREATE POLICY "Students delete own schools" ON public.student_schools
  FOR DELETE TO authenticated USING (auth.uid() = student_id);
CREATE INDEX idx_student_schools_student ON public.student_schools(student_id);

-- Documents
CREATE TABLE public.student_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  size_bytes BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.student_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Students view own documents" ON public.student_documents
  FOR SELECT TO authenticated USING (auth.uid() = student_id);
CREATE POLICY "Students insert own documents" ON public.student_documents
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = student_id);
CREATE POLICY "Students delete own documents" ON public.student_documents
  FOR DELETE TO authenticated USING (auth.uid() = student_id);
CREATE INDEX idx_student_documents_student ON public.student_documents(student_id);

-- Storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('student-documents', 'student-documents', false)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Students view own files" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'student-documents' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Students upload own files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'student-documents' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Students delete own files" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'student-documents' AND auth.uid()::text = (storage.foldername(name))[1]);
