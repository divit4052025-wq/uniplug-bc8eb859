-- ============================================================================
-- A3 — Live current-consent on every access gate + documented revocation cascade.
-- ============================================================================
-- BEFORE A3, video-join, document access/overview and mentor/student identity
-- unmasking all rode on the BOOKING relationship (status only), NOT on CURRENT
-- consent. Revoking a minor's parental consent therefore left video, documents
-- and unmasked identity reachable, and mark_consent_revoked only NULL'd the two
-- consent flags. A3 re-keys every gate on public.student_has_consent(...) (the
-- single live predicate, 20260604000040; SECURITY DEFINER, STABLE, fail-closed
-- on NULL DOB / unknown student) so access RE-BLOCKS the instant consent is gone,
-- regardless of booking state, and rewrites mark_consent_revoked as a cascade.
--
-- POLICY (owner-confirmed 2026-06-30): on revocation the live predicate blocks
-- ALL access immediately on every gate; we then CANCEL only UNPAID non-terminal
-- bookings (pending_payment / defensively reserved) and DELETE their (and all of
-- the student's) document_shares, and FREEZE paid 'confirmed' bookings IN PLACE
-- (status UNTOUCHED — access is already blocked by the predicate) recording each
-- for admin review. We NEVER set 'cancelled' on a PAID booking because there is
-- no refund executor — cancelling would imply a refund that never happens.
--
-- METHOD: each gate below is its chronologically-last CREATE OR REPLACE body
-- copied VERBATIM, with ONLY the consent guard inserted (CREATE OR REPLACE keeps
-- existing grants intact; signatures/return shapes are unchanged). Bases:
--   authorize_video_join              20260530000003
--   can_access_document               20260604000010  (covers can_mentor_access_document, which delegates)
--   get_student_overview_for_mentor   20260604000010
--   get_mentor_public_profile         20260604000020
--   get_my_conversations              20260604000020
--   get_conversation                  20260604000020
--   mark_consent_revoked              20260523000008  (rewritten as the cascade)
--
-- ADDITIVE + reversible: one new ledger table + CREATE OR REPLACE on existing
-- functions only; no table/column dropped or renamed. LOCAL only (db reset).
-- ============================================================================

-- ── 0. additive admin-review ledger ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.consent_revocation_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  uuid NOT NULL,
  booking_id  uuid,
  action      text NOT NULL CHECK (action IN ('frozen_paid','cancelled_unpaid','shares_revoked')),
  revoked_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.consent_revocation_events ENABLE ROW LEVEL SECURITY;
-- RLS on + zero client privileges = no client read/write path. Admin reads via a
-- future is_admin() RPC; no client policy by design (mirrors video_join_audit).
REVOKE ALL ON TABLE public.consent_revocation_events FROM anon, authenticated;

COMMENT ON TABLE public.consent_revocation_events IS
  'A3 (2026-06-30): append-only ledger of mark_consent_revoked cascade actions for a student — frozen_paid (a paid confirmed booking frozen in place for admin review), cancelled_unpaid (an unpaid booking cancelled), shares_revoked (the student''s document_shares deleted). RLS-on + REVOKE-all = no client path; admin reads via a future is_admin RPC.';

-- ── 1. authorize_video_join — block the join when consent is not current ─────
--    Verbatim 20260530000003:94-169 body. The consent guard is placed AFTER the
--    participation check (so a non-participant / orphan NULL-student booking still
--    gets not_a_participant, and consent status is never leaked to a non-party).
CREATE OR REPLACE FUNCTION public.authorize_video_join(_booking_id uuid)
RETURNS TABLE (role text, window_end timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller     uuid := auth.uid();
  v_student_id uuid;
  v_mentor_id  uuid;
  v_status     text;
  v_date       date;
  v_time_slot  text;
  v_duration    integer;
  v_eff_minutes integer;
  v_role        text;
  v_start       timestamptz;
  v_end         timestamptz;
  v_open        timestamptz;
  v_close       timestamptz;
BEGIN
  -- 1. Authentication required (defence-in-depth; the server middleware also
  --    gates this, and EXECUTE is revoked from anon).
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  -- 2. Load the booking (SECURITY DEFINER reads it regardless of RLS).
  SELECT b.student_id, b.mentor_id, b.status, b.date, b.time_slot, b.duration
    INTO v_student_id, v_mentor_id, v_status, v_date, v_time_slot, v_duration
    FROM public.bookings b
   WHERE b.id = _booking_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- 3. Participation — re-derived from auth.uid(), NEVER trusted from client.
  --    Anyone who is neither the booked student nor the matched mentor is
  --    rejected here (the 403 gate).
  IF v_caller = v_student_id THEN
    v_role := 'student';
  ELSIF v_caller = v_mentor_id THEN
    v_role := 'mentor';
  ELSE
    RAISE EXCEPTION 'not_a_participant' USING ERRCODE = '42501';
  END IF;

  -- 3b. [A3] LIVE CONSENT — neither party may join once the booked student's
  --     parental consent is not current. Checked after participation so it never
  --     leaks consent state to a non-party (and an orphan NULL-student booking
  --     still resolves as not_a_participant above).
  IF NOT public.student_has_consent(v_student_id) THEN
    RAISE EXCEPTION 'consent_revoked' USING ERRCODE = 'P0001';
  END IF;

  -- 4. State — only confirmed bookings are joinable.
  IF v_status <> 'confirmed' THEN
    RAISE EXCEPTION 'not_joinable_status' USING ERRCODE = 'P0001';
  END IF;

  -- 5. Time window in IST. Build the naive IST wall-clock instant then
  --    interpret it as Asia/Kolkata (same construction as
  --    auto_complete_past_bookings). Joinable from start−10m to end+15m.
  --    Defence-in-depth: bookings.duration has only a positive CHECK and no
  --    upper bound, so clamp the EFFECTIVE minutes (cap 120; V1 sessions are
  --    60) — a pathological duration cannot stretch the joinable window or the
  --    Daily token lifetime that the server derives from window_end.
  v_eff_minutes := LEAST(GREATEST(v_duration, 1), 120);
  v_start := (v_date::timestamp + v_time_slot::time) AT TIME ZONE 'Asia/Kolkata';
  v_end   := (v_date::timestamp + v_time_slot::time + make_interval(mins => v_eff_minutes))
               AT TIME ZONE 'Asia/Kolkata';
  v_open  := v_start - interval '10 minutes';
  v_close := v_end   + interval '15 minutes';

  IF now() < v_open OR now() > v_close THEN
    RAISE EXCEPTION 'outside_window' USING ERRCODE = 'P0001';
  END IF;

  role        := v_role;
  window_end  := v_close;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.authorize_video_join(uuid) IS
  'V1 video join gate (A3 2026-06-30): re-derives participation + state + window from auth.uid() and the booking, and additionally RAISEs consent_revoked (P0001) when the booked student''s parental consent is not current (public.student_has_consent) — checked after participation. Returns (role, window_end) on success.';

-- ── 2. can_access_document — non-owner branch additionally requires consent ──
--    Verbatim 20260604000010:146-167 body; the consent check is added ONLY in the
--    non-owner path (the owning student keeps access to their OWN document).
CREATE OR REPLACE FUNCTION public.can_access_document(_document_id uuid, _viewer uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_student uuid;
  v_vis     text;
BEGIN
  SELECT sd.student_id, sd.visibility INTO v_student, v_vis
    FROM public.student_documents sd WHERE sd.id = _document_id;
  IF NOT FOUND THEN RETURN false; END IF;
  IF _viewer = v_student THEN RETURN true; END IF;                 -- owner
  -- [A3] non-owner access additionally requires the owning student's CURRENT
  -- consent (re-blocks every booked mentor the moment consent is revoked).
  IF NOT public.student_has_consent(v_student) THEN RETURN false; END IF;
  -- mentor must have an active (confirmed/completed) booking relationship …
  IF NOT public.booking_relationship_is_active(v_student, _viewer) THEN RETURN false; END IF;
  -- … and the doc must be all_booked OR explicitly shared to them.
  IF v_vis = 'all_booked' THEN RETURN true; END IF;
  RETURN EXISTS (SELECT 1 FROM public.document_shares s WHERE s.document_id = _document_id AND s.mentor_id = _viewer);
END;
$function$;

COMMENT ON FUNCTION public.can_access_document(uuid, uuid) IS
  'A + A3 (2026-06-30): TRUE if _viewer is the owning student, or a mentor with a confirmed/completed booking AND the owning student''s parental consent is CURRENT AND the doc is all_booked or explicitly shared to them. The single access predicate for doc-sharing reads/writes (can_mentor_access_document delegates here).';

-- ── 3. get_student_overview_for_mentor — return nothing without consent ──────
--    Verbatim 20260604000010:267-340 body; the consent guard is added after the
--    existing booking-relationship gate.
CREATE OR REPLACE FUNCTION public.get_student_overview_for_mentor(_student_id uuid)
RETURNS TABLE(student_id uuid, full_name text, school text, grade text, documents jsonb, schools jsonb)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_mentor uuid := auth.uid();
BEGIN
  -- Unchanged gate: caller must hold a confirmed/completed booking with this student.
  IF NOT public.booking_relationship_is_active(_student_id, v_mentor) THEN
    RETURN;
  END IF;

  -- [A3] LIVE CONSENT — once the student's parental consent is not current, the
  -- mentor sees nothing (re-blocks the whole overview on revocation).
  IF NOT public.student_has_consent(_student_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    s.id AS student_id,
    s.full_name,
    s.school,
    s.grade,
    COALESCE(
      (SELECT jsonb_agg(
          jsonb_build_object(
            'id',           d.id,
            'file_name',    d.file_name,
            'storage_path', d.storage_path,
            'size_bytes',   d.size_bytes,
            'created_at',   d.created_at,
            'visibility',   d.visibility,
            'shared',       (d.visibility = 'restricted'),
            -- Notes/versions are scoped to the CALLING mentor's own rows + the
            -- owning student's rows — a mentor must NOT see a DIFFERENT mentor's
            -- private notes / edited-version paths on a shared student's doc
            -- (folded from review A-1).
            'notes', COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                       'id', n.id, 'author_id', n.author_id, 'body', n.body, 'created_at', n.created_at)
                     ORDER BY n.created_at DESC)
              FROM public.document_notes n
              WHERE n.document_id = d.id
                AND (n.author_id = v_mentor OR n.author_id = _student_id)), '[]'::jsonb),
            'versions', COALESCE((
              SELECT jsonb_agg(jsonb_build_object(
                       'id', v.id, 'version_no', v.version_no, 'file_name', v.file_name,
                       'storage_path', v.storage_path, 'size_bytes', v.size_bytes,
                       'uploaded_by', v.uploaded_by, 'created_at', v.created_at)
                     ORDER BY v.version_no DESC)
              FROM public.document_versions v
              WHERE v.document_id = d.id
                AND (v.uploaded_by = v_mentor OR v.uploaded_by = _student_id)), '[]'::jsonb)
          ) ORDER BY d.created_at DESC
        )
        FROM public.student_documents d
        WHERE d.student_id = _student_id
          -- THE GATE: all_booked is visible to any booked mentor; restricted only if explicitly shared.
          AND (d.visibility = 'all_booked'
               OR EXISTS (SELECT 1 FROM public.document_shares sh
                          WHERE sh.document_id = d.id AND sh.mentor_id = v_mentor))
      ),
      '[]'::jsonb
    ) AS documents,
    COALESCE(
      (SELECT jsonb_agg(
          jsonb_build_object('id', sc.id, 'name', sc.name, 'category', sc.category, 'created_at', sc.created_at)
          ORDER BY sc.created_at DESC)
        FROM public.student_schools sc
        WHERE sc.student_id = _student_id
      ),
      '[]'::jsonb
    ) AS schools
  FROM public.students s
  WHERE s.id = _student_id;
