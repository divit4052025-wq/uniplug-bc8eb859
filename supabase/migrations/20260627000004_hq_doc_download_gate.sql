-- ============================================================================
-- A2 — Mentor document DOWNLOAD gate (signed-URL byte-access)
-- Pairs with src/lib/documents/download.functions.ts (getDocumentDownloadUrl).
-- ============================================================================
-- The A phase (20260604000010) flagged byte-level download as OUT OF SCOPE:
-- get_student_overview_for_mentor returns storage_path, but the private
-- student-documents bucket is owner-uuid-prefix RLS (20260425094043), so a
-- booked mentor cannot fetch the bytes. This adds the remaining "storage-trust"
-- piece: a thin, JWT-derived access predicate the download server fn calls on
-- the CALLER's JWT before a service-role client mints a short-TTL signed URL.
--
-- WHY A WRAPPER (instead of calling can_access_document directly):
--   can_access_document(_document_id, _viewer) takes the viewer EXPLICITLY (its
--   SQL-internal callers add_document_note/add_document_version pass auth.uid()).
--   A download fn that passed _viewer itself would be only as safe as the value
--   it passes. This wrapper takes NO identity arg and derives the viewer from
--   auth.uid() — exactly like public.is_admin() (the gate getMentorVerificationDocs
--   already uses). If ever called without a user JWT (e.g. accidentally via the
--   service-role client) auth.uid() is NULL and it fails CLOSED. Parity with the
--   authorize_video_join "re-derive the caller from auth.uid()" posture.
--
-- ADDITIVE: one new SECURITY DEFINER function. No table/column/RPC changed, no
-- new storage RLS policy (the storage.objects surface stays narrow; bytes are
-- reached only through the server fn, mirroring F2's mentor-documents design).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.can_mentor_access_document(_document_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT public.can_access_document(_document_id, auth.uid());
$function$;

COMMENT ON FUNCTION public.can_mentor_access_document(uuid) IS
  'A2 (2026-06-27): JWT-derived download gate. TRUE iff the CALLER (auth.uid()) may access this document under the A visibility/share rules (owner student, or booked mentor on an all_booked or explicitly-shared doc). Zero identity args (parity with is_admin) so the byte-download server fn cannot check a viewer other than the JWT caller; fails closed when auth.uid() is NULL. Delegates to can_access_document(_document_id, auth.uid()).';

REVOKE ALL ON FUNCTION public.can_mentor_access_document(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_mentor_access_document(uuid) TO authenticated, service_role;
