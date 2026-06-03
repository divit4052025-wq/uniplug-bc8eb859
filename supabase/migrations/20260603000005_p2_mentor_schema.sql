-- ════════════════════════════════════════════════════════════════════════════
-- Phase 2: mentor profile schema — extend mentors for the mentor signup wizard,
-- add the admits matching join, wire specialty + enrolment ref links.
-- ════════════════════════════════════════════════════════════════════════════
--
-- WHY: the mentor signup wizard needs structured profile fields, a single
-- specialty (drives the mascot), canonical enrolment links, and the admits list
-- (the matching key joined against students' target universities on
-- ref_universities). Additive; extends what exists, greenfields nothing.
--
-- READ-PRIVACY (load-bearing): public.mentors SELECT is OWNER-ONLY
-- (auth.uid() = id). Non-owners / students never read the mentors table
-- directly — browse goes through column-narrowed SECURITY DEFINER RPCs
-- (list_approved_mentor_profiles, get_mentor_public_profile). So the new private
-- fields below (phone, college_email, date_of_birth, …) are safe-by-default:
-- invisible to everyone but the owner unless a future RPC opts them in.
--
-- ADDITIVE ONLY — nothing existing is dropped / renamed / behaviour-changed:
--   - mentors: + date_of_birth, phone, college_email, specialty_id (→
--     ref_specialties), ref_university_id (→ ref_universities), ref_course_id
--     (→ ref_courses), max_active_mentees, re_review_pending. All nullable
--     (re_review_pending NOT NULL DEFAULT false). REUSES year/bio/price_inr and
--     the free-text university/course (kept as labels; ref_*_id are the clean
--     canonical links — same posture as student_schools). The existing
--     prevent_mentor_self_approval lock trigger is UNTOUCHED.
--   - NOTE price_inr: already exists NOT NULL DEFAULT 1800. The brief asked for a
--     ₹1000 placeholder; changing an existing default is a behaviour change, so
--     it is LEFT at 1800 (reuse). Flagged for review.
--   - mentor_admits: NEW owner-scoped join — mentor_id + ref_university_id (the
--     clean matching key, STRICT) + nullable proof_path (filled at finalize;
--     proofs live in the existing mentor-documents bucket). Supports add+remove.
--   - re_review_pending lock: a NEW additive BEFORE UPDATE trigger keeps it
--     admin/service-controlled NOW (RLS can't enforce column-immutability —
--     there is no OLD in WITH CHECK). The "editing a verified field flips this"
--     auto-flag logic is a LATER phase and is intentionally NOT built here.
--   - handle_new_user: CREATE OR REPLACE to populate the new mentor columns from
--     signup metadata. Backward compatible (absent keys behave as today; student
--     branch + the legal_acceptances block are byte-for-byte unchanged). Trigger
--     on_auth_user_created NOT recreated.
--
-- REUSES (no new objects): mentor-documents bucket (private, owner-prefix) for
-- college-ID + admit proofs — already has owner RLS + an admin signed-URL review
-- path; legal_acceptances (doc_type 'mentor_agreement' already in CHECK + already
-- recorded by handle_new_user). No new storage bucket / policy, no new legal table.
--
-- OUT OF SCOPE (deliberately NOT built): payout/banking details, book_session
-- mentee-limit enforcement, the re_review auto-flag trigger logic, public-profile
-- masking / contact-stripping (the child-safety RLS phase).
--
-- Idempotent (ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS, CREATE INDEX
-- IF NOT EXISTS, CREATE OR REPLACE FUNCTION, DROP TRIGGER/POLICY IF EXISTS).
--
-- Verification: supabase/dev-seeds/p2-mentor-schema-verification.sql
-- ════════════════════════════════════════════════════════════════════════════

-- ─── mentors: new profile columns (all mentor-self-editable except re_review_pending) ───

ALTER TABLE public.mentors
  ADD COLUMN IF NOT EXISTS date_of_birth      date,
  ADD COLUMN IF NOT EXISTS phone              text,
  ADD COLUMN IF NOT EXISTS college_email      text,
  ADD COLUMN IF NOT EXISTS specialty_id       uuid REFERENCES public.ref_specialties(id)  ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ref_university_id  uuid REFERENCES public.ref_universities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ref_course_id      uuid REFERENCES public.ref_courses(id)      ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS max_active_mentees integer,
  ADD COLUMN IF NOT EXISTS re_review_pending  boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS mentors_specialty_idx       ON public.mentors (specialty_id);