END;
$function$;

COMMENT ON FUNCTION public.get_student_overview_for_mentor(uuid) IS
  'P4 contact-strip + A + A3 (2026-06-30): booking-gated mentor view of a student, now also returning NOTHING once the student''s parental consent is not current (public.student_has_consent). NO email/phone. documents FILTERED by per-doc visibility/share and enriched with notes + versions.';

-- ── 4. get_mentor_public_profile — re-mask identity without consent ─────────
--    Verbatim 20260604000020:96-146 body; each unmask CASE is ANDed with the
--    viewing student's CURRENT consent so the mentor's full name + photo re-mask
--    on revocation. Browsing (everything else) is untouched.
CREATE OR REPLACE FUNCTION public.get_mentor_public_profile(_mentor_id uuid)
RETURNS TABLE(
  id            uuid,
  full_name     text,        -- first-name pre-booking; REAL full name once booking_relationship_is_active
  first_name    text,
  photo_url     text,        -- NULL pre-booking; real photo once booked
  mascot_key    text,
  specialty_label text,
  university    text,
  countries     text[],
  course        text,
  year          text,
  price_inr     integer,
  bio           text,
  topics        text[],
  avg_rating    numeric,
  review_count  integer,
  verified_at   timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT
    m.id,
    CASE WHEN public.booking_relationship_is_active(auth.uid(), m.id)
              AND public.student_has_consent(auth.uid())
         THEN m.full_name ELSE split_part(m.full_name, ' ', 1) END AS full_name,
    split_part(m.full_name, ' ', 1)            AS first_name,
    CASE WHEN public.booking_relationship_is_active(auth.uid(), m.id)
              AND public.student_has_consent(auth.uid())
         THEN m.photo_url ELSE NULL END         AS photo_url,
    sp.mascot_key,
    sp.label                                    AS specialty_label,
    m.university,
    m.countries,
    m.course,
    m.year,
    m.price_inr,
    m.bio,
    m.topics,
    r.avg_rating,
    COALESCE(r.review_count, 0)::integer        AS review_count,
    m.verified_at
  FROM public.mentors m
  LEFT JOIN public.ref_specialties sp ON sp.id = m.specialty_id
  LEFT JOIN LATERAL (
    SELECT round(avg(rv.rating)::numeric, 1) AS avg_rating, count(*)::int AS review_count
    FROM public.reviews rv WHERE rv.mentor_id = m.id
  ) r ON true
  WHERE m.id = _mentor_id AND m.status = 'approved'::public.mentor_status;
$function$;

COMMENT ON FUNCTION public.get_mentor_public_profile(uuid) IS
  'B + A3 (2026-06-30): masked mentor detail. full_name/photo unlock only when booking_relationship_is_active(auth.uid(), id) AND the viewing student''s parental consent is current — so identity RE-MASKS to first-name/no-photo on consent revocation. Browse fields unchanged. NO phone/email/dob/doc-paths.';

-- ── 5. get_my_conversations — re-mask peer identity (both directions) ───────
--    Verbatim 20260604000020:162-199 body; each identity-unmask CASE is ANDed
--    with the booked student's CURRENT consent. has_session / listing untouched
--    (so conversations still LIST after revocation — only the identity re-masks).
CREATE OR REPLACE FUNCTION public.get_my_conversations()
RETURNS TABLE(conversation_id uuid, peer_id uuid, peer_name text, peer_subtitle text, peer_photo_url text, last_message text, last_message_at timestamp with time zone, unread_count integer, is_blocked boolean, i_blocked boolean, has_session boolean)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT
    c.id,
    CASE WHEN c.student_id = auth.uid() THEN c.mentor_id ELSE c.student_id END,
    CASE WHEN public.booking_relationship_is_active(c.student_id, c.mentor_id)
              AND public.student_has_consent(c.student_id)
         THEN (CASE WHEN c.student_id = auth.uid() THEN m.full_name ELSE s.full_name END)
         ELSE (CASE WHEN c.student_id = auth.uid() THEN split_part(m.full_name,' ',1) ELSE split_part(s.full_name,' ',1) END) END,
    CASE WHEN c.student_id = auth.uid() THEN m.university
         ELSE coalesce(s.grade,'') || ' · ' || coalesce(s.school,'') END,
    CASE WHEN c.student_id = auth.uid() AND public.booking_relationship_is_active(c.student_id, c.mentor_id)
              AND public.student_has_consent(c.student_id)
         THEN m.photo_url ELSE NULL END,
    left(lm.body, 80),
    c.last_message_at,
    coalesce(un.cnt, 0)::int,
    (c.blocked_by IS NOT NULL),
    (c.blocked_by = auth.uid()),
    public.booking_relationship_is_active(c.student_id, c.mentor_id)
  FROM public.conversations c
  LEFT JOIN public.mentors  m ON m.id = c.mentor_id
  LEFT JOIN public.students s ON s.id = c.student_id
  LEFT JOIN LATERAL (
    SELECT mm.body FROM public.messages mm
     WHERE mm.conversation_id = c.id AND NOT mm.soft_deleted
     ORDER BY mm.created_at DESC LIMIT 1
  ) lm ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS cnt FROM public.notifications n
     WHERE n.recipient_id = auth.uid() AND n.conversation_id = c.id
       AND n.kind = 'new_message' AND n.read_at IS NULL
  ) un ON true
  WHERE auth.uid() IN (c.student_id, c.mentor_id)
  ORDER BY c.last_message_at DESC NULLS LAST;
