-- ════════════════════════════════════════════════════════════════════════════
-- Phase 0: reference / taxonomy layer — strict pick-lists, lenient schools,
-- an academic-email-domain allowlist, and the "can't find it? request to add"
-- moderation queue.
-- ════════════════════════════════════════════════════════════════════════════
--
-- WHY: the V1 student & mentor signup flows need canonical, ID-keyed pick-lists
-- instead of free text. ref_universities is the shared matching key — student
-- target universities ↔ mentor admits join cleanly on the same id. The other
-- ref_* tables (courses, subjects, sports, co-curriculars, project categories,
-- specialties) feed the existing AI matching/personalisation. Schools are the
-- one LENIENT axis: India's school list cannot be cleanly seeded, so ref_schools
-- is suggestion-only and must NEVER block signup (free-text capture stays on the
-- existing students.school column — untouched here). When a user can't find an
-- entry, create_ref_add_request files it into ref_add_requests for admin review.
--
-- WHAT THIS ADDS (additive only — nothing existing is dropped / renamed /
-- altered; students.school, student_schools, mentors.university/course/topics
-- all stay exactly as they are):
--   - extension pg_trgm (typeahead) in the extensions schema
--   - 9 reference tables: ref_universities / ref_courses / ref_subjects /
--     ref_sports / ref_cocurriculars / ref_project_categories / ref_specialties /
--     ref_schools / ref_academic_domains
--   - ref_add_requests — the user-submitted add-to-taxonomy moderation queue
--   - RLS on every table: default-deny; public-among-authenticated SELECT;
--     admin-only INSERT/UPDATE/DELETE via the existing public.is_admin().
--     ref_add_requests is readable by its own requester + admin, and written
--     only through the SECURITY DEFINER RPCs below (no client write policy).
--   - GIN trigram indexes on every searchable name (pg_trgm)
--   - RPCs (all SECURITY DEFINER):
--       search_reference / search_schools — anon-callable typeahead (signup runs
--         before the password step, so typeahead must work pre-auth)
--       create_ref_add_request           — authenticated; files an add-request
--       admin_promote_ref_add_request    — admin-only; inserts the proposed name
--                                           into the right ref_* table + approves
--       admin_reject_ref_add_request     — admin-only; rejects with a reason
--
-- Reuses the existing public.is_admin() predicate (defined in
-- 20260425132312_*.sql) — NO new admin check is introduced.
--
-- NOTE — "public SELECT" in the brief is implemented as TO authenticated
-- USING (true) to match this repo's policy convention (client policies are
-- always scoped TO authenticated, never anon). Pre-auth typeahead is served
-- by the anon-granted SECURITY DEFINER search RPCs instead of by opening the
-- tables directly to anon.
--
-- Static seed data ships in the paired follow-up migration
-- 20260603000002_p0_ref_seed.sql.
--
-- Idempotent (CREATE EXTENSION IF NOT EXISTS, CREATE TABLE IF NOT EXISTS,
-- CREATE INDEX IF NOT EXISTS, CREATE OR REPLACE FUNCTION, DROP POLICY IF EXISTS
-- before CREATE POLICY).
--
-- Verification: supabase/dev-seeds/p0-ref-taxonomy-verification.sql
-- ════════════════════════════════════════════════════════════════════════════

-- The extensions schema is platform-provided on Supabase (local + hosted);
-- create-if-not-exists keeps this migration self-contained / portable.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- ─── ref_universities — STRICT; the matching key (student targets ↔ mentor admits) ───