CREATE INDEX IF NOT EXISTS mentors_ref_university_idx  ON public.mentors (ref_university_id);
CREATE INDEX IF NOT EXISTS mentors_ref_course_idx      ON public.mentors (ref_course_id);

COMMENT ON COLUMN public.mentors.college_email IS
  'Phase 2 (2026-06-03): the verified college email (retained as the verification credential even if the mentor later switches login to a personal email — that switch is a later phase). Nullable; populated at signup.';
COMMENT ON COLUMN public.mentors.specialty_id IS
  'Phase 2 (2026-06-03): the mentor''s SINGLE specialty (drives the mascot) → ref_specialties (the 6 fixed). Nullable; one per mentor.';
COMMENT ON COLUMN public.mentors.ref_university_id IS
  'Phase 2 (2026-06-03): canonical link for the mentor''s current enrolment university → ref_universities. Free-text mentors.university is kept as the label; this is the clean id. Nullable.';
COMMENT ON COLUMN public.mentors.ref_course_id IS
  'Phase 2 (2026-06-03): canonical link for the mentor''s current course → ref_courses. Free-text mentors.course kept as label. Nullable.';
COMMENT ON COLUMN public.mentors.max_active_mentees IS
  'Phase 2 (2026-06-03): mentor''s self-set cap on concurrent active mentees. COLUMN ONLY this phase — enforcement in book_session lands later. NULL = no limit.';
COMMENT ON COLUMN public.mentors.re_review_pending IS
  'Phase 2 (2026-06-03): true when a verified mentor edited a verification-relevant field and needs admin re-review. Admin/service-controlled (locked by prevent_mentor_re_review_tamper). The auto-flip-on-edit logic is a LATER phase; this phase ships the column + lock only.';

-- ─── re_review_pending lock: NEW additive BEFORE UPDATE trigger (does not touch
--     the existing prevent_mentor_self_approval). Mirrors that trigger's shape. ───

CREATE OR REPLACE FUNCTION public.prevent_mentor_re_review_tamper()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.re_review_pending IS NOT DISTINCT FROM OLD.re_review_pending THEN
    RETURN NEW;
  END IF;
  IF coalesce(auth.jwt() ->> 'role', '') = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 're_review_pending is admin-controlled and cannot be changed by a mentor.'
    USING ERRCODE = 'P0001';
END;
$$;

DROP TRIGGER IF EXISTS mentors_prevent_re_review_tamper ON public.mentors;
CREATE TRIGGER mentors_prevent_re_review_tamper
  BEFORE UPDATE ON public.mentors
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_mentor_re_review_tamper();

COMMENT ON FUNCTION public.prevent_mentor_re_review_tamper() IS
  'Phase 2 (2026-06-03): column-lock — only admin / service_role may change mentors.re_review_pending (RLS cannot express column-immutability). Additive; separate from prevent_mentor_self_approval. No auto-flag logic (later phase).';

-- ════════════════════════════════════════════════════════════════════════════
-- mentor_admits — the universities a mentor was admitted to (matching key)
-- ════════════════════════════════════════════════════════════════════════════
-- ref_university_id is STRICT (NOT NULL) — kept clean for the student-targets ↔
-- mentor-admits join. A mentor whose admit uni isn't in ref_universities uses the
-- Phase 0 "request to add" flow first. proof_path is nullable (filled at finalize;
-- the file lives in the existing private mentor-documents bucket under the
-- mentor's own auth-uid prefix). Supports add (INSERT) and remove (DELETE).

CREATE TABLE IF NOT EXISTS public.mentor_admits (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mentor_id         uuid NOT NULL REFERENCES public.mentors(id) ON DELETE CASCADE,
  ref_university_id uuid NOT NULL REFERENCES public.ref_universities(id) ON DELETE CASCADE,
  proof_path        text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mentor_id, ref_university_id)
);

CREATE INDEX IF NOT EXISTS mentor_admits_mentor_idx ON public.mentor_admits (mentor_id);
CREATE INDEX IF NOT EXISTS mentor_admits_ref_university_idx ON public.mentor_admits (ref_university_id);

ALTER TABLE public.mentor_admits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Mentors view own admits" ON public.mentor_admits;
CREATE POLICY "Mentors view own admits"
  ON public.mentor_admits FOR SELECT TO authenticated
  USING (auth.uid() = mentor_id);

DROP POLICY IF EXISTS "Mentors insert own admits" ON public.mentor_admits;
CREATE POLICY "Mentors insert own admits"
  ON public.mentor_admits FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = mentor_id);

