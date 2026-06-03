-- V1 1:1 Video Calls (2026-05-30): server-side join authorization + lazy Daily
-- room registry + append-only join audit.
--
-- SECURITY-SENSITIVE / child-safety. These are 1:1 calls between a booked
-- student (often a minor) and their matched mentor. The whole point of this
-- migration is the join-authorization function: the single, auditable,
-- auth.uid()-based gate that decides whether a caller may obtain a Daily
-- meeting token for a given booking. The application layer (a server-only
-- TanStack Start function) calls authorize_video_join FIRST and mints a token
-- only on success — but the gate re-derives EVERYTHING from auth.uid() + the
-- bookings row and trusts no client-supplied role, room, or participant claim.
--
-- WHAT THIS SHIPS
--   1. video_rooms        — lazy, one-row-per-booking registry of the Daily
--                           room (name + url). Created on FIRST authorized join,
--                           never at booking time → no orphan rooms. RLS-on-no-
--                           policies: only service_role / SECURITY DEFINER write.
--   2. video_join_audit   — append-only ledger of every token issuance (who,
--                           which booking, which role, when, token expiry).
--                           RLS-on-no-policies + no UPDATE/DELETE path = immutable.
--   3. authorize_video_join(uuid) — SECURITY DEFINER, read-only. Returns
--                           (role, window_end) or RAISEs a distinct error the
--                           server maps to 401/403/404/409. NO recording /
--                           transcription / capture is involved anywhere — this
--                           gate only authorizes live participation.
--
-- DESIGN DECISIONS
--   * Identity: students.id and mentors.id ARE auth.users.id (see
--     20260425092228 + handle_new_user). So participation is the direct check
--     auth.uid() = bookings.student_id (→ 'student') OR = bookings.mentor_id
--     (→ 'mentor'); anyone else is rejected. This is the same equality RLS uses.
--   * Joinable status = 'confirmed' only (cancelled/completed reject).
--   * Time window (IST, mirrors auto_complete_past_bookings' AT TIME ZONE math
--     in 20260514100005): joinable from start − 10 min to end + 15 min, where
--     end = start + duration minutes. window_end (returned) = end + 15 min and
--     bounds the Daily token/room expiry the server sets.
--   * The function is READ-ONLY: it does not touch video_rooms. Room get-or-
--     create + token mint + audit insert are the server's job (service_role),
--     keeping this gate trivial to prove with a dev-seed.
--   * Consent is enforced UPSTREAM at booking INSERT (bookings_minor_consent_gate,
--     20260530000001). This gate does NOT rely on that — a booking only exists
--     if consent passed, but the join check stands on its own (participation).
--
-- Idempotent: CREATE TABLE IF NOT EXISTS, CREATE OR REPLACE FUNCTION, REVOKE/
-- GRANT against the canonical signature.
--
-- Verification: supabase/dev-seeds/video-call-join-auth-verification.sql

-- ─── 1. video_rooms: lazy per-booking Daily room registry ───────────────────
CREATE TABLE IF NOT EXISTS public.video_rooms (
  booking_id      uuid PRIMARY KEY REFERENCES public.bookings(id) ON DELETE CASCADE,
  daily_room_name text NOT NULL UNIQUE,
  daily_room_url  text NOT NULL,
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- RLS ON with NO policies + REVOKE ALL → no anon/authenticated access at all.
-- The only writer/reader is the server's service_role client (bypasses RLS).
-- The room NAME is non-guessable (server generates name with random entropy)
-- and Daily rooms are private (token required), so this is defence-in-depth.
ALTER TABLE public.video_rooms ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.video_rooms FROM anon, authenticated;

COMMENT ON TABLE public.video_rooms IS
  'V1 video calls (2026-05-30): one row per booking, created lazily on first authorized join (never at booking time → no orphans). Holds the Daily room name + url so both participants join the SAME room and re-joins reuse it. RLS-on-no-policies: written/read only by the server service_role client.';

-- ─── 2. video_join_audit: append-only token-issuance ledger ─────────────────
CREATE TABLE IF NOT EXISTS public.video_join_audit (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- FKs intentionally omitted (standard audit-log pattern): a safeguarding
  -- record must OUTLIVE the booking/user it references — it stays durable even
  -- after account or booking deletion, when the trail matters most.
  booking_id uuid NOT NULL,
  user_id    uuid NOT NULL,
  role       text NOT NULL CHECK (role IN ('student','mentor')),
  issued_at  timestamptz NOT NULL DEFAULT now(),
  token_exp  timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS video_join_audit_booking_idx
  ON public.video_join_audit (booking_id, issued_at DESC);

ALTER TABLE public.video_join_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.video_join_audit FROM anon, authenticated;

COMMENT ON TABLE public.video_join_audit IS
  'V1 video calls (2026-05-30): append-only ledger of every Daily meeting-token issuance — who (user_id+role), which booking, when (issued_at), until when (token_exp). Safeguarding/observability trail for minors'' calls. RLS-on-no-policies + no UPDATE/DELETE path = immutable. Written only by the server service_role client after authorize_video_join succeeds. INVARIANT: the server MUST set token_exp = authorize_video_join.window_end (and role = the gate''s returned role), so every audit row is self-consistent with the authorization that produced it. FKs on booking_id/user_id are intentionally OMITTED (no ON DELETE CASCADE) so the ledger survives deletion of the booking or the user account — a deleted/banned actor must not be able to erase their own safeguarding record.';

-- ─── 3. authorize_video_join: the join-authorization gate ───────────────────
-- READ-ONLY. Re-derives participation + state + time window from auth.uid() and
-- the bookings row. RAISEs a distinct message per failure (the server maps to
-- HTTP status). Returns (role, window_end) on success.
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

REVOKE ALL ON FUNCTION public.authorize_video_join(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.authorize_video_join(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.authorize_video_join(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.authorize_video_join(uuid) IS
  'V1 video calls (2026-05-30): the join-authorization gate. SECURITY DEFINER, read-only. Given a booking id, re-derives the caller''s role from auth.uid() (= student_id → student, = mentor_id → mentor, else RAISE not_a_participant), requires status=confirmed (else not_joinable_status), and requires now() within [start−10m, end+15m] IST (else outside_window); RAISEs booking_not_found if the id is unknown. Returns (role, window_end). The server calls this before minting any Daily meeting token.';
