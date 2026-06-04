-- ============================================================================
-- Consent column-lock — parental_consent_at / parental_consent_token are
-- writable ONLY by the trusted consent path, and the token is NOT readable by
-- end users (child-safety). Hardened per the adversarial security review.
-- ============================================================================
-- The whole minor-safety model (booking gate prevent_booking_minor_no_consent +
-- messaging gate student_has_consent) keys on students.parental_consent_at.
--
-- INVESTIGATION — every write/read path to the consent columns:
--   • record_parental_consent(_token) — SECURITY DEFINER (owner postgres), ANON/
--       token-based (auth.uid() NULL). The legitimate writer of parental_consent_at.
--   • mark_consent_revoked(_student_id) — SECURITY DEFINER, is_admin()-gated.
--   • handle_new_user() — mints the token via INSERT at signup.
--   • request_parental_consent — READS only (sends email).
--   • send-event-email route — reads the token via supabaseAdmin (service_role).
--   • THE HOLES the review found:
--       (1) BLOCKER: students UPDATE RLS = USING(auth.uid()=id), no WITH CHECK,
--           no column lock → a student can `UPDATE students SET parental_consent_at=now()`.
--       (2) BLOCKER: the consent TOKEN sits on the student's own row and BOTH
--           authenticated + anon hold SELECT on it → a student can READ their token
--           and REPLAY record_parental_consent(own_token) to self-consent, going
--           through the legitimate writer (a GUC/trigger lock does NOT stop this).
--
-- FIX (non-forgeable, privilege-layer — preferred over a session-GUC trigger,
-- which the review showed is a spoofable primitive): end-user roles lose UPDATE
-- on the two consent columns and SELECT on the token. The postgres-owned
-- SECURITY DEFINER consent functions bypass column grants, so the trusted path
-- still works. A table-level grant overrides a column REVOKE, so we revoke the
-- table grant and re-grant every OTHER column. Plus a caller-is-not-the-student
-- guard in record_parental_consent (defense-in-depth).
--
-- service_role / postgres are untouched (admin email dispatch + data export keep
-- full access). ADDITIVE to behaviour for every legitimate path; only a student's
-- direct write to / read of the consent secrets is removed.
-- ============================================================================

-- 1. Consent columns NOT directly UPDATE-able by end users (closes hole 1).
--    Re-grant UPDATE on every column EXCEPT parental_consent_at / _token.
REVOKE UPDATE ON public.students FROM authenticated, anon;
GRANT UPDATE (
  id, full_name, email, phone, school, grade, countries, created_at,
  first_session_used, code_of_conduct_accepted_at, date_of_birth,
  parental_consent_email, parent_phone, board, bio, photo_url
) ON public.students TO authenticated;
-- anon never legitimately UPDATEs students (RLS blocked it); it gets no UPDATE.

-- 2. The consent TOKEN is a parent-only capability (delivered by the parent
--    email link); end users must not READ it (closes hole 2 — the replay).
--    Re-grant SELECT on every column EXCEPT parental_consent_token.
REVOKE SELECT ON public.students FROM authenticated, anon;
GRANT SELECT (
  id, full_name, email, phone, school, grade, countries, created_at,
  first_session_used, code_of_conduct_accepted_at, date_of_birth,
  parental_consent_at, parental_consent_email, parent_phone, board, bio, photo_url
) ON public.students TO authenticated;
-- anon had a dead SELECT grant (RLS USING(auth.uid()=id) yields no rows for anon);
-- it is not re-granted. The DEFINER consent RPCs read the token as owner.

-- 3. record_parental_consent: drop the GUC opt-in (no longer needed — the column
--    privilege is the boundary), and add a caller-is-not-the-student guard so a
--    logged-in student can never drive consent for themselves even if a token
--    were obtained out-of-band. (Owner privileges let it write the locked columns.)
CREATE OR REPLACE FUNCTION public.record_parental_consent(_token uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_student_id   uuid;
  v_already      timestamptz;
  v_parent_email text;
  c_scope   constant text[] := ARRAY['data_processing','mentorship_sessions','messaging','session_recording'];
  c_version constant text   := 'v1-2026-05-30';
BEGIN
  IF _token IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT id, parental_consent_at, parental_consent_email
    INTO v_student_id, v_already, v_parent_email
    FROM public.students
   WHERE parental_consent_token = _token
   LIMIT 1;
  IF v_student_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Consent must come from the parent (anon, via the email token link), never
  -- the student themselves. A logged-in student calling this for their own row
  -- is rejected outright (the token is also unreadable by them, per the grants).
  IF auth.uid() IS NOT NULL AND auth.uid() = v_student_id THEN
    RETURN NULL;
  END IF;

  UPDATE public.students
     SET parental_consent_at = COALESCE(parental_consent_at, now())
   WHERE id = v_student_id;

  IF v_already IS NULL THEN
    INSERT INTO public.parental_consent_records
      (student_id, parent_email, consent_scope, consent_version)
    VALUES
      (v_student_id, v_parent_email, c_scope, c_version);
  END IF;

  RETURN v_student_id;
END;
$function$;

COMMENT ON FUNCTION public.record_parental_consent(uuid) IS
  'Parent-only consent recorder (2026-06-04 hardening): writes the privilege-locked parental_consent_at as table owner (DEFINER). Rejects a call where auth.uid() = the student (consent must come from the parent via the email token link); the token is also unreadable by end users so it cannot be replayed.';
