-- ============================================================================
-- ADMIN CONSOLE — PHASE 4: CONSENT OVERSIGHT. Additive, LOCAL-only.
-- ============================================================================
-- Surfaces parental-consent status for every consent-required minor, and the
-- booking-level fallout of a consent revocation (the A3 cascade) so a human can
-- resolve it. All readers/actions is_admin()-gated.
--
-- STATUS is DERIVED (there is no stored consent-status flag):
--   consent-required := requires_consent_base(dob,grade) OR dob IS NULL (fail-closed)
--   GRANTED  := parental_consent_at IS NOT NULL
--   REVOKED  := parental_consent_at IS NULL AND a consent_revocation_events row exists
--               (mark_consent_revoked ALWAYS inserts a 'shares_revoked' row + NULLs
--                the token — this is the only signal that separates revoked from...)
--   PENDING  := parental_consent_at IS NULL AND no revocation row (awaiting the parent)
--
-- AUDIT gap this closes: mark_consent_revoked predates admin_audit_log and writes NO
-- admin-actor trail (consent_revocation_events has no actor_id). admin_revoke_consent
-- wraps it so every revocation is attributable; the primitive is then revoked from
-- authenticated so the audited wrapper is the only path.
--
-- HONESTY: a 'frozen_paid' booking's status stays 'confirmed' (access is blocked by
-- the live student_has_consent() gate, not the row). A3 writes NO refund — resolution
-- is a human decision, tracked by the resolved_* columns added below.
--
-- PII: admin_list_consent shows the minor's NAME (this is an operational worklist —
-- the operator must know WHO to chase for consent / whose consent to revoke, same
-- posture as the P3 user directory). The parent CONTACT is presence-only here; its
-- value is revealed only via the logged admin_reveal_contact on the 360. The fallout
-- reader masks the student (masked_user_label). The P1 safeguarding queue masks names
-- because there you triage before knowing identity; this register is the opposite.
-- PRE-LAUNCH: mask register names for non-super scoped reviewers when those roles ship.
--
-- Pairs with supabase/dev-seeds/admin-p4-consent-verification.sql
-- ============================================================================

-- ── 0. resolution-tracking on the A3 fallout ledger (additive, nullable) ─────
ALTER TABLE public.consent_revocation_events
  ADD COLUMN IF NOT EXISTS resolved_at    timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_by    uuid,
  ADD COLUMN IF NOT EXISTS resolution_note text;
COMMENT ON COLUMN public.consent_revocation_events.resolved_at IS
  'Admin P4: when an operator marked this revocation-fallout event handled (e.g. refund issued out-of-band). NULL = still needs a human.';

