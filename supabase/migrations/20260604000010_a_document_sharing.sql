-- ============================================================================
-- A — Document sharing (booking/overview-centric model)
-- ============================================================================
-- A student uploads documents (student_documents — owner-only, already exists).
-- This phase lets a mentor the student has booked SEE (and annotate / return an
-- edited version of) those documents, gated by a per-document visibility:
--
--   visibility='all_booked'  → any mentor with a confirmed/completed booking
--                              (the existing overview gate) may see it.
--   visibility='restricted'  → only mentors with an explicit document_shares row.
--
-- New tables: document_shares (student grants a restricted doc to one mentor),
-- document_notes (either party annotates a doc), document_versions (a mentor's
-- edited return / a student revision; per-doc capped). All cross-party READS go
-- through the SECURITY DEFINER get_student_overview_for_mentor (extended here);
-- all cross-party WRITES go through SECURITY DEFINER RPCs that re-check access.
-- Owner students keep direct owner-scoped RLS reads.
--
-- ADDITIVE: one new column (defaulted so existing docs keep today's behaviour),
-- three new tables, three new RPCs, one cap trigger; get_student_overview_for_mentor
-- is CREATE OR REPLACE (its return TYPE is unchanged — only the documents jsonb
-- content is filtered/enriched).
--
-- OUT OF SCOPE / FLAGGED: byte-level download. The overview returns storage_path
-- but the private student-documents bucket is owner-uuid-prefix RLS, so a mentor
-- cannot fetch the bytes today. A signed-URL server fn honouring the SAME
-- visibility/share gate is the remaining storage piece (the plan's storage-trust
-- fork) — deliberately not built here.
-- ============================================================================

-- ── 1. student_documents.visibility ────────────────────────────────────────
ALTER TABLE public.student_documents
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'all_booked';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'student_documents_visibility_valid') THEN
    ALTER TABLE public.student_documents
      ADD CONSTRAINT student_documents_visibility_valid
      CHECK (visibility IN ('all_booked', 'restricted'));
  END IF;
END $$;

COMMENT ON COLUMN public.student_documents.visibility IS
  'A (2026-06-04): all_booked = visible to any mentor with a confirmed/completed booking; restricted = only mentors granted via document_shares. Default all_booked preserves the pre-A behaviour (overview returned every doc).';

-- ── 2. document_shares — student grants a RESTRICTED doc to one mentor ──────
CREATE TABLE IF NOT EXISTS public.document_shares (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.student_documents(id) ON DELETE CASCADE,
  mentor_id   uuid NOT NULL,           -- plain uuid (durability; FK-free like chat participants)
  created_by  uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, mentor_id)
);
CREATE INDEX IF NOT EXISTS document_shares_mentor_idx ON public.document_shares (mentor_id);
CREATE INDEX IF NOT EXISTS document_shares_document_idx ON public.document_shares (document_id);

-- ── 3. document_notes — either party annotates a document ───────────────────
CREATE TABLE IF NOT EXISTS public.document_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.student_documents(id) ON DELETE CASCADE,
  author_id   uuid NOT NULL,
  body        text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS document_notes_document_idx ON public.document_notes (document_id, created_at DESC);

-- ── 4. document_versions — mentor edited-return / student revision (capped) ──
CREATE TABLE IF NOT EXISTS public.document_versions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  uuid NOT NULL REFERENCES public.student_documents(id) ON DELETE CASCADE,
  version_no   integer NOT NULL,
  file_name    text NOT NULL,
  storage_path text NOT NULL,
  size_bytes   bigint,
  uploaded_by  uuid NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, version_no)
);
CREATE INDEX IF NOT EXISTS document_versions_document_idx ON public.document_versions (document_id, version_no DESC);

-- Per-document cap on versions (the per-doc access/size limit). Constant kept in
-- the trigger so it's one-line-tunable.
CREATE OR REPLACE FUNCTION public.enforce_document_version_cap()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
DECLARE
  c_max_versions constant integer := 10;
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.document_versions WHERE document_id = NEW.document_id;
  IF v_count >= c_max_versions THEN
    RAISE EXCEPTION 'this document has reached its version limit (%).', c_max_versions
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS document_versions_cap ON public.document_versions;
CREATE TRIGGER document_versions_cap
  BEFORE INSERT ON public.document_versions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_document_version_cap();

-- ── 5. RLS — owner/author/uploader direct reads; cross-party via DEFINER RPCs ─
ALTER TABLE public.document_shares   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_notes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.document_shares, public.document_notes, public.document_versions TO authenticated;
-- No client INSERT/UPDATE/DELETE — all writes go through the SECURITY DEFINER RPCs below.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.document_shares, public.document_notes, public.document_versions FROM authenticated, anon;

