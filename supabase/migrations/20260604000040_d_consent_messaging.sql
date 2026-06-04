-- ============================================================================
-- D — Consent fail-closed for messaging (P6.2, child-safety)
-- ============================================================================
-- Booking is already consent-gated (prevent_booking_minor_no_consent, fail-
-- closed on NULL DOB). Messaging was the fail-OPEN gap: a consent-required minor
-- could open a chat with an approved mentor and send up to the 15-message cap
-- with zero parental consent. This adds a student_has_consent helper (truth-
-- table-identical to the booking gate) and a consent check inside send_message
-- for STUDENT senders that returns {ok:false, reason:'consent_required'} (NOT a
-- RAISE → the compose UI can show AwaitingConsentNotice) and writes nothing.
--
-- ADDITIVE: new helper + CREATE OR REPLACE send_message (body only, signature
-- unchanged). Behaviour change (intended, child-safety): minors who can message
-- today without consent are now blocked.
--
-- FLAGGED (NOT fixed here — pre-existing + entangled, per the safety valve):
-- students.parental_consent_at / parental_consent_token are NOT column-locked
-- and the students UPDATE policy has no WITH CHECK, so a student could
-- self-UPDATE their own parental_consent_at and bypass BOTH this gate and the
-- booking gate. Closing it cleanly needs a trusted-path column-lock that does
-- not break the live record_parental_consent (SECURITY DEFINER, anon/token)
-- path — a focused follow-up, surfaced for review.
-- ============================================================================