-- ── 1. consent status per consent-required minor ────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_list_consent(
  _status text DEFAULT NULL, _limit integer DEFAULT 100
)
RETURNS TABLE (
  student_id uuid, full_name text, grade text, dob_known boolean, status text,
  has_parent_contact boolean, granted_at timestamptz, last_revoked_at timestamptz,
  unresolved_fallout integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  WITH base AS (
    SELECT s.id, s.full_name, s.grade,
           (s.date_of_birth IS NOT NULL) AS dob_known,
           CASE
             WHEN s.parental_consent_at IS NOT NULL THEN 'granted'
             WHEN EXISTS (SELECT 1 FROM public.consent_revocation_events r WHERE r.student_id = s.id) THEN 'revoked'
             ELSE 'pending'
           END AS status,
           (s.parental_consent_email IS NOT NULL OR s.parent_phone IS NOT NULL) AS has_parent_contact,
           s.parental_consent_at AS granted_at,
           (SELECT max(r.revoked_at) FROM public.consent_revocation_events r WHERE r.student_id = s.id) AS last_revoked_at,
           (SELECT count(*) FROM public.consent_revocation_events r
             WHERE r.student_id = s.id AND r.booking_id IS NOT NULL AND r.resolved_at IS NULL)::int AS unresolved_fallout
      FROM public.students s
     WHERE public.requires_consent_base(s.date_of_birth, s.grade) OR s.date_of_birth IS NULL
  )
  SELECT b.id, b.full_name, b.grade, b.dob_known, b.status,
         b.has_parent_contact, b.granted_at, b.last_revoked_at, b.unresolved_fallout
    FROM base b
   WHERE _status IS NULL OR b.status = _status
   ORDER BY CASE b.status WHEN 'revoked' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
            (b.unresolved_fallout > 0) DESC,
            b.last_revoked_at DESC NULLS LAST, b.granted_at DESC NULLS LAST
   LIMIT GREATEST(0, LEAST(_limit, 500));
END $$;
REVOKE ALL     ON FUNCTION public.admin_list_consent(text, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_list_consent(text, integer) TO authenticated, service_role;
COMMENT ON FUNCTION public.admin_list_consent(text, integer) IS
  'Admin P4 (2026-07-01): is_admin-gated consent register — every consent-required minor with DERIVED status (granted/pending/revoked), parent-contact presence (not the value), last revocation, and unresolved booking fallout. Revoked/pending first.';

-- ── 2. revocation fallout needing a human (booking-level events) ─────────────
CREATE OR REPLACE FUNCTION public.admin_list_consent_fallout(_include_resolved boolean DEFAULT false)
RETURNS TABLE (
  event_id uuid, student_id uuid, student_label text, booking_id uuid,
  action text, revoked_at timestamptz, resolved_at timestamptz, resolved_by uuid, resolution_note text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
    SELECT r.id, r.student_id, public.masked_user_label(r.student_id), r.booking_id,
           r.action, r.revoked_at, r.resolved_at, r.resolved_by, r.resolution_note
      FROM public.consent_revocation_events r
     WHERE r.booking_id IS NOT NULL                 -- booking-level fallout (frozen_paid / cancelled_unpaid)
       AND (_include_resolved OR r.resolved_at IS NULL)
     ORDER BY (r.resolved_at IS NULL) DESC, r.revoked_at DESC;
END $$;
REVOKE ALL     ON FUNCTION public.admin_list_consent_fallout(boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_list_consent_fallout(boolean) TO authenticated, service_role;
COMMENT ON FUNCTION public.admin_list_consent_fallout(boolean) IS
  'Admin P4 (2026-07-01): is_admin-gated list of booking-level consent-revocation fallout (frozen_paid = paid booking now consent-blocked with no auto-refund; cancelled_unpaid) for a human to resolve. Masked student label. Unresolved first.';

-- ── 3. audited consent revocation (wraps the un-audited A3 primitive) ────────
CREATE OR REPLACE FUNCTION public.admin_revoke_consent(_student_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_actor uuid := auth.uid();
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF _reason IS NULL OR btrim(_reason) = '' THEN RAISE EXCEPTION 'reason_required'; END IF;
  -- Only revoke a student who CURRENTLY has consent granted. This rejects a typo'd
  -- / non-student id (would otherwise write a phantom audit + ledger row) AND blocks
  -- re-revoking an already-revoked student (which would re-insert duplicate
  -- frozen_paid fallout for the same booking). (review: re-revocation guard.)
  IF NOT EXISTS (SELECT 1 FROM public.students WHERE id = _student_id AND parental_consent_at IS NOT NULL) THEN
    RAISE EXCEPTION 'no_active_consent_to_revoke';
  END IF;
  -- PERFORM the A3 cascade (NULLs consent + token, cancels unpaid, freezes paid,
  -- revokes doc shares) then write the audit row it never wrote. Atomic: if the
  -- primitive raises, the audit row rolls back too.
  PERFORM public.mark_consent_revoked(_student_id);
  INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id, justification)
  VALUES (v_actor, 'revoke_consent', 'student', _student_id, btrim(_reason));
END $$;
REVOKE ALL     ON FUNCTION public.admin_revoke_consent(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_revoke_consent(uuid, text) TO authenticated, service_role;
COMMENT ON FUNCTION public.admin_revoke_consent(uuid, text) IS
  'Admin P4 (2026-07-01): is_admin-gated AUDITED wrapper over mark_consent_revoked — requires a reason, PERFORMs the A3 revocation cascade then writes a revoke_consent audit row (the primitive predates the audit log). The exclusive authenticated revocation path.';

-- close the un-audited direct path (the audited wrapper, owner-executed, still calls it)
REVOKE EXECUTE ON FUNCTION public.mark_consent_revoked(uuid) FROM authenticated, anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.mark_consent_revoked(uuid) TO service_role;

-- ── 4. resolve a fallout event (mark handled) ───────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_resolve_consent_event(_event_id uuid, _note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_actor uuid := auth.uid(); v_student uuid; v_note text := NULLIF(btrim(coalesce(_note, '')), '');
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  UPDATE public.consent_revocation_events
     SET resolved_at = now(), resolved_by = v_actor, resolution_note = v_note
   WHERE id = _event_id AND booking_id IS NOT NULL AND resolved_at IS NULL
   RETURNING student_id INTO v_student;
  IF v_student IS NULL THEN RAISE EXCEPTION 'not_found_or_already_resolved'; END IF;
  INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id, justification)
  VALUES (v_actor, 'resolve_consent_fallout', 'student', v_student, v_note);
END $$;
REVOKE ALL     ON FUNCTION public.admin_resolve_consent_event(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_resolve_consent_event(uuid, text) TO authenticated, service_role;
COMMENT ON FUNCTION public.admin_resolve_consent_event(uuid, text) IS
  'Admin P4 (2026-07-01): is_admin-gated — marks a booking-level consent-revocation fallout event handled (resolved_at/by/note) and audits resolve_consent_fallout. Idempotent: no-op raise if already resolved.';
