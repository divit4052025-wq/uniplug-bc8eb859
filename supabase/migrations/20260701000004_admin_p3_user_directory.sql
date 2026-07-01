-- ============================================================================
-- ADMIN CONSOLE — PHASE 3: USER DIRECTORY + 360 PROFILES. Additive, LOCAL-only.
-- ============================================================================
-- Search across students + mentors and a per-user 360 (profile + account state +
-- consent + bookings + reports involving them + warnings). All readers are
-- is_admin()-gated. The 360 reads OPERATIONAL data (masked counterpart/party
-- labels, report metadata) — the same "no raw contact" posture as the safeguarding
-- queue; raw contact is exposed ONLY via the logged admin_reveal_contact (P1), and
-- the state-changing actions (suspend/ban/restore, warn) are the audited P1 RPCs
-- (admin_set_account_state, admin_warn_user). So this migration adds READERS only.
--
-- PII posture: the directory shows a user's NAME (the operator identifier — this is
-- a super-admin lookup tool) but NEVER their raw email/phone/parent contact; those
-- travel only through admin_reveal_contact, which logs. PRE-LAUNCH: when scoped
-- admin roles become grantable, mask names for non-super reviewers here too.
-- AUDIT posture: opening a 360 (admin_get_user_profile) and pulling a user's report
-- history (admin_list_user_reports) are LOGGED; the bulk directory search
-- (admin_search_users) is intentionally NOT logged — it is operational browse over
-- masked-contact metadata, gated to super_admin only. Revisit if scoped roles ship.
--
-- Pairs with dev-seed supabase/dev-seeds/admin-p3-user-directory-verification.sql
-- ============================================================================

-- ── 1. unified user search ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_search_users(
  _query text DEFAULT NULL, _role text DEFAULT NULL, _limit integer DEFAULT 50
)
RETURNS TABLE (
  user_id uuid, role text, full_name text, sub_label text, account_state text, created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  WITH people AS (
    SELECT s.id, 'student'::text AS role, s.full_name, s.email,
           NULLIF(concat_ws(' · ', NULLIF(s.grade, ''), NULLIF(s.school, '')), '') AS sub_label, s.created_at
      FROM public.students s
    UNION ALL
    SELECT m.id, 'mentor'::text, m.full_name, m.email,
           NULLIF(concat_ws(' · ', NULLIF(m.university, ''), m.status::text), '') AS sub_label, m.created_at
      FROM public.mentors m
  )
  SELECT p.id, p.role, p.full_name, p.sub_label,
         COALESCE(mod.state, 'active') AS account_state, p.created_at
    FROM people p
    LEFT JOIN public.account_moderation mod ON mod.user_id = p.id
   WHERE (_role IS NULL OR p.role = _role)
     AND (_query IS NULL OR _query = ''
          OR p.full_name ILIKE '%' || _query || '%'
          OR p.email ILIKE '%' || _query || '%'
          OR p.id::text = _query)
   ORDER BY (COALESCE(mod.state, 'active') <> 'active') DESC,  -- moderated first
            p.created_at DESC
   LIMIT GREATEST(0, LEAST(_limit, 200));
END $$;
REVOKE ALL     ON FUNCTION public.admin_search_users(text, text, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_search_users(text, text, integer) TO authenticated, service_role;
COMMENT ON FUNCTION public.admin_search_users(text, text, integer) IS
  'Admin P3 (2026-07-01): is_admin-gated unified student+mentor search (name/email/id) with current account_moderation state. Names shown for operator lookup; raw contact only via the logged admin_reveal_contact. Moderated accounts first.';

-- ── 2. per-user 360 header ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_get_user_profile(_user_id uuid)
RETURNS TABLE (
  user_id uuid, role text, full_name text, created_at timestamptz,
  account_state text, account_reason text,
  grade text, school text, requires_consent boolean, dob_known boolean, has_consent boolean, parental_consent_at timestamptz,
  university text, course text, year text, mentor_status text, tier text, is_adult boolean
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_actor uuid := auth.uid();
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM public.students WHERE id = _user_id) THEN
    -- Log AFTER confirming a real user (no orphan view rows for typo'd/deleted ids).
    -- Opening a 360 reads a minor's full profile + consent context (mirrors
    -- admin_get_report_case). Reveal + state changes are separately logged by P1.
    INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id)
    VALUES (v_actor, 'view_user_profile', 'user', _user_id);
    RETURN QUERY
      SELECT s.id, 'student'::text, s.full_name, s.created_at,
             COALESCE(mod.state, 'active'), mod.reason,
             s.grade, s.school,
             -- CONSENT from the AUTHORITATIVE, fail-closed gate — NOT an age guess.
             -- requires_consent: a gated grade (9/10/11) OR a NULL DOB (unproven age)
             -- REQUIRES consent regardless of computed age. has_consent =
             -- student_has_consent (also fail-closed: NULL DOB => false). The UI must
             -- never render "not required (18+)" for a consent-required student.
             (public.requires_consent_base(s.date_of_birth, s.grade) OR s.date_of_birth IS NULL) AS requires_consent,
             (s.date_of_birth IS NOT NULL) AS dob_known,
             public.student_has_consent(s.id) AS has_consent, s.parental_consent_at,
             NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::boolean
        FROM public.students s
        LEFT JOIN public.account_moderation mod ON mod.user_id = s.id
       WHERE s.id = _user_id;
  ELSIF EXISTS (SELECT 1 FROM public.mentors WHERE id = _user_id) THEN
    INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id)
    VALUES (v_actor, 'view_user_profile', 'user', _user_id);
    RETURN QUERY
      SELECT m.id, 'mentor'::text, m.full_name, m.created_at,
             COALESCE(mod.state, 'active'), mod.reason,
             NULL::text, NULL::text, NULL::boolean, NULL::boolean, NULL::boolean, NULL::timestamptz,
             m.university, m.course, m.year, m.status::text, m.tier::text,
             public.mentor_is_adult(m.date_of_birth)
        FROM public.mentors m
        LEFT JOIN public.account_moderation mod ON mod.user_id = m.id
       WHERE m.id = _user_id;
  END IF;  -- non-existent user: no audit row, no rows
