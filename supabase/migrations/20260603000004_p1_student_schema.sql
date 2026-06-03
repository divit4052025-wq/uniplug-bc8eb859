-- ════════════════════════════════════════════════════════════════════════════
-- Phase 1: student profile schema — extend students for the signup wizard, wire
-- student↔reference selections, record legal acceptances, add the photo bucket.
-- ════════════════════════════════════════════════════════════════════════════
--
-- WHY: the 10-step student signup wizard needs structured profile fields and
-- ID-keyed selections against the Phase 0 ref_* taxonomy (student target
-- universities ↔ mentor admits join on ref_universities; interests feed AI
-- matching). This adds only what is missing and EXTENDS what already exists.
--
-- ADDITIVE ONLY — nothing existing is dropped, renamed, or behaviour-changed:
--   - students: + board, bio, photo_url (all nullable; existing INSERT paths,
--     the signup-atomicity RPC, and handle_new_user keep working untouched).
--     date_of_birth / grade / school / phone are REUSED (not duplicated); the
--     write-lock trigger students_dob_immutable is left exactly as-is.
--   - student_schools (the existing dream/target/safety target-university
--     shortlist): + nullable ref_university_id FK → ref_universities. We EXTEND
--     this rather than create a duplicate student_universities table — it is
--     already the target-university store (MySchoolsSection, the mentor-overview
--     RPC, and data-export all read it). name stays as the lenient free-text
--     label/fallback, so existing rows and "can't find it" entries survive.
--     Its existing owner-gated RLS already covers the new column; we do NOT
--     touch its policies (a pre-existing UPDATE-without-WITH-CHECK gap is left
--     as-is to honour additive-only; flagged in the Phase 1 report).
--   - 5 NEW student↔ref join tables (net-new — no prior student-side storage):
--     student_courses, student_subjects, student_sports, student_cocurriculars,
--     student_project_categories (projects carries a free-text detail column).
--     Owner-gated RLS (auth.uid() = student_id) with WITH CHECK on insert/update.
--   - legal_acceptances: append-only record of terms/privacy/mentor_agreement
--     acceptance at signup (owner reads/inserts; no UPDATE/DELETE = immutable).
--   - student-photos: NEW private storage bucket, owner-prefix RLS (mirrors the
--     mentor-documents pattern).
--   - handle_new_user: CREATE OR REPLACE to ALSO read optional board/bio and to
--     record legal acceptances from optional signup metadata — fully backward
--     compatible (absent keys → no change vs today). Trigger NOT recreated.
--
-- Reuses public.is_admin() and the Phase 0 ref_* tables. No new admin check.
--
-- Idempotent (ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS, CREATE INDEX
-- IF NOT EXISTS, DROP POLICY IF EXISTS before CREATE POLICY, CREATE OR REPLACE
-- FUNCTION, ON CONFLICT for the bucket).
--
-- Verification: supabase/dev-seeds/p1-student-schema-verification.sql
-- ════════════════════════════════════════════════════════════════════════════

-- ─── students: new profile columns (all nullable — never break existing INSERTs) ───

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS board     text,
  ADD COLUMN IF NOT EXISTS bio       text,
  ADD COLUMN IF NOT EXISTS photo_url text;

COMMENT ON COLUMN public.students.board IS
  'Phase 1 (2026-06-03): school examination board (e.g. CBSE/ICSE/IB/State/A-Levels). Free text, nullable.';
COMMENT ON COLUMN public.students.bio IS
  'Phase 1 (2026-06-03): short student bio. Nullable.';
COMMENT ON COLUMN public.students.photo_url IS
  'Phase 1 (2026-06-03): path/key into the private student-photos storage bucket. Nullable; set post-signup on upload. Visibility-to-mentors is gated elsewhere (consent).';

-- ─── student_schools: link the existing target-university shortlist to ref_universities ───
-- EXTEND, do not duplicate. name stays the lenient free-text label; ref_university_id
-- is the optional canonical link used for the student-targets ↔ mentor-admits match.

