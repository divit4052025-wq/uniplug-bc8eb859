-- Phase G4-follow-up: interim parental-consent system (email-verified, no DigiLocker).
--
-- HIGH-STAKES / child-safety / security-sensitive. This is G4's mandated
-- SECOND security-reviewer pass (the token flow + consent recording +
-- gating). G4 (20260523000008) installed the columns + a DOB-only booking
-- gate + the anon record_parental_consent RPC; this migration:
--   1. adds parent_phone,
--   2. adds an APPEND-ONLY immutable consent audit table,
--   3. extends record_parental_consent to write that audit row (who/when/scope/version),
--   4. adds request_parental_consent (powers "resend"; student-self or admin only),
--   5. BROADENS the booking gate to the live OR rule (under-18 IST OR grade 9/10/11),
--   6. makes students.date_of_birth immutable after signup (admin-only editable),
--      so a minor can't edit their DOB to dodge the gate.
--
-- DESIGN DECISIONS (per approved plan + adjustments):
--   * NO stored consent_required / consent_status flag — status is DERIVED.
--     The booking trigger computes the gate LIVE every time.
--   * Age threshold = 18 (India majority), computed in IST.
--   * Grade set for the OR rule = exactly {Grade 9, Grade 10, Grade 11}.
--   * Adults (>=18 and not in 9/10/11) need no parent step.
--   * Immutability via an append-only table with RLS-and-no-policies + no
--     UPDATE/DELETE path — the SECURITY DEFINER RPC is the only writer.
--   * consent_scope is the forward-looking set
--     {data_processing, mentorship_sessions, messaging, session_recording}.
--     consent_version is the RE-CONSENT TRIGGER: messaging + session_recording
--     are NOT permanently pre-authorized. v1 records them under v1 (placeholder)
--     terms; when those features ship with CONCRETE terms, bump CONSENT_VERSION
--     (CREATE OR REPLACE record_parental_consent) AND revoke prior consents
--     (NULL parental_consent_at) so the parent re-consents against the new text.
--   * Fail-closed on unknown age: a row with date_of_birth IS NULL is treated as
--     REQUIRING consent (we cannot prove adulthood). There is NO grandfathering —
--     a NULL DOB does NOT slip the booking gate. This supersedes G4's grandfather
--     posture: the existing NULL-DOB live rows must add a DOB (caught by the
--     signup/profile UI) before they can book. Trade-off accepted deliberately —
--     a child-safety gate must not fail open on missing age data.
--
-- DEFERRED to the signup-form stage (NOT in this migration — pairs with the
-- UI that produces the metadata):
--   * handle_new_user extension to read date_of_birth / parent_email /
--     parent_phone from signup metadata and mint parental_consent_token.
--   * The 'parental_consent_request' email-hook handler + template + send-
--     failure logging (the C2 hook already logs Resend failures; the consent
--     type slots into the same switch).
--
-- LEGAL COPY: none in this migration. The binding consent wording is presented
-- on the parent page + email (UI stage) and is TODO-LEGAL placeholder until
-- counsel-approved. consent_version pins which text a consent was given against.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS, CREATE OR
-- REPLACE FUNCTION, DROP TRIGGER IF EXISTS + CREATE.
--
-- Verification: supabase/dev-seeds/parental-consent-verification.sql

-- ─── 1. parent_phone column ────────────────────────────────────────────────
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS parent_phone text;

-- ─── 2. Append-only immutable consent audit table ──────────────────────────
CREATE TABLE IF NOT EXISTS public.parental_consent_records (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  consented_at    timestamptz NOT NULL DEFAULT now(),
  parent_email    text,
  consent_scope   text[] NOT NULL,
  consent_version text NOT NULL
);

CREATE INDEX IF NOT EXISTS parental_consent_records_student_idx
  ON public.parental_consent_records (student_id);

-- RLS ON with NO policies → no client (anon/authenticated) SELECT/INSERT/
-- UPDATE/DELETE. The only writer is record_parental_consent (SECURITY DEFINER,
-- owned by postgres, bypasses RLS). There is deliberately no UPDATE/DELETE
-- path anywhere → the audit trail is append-only / immutable.
ALTER TABLE public.parental_consent_records ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.parental_consent_records FROM anon, authenticated;

COMMENT ON TABLE public.parental_consent_records IS
  'Phase G4-follow-up (2026-05-30): append-only immutable record of parental consent — who (parent_email), when (consented_at), what (consent_scope), and against which terms (consent_version). Written ONLY by record_parental_consent(). RLS-on-no-policies + no UPDATE/DELETE path = immutable. students.parental_consent_at remains the fast-path flag the booking gate reads.';

