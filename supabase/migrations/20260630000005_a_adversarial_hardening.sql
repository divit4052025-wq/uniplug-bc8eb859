-- ============================================================================
-- A-ADV-FIX — close the 5 SQL-fixable gaps the adversarial pass found over A1–A4.
-- (additive, reversible, LOCAL-only — supabase db reset, never db push/--linked).
-- ============================================================================
-- All five are CREATE OR REPLACE of an existing function/trigger body, or a grant
-- narrowing — no table/column/RPC dropped or renamed, no client RPC signature
-- changed. Each function below is its chronologically-last (effective FINAL) body
-- copied VERBATIM with ONLY the marked A-ADV line(s) added; every other guard,
-- grant, comment and code path is preserved.
--
-- FIX 1 (A1, MEDIUM) — whitespace-normalize the parent==self EMAIL compare in BOTH
--   layers. lower(btrim(...)) strips only the ASCII space, so a TAB-prefixed /
--   NEWLINE-suffixed copy of the child's OWN email (E'\tkid@x.com') slipped past
--   both enforce_parent_not_self and record_parental_consent and enabled anon
--   self-approval. Both comparisons now strip ALL whitespace via
--   lower(regexp_replace(<email>, '\s', '', 'g')) (a valid email has no internal
--   whitespace, so this never over-blocks a legitimate distinct parent email).
--
-- FIX 2 (A1, LOW) — canonicalize the PHONE compare in enforce_parent_not_self.
--   The digit-string equality let '9000000051' (10-digit) differ from
--   '919000000051' (country-code form of the same number). Now compares the LAST
--   10 DIGITS when both sides have >= 10 digits (catching 91-prefix / 0-trunk
--   variants), falling back to full-digit equality when either has < 10.
--
-- FIX 3 (A1, LOW) — narrow the public.students INSERT grant. authenticated (and
--   anon) had INSERT on EVERY column incl. the consent-control columns, so an
--   authenticated user could self-INSERT a row with parental_consent_at preset
--   (reachable only when the row is absent). Mirrors A1's UPDATE narrowing.
--   Reproduced real INSERT grant (information_schema.column_privileges):
--     authenticated/anon INSERT had: bio, board, code_of_conduct_accepted_at,
--       countries, created_at, date_of_birth, email, first_session_used,
--       full_name, grade, id, parent_phone, parental_consent_at,
--       parental_consent_email, parental_consent_token,
--       parental_consent_token_issued_at, phone, photo_url, profile_completed_at,
--       school.
--   anon has NO INSERT RLS policy (only "Students can insert own row" for
--   authenticated, WITH CHECK auth.uid()=id) so its INSERT grant is vestigial
--   (RLS default-denies it) — exactly like A1's UPDATE reasoning; not re-granted.
--   Signup is unaffected (handle_new_user is SECURITY DEFINER → bypasses grants);
--   grep confirmed NO client path does .from('students').insert()/.upsert() or
--   writes the consent columns directly (SignupWizard sends them as auth metadata;
--   FinalizeProfile only UPDATEs photo_url/bio).
--
-- FIX 4 (A3, LOW) — add a live-consent guard to share_student_document. Post-
--   revocation the owning minor could re-create a deleted document_share via this
--   RPC because it checked only booking_relationship_is_active() (TRUE for a
--   frozen paid 'confirmed' booking) with NO consent check. Now raises
--   consent_revoked (P0001) before the share INSERT when the owning student's
--   parental consent is not current.
--
-- FIX 5 (A2, LOW) — make enforce_mentor_adult_on_approve re-validate a DOB
--   DOWNGRADE on an already-approved row. It fired only on the transition INTO
--   approved, so a DOB downgrade on a still-approved row (reachable only by
--   service_role/admin, who bypass the identity-tamper trigger) was not re-checked.
--   Now also bites when NEW.date_of_birth IS DISTINCT FROM OLD.date_of_birth. Still
--   does NOT re-bite a status-&-DOB-unchanged re-save of an approved adult.
-- ============================================================================

-- ── FIX 1 + FIX 2: enforce_parent_not_self ──────────────────────────────────
--   Verbatim 20260630000001:41-62 body. Email arm: btrim -> regexp_replace '\s'
--   (FIX1). Phone arm: digit-string equality -> last-10-digit canonical compare
--   with a full-digit fallback (FIX2). A DECLARE block is added for the two digit
--   locals; everything else (search_path, both RAISE messages/ERRCODEs, the NULL
--   guards, RETURN NEW) is preserved.
CREATE OR REPLACE FUNCTION public.enforce_parent_not_self()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
  d_parent text;
  d_self   text;
