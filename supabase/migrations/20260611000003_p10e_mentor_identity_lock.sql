-- ============================================================================
-- P10e — mentor identity / document column-tamper lock (verification integrity).
-- ============================================================================
-- THE GAP (found by the P10 adversarial security review): the mentor profile
-- editor (SettingsSection) self-restricts to a 4-column allowlist (bio, topics,
-- photo_url, phone) — but that is a CLIENT control only. At the data layer the
-- `mentors` table has a table-wide UPDATE grant to `authenticated` and an UPDATE
-- RLS policy of just USING (auth.uid()=id) with no WITH CHECK. The existing
-- prevent_mentor_self_approval trigger locks ONLY the 8 admin/verification
-- columns (status, price_inr, verified_*, verification_notes,
-- application_submitted_at, tier, college_email). Its branch (1) returns NEW
-- whenever none of those 8 changed — so a mentor crafting a raw
-- `from('mentors').update({ university: 'forged', id_document_path: 'swap' })`
-- (bypassing the frontend) could tamper with their VERIFIED IDENTITY: the
-- academic fields students see + that drove the email-tier classification, and —
-- worst — swap their approved ID / enrollment document out from under the
-- approval.
--
-- WRITE-PATH INVESTIGATION (every legitimate mentor write to these columns):
--   • university/course/year/ref_university_id/ref_course_id/specialty_id/
--     full_name/email/countries/date_of_birth/max_active_mentees — set ONCE at
--     signup by handle_new_user() from the auth metadata (an INSERT; this
--     BEFORE UPDATE trigger never fires for it). NO client UPDATE path exists
--     (grep src/: the only direct mentors UPDATEs are the two document paths).
--   • id_document_path / enrollment_letter_path — set (and possibly re-uploaded)
--     by the finalize/resubmit flow via mentorWrite.ts while the application is
--     PENDING or REJECTED. After approval they must be frozen.
--   • Admin verification + ops write everything via is_admin()/service_role.
--
-- FIX: a companion BEFORE UPDATE trigger (alongside, not replacing, the existing
-- two — lower risk than reshaping the audited self-approval branches). For a
-- non-admin / non-service caller it REJECTS any change to the identity/capacity
-- columns, and freezes the two document paths once status='approved'. The
-- editor's 4 safe columns are untouched, so the legitimate profile edit still
-- passes; finalize (pending) / resubmit (rejected) document uploads still pass.
--
-- This pairs the frontend allowlist with a real data-layer boundary, matching
-- the bookings (P10a) / students (consent_column_lock) privilege-lock philosophy.
--
-- Verification: supabase/dev-seeds/p10e-mentor-identity-lock-verification.sql
-- ============================================================================

CREATE OR REPLACE FUNCTION public.prevent_mentor_identity_tamper()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Admin / service bypass (admin verification queue + ops set anything).
  IF coalesce(auth.jwt() ->> 'role', '') = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  -- Verified identity + capacity columns: NO legitimate mentor-UPDATE path
  -- (born at signup via handle_new_user). Any self-edit is tampering.
  IF OLD.university           IS DISTINCT FROM NEW.university
     OR OLD.course            IS DISTINCT FROM NEW.course
     OR OLD.year              IS DISTINCT FROM NEW.year
     OR OLD.ref_university_id  IS DISTINCT FROM NEW.ref_university_id
     OR OLD.ref_course_id      IS DISTINCT FROM NEW.ref_course_id
     OR OLD.specialty_id       IS DISTINCT FROM NEW.specialty_id
     OR OLD.full_name          IS DISTINCT FROM NEW.full_name
     OR OLD.email              IS DISTINCT FROM NEW.email
     OR OLD.countries          IS DISTINCT FROM NEW.countries
     OR OLD.date_of_birth      IS DISTINCT FROM NEW.date_of_birth
     OR OLD.max_active_mentees IS DISTINCT FROM NEW.max_active_mentees
  THEN
    RAISE EXCEPTION
      'Mentor identity (name, university, course, capacity, date of birth) can only be changed by an administrator.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Verification documents: the finalize/resubmit flow legitimately uploads (and
  -- may re-upload) the ID + enrollment proof while PENDING/REJECTED. Once
  -- APPROVED they are frozen — an approved mentor must not swap the verified
  -- document out from under the approval.
  IF OLD.status = 'approved'::public.mentor_status
     AND (OLD.id_document_path       IS DISTINCT FROM NEW.id_document_path
          OR OLD.enrollment_letter_path IS DISTINCT FROM NEW.enrollment_letter_path)
  THEN
    RAISE EXCEPTION 'Verification documents cannot be changed after approval.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.prevent_mentor_identity_tamper() IS
  'P10e (2026-06-11): BEFORE UPDATE companion lock on public.mentors. Rejects a non-admin/non-service mentor self-edit of the verified-identity + capacity columns (university/course/year/ref_*/specialty_id/full_name/email/countries/date_of_birth/max_active_mentees — none of which have a legitimate client UPDATE path) and freezes id_document_path/enrollment_letter_path once status=approved. The profile editor''s safe columns (bio/topics/photo_url/phone) and the pending/rejected finalize document uploads are unaffected. Pairs the frontend allowlist with a data-layer boundary.';

DROP TRIGGER IF EXISTS mentors_prevent_identity_tamper ON public.mentors;
CREATE TRIGGER mentors_prevent_identity_tamper
  BEFORE UPDATE ON public.mentors
  FOR EACH ROW EXECUTE FUNCTION public.prevent_mentor_identity_tamper();