$function$;

-- ── 6. get_conversation — same identity re-mask (both directions) ───────────
--    Verbatim 20260604000020:202-226 body; identity-unmask CASEs ANDed with the
--    booked student's CURRENT consent.
CREATE OR REPLACE FUNCTION public.get_conversation(_conversation_id uuid)
RETURNS TABLE(conversation_id uuid, peer_id uuid, peer_name text, peer_subtitle text, peer_photo_url text, is_blocked boolean, i_blocked boolean, has_session boolean)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT
    c.id,
    CASE WHEN c.student_id = auth.uid() THEN c.mentor_id ELSE c.student_id END,
    CASE WHEN public.booking_relationship_is_active(c.student_id, c.mentor_id)
              AND public.student_has_consent(c.student_id)
         THEN (CASE WHEN c.student_id = auth.uid() THEN m.full_name ELSE s.full_name END)
         ELSE (CASE WHEN c.student_id = auth.uid() THEN split_part(m.full_name,' ',1) ELSE split_part(s.full_name,' ',1) END) END,
    CASE WHEN c.student_id = auth.uid() THEN m.university
         ELSE coalesce(s.grade,'') || ' · ' || coalesce(s.school,'') END,
    CASE WHEN c.student_id = auth.uid() AND public.booking_relationship_is_active(c.student_id, c.mentor_id)
              AND public.student_has_consent(c.student_id)
         THEN m.photo_url ELSE NULL END,
    (c.blocked_by IS NOT NULL),
    (c.blocked_by = auth.uid()),
    public.booking_relationship_is_active(c.student_id, c.mentor_id)
  FROM public.conversations c
  LEFT JOIN public.mentors  m ON m.id = c.mentor_id
  LEFT JOIN public.students s ON s.id = c.student_id
  WHERE c.id = _conversation_id
    AND auth.uid() IN (c.student_id, c.mentor_id);