-- document_shares: the doc-owner student and the target mentor may read.
CREATE POLICY "doc share visible to owner and target mentor" ON public.document_shares
  FOR SELECT TO authenticated
  USING (
    auth.uid() = mentor_id
    OR auth.uid() = (SELECT sd.student_id FROM public.student_documents sd WHERE sd.id = document_id)
  );

-- document_notes: the doc-owner student and the note author may read directly;
-- a booked mentor reads them via the gated overview RPC.
CREATE POLICY "doc note visible to owner and author" ON public.document_notes
  FOR SELECT TO authenticated
  USING (
    auth.uid() = author_id
    OR auth.uid() = (SELECT sd.student_id FROM public.student_documents sd WHERE sd.id = document_id)
  );

-- document_versions: the doc-owner student and the uploader may read directly.
CREATE POLICY "doc version visible to owner and uploader" ON public.document_versions
  FOR SELECT TO authenticated
  USING (
    auth.uid() = uploaded_by
    OR auth.uid() = (SELECT sd.student_id FROM public.student_documents sd WHERE sd.id = document_id)
  );

-- ── 6. Access helper: may this caller see this document? ────────────────────
-- A booked mentor sees a doc iff visibility='all_booked' OR an explicit share;
-- the owning student always sees their own. SECURITY DEFINER (reads across rows).
CREATE OR REPLACE FUNCTION public.can_access_document(_document_id uuid, _viewer uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_student uuid;
  v_vis     text;
BEGIN
  SELECT sd.student_id, sd.visibility INTO v_student, v_vis
    FROM public.student_documents sd WHERE sd.id = _document_id;
  IF NOT FOUND THEN RETURN false; END IF;
  IF _viewer = v_student THEN RETURN true; END IF;                 -- owner
  -- mentor must have an active (confirmed/completed) booking relationship …
  IF NOT public.booking_relationship_is_active(v_student, _viewer) THEN RETURN false; END IF;
  -- … and the doc must be all_booked OR explicitly shared to them.
  IF v_vis = 'all_booked' THEN RETURN true; END IF;
  RETURN EXISTS (SELECT 1 FROM public.document_shares s WHERE s.document_id = _document_id AND s.mentor_id = _viewer);
END;
$function$;

COMMENT ON FUNCTION public.can_access_document(uuid, uuid) IS
  'A: TRUE if _viewer is the owning student, or a mentor with a confirmed/completed booking AND the doc is all_booked or explicitly shared to them. The single access predicate for doc-sharing reads/writes.';

-- ── 7. Write RPCs (cross-party, access-checked) ─────────────────────────────
-- 7a. Student grants a RESTRICTED document to a mentor they have booked.
CREATE OR REPLACE FUNCTION public.share_student_document(_document_id uuid, _mentor_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_caller  uuid := auth.uid();
  v_student uuid;
  v_id      uuid;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501'; END IF;
  SELECT sd.student_id INTO v_student FROM public.student_documents sd WHERE sd.id = _document_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'document not found' USING ERRCODE = 'P0001'; END IF;
  IF v_student <> v_caller THEN
    RAISE EXCEPTION 'only the owning student can share this document' USING ERRCODE = '42501';
  END IF;
  -- May only share with a mentor the student actually has an active relationship with.
  IF NOT public.booking_relationship_is_active(v_caller, _mentor_id) THEN
    RAISE EXCEPTION 'you can only share with a mentor you have a confirmed session with' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.document_shares (document_id, mentor_id, created_by)
  VALUES (_document_id, _mentor_id, v_caller)
  ON CONFLICT (document_id, mentor_id) DO UPDATE SET created_at = public.document_shares.created_at
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

-- 7b. Either party (with access) adds a note on a document.
CREATE OR REPLACE FUNCTION public.add_document_note(_document_id uuid, _body text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_id     uuid;
  v_body   text := btrim(coalesce(_body, ''));
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501'; END IF;
  IF v_body = '' THEN RAISE EXCEPTION 'note body required' USING ERRCODE = 'P0001'; END IF;
  IF NOT public.can_access_document(_document_id, v_caller) THEN
    RAISE EXCEPTION 'you do not have access to this document' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.document_notes (document_id, author_id, body)
  VALUES (_document_id, v_caller, v_body)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

-- 7c. Either party (with access) adds a version (e.g. a mentor's edited return).
CREATE OR REPLACE FUNCTION public.add_document_version(_document_id uuid, _file_name text, _storage_path text, _size_bytes bigint DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_id     uuid;
  v_next   integer;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501'; END IF;
  IF coalesce(btrim(_file_name),'') = '' OR coalesce(btrim(_storage_path),'') = '' THEN
    RAISE EXCEPTION 'file_name and storage_path required' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public.can_access_document(_document_id, v_caller) THEN
    RAISE EXCEPTION 'you do not have access to this document' USING ERRCODE = '42501';
  END IF;
  SELECT coalesce(max(version_no), 0) + 1 INTO v_next FROM public.document_versions WHERE document_id = _document_id;
  INSERT INTO public.document_versions (document_id, version_no, file_name, storage_path, size_bytes, uploaded_by)
  VALUES (_document_id, v_next, _file_name, _storage_path, _size_bytes, v_caller)
  RETURNING id INTO v_id;   -- the per-doc cap trigger fires here
  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.share_student_document(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.add_document_note(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.add_document_version(uuid, text, text, bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_access_document(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.share_student_document(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.add_document_note(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.add_document_version(uuid, text, text, bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_document(uuid, uuid) TO authenticated, service_role;

-- ── 8. Extend get_student_overview_for_mentor: GATE docs by visibility/share ─
-- Return TYPE is unchanged (documents jsonb) → CREATE OR REPLACE. The documents
-- array is now FILTERED to docs this mentor may access and ENRICHED with
-- visibility, shared flag, notes, and versions.
CREATE OR REPLACE FUNCTION public.get_student_overview_for_mentor(_student_id uuid)
RETURNS TABLE(student_id uuid, full_name text, school text, grade text, documents jsonb, schools jsonb)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_mentor uuid := auth.uid();
BEGIN
  -- Unchanged gate: caller must hold a confirmed/completed booking with this student.
  IF NOT public.booking_relationship_is_active(_student_id, v_mentor) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    s.id AS student_id,
    s.full_name,
    s.school,
    s.grade,
    COALESCE(
      (SELECT jsonb_agg(
          jsonb_build_object(
            'id',           d.id,
            'file_name',    d.file_name,
            'storage_path', d.storage_path,
            'size_bytes',   d.size_bytes,
            'created_at',   d.created_at,
            'visibility',   d.visibility,
            'shared',       (d.visibility = 'restricted'),
            -- Notes/versions are scoped to the CALLING mentor's own rows + the
            -- owning student's rows — a mentor must NOT see a DIFFERENT mentor's
            -- private notes / edited-version paths on a shared student's doc
            -- (folded from review A-1).
            'notes', COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                       'id', n.id, 'author_id', n.author_id, 'body', n.body, 'created_at', n.created_at)
                     ORDER BY n.created_at DESC)
              FROM public.document_notes n
              WHERE n.document_id = d.id
                AND (n.author_id = v_mentor OR n.author_id = _student_id)), '[]'::jsonb),
            'versions', COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                       'id', v.id, 'version_no', v.version_no, 'file_name', v.file_name,
                       'storage_path', v.storage_path, 'size_bytes', v.size_bytes,
                       'uploaded_by', v.uploaded_by, 'created_at', v.created_at)
                     ORDER BY v.version_no DESC)
              FROM public.document_versions v
              WHERE v.document_id = d.id
                AND (v.uploaded_by = v_mentor OR v.uploaded_by = _student_id)), '[]'::jsonb)
          ) ORDER BY d.created_at DESC
        )
        FROM public.student_documents d
        WHERE d.student_id = _student_id
          -- THE GATE: all_booked is visible to any booked mentor; restricted only if explicitly shared.
          AND (d.visibility = 'all_booked'
               OR EXISTS (SELECT 1 FROM public.document_shares sh
                          WHERE sh.document_id = d.id AND sh.mentor_id = v_mentor))
      ),
      '[]'::jsonb
    ) AS documents,
    COALESCE(
      (SELECT jsonb_agg(
          jsonb_build_object('id', sc.id, 'name', sc.name, 'category', sc.category, 'created_at', sc.created_at)
          ORDER BY sc.created_at DESC)
        FROM public.student_schools sc
        WHERE sc.student_id = _student_id
      ),
      '[]'::jsonb
    ) AS schools
  FROM public.students s
  WHERE s.id = _student_id;
END;
$function$;

COMMENT ON FUNCTION public.get_student_overview_for_mentor(uuid) IS
  'P4 contact-strip + A (2026-06-04): booking-gated mentor view of a student. NO email/phone (hotfix 20260603000006). documents now FILTERED by per-doc visibility/share (all_booked or restricted+shared) and enriched with notes + versions. Uses booking_relationship_is_active (C-3).';
