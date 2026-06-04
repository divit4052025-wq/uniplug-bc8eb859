-- ============================================================================
-- C — Admin actions (scoped to the genuinely-missing pieces)
-- ============================================================================
-- The approve/reject pipeline is ALREADY built: admin_set_mentor_status +
-- notify_event_email (mentor_approved/mentor_rejected) + the send-event-email
-- route + admin.tsx ApprovalsSection are wired end-to-end. This phase adds the
-- NAMED contract the build asks for and the missing clear/reason/list pieces,
-- reusing the existing email channel:
--
--   approve_mentor(_mentor_id)              — named approve; emails mentor_approved.
--   reject_mentor(_mentor_id, _reason)      — named reject; stores the reason in
--                                             verification_notes; emails mentor_rejected
--                                             WITH the reason.
--   admin_clear_re_review(_mentor_id)       — clears re_review_pending; emails the mentor.
--   admin_list_add_requests(_status)        — reader for the add-request review list
--                                             (the promote/reject RPCs already exist).
--
-- All is_admin()-gated SECURITY DEFINER. They pass the mentors locks via the
-- is_admin() bypass (auth.uid() survives SECURITY DEFINER).
--
-- "notification + email": delivered via the existing EMAIL channel
-- (notify_event_email → send-event-email route), which is this codebase's
-- deliberate mentor-comms channel. A DISTINCT in-app notifications row is NOT
-- added here — that would require widening the notifications kind CHECK AND a
-- case in the mentor-facing notifications renderer (UI beyond the admin tab,
-- out of scope) — flagged as a ships-with follow-up.
-- ============================================================================

-- ── approve_mentor ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.approve_mentor(_mentor_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.mentors
     SET status = 'approved'::public.mentor_status,
         verified_at = now(),
         verified_by = auth.uid(),
         re_review_pending = false          -- approving clears any pending re-review
   WHERE id = _mentor_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'mentor not found: %', _mentor_id USING ERRCODE = 'P0001'; END IF;
  PERFORM public.notify_event_email(jsonb_build_object('type','mentor_approved','mentor_id',_mentor_id));
END;
$function$;

-- ── reject_mentor(reason) ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reject_mentor(_mentor_id uuid, _reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.mentors
     SET status = 'rejected'::public.mentor_status,
         verified_at = NULL,
         verified_by = NULL,
         verification_notes = NULLIF(btrim(coalesce(_reason, '')), '')
   WHERE id = _mentor_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'mentor not found: %', _mentor_id USING ERRCODE = 'P0001'; END IF;
  PERFORM public.notify_event_email(jsonb_build_object(
    'type','mentor_rejected','mentor_id',_mentor_id,'reason', NULLIF(btrim(coalesce(_reason,'')),'')));
END;
$function$;

-- ── admin_clear_re_review ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_clear_re_review(_mentor_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE v_status public.mentor_status;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.mentors
     SET re_review_pending = false
   WHERE id = _mentor_id
  RETURNING status INTO v_status;
  IF NOT FOUND THEN RAISE EXCEPTION 'mentor not found: %', _mentor_id USING ERRCODE = 'P0001'; END IF;
  -- Only notify if the mentor is approved (a cleared re-review means "you're good again").
  IF v_status = 'approved' THEN
    PERFORM public.notify_event_email(jsonb_build_object('type','mentor_re_review_cleared','mentor_id',_mentor_id));
  END IF;
END;
$function$;

-- ── admin_list_add_requests — the add-request review list reader ─────────────
CREATE OR REPLACE FUNCTION public.admin_list_add_requests(_status text DEFAULT 'pending')
RETURNS TABLE(
  id            uuid,
  kind          text,
  proposed_name text,
  requested_by  uuid,
  status        text,
  decision_reason text,
  created_at    timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  SELECT r.id, r.kind, r.proposed_name, r.requested_by, r.status, r.decision_reason, r.created_at
  FROM public.ref_add_requests r
  WHERE (_status IS NULL OR r.status = _status)
  ORDER BY r.created_at DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.approve_mentor(uuid)            FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reject_mentor(uuid, text)       FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_clear_re_review(uuid)     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_add_requests(text)   FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_mentor(uuid)          TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reject_mentor(uuid, text)     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_clear_re_review(uuid)   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_list_add_requests(text) TO authenticated, service_role;

COMMENT ON FUNCTION public.approve_mentor(uuid) IS 'C (2026-06-04): admin-only named approve. Sets approved+verified_at/by, clears re_review_pending, emails mentor_approved. Coexists with admin_set_mentor_status.';
COMMENT ON FUNCTION public.reject_mentor(uuid, text) IS 'C (2026-06-04): admin-only named reject with a reason stored in verification_notes + included in the mentor_rejected email.';
COMMENT ON FUNCTION public.admin_clear_re_review(uuid) IS 'C (2026-06-04): admin-only clear of re_review_pending; emails mentor_re_review_cleared when the mentor is approved.';
COMMENT ON FUNCTION public.admin_list_add_requests(text) IS 'C (2026-06-04): admin-only reader for the ref add-request review list (pairs with the existing admin_promote/admin_reject_ref_add_request).';