-- ── student_has_consent — the single consent predicate (== booking gate) ────
-- has_consent  iff  NOT[ (requires_consent_base(dob,grade) OR dob IS NULL)
--                        AND parental_consent_at IS NULL ]
CREATE OR REPLACE FUNCTION public.student_has_consent(_student_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_dob   date;
  v_grade text;
  v_at    timestamptz;
BEGIN
  SELECT s.date_of_birth, s.grade, s.parental_consent_at
    INTO v_dob, v_grade, v_at
    FROM public.students s WHERE s.id = _student_id;
  IF NOT FOUND THEN
    RETURN false;                       -- unknown student → fail-closed
  END IF;
  IF v_at IS NOT NULL THEN
    RETURN true;                        -- consent on file
  END IF;
  IF v_dob IS NULL THEN
    RETURN false;                       -- unknown age → fail-closed (matches booking gate)
  END IF;
  RETURN NOT public.requires_consent_base(v_dob, v_grade);  -- adult & non-gated grade → allowed
END;
$function$;

COMMENT ON FUNCTION public.student_has_consent(uuid) IS
  'D (2026-06-04): TRUE iff the student does not need parental consent (adult, non-gated grade) OR has it on file. Fail-closed on NULL DOB / unknown student. Truth-table-identical to prevent_booking_minor_no_consent. Used by send_message.';

REVOKE ALL ON FUNCTION public.student_has_consent(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.student_has_consent(uuid) TO authenticated, service_role;

-- ── send_message — insert the consent gate (step 3c) ────────────────────────
CREATE OR REPLACE FUNCTION public.send_message(_recipient_id uuid, _body text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  c_max_chars       constant int := 500;
  c_pre_booking_cap constant int := 15;   -- student→mentor pre-booking cap
  c_rate_per_min    constant int := 20;   -- light anti-flood
  v_sender    uuid := auth.uid();
  v_sender_is_student boolean;
  v_sender_is_mentor  boolean;
  v_student_id uuid;
  v_mentor_id  uuid;
  v_body      text := btrim(coalesce(_body, ''));
  v_convo     public.conversations%ROWTYPE;
  v_has_session boolean;
  v_recent    int;
  v_student_msgs int;
  v_convo_id  uuid;
  v_msg_id    uuid;
BEGIN
  -- 1. Authenticated.
  IF v_sender IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF _recipient_id IS NULL THEN
    RAISE EXCEPTION 'invalid_recipient' USING ERRCODE = 'P0001';
  END IF;

  -- 2. Sender role.
  v_sender_is_student := EXISTS (SELECT 1 FROM public.students WHERE id = v_sender);
  v_sender_is_mentor  := EXISTS (SELECT 1 FROM public.mentors  WHERE id = v_sender);
  IF NOT (v_sender_is_student OR v_sender_is_mentor) THEN
    RAISE EXCEPTION 'invalid_sender' USING ERRCODE = '42501';
  END IF;
  IF v_sender = _recipient_id THEN
    RAISE EXCEPTION 'invalid_recipient' USING ERRCODE = 'P0001';
  END IF;

  -- 3. Recipient must be the OPPOSITE role and exist → derive the pair.
  IF v_sender_is_student THEN
    IF NOT EXISTS (SELECT 1 FROM public.mentors WHERE id = _recipient_id) THEN
      RAISE EXCEPTION 'invalid_recipient' USING ERRCODE = 'P0001';
    END IF;
    v_student_id := v_sender;
    v_mentor_id  := _recipient_id;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.students WHERE id = _recipient_id) THEN
      RAISE EXCEPTION 'invalid_recipient' USING ERRCODE = 'P0001';
    END IF;
    v_student_id := _recipient_id;
    v_mentor_id  := v_sender;
  END IF;

  -- 3b. The mentor on this pair must be APPROVED (vetted).
  IF NOT EXISTS (
    SELECT 1 FROM public.mentors WHERE id = v_mentor_id AND status = 'approved'
  ) THEN
    RAISE EXCEPTION 'mentor_not_available' USING ERRCODE = 'P0001';
  END IF;

  -- 3c. CONSENT FAIL-CLOSED (D / P6.2): gate on the STUDENT PARTY of the pair
  --     REGARDLESS of sender direction (folded from review D-1). A minor without
  --     recorded parental consent (or unknown DOB) cannot send — AND a mentor
  --     cannot keep messaging a minor whose parental consent was REVOKED (the
  --     one-directional version left that continuation path open). Identical
  --     truth-table to the booking gate. Friendly reason (no RAISE → UI shows
  --     AwaitingConsentNotice); writes NOTHING. Adult students → has_consent
  --     true → unaffected in both directions.
  IF NOT public.student_has_consent(v_student_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'consent_required');
  END IF;

  -- 4. Load existing conversation (may be absent) + pair-has-session.
  SELECT * INTO v_convo FROM public.conversations
   WHERE student_id = v_student_id AND mentor_id = v_mentor_id;

  v_has_session := EXISTS (
    SELECT 1 FROM public.bookings b
     WHERE b.student_id = v_student_id AND b.mentor_id = v_mentor_id
       AND b.status IN ('confirmed','completed')
  );

  -- 5. Mentor no-cold-initiate (CHILD-SAFETY).
  IF v_sender_is_mentor AND v_convo.id IS NULL AND NOT v_has_session THEN
    RAISE EXCEPTION 'mentor_cannot_initiate' USING ERRCODE = 'P0001';
  END IF;

  -- 6. Block — read-only in both directions while blocked_by is set.
  IF v_convo.id IS NOT NULL AND v_convo.blocked_by IS NOT NULL THEN
    RAISE EXCEPTION 'blocked' USING ERRCODE = 'P0001';
  END IF;

  -- 7. Body length.
  IF v_body = '' THEN
    RAISE EXCEPTION 'empty' USING ERRCODE = 'P0001';
  END IF;
  IF char_length(v_body) > c_max_chars THEN
    RAISE EXCEPTION 'too_long' USING ERRCODE = 'P0001';
  END IF;

  -- 8. PII-block — the ONLY gate that writes. Log then RETURN (must not RAISE).
  IF public.chat_contains_pii(v_body) THEN
    INSERT INTO public.safeguarding_events (event_type, actor_id, conversation_id, detail)
    VALUES ('pii_blocked', v_sender, v_convo.id, 'send_message PII heuristic match');
    RETURN jsonb_build_object('ok', false, 'reason', 'pii_blocked');
  END IF;

  -- 9. Anti-flood (secondary).
  SELECT count(*) INTO v_recent FROM public.messages
   WHERE sender_id = v_sender AND created_at > now() - interval '1 minute';
  IF v_recent >= c_rate_per_min THEN
    RAISE EXCEPTION 'rate_limited' USING ERRCODE = 'P0001';
  END IF;

  -- 10. Pre-booking cap — student only, no session.
  IF NOT v_has_session AND v_sender_is_student AND v_convo.id IS NOT NULL THEN
    SELECT count(*) INTO v_student_msgs FROM public.messages
     WHERE conversation_id = v_convo.id AND sender_id = v_sender;
    IF v_student_msgs >= c_pre_booking_cap THEN
      RAISE EXCEPTION 'pre_booking_cap' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- 11. WRITE PHASE.
  INSERT INTO public.conversations (student_id, mentor_id, last_message_at)
  VALUES (v_student_id, v_mentor_id, now())
  ON CONFLICT (student_id, mentor_id) DO UPDATE SET last_message_at = now()
  RETURNING id INTO v_convo_id;

  INSERT INTO public.messages (conversation_id, sender_id, recipient_id, body)
  VALUES (v_convo_id, v_sender, _recipient_id, v_body)
  RETURNING id INTO v_msg_id;

  RETURN jsonb_build_object('ok', true, 'conversation_id', v_convo_id, 'message_id', v_msg_id);
END;
$function$;
