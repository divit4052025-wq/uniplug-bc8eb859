-- Phase F1: mentor verification — document columns + private storage bucket
-- + per-mentor storage RLS + extension of prevent_mentor_self_approval to
-- lock the new admin-only columns.
--
-- Background: today's "Verified" badge on the mentor profile (rendered
-- in mentor.$id.tsx) is a lie — there's no mechanism to actually verify
-- a mentor's identity / enrollment. This migration adds the data shape
-- so mentors can upload their ID + enrollment letter to private storage,
-- admins can review them via a SECURITY DEFINER-issued signed URL, and
-- admins can mark the mentor verified by setting verified_at/verified_by.
--
-- Columns on public.mentors (all NULL-permitting, populated on the
-- mentor's upload + admin's approval respectively):
--   id_document_path       — Storage path for the mentor's ID upload;
--                            mentor-writable on their own row.
--   enrollment_letter_path — Storage path for enrollment letter; same.
--   verified_at            — Set by admin via admin_set_mentor_status
--                            (extended in a follow-up to also accept a
--                            verification flag); ADMIN-ONLY (locked).
--   verified_by            — auth.uid() of the admin who verified;
--                            ADMIN-ONLY (locked).
--   verification_notes     — Optional admin notes (esp. for rejections);
--                            ADMIN-ONLY (locked).
--
-- Storage: a new private bucket `mentor-documents` mirrors the
-- existing `student-documents` bucket pattern (per-user prefix in path:
-- `<mentor_uuid>/<filename>`). Mentor INSERT/SELECT/DELETE on own
-- prefix; no mentor UPDATE policy (re-upload = DELETE + INSERT). Admin
-- SELECT is via the server-fn calling storage.createSignedUrl after
-- verifying is_admin() — no DB-side admin SELECT policy on
-- storage.objects so the surface stays narrow.
--
-- Trigger lock extension: prevent_mentor_self_approval gains the three
-- new admin-only columns. Paths stay mentor-writable so the short-
-- circuit only requires status / price_inr / verified_at / verified_by /
-- verification_notes to all be unchanged for the mentor self-write path.
--
-- Idempotent (ALTER TABLE ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE
-- FUNCTION, ON CONFLICT for bucket insert, DROP POLICY IF EXISTS).
--
-- Verification: supabase/dev-seeds/f1-mentor-verification-verification.sql

-- ─── Columns ────────────────────────────────────────────────────────────────
ALTER TABLE public.mentors
  ADD COLUMN IF NOT EXISTS id_document_path       text,
  ADD COLUMN IF NOT EXISTS enrollment_letter_path text,
  ADD COLUMN IF NOT EXISTS verified_at            timestamptz,
  ADD COLUMN IF NOT EXISTS verified_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verification_notes     text;

CREATE INDEX IF NOT EXISTS mentors_verified_at_idx
  ON public.mentors (verified_at)
  WHERE verified_at IS NOT NULL;

-- ─── Extended trigger: lock the new admin-only columns ────────────────────
CREATE OR REPLACE FUNCTION public.prevent_mentor_self_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- No-op short-circuit: all admin-controlled columns unchanged.
  IF OLD.status              IS NOT DISTINCT FROM NEW.status
     AND OLD.price_inr           IS NOT DISTINCT FROM NEW.price_inr
     AND OLD.verified_at         IS NOT DISTINCT FROM NEW.verified_at
     AND OLD.verified_by         IS NOT DISTINCT FROM NEW.verified_by
     AND OLD.verification_notes  IS NOT DISTINCT FROM NEW.verification_notes
  THEN
    RETURN NEW;
  END IF;

  IF coalesce(auth.jwt() ->> 'role', '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Mentor status, pricing, and verification fields can only be changed by an administrator.'
    USING ERRCODE = 'P0001';
END;
$$;

COMMENT ON FUNCTION public.prevent_mentor_self_approval() IS
  'BEFORE UPDATE trigger on public.mentors. Phase F1 (2026-05-23) extended to lock verified_at, verified_by, verification_notes alongside the A2 status/price_inr lock. Document path columns (id_document_path, enrollment_letter_path) stay mentor-writable so mentors can upload + replace their own files. Bypass: service_role or is_admin().';

-- ─── Private storage bucket ────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('mentor-documents', 'mentor-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: per-mentor prefix isolation.
DROP POLICY IF EXISTS "Mentors view own documents" ON storage.objects;
CREATE POLICY "Mentors view own documents" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'mentor-documents'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Mentors upload own documents" ON storage.objects;
CREATE POLICY "Mentors upload own documents" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'mentor-documents'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Mentors delete own documents" ON storage.objects;
CREATE POLICY "Mentors delete own documents" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'mentor-documents'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
-- No UPDATE policy by design — mentors re-upload (DELETE + INSERT) rather
-- than rename, so the path fields on public.mentors stay in sync. Admin
-- SELECT against the bucket happens via supabaseAdmin in a server-fn
-- that first checks is_admin() — no DB-side admin SELECT policy added
-- (keeps the storage.objects surface narrow).