ALTER TABLE public.student_schools
  ADD COLUMN IF NOT EXISTS ref_university_id uuid REFERENCES public.ref_universities(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS student_schools_ref_university_idx
  ON public.student_schools (ref_university_id);

COMMENT ON COLUMN public.student_schools.ref_university_id IS
  'Phase 1 (2026-06-03): optional canonical link to ref_universities for the target-university matching key. Nullable — free-text name remains the durable label and lenient "can''t find it" fallback. RLS unchanged (owner-gated by student_id).';

-- ════════════════════════════════════════════════════════════════════════════
-- Student ↔ reference join tables (5 net-new, owner-scoped)
-- ════════════════════════════════════════════════════════════════════════════

-- ─── student_courses → ref_courses ───
CREATE TABLE IF NOT EXISTS public.student_courses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  course_id   uuid NOT NULL REFERENCES public.ref_courses(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, course_id)
);
CREATE INDEX IF NOT EXISTS student_courses_student_idx ON public.student_courses (student_id);
ALTER TABLE public.student_courses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students view own courses" ON public.student_courses;
CREATE POLICY "Students view own courses"
  ON public.student_courses FOR SELECT TO authenticated
  USING (auth.uid() = student_id);
DROP POLICY IF EXISTS "Students insert own courses" ON public.student_courses;
CREATE POLICY "Students insert own courses"
  ON public.student_courses FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = student_id);
DROP POLICY IF EXISTS "Students update own courses" ON public.student_courses;
CREATE POLICY "Students update own courses"
  ON public.student_courses FOR UPDATE TO authenticated
  USING (auth.uid() = student_id)
  WITH CHECK (auth.uid() = student_id);
DROP POLICY IF EXISTS "Students delete own courses" ON public.student_courses;
CREATE POLICY "Students delete own courses"
  ON public.student_courses FOR DELETE TO authenticated
  USING (auth.uid() = student_id);

COMMENT ON TABLE public.student_courses IS
  'Phase 1 (2026-06-03): a student''s desired courses (multi-add), ID-keyed to ref_courses. Owner-scoped RLS (auth.uid() = student_id).';

-- ─── student_subjects → ref_subjects ───
CREATE TABLE IF NOT EXISTS public.student_subjects (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  subject_id  uuid NOT NULL REFERENCES public.ref_subjects(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, subject_id)
);
CREATE INDEX IF NOT EXISTS student_subjects_student_idx ON public.student_subjects (student_id);
ALTER TABLE public.student_subjects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students view own subjects" ON public.student_subjects;
CREATE POLICY "Students view own subjects"
  ON public.student_subjects FOR SELECT TO authenticated
  USING (auth.uid() = student_id);
DROP POLICY IF EXISTS "Students insert own subjects" ON public.student_subjects;
CREATE POLICY "Students insert own subjects"
  ON public.student_subjects FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = student_id);
DROP POLICY IF EXISTS "Students update own subjects" ON public.student_subjects;
CREATE POLICY "Students update own subjects"
  ON public.student_subjects FOR UPDATE TO authenticated
  USING (auth.uid() = student_id)
  WITH CHECK (auth.uid() = student_id);
DROP POLICY IF EXISTS "Students delete own subjects" ON public.student_subjects;
CREATE POLICY "Students delete own subjects"
  ON public.student_subjects FOR DELETE TO authenticated
  USING (auth.uid() = student_id);

COMMENT ON TABLE public.student_subjects IS
  'Phase 1 (2026-06-03): a student''s subjects (multi-add), ID-keyed to ref_subjects. Owner-scoped RLS.';

-- ─── student_sports → ref_sports ───
CREATE TABLE IF NOT EXISTS public.student_sports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  sport_id    uuid NOT NULL REFERENCES public.ref_sports(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, sport_id)
);
CREATE INDEX IF NOT EXISTS student_sports_student_idx ON public.student_sports (student_id);
ALTER TABLE public.student_sports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students view own sports" ON public.student_sports;
CREATE POLICY "Students view own sports"
  ON public.student_sports FOR SELECT TO authenticated
  USING (auth.uid() = student_id);
DROP POLICY IF EXISTS "Students insert own sports" ON public.student_sports;
CREATE POLICY "Students insert own sports"
  ON public.student_sports FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = student_id);
DROP POLICY IF EXISTS "Students update own sports" ON public.student_sports;
CREATE POLICY "Students update own sports"
  ON public.student_sports FOR UPDATE TO authenticated
  USING (auth.uid() = student_id)
  WITH CHECK (auth.uid() = student_id);
DROP POLICY IF EXISTS "Students delete own sports" ON public.student_sports;
CREATE POLICY "Students delete own sports"
  ON public.student_sports FOR DELETE TO authenticated
  USING (auth.uid() = student_id);