$function$;

COMMENT ON FUNCTION public.get_my_conversations() IS
  'B-01 + A3 (2026-06-30): conversation list. Peer name/photo unmask only on an active booking AND the booked student''s current consent (identity re-masks BOTH directions on revocation); listing + has_session unchanged so threads still appear.';
COMMENT ON FUNCTION public.get_conversation(uuid) IS
  'B-01 + A3 (2026-06-30): single conversation header. Peer name/photo unmask only on an active booking AND the booked student''s current consent (re-masks BOTH directions on revocation); listing unchanged.';

-- ── 7. mark_consent_revoked — the documented revocation cascade ─────────────
--    Verbatim 20260523000008:113-128 body (is_admin() guard + flag NULLing
--    PRESERVED), then the cascade per the owner-confirmed policy above.
CREATE OR REPLACE FUNCTION public.mark_consent_revoked(_student_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.students
     SET parental_consent_at    = NULL,
         parental_consent_token = NULL
   WHERE id = _student_id;

  -- [A3] CASCADE — the live predicate already blocks ALL access on every gate;
  -- these actions clean up dependent state and record an admin-review trail.

  -- (i) delete ALL document_shares for this student's documents (defense-in-depth
  --     — the predicate already blocks; this removes the dangling grants).
  INSERT INTO public.consent_revocation_events (student_id, action)
    VALUES (_student_id, 'shares_revoked');
  DELETE FROM public.document_shares ds
   USING public.student_documents sd
   WHERE ds.document_id = sd.id AND sd.student_id = _student_id;

  -- (ii) CANCEL only UNPAID non-terminal bookings (pending_payment; defensively
  --      reserved). No money was taken, so cancelling implies no refund.
  WITH c AS (
    UPDATE public.bookings SET status = 'cancelled'
     WHERE student_id = _student_id AND status IN ('pending_payment','reserved')
     RETURNING id)
  INSERT INTO public.consent_revocation_events (student_id, booking_id, action)
    SELECT _student_id, id, 'cancelled_unpaid' FROM c;

  -- (iii) FREEZE paid 'confirmed' bookings IN PLACE — status UNTOUCHED (access is
  --       already blocked by the predicate). NEVER set 'cancelled' on a paid
  --       booking: there is no refund executor, so that would imply a refund that
  --       never happens. Record each for admin review.
  INSERT INTO public.consent_revocation_events (student_id, booking_id, action)
    SELECT _student_id, id, 'frozen_paid' FROM public.bookings
     WHERE student_id = _student_id AND status = 'confirmed';
END;
$$;

COMMENT ON FUNCTION public.mark_consent_revoked(uuid) IS
  'G4 + A3 (2026-06-30): admin-only. NULLs parental_consent_at/_token (so every live-consent gate re-blocks immediately), then runs the revocation cascade: delete the student''s document_shares, cancel UNPAID non-terminal bookings, and FREEZE paid confirmed bookings in place (status untouched — no refund executor exists). Every action is recorded in consent_revocation_events for admin review. Preserves the is_admin() entry guard.';