CREATE TABLE IF NOT EXISTS public.ref_universities (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  country     text,
  aliases     text[] NOT NULL DEFAULT '{}',
  source      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ref_universities_name_trgm_idx
  ON public.ref_universities USING gin (name extensions.gin_trgm_ops);

ALTER TABLE public.ref_universities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ref_universities readable by authenticated" ON public.ref_universities;
CREATE POLICY "ref_universities readable by authenticated"
  ON public.ref_universities FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "ref_universities insert admin only" ON public.ref_universities;
CREATE POLICY "ref_universities insert admin only"
  ON public.ref_universities FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "ref_universities update admin only" ON public.ref_universities;
CREATE POLICY "ref_universities update admin only"
  ON public.ref_universities FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "ref_universities delete admin only" ON public.ref_universities;
CREATE POLICY "ref_universities delete admin only"
  ON public.ref_universities FOR DELETE TO authenticated
  USING (public.is_admin());

COMMENT ON TABLE public.ref_universities IS
  'Phase 0 (2026-06-03): STRICT canonical university list. The shared matching key — student target universities and mentor admits both reference these ids. aliases[] holds common alternate names (e.g. "IIT Bombay") so typeahead resolves them. RLS: authenticated read-all, admin-only write. Seeded in 20260603000002_p0_ref_seed.sql; long tail via ref_add_requests.';

-- ─── ref_courses — STRICT ───

CREATE TABLE IF NOT EXISTS public.ref_courses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ref_courses_name_trgm_idx
  ON public.ref_courses USING gin (name extensions.gin_trgm_ops);

ALTER TABLE public.ref_courses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ref_courses readable by authenticated" ON public.ref_courses;
CREATE POLICY "ref_courses readable by authenticated"
  ON public.ref_courses FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "ref_courses insert admin only" ON public.ref_courses;
CREATE POLICY "ref_courses insert admin only"
  ON public.ref_courses FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "ref_courses update admin only" ON public.ref_courses;
CREATE POLICY "ref_courses update admin only"
  ON public.ref_courses FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "ref_courses delete admin only" ON public.ref_courses;
CREATE POLICY "ref_courses delete admin only"
  ON public.ref_courses FOR DELETE TO authenticated
  USING (public.is_admin());

COMMENT ON TABLE public.ref_courses IS
  'Phase 0 (2026-06-03): STRICT canonical course / field-of-study list (student desired courses; mentor enrolment course is free-text on mentors.course, untouched). RLS: authenticated read-all, admin-only write.';

-- ─── ref_subjects — STRICT ───

CREATE TABLE IF NOT EXISTS public.ref_subjects (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ref_subjects_name_trgm_idx
  ON public.ref_subjects USING gin (name extensions.gin_trgm_ops);

ALTER TABLE public.ref_subjects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ref_subjects readable by authenticated" ON public.ref_subjects;
CREATE POLICY "ref_subjects readable by authenticated"
  ON public.ref_subjects FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "ref_subjects insert admin only" ON public.ref_subjects;
CREATE POLICY "ref_subjects insert admin only"
  ON public.ref_subjects FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "ref_subjects update admin only" ON public.ref_subjects;
CREATE POLICY "ref_subjects update admin only"
  ON public.ref_subjects FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "ref_subjects delete admin only" ON public.ref_subjects;
CREATE POLICY "ref_subjects delete admin only"
  ON public.ref_subjects FOR DELETE TO authenticated
  USING (public.is_admin());

COMMENT ON TABLE public.ref_subjects IS
  'Phase 0 (2026-06-03): STRICT canonical school-subjects list (student subjects). RLS: authenticated read-all, admin-only write.';

-- ─── ref_sports — STRICT ───

CREATE TABLE IF NOT EXISTS public.ref_sports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ref_sports_name_trgm_idx
  ON public.ref_sports USING gin (name extensions.gin_trgm_ops);

ALTER TABLE public.ref_sports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ref_sports readable by authenticated" ON public.ref_sports;
CREATE POLICY "ref_sports readable by authenticated"
  ON public.ref_sports FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "ref_sports insert admin only" ON public.ref_sports;
CREATE POLICY "ref_sports insert admin only"
  ON public.ref_sports FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "ref_sports update admin only" ON public.ref_sports;
CREATE POLICY "ref_sports update admin only"
  ON public.ref_sports FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "ref_sports delete admin only" ON public.ref_sports;
CREATE POLICY "ref_sports delete admin only"
  ON public.ref_sports FOR DELETE TO authenticated
  USING (public.is_admin());

COMMENT ON TABLE public.ref_sports IS
  'Phase 0 (2026-06-03): STRICT canonical sports list (student interests axis; feeds AI matching against mentor specialty). RLS: authenticated read-all, admin-only write.';

-- ─── ref_cocurriculars — STRICT ───

CREATE TABLE IF NOT EXISTS public.ref_cocurriculars (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ref_cocurriculars_name_trgm_idx
  ON public.ref_cocurriculars USING gin (name extensions.gin_trgm_ops);

ALTER TABLE public.ref_cocurriculars ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ref_cocurriculars readable by authenticated" ON public.ref_cocurriculars;
CREATE POLICY "ref_cocurriculars readable by authenticated"
  ON public.ref_cocurriculars FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "ref_cocurriculars insert admin only" ON public.ref_cocurriculars;
CREATE POLICY "ref_cocurriculars insert admin only"
  ON public.ref_cocurriculars FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "ref_cocurriculars update admin only" ON public.ref_cocurriculars;
CREATE POLICY "ref_cocurriculars update admin only"
  ON public.ref_cocurriculars FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "ref_cocurriculars delete admin only" ON public.ref_cocurriculars;
CREATE POLICY "ref_cocurriculars delete admin only"
  ON public.ref_cocurriculars FOR DELETE TO authenticated
  USING (public.is_admin());

COMMENT ON TABLE public.ref_cocurriculars IS
  'Phase 0 (2026-06-03): STRICT canonical co-curriculars list (student interests axis). RLS: authenticated read-all, admin-only write.';

-- ─── ref_project_categories — STRICT ───

CREATE TABLE IF NOT EXISTS public.ref_project_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ref_project_categories_name_trgm_idx
  ON public.ref_project_categories USING gin (name extensions.gin_trgm_ops);

ALTER TABLE public.ref_project_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ref_project_categories readable by authenticated" ON public.ref_project_categories;
CREATE POLICY "ref_project_categories readable by authenticated"
  ON public.ref_project_categories FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "ref_project_categories insert admin only" ON public.ref_project_categories;
CREATE POLICY "ref_project_categories insert admin only"
  ON public.ref_project_categories FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "ref_project_categories update admin only" ON public.ref_project_categories;
CREATE POLICY "ref_project_categories update admin only"
  ON public.ref_project_categories FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "ref_project_categories delete admin only" ON public.ref_project_categories;
CREATE POLICY "ref_project_categories delete admin only"
  ON public.ref_project_categories FOR DELETE TO authenticated
  USING (public.is_admin());

COMMENT ON TABLE public.ref_project_categories IS
  'Phase 0 (2026-06-03): STRICT canonical academic / science project categories (student interests axis). RLS: authenticated read-all, admin-only write.';

-- ─── ref_specialties — STRICT, closed set of six (drives the mentor mascot) ───

CREATE TABLE IF NOT EXISTS public.ref_specialties (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text NOT NULL UNIQUE,
  label       text NOT NULL,
  mascot_key  text NOT NULL UNIQUE,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ref_specialties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ref_specialties readable by authenticated" ON public.ref_specialties;
CREATE POLICY "ref_specialties readable by authenticated"
  ON public.ref_specialties FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "ref_specialties insert admin only" ON public.ref_specialties;
CREATE POLICY "ref_specialties insert admin only"
  ON public.ref_specialties FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "ref_specialties update admin only" ON public.ref_specialties;
CREATE POLICY "ref_specialties update admin only"
  ON public.ref_specialties FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "ref_specialties delete admin only" ON public.ref_specialties;
CREATE POLICY "ref_specialties delete admin only"
  ON public.ref_specialties FOR DELETE TO authenticated
  USING (public.is_admin());

COMMENT ON TABLE public.ref_specialties IS
  'Phase 0 (2026-06-03): the six fixed mentor specialties (General, Essays, Sports, Co-curriculars, Projects, Competitive-exam prep). A mentor picks exactly one; mascot_key drives the mascot. Closed set — NOT user-addable via ref_add_requests. RLS: authenticated read-all, admin-only write.';

-- ─── ref_schools — LENIENT, suggestion-only (NEVER blocks signup) ───

CREATE TABLE IF NOT EXISTS public.ref_schools (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ref_schools_name_trgm_idx
  ON public.ref_schools USING gin (name extensions.gin_trgm_ops);

ALTER TABLE public.ref_schools ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ref_schools readable by authenticated" ON public.ref_schools;
CREATE POLICY "ref_schools readable by authenticated"
  ON public.ref_schools FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "ref_schools insert admin only" ON public.ref_schools;
CREATE POLICY "ref_schools insert admin only"
  ON public.ref_schools FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "ref_schools update admin only" ON public.ref_schools;
CREATE POLICY "ref_schools update admin only"
  ON public.ref_schools FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "ref_schools delete admin only" ON public.ref_schools;
CREATE POLICY "ref_schools delete admin only"
  ON public.ref_schools FOR DELETE TO authenticated
  USING (public.is_admin());

COMMENT ON TABLE public.ref_schools IS
  'Phase 0 (2026-06-03): LENIENT, suggestion-only school list for typeahead. India''s school list cannot be cleanly seeded, so this NEVER blocks signup — the authoritative free-text value stays on students.school (untouched). Whatever a student types is captured there for later normalisation against this table. RLS: authenticated read-all, admin-only write.';

-- ─── ref_academic_domains — soft allowlist for mentor college-email validation ───

CREATE TABLE IF NOT EXISTS public.ref_academic_domains (
  domain      text PRIMARY KEY,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ref_academic_domains ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ref_academic_domains readable by authenticated" ON public.ref_academic_domains;
CREATE POLICY "ref_academic_domains readable by authenticated"
  ON public.ref_academic_domains FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "ref_academic_domains insert admin only" ON public.ref_academic_domains;
CREATE POLICY "ref_academic_domains insert admin only"
  ON public.ref_academic_domains FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "ref_academic_domains update admin only" ON public.ref_academic_domains;
CREATE POLICY "ref_academic_domains update admin only"
  ON public.ref_academic_domains FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "ref_academic_domains delete admin only" ON public.ref_academic_domains;
CREATE POLICY "ref_academic_domains delete admin only"
  ON public.ref_academic_domains FOR DELETE TO authenticated
  USING (public.is_admin());

COMMENT ON TABLE public.ref_academic_domains IS
  'Phase 0 (2026-06-03): soft allowlist of Indian academic email domains for mentor college-email validation. A FLAG, never a hard block — an unmatched domain falls back to manual review, it does not reject the mentor. domain is the lowercased suffix (e.g. ac.in, iitb.ac.in). RLS: authenticated read-all, admin-only write.';

-- ─── ref_add_requests — user-submitted "can't find it? request to add" queue ───

CREATE TABLE IF NOT EXISTS public.ref_add_requests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind             text NOT NULL
    CHECK (kind IN ('university','course','subject','sport','cocurricular','project_category','school')),
  proposed_name    text NOT NULL CHECK (btrim(proposed_name) <> ''),
  requested_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status           text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected')),
  decision_reason  text,
  decided_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ref_add_requests_status_idx
  ON public.ref_add_requests (status, created_at DESC);

CREATE INDEX IF NOT EXISTS ref_add_requests_requester_idx
  ON public.ref_add_requests (requested_by);

ALTER TABLE public.ref_add_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ref_add_requests readable by requester or admin" ON public.ref_add_requests;
CREATE POLICY "ref_add_requests readable by requester or admin"
  ON public.ref_add_requests FOR SELECT TO authenticated
  USING (requested_by = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "ref_add_requests update admin only" ON public.ref_add_requests;
CREATE POLICY "ref_add_requests update admin only"
  ON public.ref_add_requests FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- No client INSERT or DELETE policy by design — requests are created ONLY via
-- the SECURITY DEFINER create_ref_add_request() RPC (which stamps requested_by =
-- auth.uid()), and moderated via admin_promote_/admin_reject_ref_add_request().
-- The admin UPDATE policy above is defense-in-depth for manual queue edits.

COMMENT ON TABLE public.ref_add_requests IS
  'Phase 0 (2026-06-03): moderation queue for user-submitted "can''t find it? request to add" entries across the strict ref_* taxonomies. Written only via create_ref_add_request() (insert) and admin_promote_/admin_reject_ref_add_request() (decide) — no client write policy. Readable by its requester + admin.';

-- ════════════════════════════════════════════════════════════════════════════
-- RPCs
-- ════════════════════════════════════════════════════════════════════════════

-- search_reference: pg_trgm fuzzy typeahead over a strict name-bearing ref_*
-- table. anon-callable (signup typeahead runs before the password step) — hence
-- SECURITY DEFINER so it can read the tables whose SELECT policy is scoped to
-- authenticated. Validated _kind → table mapping (no SQL injection surface);
-- _q is always a bound parameter. universities also match on aliases[].
CREATE OR REPLACE FUNCTION public.search_reference(_kind text, _q text, _limit integer DEFAULT 20)
RETURNS TABLE (id uuid, name text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_table text;
  v_lim   integer := least(greatest(coalesce(_limit, 20), 1), 50);
BEGIN
  IF _q IS NULL OR btrim(_q) = '' THEN
    RETURN;
  END IF;

  IF _kind = 'university' THEN
    RETURN QUERY
      SELECT u.id, u.name
      FROM public.ref_universities u
      WHERE u.name ILIKE '%' || _q || '%'
         OR EXISTS (SELECT 1 FROM unnest(u.aliases) a WHERE a ILIKE '%' || _q || '%')
      ORDER BY similarity(u.name, _q) DESC, u.name
      LIMIT v_lim;
    RETURN;
  END IF;

  v_table := CASE _kind
    WHEN 'course'           THEN 'ref_courses'
    WHEN 'subject'          THEN 'ref_subjects'
    WHEN 'sport'            THEN 'ref_sports'
    WHEN 'cocurricular'     THEN 'ref_cocurriculars'
    WHEN 'project_category' THEN 'ref_project_categories'
  END;

  IF v_table IS NULL THEN
    RAISE EXCEPTION 'unknown reference kind: %', _kind USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY EXECUTE format(
    'SELECT id, name FROM public.%I
       WHERE name ILIKE $1
       ORDER BY similarity(name, $2) DESC, name
       LIMIT $3', v_table)
  USING '%' || _q || '%', _q, v_lim;
END;
$$;

REVOKE ALL ON FUNCTION public.search_reference(text, text, integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.search_reference(text, text, integer) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.search_reference(text, text, integer) IS
  'Phase 0 (2026-06-03): trigram typeahead over a strict ref_* table (kinds: university, course, subject, sport, cocurricular, project_category). Returns (id, name) ordered by similarity. anon-callable for pre-auth signup typeahead. universities also match aliases[].';

-- search_schools: lenient suggestion typeahead over ref_schools. Suggestion-only
-- — the caller is free to submit whatever they typed; this never gates anything.
CREATE OR REPLACE FUNCTION public.search_schools(_q text, _limit integer DEFAULT 20)
RETURNS TABLE (id uuid, name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  SELECT s.id, s.name
  FROM public.ref_schools s
  WHERE btrim(coalesce(_q, '')) <> ''
    AND s.name ILIKE '%' || _q || '%'
  ORDER BY similarity(s.name, coalesce(_q, '')) DESC, s.name
  LIMIT least(greatest(coalesce(_limit, 20), 1), 50);
$$;

REVOKE ALL ON FUNCTION public.search_schools(text, integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.search_schools(text, integer) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.search_schools(text, integer) IS
  'Phase 0 (2026-06-03): lenient trigram typeahead over ref_schools (suggestion-only — never blocks; free-text capture stays on students.school). anon-callable for pre-auth signup typeahead.';

-- create_ref_add_request: an authenticated user files a "can''t find it" request.
-- SECURITY DEFINER so the insert bypasses the admin-only write posture, but the
-- row is always stamped with the caller''s own auth.uid() as requested_by.
CREATE OR REPLACE FUNCTION public.create_ref_add_request(_kind text, _proposed_name text)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id  uuid;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF _kind NOT IN ('university','course','subject','sport','cocurricular','project_category','school') THEN
    RAISE EXCEPTION 'unknown reference kind: %', _kind USING ERRCODE = 'P0001';
  END IF;
  IF _proposed_name IS NULL OR btrim(_proposed_name) = '' THEN
    RAISE EXCEPTION 'proposed_name is required' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.ref_add_requests (kind, proposed_name, requested_by)
  VALUES (_kind, btrim(_proposed_name), v_uid)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL    ON FUNCTION public.create_ref_add_request(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_ref_add_request(text, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.create_ref_add_request(text, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.create_ref_add_request(text, text) IS
  'Phase 0 (2026-06-03): authenticated user files a request to add _proposed_name to the _kind taxonomy. Stamps requested_by = auth.uid(); status starts pending. Returns the new request id. Specialties are a closed set and are not an accepted kind.';

-- admin_promote_ref_add_request: admin approves a pending request — inserts the
-- proposed name into the matching ref_* table (idempotent) and marks it approved.
CREATE OR REPLACE FUNCTION public.admin_promote_ref_add_request(_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_kind   text;
  v_name   text;
  v_status text;
  v_table  text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT kind, proposed_name, status
    INTO v_kind, v_name, v_status
  FROM public.ref_add_requests
  WHERE id = _id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'request not found: %', _id USING ERRCODE = 'P0001';
  END IF;
  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'request % is not pending (status = %)', _id, v_status USING ERRCODE = 'P0001';
  END IF;

  v_table := CASE v_kind
    WHEN 'university'       THEN 'ref_universities'
    WHEN 'course'           THEN 'ref_courses'
    WHEN 'subject'          THEN 'ref_subjects'
    WHEN 'sport'            THEN 'ref_sports'
    WHEN 'cocurricular'     THEN 'ref_cocurriculars'
    WHEN 'project_category' THEN 'ref_project_categories'
    WHEN 'school'           THEN 'ref_schools'
  END;

  IF v_table IS NULL THEN
    RAISE EXCEPTION 'cannot promote unknown kind: %', v_kind USING ERRCODE = 'P0001';
  END IF;

  EXECUTE format(
    'INSERT INTO public.%I (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', v_table)
  USING v_name;

  UPDATE public.ref_add_requests
  SET status = 'approved', decided_by = auth.uid(), decided_at = now()
  WHERE id = _id;
END;
$$;

REVOKE ALL    ON FUNCTION public.admin_promote_ref_add_request(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_promote_ref_add_request(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.admin_promote_ref_add_request(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_promote_ref_add_request(uuid) IS
  'Phase 0 (2026-06-03): admin-only. Approves a pending ref_add_requests row — inserts proposed_name into the matching ref_* table (ON CONFLICT (name) DO NOTHING) and sets status = approved + decided_by/decided_at. Gated by public.is_admin().';

-- admin_reject_ref_add_request: admin rejects a pending request with a reason.
CREATE OR REPLACE FUNCTION public.admin_reject_ref_add_request(_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.ref_add_requests
  SET status = 'rejected',
      decision_reason = _reason,
      decided_by = auth.uid(),
      decided_at = now()
  WHERE id = _id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no pending request to reject: %', _id USING ERRCODE = 'P0001';
  END IF;
END;
$$;

REVOKE ALL    ON FUNCTION public.admin_reject_ref_add_request(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_reject_ref_add_request(uuid, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.admin_reject_ref_add_request(uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_reject_ref_add_request(uuid, text) IS
  'Phase 0 (2026-06-03): admin-only. Rejects a pending ref_add_requests row, recording decision_reason + decided_by/decided_at. Gated by public.is_admin().';