COMMENT ON TABLE public.student_sports IS
  'Phase 1 (2026-06-03): a student''s sports (multi-add), ID-keyed to ref_sports. Owner-scoped RLS. Feeds AI matching vs mentor specialty.';

-- ─── student_cocurriculars → ref_cocurriculars ───
CREATE TABLE IF NOT EXISTS public.student_cocurriculars (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  cocurricular_id uuid NOT NULL REFERENCES public.ref_cocurriculars(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, cocurricular_id)
);
CREATE INDEX IF NOT EXISTS student_cocurriculars_student_idx ON public.student_cocurriculars (student_id);
ALTER TABLE public.student_cocurriculars ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students view own cocurriculars" ON public.student_cocurriculars;
CREATE POLICY "Students view own cocurriculars"
  ON public.student_cocurriculars FOR SELECT TO authenticated
  USING (auth.uid() = student_id);
DROP POLICY IF EXISTS "Students insert own cocurriculars" ON public.student_cocurriculars;
CREATE POLICY "Students insert own cocurriculars"
  ON public.student_cocurriculars FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = student_id);
DROP POLICY IF EXISTS "Students update own cocurriculars" ON public.student_cocurriculars;
CREATE POLICY "Students update own cocurriculars"
  ON public.student_cocurriculars FOR UPDATE TO authenticated
  USING (auth.uid() = student_id)
  WITH CHECK (auth.uid() = student_id);
DROP POLICY IF EXISTS "Students delete own cocurriculars" ON public.student_cocurriculars;
CREATE POLICY "Students delete own cocurriculars"
  ON public.student_cocurriculars FOR DELETE TO authenticated
  USING (auth.uid() = student_id);

COMMENT ON TABLE public.student_cocurriculars IS
  'Phase 1 (2026-06-03): a student''s co-curriculars (multi-add), ID-keyed to ref_cocurriculars. Owner-scoped RLS.';

-- ─── student_project_categories → ref_project_categories (carries free-text detail) ───
-- No UNIQUE(student_id, project_category_id): a student may list multiple
-- projects in the same category, differentiated by detail.
CREATE TABLE IF NOT EXISTS public.student_project_categories (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id          uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  project_category_id uuid NOT NULL REFERENCES public.ref_project_categories(id) ON DELETE CASCADE,
  detail              text,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS student_project_categories_student_idx ON public.student_project_categories (student_id);
ALTER TABLE public.student_project_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students view own projects" ON public.student_project_categories;
CREATE POLICY "Students view own projects"
  ON public.student_project_categories FOR SELECT TO authenticated
  USING (auth.uid() = student_id);
DROP POLICY IF EXISTS "Students insert own projects" ON public.student_project_categories;
CREATE POLICY "Students insert own projects"
  ON public.student_project_categories FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = student_id);
DROP POLICY IF EXISTS "Students update own projects" ON public.student_project_categories;
CREATE POLICY "Students update own projects"
  ON public.student_project_categories FOR UPDATE TO authenticated
  USING (auth.uid() = student_id)
  WITH CHECK (auth.uid() = student_id);
DROP POLICY IF EXISTS "Students delete own projects" ON public.student_project_categories;
CREATE POLICY "Students delete own projects"
  ON public.student_project_categories FOR DELETE TO authenticated
  USING (auth.uid() = student_id);

COMMENT ON TABLE public.student_project_categories IS
  'Phase 1 (2026-06-03): a student''s academic/science projects, ID-keyed to ref_project_categories with a free-text detail per project (multiple per category allowed). Owner-scoped RLS.';

-- ════════════════════════════════════════════════════════════════════════════
-- legal_acceptances — append-only record of T&C / privacy / mentor-agreement acceptance
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.legal_acceptances (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  doc_type    text NOT NULL CHECK (doc_type IN ('terms','privacy','mentor_agreement')),
  version     text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS legal_acceptances_user_idx ON public.legal_acceptances (user_id, doc_type);
ALTER TABLE public.legal_acceptances ENABLE ROW LEVEL SECURITY;

-- Owner reads own + admin reads all; owner records own acceptance. No UPDATE /
-- DELETE policy by design → append-only / immutable from the client (mirrors
-- parental_consent_records). handle_new_user (SECURITY DEFINER) also inserts
-- here at signup, bypassing RLS.
DROP POLICY IF EXISTS "Users view own legal acceptances" ON public.legal_acceptances;
CREATE POLICY "Users view own legal acceptances"
  ON public.legal_acceptances FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Users record own legal acceptances" ON public.legal_acceptances;
CREATE POLICY "Users record own legal acceptances"
  ON public.legal_acceptances FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.legal_acceptances IS
  'Phase 1 (2026-06-03): append-only record of legal acceptance (terms/privacy/mentor_agreement + version) captured at signup. RLS: owner reads own + admin reads all; owner inserts own; NO update/delete (immutable). Also written by handle_new_user from optional signup metadata.';

-- ════════════════════════════════════════════════════════════════════════════
-- Private storage bucket: student-photos (owner-only, mirrors mentor-documents)
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public)
VALUES ('student-photos', 'student-photos', false)
ON CONFLICT (id) DO NOTHING;

