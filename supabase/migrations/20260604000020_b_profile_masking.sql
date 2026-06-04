-- ============================================================================
-- B — Pre-booking profile masking + rating aggregate + browse filters
-- ============================================================================
-- Goal: pre-booking, a student sees a mentor's FIRST NAME + mascot + mentoring
-- info + aggregate rating only. The full name + photo unlock ONLY when a
-- non-failed booking links caller↔mentor (booking_relationship_is_active, C-3:
-- confirmed/completed).
--
-- ZERO-UI-CHANGE masking (this build adds no UI beyond the admin tab in C):
-- both public RPCs KEEP their existing columns (so browse.tsx / mentor.$id.tsx
-- compile + render unchanged), but:
--   • full_name now carries the PRIVACY-APPROPRIATE name — first-name only
--     pre-booking, the real full name once the caller has a confirmed/completed
--     booking with this mentor. The real last name is NEVER sent pre-booking.
--   • photo_url is NULL pre-booking, the real photo once booked.
--   • new ADDITIVE columns first_name / mascot_key / specialty_label /
--     avg_rating / review_count are provided for the (later, ships-with) UI to
--     show the mascot + rating; existing consumers ignore them.
--   • list_approved_mentor_profiles gains optional filter params
--     (_specialty_id / _university / _min_rating); the existing no-arg call
--     still resolves (all DEFAULT NULL → unfiltered, same as today).
--
-- Both RPCs are DROP+CREATE (return type changes) with grants restated EXACTLY
-- (anon, authenticated, service_role — the F2 header warns a prior migration
-- dropped the anon grant and broke the anonymous landing page).
--
-- list_ is ALWAYS pre-booking context (a browse list) → it never returns the
-- full name (first-name only, unconditionally). The detail RPC carries the
-- booking-gated unlock.
-- ============================================================================

-- ── list_approved_mentor_profiles — first-name + mascot + rating + filters ──
DROP FUNCTION IF EXISTS public.list_approved_mentor_profiles();

CREATE FUNCTION public.list_approved_mentor_profiles(
  _specialty_id uuid    DEFAULT NULL,
  _university   text    DEFAULT NULL,
  _min_rating   numeric DEFAULT NULL
)
RETURNS TABLE(
  id            uuid,
  full_name     text,        -- MASKED: first-name only (browse is always pre-booking)
  first_name    text,
  mascot_key    text,
  specialty_label text,
  university    text,
  countries     text[],
  course        text,
  year          text,
  price_inr     integer,
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
    split_part(m.full_name, ' ', 1)            AS full_name,   -- masked
    split_part(m.full_name, ' ', 1)            AS first_name,
    sp.mascot_key,
    sp.label                                    AS specialty_label,
    m.university,
    m.countries,
    m.course,
    m.year,
    m.price_inr,
    r.avg_rating,
    COALESCE(r.review_count, 0)::integer        AS review_count,
    m.verified_at
  FROM public.mentors m
  LEFT JOIN public.ref_specialties sp ON sp.id = m.specialty_id
  LEFT JOIN LATERAL (
    SELECT round(avg(rv.rating)::numeric, 1) AS avg_rating, count(*)::int AS review_count
    FROM public.reviews rv WHERE rv.mentor_id = m.id
  ) r ON true
  WHERE m.status = 'approved'::public.mentor_status
    AND (_specialty_id IS NULL OR m.specialty_id = _specialty_id)
    AND (_university   IS NULL OR m.university ILIKE '%' || _university || '%')
    AND (_min_rating   IS NULL OR r.avg_rating >= _min_rating)   -- NULL avg (no reviews) excluded when a floor is set
  ORDER BY m.created_at DESC;
$function$;

COMMENT ON FUNCTION public.list_approved_mentor_profiles(uuid, text, numeric) IS
  'B (2026-06-04): masked browse list. full_name carries FIRST NAME ONLY (browse is pre-booking); never the last name. Adds mascot_key/specialty_label/avg_rating/review_count + optional specialty/university/min-rating filters. NO phone/email/photo.';

REVOKE ALL ON FUNCTION public.list_approved_mentor_profiles(uuid, text, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_approved_mentor_profiles(uuid, text, numeric) TO anon, authenticated, service_role;

-- ── get_mentor_public_profile — masked, with booking-gated name/photo unlock ─
DROP FUNCTION IF EXISTS public.get_mentor_public_profile(uuid);

CREATE FUNCTION public.get_mentor_public_profile(_mentor_id uuid)
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
         THEN m.full_name ELSE split_part(m.full_name, ' ', 1) END AS full_name,
    split_part(m.full_name, ' ', 1)            AS first_name,
    CASE WHEN public.booking_relationship_is_active(auth.uid(), m.id)
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
  'B (2026-06-04): masked mentor detail. full_name = first-name pre-booking, REAL full name only when booking_relationship_is_active(auth.uid(), id) (C-3 confirmed/completed); photo_url NULL until then. Adds first_name/mascot_key/specialty_label/avg_rating/review_count. NO phone/email/college_email/dob/doc-paths.';

REVOKE ALL ON FUNCTION public.get_mentor_public_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_mentor_public_profile(uuid) TO anon, authenticated, service_role;

-- ── (folded from review B-01/B-02) Extend masking to the chat-header + review
--    RPCs so a mentor's REAL last name / photo are not leaked pre-booking, and a
--    student's surname is not de-anonymisable by UUID. DB-only (the UI reads
--    peer_name / full_name and renders whatever it gets — first-name pre-booking,
--    full name once booking_relationship_is_active). CREATE OR REPLACE keeps the
--    return shapes identical.

-- B-01: get_my_conversations — peer name/photo unlock only on an active booking.
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
         THEN (CASE WHEN c.student_id = auth.uid() THEN m.full_name ELSE s.full_name END)
         ELSE (CASE WHEN c.student_id = auth.uid() THEN split_part(m.full_name,' ',1) ELSE split_part(s.full_name,' ',1) END) END,
    CASE WHEN c.student_id = auth.uid() THEN m.university
         ELSE coalesce(s.grade,'') || ' · ' || coalesce(s.school,'') END,
    CASE WHEN c.student_id = auth.uid() AND public.booking_relationship_is_active(c.student_id, c.mentor_id)
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

-- B-01: get_conversation — same unlock gate.
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
         THEN (CASE WHEN c.student_id = auth.uid() THEN m.full_name ELSE s.full_name END)
         ELSE (CASE WHEN c.student_id = auth.uid() THEN split_part(m.full_name,' ',1) ELSE split_part(s.full_name,' ',1) END) END,
    CASE WHEN c.student_id = auth.uid() THEN m.university
         ELSE coalesce(s.grade,'') || ' · ' || coalesce(s.school,'') END,
    CASE WHEN c.student_id = auth.uid() AND public.booking_relationship_is_active(c.student_id, c.mentor_id)
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

-- B-02: get_review_student_names — first-name only (a public mentor profile may
-- label reviewers by first name; the surname must not be UUID-de-anonymisable).
CREATE OR REPLACE FUNCTION public.get_review_student_names(_ids uuid[])
RETURNS TABLE(id uuid, full_name text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT s.id, split_part(s.full_name, ' ', 1) AS full_name
  FROM public.students s WHERE s.id = ANY(_ids);
$function$;