BEGIN
  -- Only bites when a parent EMAIL is actually supplied (adults: NULL -> skip).
  -- [A-ADV FIX1] strip ALL whitespace on BOTH sides (tab/newline-prefixed copies
  -- of the child's own email previously slipped past the ASCII-space-only btrim).
  IF NEW.parental_consent_email IS NOT NULL
     AND lower(regexp_replace(NEW.parental_consent_email, '\s', '', 'g'))
       = lower(regexp_replace(NEW.email, '\s', '', 'g')) THEN
    RAISE EXCEPTION 'parent_email_must_differ_from_student'
      USING ERRCODE = 'check_violation';
  END IF;
  -- Phone arm: only when BOTH digit-strings are non-empty.
  -- [A-ADV FIX2] canonicalize to the LAST 10 DIGITS so 91-prefix / leading-0 trunk
  -- variants of the same number match; fall back to full-digit equality when
  -- either side has < 10 digits (short/partial numbers).
  IF NEW.parent_phone IS NOT NULL AND NEW.phone IS NOT NULL THEN
    d_parent := regexp_replace(NEW.parent_phone, '\D', '', 'g');
    d_self   := regexp_replace(NEW.phone, '\D', '', 'g');
    IF d_parent <> '' AND d_self <> '' THEN
      IF length(d_parent) >= 10 AND length(d_self) >= 10 THEN
        IF right(d_parent, 10) = right(d_self, 10) THEN
          RAISE EXCEPTION 'parent_phone_must_differ_from_student'
            USING ERRCODE = 'check_violation';
        END IF;
      ELSIF d_parent = d_self THEN
        RAISE EXCEPTION 'parent_phone_must_differ_from_student'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_parent_not_self() IS
  'A1 + A-ADV (2026-06-30): rejects a students row whose parental_consent_email == own email (case-insensitive, ALL whitespace stripped) or whose parent_phone == own phone (last-10-digit canonical compare; full-digit fallback < 10 digits). Fires on the signup INSERT (via handle_new_user) and on any UPDATE touching those columns. Adults (consent_email NULL) pass.';

-- ── FIX 3: narrow the public.students INSERT grant (drop consent columns) ────
--   Mirror A1's UPDATE narrowing: revoke INSERT from both roles, re-grant the
--   real INSERT column set MINUS the 5 consent-control columns to authenticated
--   only. anon is NOT re-granted (no anon INSERT RLS policy → its grant was
--   vestigial; same philosophy as A1's UPDATE). handle_new_user (DEFINER) is
--   unaffected.
REVOKE INSERT ON public.students FROM authenticated, anon;
GRANT INSERT (
  bio, board, code_of_conduct_accepted_at, countries, created_at, date_of_birth,
  email, first_session_used, full_name, grade, id, phone, photo_url,
  profile_completed_at, school
) ON public.students TO authenticated;
-- Dropped from the INSERT grant (consent destination becomes non-self-writable):
--   parental_consent_at, parental_consent_token, parental_consent_token_issued_at,
--   parental_consent_email, parent_phone.

-- ── FIX 1 (layer 2): record_parental_consent self-routed guard normalized ────
--   Verbatim 20260630000001:91-150 body with ONLY the self-routed email compare
--   changed from lower(btrim(...)) to lower(regexp_replace(...,'\s','','g')) on
--   both sides. The TTL guard, the same-logged-in-student guard, the COALESCE
--   stamp, the audit insert and all grants are preserved.
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
  v_self_email      text;        -- A1: the student's own email (for the self-routed guard)
  v_token_issued_at timestamptz; -- A1: mint time (for the TTL guard)
  c_scope   constant text[] := ARRAY['data_processing','mentorship_sessions','messaging','session_recording'];
  c_version constant text   := 'v1-2026-05-30';
BEGIN
  IF _token IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT id, parental_consent_at, parental_consent_email, email, parental_consent_token_issued_at
    INTO v_student_id, v_already, v_parent_email, v_self_email, v_token_issued_at
    FROM public.students
   WHERE parental_consent_token = _token
   LIMIT 1;
  IF v_student_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- [A1 guard] reject self-routed consent (the token's parent email == the
  -- student's own email — defense-in-depth even with the parent!=self trigger).
  -- [A-ADV FIX1] strip ALL whitespace on both sides (matches the trigger arm so a
  -- tab/newline-disguised self-email can never approve consent here either).
  IF v_parent_email IS NOT NULL AND v_self_email IS NOT NULL
     AND lower(regexp_replace(v_parent_email, '\s', '', 'g'))
       = lower(regexp_replace(v_self_email, '\s', '', 'g')) THEN
    RETURN NULL;
  END IF;
  -- [A1 guard] reject stale tokens (TTL 30 days from mint/resend).
  IF v_token_issued_at IS NOT NULL AND now() - v_token_issued_at > interval '30 days' THEN
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
  'Parent-only consent recorder (A1 + A-ADV 2026-06-30): writes the privilege-locked parental_consent_at as table owner (DEFINER). Rejects self-routed tokens (parent_email == student email, ALL whitespace stripped), stale tokens (>30d TTL), and any call where auth.uid() = the student. The token is unreadable by end users so it cannot be replayed.';

-- ── FIX 4: share_student_document — live-consent guard before the share INSERT ─
--   Verbatim 20260604000010:174-201 body with ONLY the [A-ADV FIX4] consent guard
--   added after the booking-relationship check and before the INSERT. The owning
--   student is auth.uid() (v_caller; the v_student <> v_caller guard already proved
--   v_student = v_caller). All other logic and the existing grants are preserved.
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
  -- [A-ADV FIX4] LIVE CONSENT — a revoked minor must NOT be able to re-create a
  -- deleted share via this RPC. booking_relationship_is_active stays TRUE for a
  -- frozen paid 'confirmed' booking, so the relationship check alone is not enough.
  -- The student shares their OWN doc, so the owning student is auth.uid() (v_caller).
  IF NOT public.student_has_consent(v_caller) THEN
    RAISE EXCEPTION 'consent_revoked' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.document_shares (document_id, mentor_id, created_by)
  VALUES (_document_id, _mentor_id, v_caller)
  ON CONFLICT (document_id, mentor_id) DO UPDATE SET created_at = public.document_shares.created_at
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

COMMENT ON FUNCTION public.share_student_document(uuid, uuid) IS
  'A + A-ADV (2026-06-30): the owning student grants a restricted document to a mentor they have a confirmed/completed booking with. Now also RAISEs consent_revoked (P0001) when the owning student''s parental consent is not current — so a revoked minor cannot re-create a deleted document_share over a frozen paid booking. Grants unchanged (authenticated, service_role).';

-- ── FIX 5: enforce_mentor_adult_on_approve — re-validate a DOB downgrade ─────
--   Verbatim 20260630000002:48-59 body with ONLY the extra
--   `OR NEW.date_of_birth IS DISTINCT FROM OLD.date_of_birth` disjunct added so a
--   DOB downgrade on an already-approved row re-checks the 18+ gate. The trigger
--   itself is unchanged (date_of_birth is already in its UPDATE OF list). A
--   status-&-DOB-unchanged re-save of an approved adult still does NOT re-bite.
CREATE OR REPLACE FUNCTION public.enforce_mentor_adult_on_approve()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'approved'
     AND (TG_OP = 'INSERT'
          OR NEW.status IS DISTINCT FROM OLD.status
          OR NEW.date_of_birth IS DISTINCT FROM OLD.date_of_birth)
     AND NOT public.mentor_is_adult(NEW.date_of_birth) THEN
    RAISE EXCEPTION 'mentor_must_be_18_plus'
      USING ERRCODE = 'check_violation',
            DETAIL = 'A mentor cannot be approved without a verified DOB indicating age >= 18.';
  END IF;
  RETURN NEW;
END $$;

COMMENT ON FUNCTION public.enforce_mentor_adult_on_approve() IS
  'A2 + A-ADV (2026-06-30): BEFORE INSERT OR UPDATE OF status,date_of_birth on public.mentors. Raises mentor_must_be_18_plus (check_violation) when a row is status=approved AND not a verified adult AND (insert | status changed | DOB changed) — so a DOB DOWNGRADE on an already-approved row is re-validated, while a status-&-DOB-unchanged re-save of an approved adult is not re-bitten. Authoritative gate independent of approve_mentor/admin_set_mentor_status/raw writes.';