-- Per-student prefix isolation: files live under '<auth.uid()>/...'.
DROP POLICY IF EXISTS "Students view own photos" ON storage.objects;
CREATE POLICY "Students view own photos" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'student-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Students upload own photos" ON storage.objects;
CREATE POLICY "Students upload own photos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'student-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Students delete own photos" ON storage.objects;
CREATE POLICY "Students delete own photos" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'student-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
-- No UPDATE policy by design — re-upload (DELETE + INSERT), mirroring
-- mentor-documents; keeps the storage.objects surface narrow.

-- ════════════════════════════════════════════════════════════════════════════
-- handle_new_user — CREATE OR REPLACE to populate board/bio + record legal
-- acceptances from optional signup metadata. Backward compatible: absent keys
-- behave exactly as today. Trigger on_auth_user_created is NOT recreated.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role        text;
  v_full_name   text;
  v_email       text;
  v_phone       text;
  v_school      text;
  v_grade       text;
  v_university  text;
  v_course      text;
  v_year        text;
  v_countries   text[];
  v_dob_raw      text;
  v_dob          date;
  v_parent_email text;
  v_parent_phone text;
  v_needs_consent boolean;
  v_token        uuid;
  v_board        text;
  v_bio          text;
  v_terms_ver            text;
  v_privacy_ver          text;
  v_mentor_agreement_ver text;