-- ─── 3. record_parental_consent: now also writes the immutable audit row ────
-- Signature unchanged (anon-callable; the token IS the auth). Scope + version
-- are SERVER-DEFINED constants here, not client input — a tampered client
-- cannot record a different scope/version than what is live.
CREATE OR REPLACE FUNCTION public.record_parental_consent(_token uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_student_id   uuid;
  v_already      timestamptz;
  v_parent_email text;
  -- Server-defined canonical consent contract. Bump CONSENT_VERSION (and
  -- revoke prior consents) when messaging/session_recording ship with
  -- concrete terms — see migration header.
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
    -- Friendly fail: token unknown / revoked / typo. No exception so the
    -- consent page renders a clean "this link isn't valid" message.
    RETURN NULL;
  END IF;

  -- Set the flag idempotently (parent clicking twice doesn't re-stamp).
  UPDATE public.students
     SET parental_consent_at = COALESCE(parental_consent_at, now())
   WHERE id = v_student_id;

  -- Append the immutable audit row only on FIRST consent (NULL -> now).
  -- A second click finds v_already NOT NULL and records nothing further,
  -- so there is exactly one record per consent.
  IF v_already IS NULL THEN
    INSERT INTO public.parental_consent_records
      (student_id, parent_email, consent_scope, consent_version)
    VALUES
      (v_student_id, v_parent_email, c_scope, c_version);
  END IF;

  RETURN v_student_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_parental_consent(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.record_parental_consent(uuid) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.record_parental_consent(uuid) IS
  'Phase G4-follow-up (2026-05-30): parent-clicks-link endpoint. anon-callable (token IS the auth). Idempotent: sets parental_consent_at once and appends exactly one immutable parental_consent_records row (server-defined scope + version) on first consent. Returns student id, or NULL on token-not-found.';

-- ─── 4. request_parental_consent: (re)send the parent verification email ────
-- Student-self (auth.uid() = their own id) or admin only. Fires the existing
-- C2 event-email dispatcher with a new 'parental_consent_request' type (the
-- hook handler + template land in the signup/email UI stage). Reuses the
-- existing token (does not rotate).
CREATE OR REPLACE FUNCTION public.request_parental_consent(_student_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_token        uuid;
  v_consent_at   timestamptz;
BEGIN
  IF NOT (auth.uid() = _student_id OR public.is_admin()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT parental_consent_token, parental_consent_at
    INTO v_token, v_consent_at
    FROM public.students
   WHERE id = _student_id;

  -- Nothing to do if there's no pending consent token, or consent is already
  -- on file. Silent no-op (not an error) keeps the resend button calm.
  IF v_token IS NULL OR v_consent_at IS NOT NULL THEN
    RETURN;
  END IF;

  PERFORM public.notify_event_email(jsonb_build_object(
    'type', 'parental_consent_request',
    'student_id', _student_id
  ));
END;
$$;

REVOKE ALL ON FUNCTION public.request_parental_consent(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.request_parental_consent(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.request_parental_consent(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.request_parental_consent(uuid) IS
  'Phase G4-follow-up (2026-05-30): (re)sends the parental-consent verification email via notify_event_email (type=parental_consent_request). Allowed only for the student themselves (auth.uid()=id) or an admin. No-op if no pending token or consent already recorded.';

-- ─── 5. Booking gate — live, fail-closed on unknown age ────────────────────
-- Block when (DOB unknown) OR (under-18 by DOB in IST) OR (grade in {9,10,11})
-- AND no consent on file. Computed live — no stored flag. NO grandfathering:
-- a NULL DOB fails CLOSED (treated as requiring consent) rather than slipping
-- the gate — a child-safety gate must not fail open on missing age data.
CREATE OR REPLACE FUNCTION public.prevent_booking_minor_no_consent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_dob              date;
  v_consent_at       timestamptz;
  v_grade            text;
  v_eighteen_ago_ist date := ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata') - interval '18 years')::date;
  v_requires_consent boolean;
BEGIN
  -- Service-role bypass (seeds, admin operations).
  IF coalesce(auth.jwt() ->> 'role', '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  SELECT date_of_birth, parental_consent_at, grade
    INTO v_dob, v_consent_at, v_grade
    FROM public.students
   WHERE id = NEW.student_id;

  -- Fail CLOSED on unknown age: a row with no DOB cannot be proven adult, so
  -- it requires consent. Plus the live OR rule: under-18 by DOB, OR a gated
  -- grade (9/10/11 — conservative over-inclusion for older students still in
  -- those grades). No early NULL-DOB return → no grandfathering.
  v_requires_consent := (v_dob IS NULL)
                        OR (v_dob > v_eighteen_ago_ist)
                        OR (v_grade IN ('Grade 9', 'Grade 10', 'Grade 11'));

  IF v_requires_consent AND v_consent_at IS NULL THEN
    RAISE EXCEPTION 'parental consent required for student'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bookings_minor_consent_gate ON public.bookings;
CREATE TRIGGER bookings_minor_consent_gate
  BEFORE INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_booking_minor_no_consent();

COMMENT ON FUNCTION public.prevent_booking_minor_no_consent() IS
  'Phase G4-follow-up (2026-05-30): BEFORE INSERT on bookings. Blocks when (DOB unknown OR under-18 IST by DOB OR grade in 9/10/11) AND parental_consent_at IS NULL. Computed live (no stored flag). Service-role bypass. Fails CLOSED on NULL DOB — NO grandfathering (supersedes G4).';

-- ─── 6. Make date_of_birth immutable after signup (anti-gaming) ────────────
-- A minor must not be able to edit their DOB to slip the gate. Only admins
-- (and service_role, for seeds/ops) may change date_of_birth once set. Writes
-- that leave DOB unchanged (e.g. record_parental_consent, profile edits) pass.
CREATE OR REPLACE FUNCTION public.prevent_student_dob_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.date_of_birth IS NOT DISTINCT FROM OLD.date_of_birth THEN
    RETURN NEW;
  END IF;
  IF coalesce(auth.jwt() ->> 'role', '') = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'date of birth can only be changed by an administrator'
    USING ERRCODE = 'P0001';
END;
$$;

DROP TRIGGER IF EXISTS students_dob_immutable ON public.students;
CREATE TRIGGER students_dob_immutable
  BEFORE UPDATE ON public.students
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_student_dob_change();

COMMENT ON FUNCTION public.prevent_student_dob_change() IS
  'Phase G4-follow-up (2026-05-30): BEFORE UPDATE on students. date_of_birth is immutable once set — only is_admin() or service_role may change it (anti-gaming of the minor consent gate). No-op short-circuit when DOB is unchanged.';