DROP POLICY IF EXISTS "Mentors update own admits" ON public.mentor_admits;
CREATE POLICY "Mentors update own admits"
  ON public.mentor_admits FOR UPDATE TO authenticated
  USING (auth.uid() = mentor_id)
  WITH CHECK (auth.uid() = mentor_id);

DROP POLICY IF EXISTS "Mentors delete own admits" ON public.mentor_admits;
CREATE POLICY "Mentors delete own admits"
  ON public.mentor_admits FOR DELETE TO authenticated
  USING (auth.uid() = mentor_id);

COMMENT ON TABLE public.mentor_admits IS
  'Phase 2 (2026-06-03): universities a mentor was admitted to at application time (multi-add). ref_university_id is the STRICT clean matching key joined against students'' target universities (student_schools.ref_university_id) on ref_universities. proof_path → a file in the private mentor-documents bucket (owner-prefix), nullable until finalize. Owner-scoped RLS (auth.uid() = mentor_id); admin review is server-side via supabaseAdmin after is_admin(). No public/admin SELECT policy — mirrors the mentors owner-only posture.';

-- ════════════════════════════════════════════════════════════════════════════
-- handle_new_user — CREATE OR REPLACE: populate the new mentor columns from
-- signup metadata. Student branch + legal_acceptances block unchanged. Trigger
-- on_auth_user_created NOT recreated. Backward compatible (absent keys → as today).
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
  -- Phase 2 mentor locals
  v_phone_m         text;
  v_college_email   text;
  v_specialty_key   text;
  v_specialty_id    uuid;
  v_ref_university_id uuid;
  v_ref_course_id   uuid;
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

    -- Phase 2: optional mentor profile fields (no guard — NULL flows through,
    -- so existing clients that send only university/course/year still succeed).
    v_phone_m       := NULLIF(trim(NEW.raw_user_meta_data ->> 'phone'), '');
    v_college_email := NULLIF(trim(NEW.raw_user_meta_data ->> 'college_email'), '');
    v_bio           := NULLIF(trim(NEW.raw_user_meta_data ->> 'bio'), '');

    v_specialty_key := NULLIF(trim(NEW.raw_user_meta_data ->> 'specialty'), '');
    IF v_specialty_key IS NOT NULL THEN
      SELECT id INTO v_specialty_id FROM public.ref_specialties WHERE key = v_specialty_key;
    END IF;

    v_dob_raw := NULLIF(trim(NEW.raw_user_meta_data ->> 'date_of_birth'), '');
    IF v_dob_raw IS NOT NULL THEN
      BEGIN
        v_dob := v_dob_raw::date;
      EXCEPTION WHEN OTHERS THEN
        v_dob := NULL;
      END;
    END IF;

    -- Canonical enrolment links: accept a resolved ref id, but never let a bad /
    -- stale id break signup (malformed → NULL; non-existent → NULL).
    BEGIN
      v_ref_university_id := NULLIF(NEW.raw_user_meta_data ->> 'university_id', '')::uuid;
    EXCEPTION WHEN OTHERS THEN
      v_ref_university_id := NULL;
    END;
    IF v_ref_university_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.ref_universities WHERE id = v_ref_university_id) THEN
      v_ref_university_id := NULL;
    END IF;

    BEGIN
      v_ref_course_id := NULLIF(NEW.raw_user_meta_data ->> 'course_id', '')::uuid;
    EXCEPTION WHEN OTHERS THEN
      v_ref_course_id := NULL;
    END;
    IF v_ref_course_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.ref_courses WHERE id = v_ref_course_id) THEN
      v_ref_course_id := NULL;
    END IF;

    INSERT INTO public.mentors (
      id, full_name, email, university, course, year, countries,
      phone, college_email, bio, date_of_birth, specialty_id, ref_university_id, ref_course_id
    )
    VALUES (
      NEW.id, v_full_name, v_email, v_university, v_course, v_year, v_countries,
      v_phone_m, v_college_email, v_bio, v_dob, v_specialty_id, v_ref_university_id, v_ref_course_id
    );
  END IF;

  -- Phase 1: append-only legal acceptances captured at signup (optional keys —
  -- absent → no rows). SECURITY DEFINER bypasses RLS.
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
  'Phase 2 (2026-06-03): atomic signup trigger fn. Student branch unchanged (board/bio + consent). Mentor branch now also populates optional phone/college_email/bio/date_of_birth/specialty (key→ref_specialties)/university_id+course_id (validated → NULL if unknown) from metadata; required university/course/year guards unchanged. Records terms/privacy (both) + mentor_agreement (mentors) into legal_acceptances when version keys present. Backward compatible; trigger not recreated.';