BEGIN
  v_role := NULLIF(trim(NEW.raw_user_meta_data ->> 'role'), '');
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Account type is required. Please use the student or mentor signup page.'
      USING ERRCODE = 'P0001';
  END IF;
  IF v_role NOT IN ('student', 'mentor') THEN
    RAISE EXCEPTION 'Unsupported account type. Please contact support.'
      USING ERRCODE = 'P0001';
  END IF;

  v_full_name := NULLIF(trim(NEW.raw_user_meta_data ->> 'full_name'), '');
  IF v_full_name IS NULL THEN
    RAISE EXCEPTION 'Full name is required. Please complete the signup form and try again.'
      USING ERRCODE = 'P0001';
  END IF;

  v_email := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data ->> 'email'), ''),
    NULLIF(trim(NEW.email), '')
  );
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'Email is required to create your account.'
      USING ERRCODE = 'P0001';
  END IF;

  IF NEW.raw_user_meta_data ? 'countries'
     AND jsonb_typeof(NEW.raw_user_meta_data -> 'countries') = 'array'
  THEN
    v_countries := ARRAY(
      SELECT jsonb_array_elements_text(NEW.raw_user_meta_data -> 'countries')
    );
  ELSE
    v_countries := ARRAY[]::text[];
  END IF;

  -- Optional legal-acceptance versions (both roles), recorded after the row insert.
  v_terms_ver   := NULLIF(trim(NEW.raw_user_meta_data ->> 'terms_version'), '');
  v_privacy_ver := NULLIF(trim(NEW.raw_user_meta_data ->> 'privacy_version'), '');

  IF v_role = 'student' THEN
    v_phone  := NULLIF(trim(NEW.raw_user_meta_data ->> 'phone'),  '');
    v_school := NULLIF(trim(NEW.raw_user_meta_data ->> 'school'), '');
    v_grade  := NULLIF(trim(NEW.raw_user_meta_data ->> 'grade'),  '');

    IF v_phone IS NULL THEN
      RAISE EXCEPTION 'Phone number is required to create your student account.'
        USING ERRCODE = 'P0001';
    END IF;
    IF v_school IS NULL THEN
      RAISE EXCEPTION 'School is required to create your student account.'
        USING ERRCODE = 'P0001';
    END IF;
    IF v_grade IS NULL THEN
      RAISE EXCEPTION 'Grade is required to create your student account.'
        USING ERRCODE = 'P0001';
    END IF;

    -- Phase 1: optional profile fields (no guard — NULL flows through).
    v_board := NULLIF(trim(NEW.raw_user_meta_data ->> 'board'), '');
    v_bio   := NULLIF(trim(NEW.raw_user_meta_data ->> 'bio'),   '');

    -- DOB: read-if-present, defensively parsed (bad/missing → NULL).
    v_dob_raw := NULLIF(trim(NEW.raw_user_meta_data ->> 'date_of_birth'), '');
    IF v_dob_raw IS NOT NULL THEN
      BEGIN
        v_dob := v_dob_raw::date;
      EXCEPTION WHEN OTHERS THEN
        v_dob := NULL;
      END;
    END IF;
    v_parent_email := NULLIF(trim(NEW.raw_user_meta_data ->> 'parent_email'), '');
    v_parent_phone := NULLIF(trim(NEW.raw_user_meta_data ->> 'parent_phone'), '');

    -- Shared rule (NULL DOB → false → adult path: no token/parent fields).
    v_needs_consent := public.requires_consent_base(v_dob, v_grade);
    IF v_needs_consent THEN
      v_token := gen_random_uuid();
    ELSE
      v_token        := NULL;
      v_parent_email := NULL;
      v_parent_phone := NULL;
    END IF;

    INSERT INTO public.students (
      id, full_name, email, phone, school, grade, countries,
      date_of_birth, parental_consent_email, parent_phone, parental_consent_token,
      board, bio
    )
    VALUES (
      NEW.id, v_full_name, v_email, v_phone, v_school, v_grade, v_countries,
      v_dob, v_parent_email, v_parent_phone, v_token,
      v_board, v_bio
    );

  ELSE
    v_university := NULLIF(trim(NEW.raw_user_meta_data ->> 'university'), '');
    v_course     := NULLIF(trim(NEW.raw_user_meta_data ->> 'course'),     '');
    v_year       := NULLIF(trim(NEW.raw_user_meta_data ->> 'year'),       '');

    IF v_university IS NULL THEN
      RAISE EXCEPTION 'University is required to create your mentor account.'
        USING ERRCODE = 'P0001';
    END IF;
    IF v_course IS NULL THEN
      RAISE EXCEPTION 'Course is required to create your mentor account.'
        USING ERRCODE = 'P0001';
    END IF;
    IF v_year IS NULL THEN
      RAISE EXCEPTION 'Year of study is required to create your mentor account.'
        USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO public.mentors (id, full_name, email, university, course, year, countries)
    VALUES (NEW.id, v_full_name, v_email, v_university, v_course, v_year, v_countries);
  END IF;

  -- Phase 1: append-only legal acceptances captured at signup (optional keys —
  -- absent → no rows, matching today's behaviour). SECURITY DEFINER bypasses RLS.
  IF v_terms_ver IS NOT NULL THEN
    INSERT INTO public.legal_acceptances (user_id, doc_type, version)
    VALUES (NEW.id, 'terms', v_terms_ver);
  END IF;
  IF v_privacy_ver IS NOT NULL THEN
    INSERT INTO public.legal_acceptances (user_id, doc_type, version)
    VALUES (NEW.id, 'privacy', v_privacy_ver);
  END IF;
  IF v_role = 'mentor' THEN
    v_mentor_agreement_ver := NULLIF(trim(NEW.raw_user_meta_data ->> 'mentor_agreement_version'), '');
    IF v_mentor_agreement_ver IS NOT NULL THEN
      INSERT INTO public.legal_acceptances (user_id, doc_type, version)
      VALUES (NEW.id, 'mentor_agreement', v_mentor_agreement_ver);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL    ON FUNCTION public.handle_new_user() FROM public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
GRANT  EXECUTE ON FUNCTION public.handle_new_user() TO authenticated, service_role;

COMMENT ON FUNCTION public.handle_new_user() IS
  'Phase 1 (2026-06-03): atomic signup trigger fn (bound to on_auth_user_created). Creates the student/mentor row from raw_user_meta_data; student branch now also reads optional board/bio. Records terms/privacy (both roles) + mentor_agreement (mentors) into legal_acceptances when version keys are present. Backward compatible — absent keys behave as before. Reuses requires_consent_base for the minor-consent path.';