END $$;
REVOKE ALL     ON FUNCTION public.admin_get_user_profile(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_get_user_profile(uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.admin_get_user_profile(uuid) IS
  'Admin P3 (2026-07-01): is_admin-gated 360 header (student or mentor). Consent is driven by the AUTHORITATIVE fail-closed gate: requires_consent = requires_consent_base(dob,grade) OR dob IS NULL; has_consent = student_has_consent (adult => true). Logs view_user_profile only for a real user. No raw contact (reveal via admin_reveal_contact).';

-- ── 3. per-user bookings / reports / warnings ───────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_list_user_bookings(_user_id uuid)
RETURNS TABLE (id uuid, role_in text, counterpart_label text, date date, time_slot text, status text, price integer, frozen boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
    SELECT b.id,
           CASE WHEN b.student_id = _user_id THEN 'student' ELSE 'mentor' END AS role_in,
           public.masked_user_label(CASE WHEN b.student_id = _user_id THEN b.mentor_id ELSE b.student_id END) AS counterpart_label,
           b.date, b.time_slot, b.status, b.price, (b.frozen_at IS NOT NULL) AS frozen
      FROM public.bookings b
     WHERE b.student_id = _user_id OR b.mentor_id = _user_id
     ORDER BY b.date DESC;
END $$;
REVOKE ALL     ON FUNCTION public.admin_list_user_bookings(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_list_user_bookings(uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.admin_list_user_bookings(uuid) IS
  'Admin P3 (2026-07-01): is_admin-gated list of a user''s bookings (as student or mentor) with a MASKED counterpart label + frozen flag.';

CREATE OR REPLACE FUNCTION public.admin_list_user_reports(_user_id uuid)
RETURNS TABLE (source text, report_id uuid, role_in text, category text, status text, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_actor uuid := auth.uid();
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  -- Pulling a specific (named) user''s safeguarding-report history ties an identified
  -- minor to report categories (incl. POCSO-relevant) — LOG it. (bookings/warnings are
  -- lower-stakes operational metadata and stay unlogged.)
  INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id)
  VALUES (v_actor, 'view_user_reports', 'user', _user_id);
  RETURN QUERY
  WITH involved AS (
    SELECT 'message'::text AS source, mr.id AS report_id, mr.created_at,
           'chat_report'::text AS category,
           CASE WHEN mr.reporter_id = _user_id THEN 'reporter' ELSE 'subject' END AS role_in
      FROM public.message_reports mr
     WHERE mr.reporter_id = _user_id OR mr.reported_user_id = _user_id
    UNION ALL
    SELECT 'safety'::text, sr.id, sr.created_at, sr.category,
           CASE WHEN sr.reporter_id = _user_id THEN 'reporter' ELSE 'subject' END
      FROM public.safety_reports sr
     WHERE sr.reporter_id = _user_id OR sr.subject_user_id = _user_id
  )
  SELECT i.source, i.report_id, i.role_in, i.category, COALESCE(t.status, 'new'), i.created_at
    FROM involved i
    LEFT JOIN public.report_triage t ON t.source = i.source AND t.report_id = i.report_id
   ORDER BY i.created_at DESC;
END $$;
REVOKE ALL     ON FUNCTION public.admin_list_user_reports(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_list_user_reports(uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.admin_list_user_reports(uuid) IS
  'Admin P3 (2026-07-01): is_admin-gated list of safeguarding reports (message + safety) involving a user, as reporter or subject, with triage status. Links into the safeguarding case view.';

CREATE OR REPLACE FUNCTION public.admin_list_user_warnings(_user_id uuid)
RETURNS TABLE (id uuid, reason text, actor_id uuid, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
    SELECT w.id, w.reason, w.actor_id, w.created_at
      FROM public.user_warnings w WHERE w.user_id = _user_id ORDER BY w.created_at DESC;
END $$;
REVOKE ALL     ON FUNCTION public.admin_list_user_warnings(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_list_user_warnings(uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.admin_list_user_warnings(uuid) IS
  'Admin P3 (2026-07-01): is_admin-gated list of warnings issued against a user (from admin_warn_user).';
