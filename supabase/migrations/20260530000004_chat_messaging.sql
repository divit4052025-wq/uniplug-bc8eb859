-- V1 1:1 Text Chat (2026-05-31): student ↔ mentor messaging.
--
-- SECURITY-SENSITIVE / child-safety. A private text channel between a student
-- (often a minor) and a mentor (adult). Design posture:
--   * TEXT ONLY (500-char DB CHECK + RPC); no media anywhere.
--   * Every limit lives in the DB/RPC (the client is "dumb"): per-message
--     length, pre-booking student→mentor cap (15), PII-block, block, rate.
--   * An adult can NEVER cold-DM a minor: a mentor may only send into a
--     conversation the student already started OR when a confirmed/completed
--     booking exists between the pair.
--   * Everything is RETAINED + admin-reviewable; "delete" is soft only; report
--     + block are server-enforced; an immutable safeguarding-events trail logs
--     pii_blocked + student-blocks-mentor (the grooming signal).
--
-- THE GATE: public.send_message(_recipient_id, _body) — SECURITY DEFINER,
-- re-derives the sender from auth.uid(), runs ALL reject-gates BEFORE any write
-- (a rejected send never creates/touches a conversation/message), and writes the
-- conversation upsert + message only after every gate passes. Return contract:
-- no-side-effect rejects RAISE a distinct reason; the PII reject (which must
-- persist its safeguarding_events log) RETURNs {ok:false,reason:'pii_blocked'}
-- instead of raising (a RAISE would roll the log back); success RETURNs {ok:true}.
--
-- FK-durability (per video_join_audit): participant ids on messages /
-- conversations / message_reports / safeguarding_events are PLAIN uuid (NO FK to
-- auth.users/students/mentors) so a deleted/banned actor can't erase the
-- safeguarding trail; the RPCs validate ids at write time, so no orphans arise.
-- messages.conversation_id keeps its FK (conversations are never deleted).
--
-- Verification: supabase/dev-seeds/chat-messaging-verification.sql

-- ════════════════════════════════════════════════════════════════════════════
-- 1. TABLES
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.conversations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      uuid NOT NULL,
  mentor_id       uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz,
  blocked_by      uuid,
  blocked_at      timestamptz,
  CONSTRAINT conversations_pair_unique UNIQUE (student_id, mentor_id)
);

CREATE TABLE IF NOT EXISTS public.messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id),
  sender_id       uuid NOT NULL,
  recipient_id    uuid NOT NULL,
  body            text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  created_at      timestamptz NOT NULL DEFAULT now(),
  soft_deleted    boolean NOT NULL DEFAULT false,
  reported        boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS messages_conversation_created_idx
  ON public.messages (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS messages_sender_created_idx
  ON public.messages (sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS messages_recipient_idx
  ON public.messages (recipient_id);

CREATE TABLE IF NOT EXISTS public.message_reports (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id     uuid NOT NULL,
  reporter_id         uuid NOT NULL,
  reported_message_id uuid,
  reported_user_id    uuid NOT NULL,
  reason              text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 1000),
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS message_reports_conversation_idx
  ON public.message_reports (conversation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.safeguarding_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type      text NOT NULL CHECK (event_type IN ('pii_blocked','student_blocked_mentor')),
  actor_id        uuid NOT NULL,
  conversation_id uuid,
  detail          text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS safeguarding_events_actor_idx
  ON public.safeguarding_events (actor_id, created_at DESC);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- conversations + messages: participants SELECT their own (messages also hide
-- soft-deleted from participants); admin sees all. NO client writes (the
-- SECURITY DEFINER RPCs / service_role are the only writers). The messages
-- SELECT policy is ALSO what gates Realtime delivery per-subscriber.
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.conversations TO authenticated;
CREATE POLICY "participants read own conversations" ON public.conversations
  FOR SELECT TO authenticated
  USING (auth.uid() IN (student_id, mentor_id) OR public.is_admin());

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.messages TO authenticated;
CREATE POLICY "participants read own non-deleted messages" ON public.messages
  FOR SELECT TO authenticated
  USING (
    ((auth.uid() = sender_id OR auth.uid() = recipient_id) AND NOT soft_deleted)
    OR public.is_admin()
  );

-- Defense-in-depth: strip the Supabase default table GRANTs so write denial does
-- not rest on RLS alone (a future stray write policy can't be silently exploited).
-- SELECT stays granted (the participant read path + Realtime). Writes go only
-- through the SECURITY DEFINER RPCs / service_role.
REVOKE INSERT, UPDATE, DELETE ON public.conversations FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.messages       FROM anon, authenticated;

-- message_reports + safeguarding_events: fully locked (admin / service_role
-- only; written by the DEFINER RPCs). Append-only — no UPDATE/DELETE path.
ALTER TABLE public.message_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.message_reports FROM anon, authenticated;
ALTER TABLE public.safeguarding_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.safeguarding_events FROM anon, authenticated;

COMMENT ON TABLE public.conversations IS
  'V1 chat (2026-05-31): one row per (student_id, mentor_id) pair. blocked_by/blocked_at hold the live block state (set by block_conversation; cleared only by the blocker or admin). Participant ids are plain uuid (no FK) for safeguarding durability.';
COMMENT ON TABLE public.messages IS
  'V1 chat (2026-05-31): text-only (≤500 char CHECK), immutable, soft-delete only (retained for admin/service_role). RLS: participants read own non-deleted; admin reads all; writes ONLY via send_message / service_role. This SELECT policy gates Realtime delivery. sender_id/recipient_id are plain uuid (no FK) for safeguarding durability.';
COMMENT ON TABLE public.message_reports IS
  'V1 chat (2026-05-31): immutable safeguarding report ledger. RLS-on + REVOKE ALL (admin/service_role only); written by submit_report; no UPDATE/DELETE path. Plain-uuid actor ids for durability.';
COMMENT ON TABLE public.safeguarding_events IS
  'V1 chat (2026-05-31): append-only grooming-signal trail — pii_blocked (off-platform-contact attempts) + student_blocked_mentor. RLS-on + REVOKE ALL (admin/service_role only); written by send_message / block_conversation. detail is a coarse marker, NEVER the raw message body.';

-- ════════════════════════════════════════════════════════════════════════════
-- 2. PII helper (first-layer regex — FRICTION, not a control; limits documented)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.chat_contains_pii(_body text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT
    -- email
    _body ~* '[[:alnum:]._%+\-]+@[[:alnum:].\-]+\.[[:alpha:]]{2,}'
    -- url / bare domain
    OR _body ~* '(https?://|www\.)'
    OR _body ~* '[[:alnum:]\-]+\.(com|net|org|io|in|co|me|app|xyz|gg|to|ly|us|uk|edu)\m'
    -- phone-ish: a run of >= 8 digits, optionally separated by space ( ) . - +
    OR _body ~ '(\+?[0-9][ ().\-]?){8,}'
    -- @handle
    OR _body ~* '@[[:alnum:]_.]{3,}'
    -- social platforms / off-platform-contact phrasing
    OR _body ~* '\m(insta|instagram|snap|snapchat|whatsapp|whats ?app|telegram|signal|discord|tiktok|wechat|kik|gmail|yahoo|hotmail|outlook)\M'
    OR _body ~* '(find|add|reach|contact|dm|text|call|ping|email) +me +(on|at|@|via|here|through)'
    OR _body ~* '\mmy +(number|email|handle|insta|snap|cell|phone|whats)';
$$;
REVOKE ALL ON FUNCTION public.chat_contains_pii(text) FROM PUBLIC;
COMMENT ON FUNCTION public.chat_contains_pii(text) IS
  'V1 chat (2026-05-31): first-layer PII / off-platform-contact heuristic (email, url, bare domain, 8+digit phone, @handle, social-platform + "contact me on X" phrasing). Deliberately broad; HAS false positives/negatives — it is FRICTION, not a safeguard. The real controls are full retention + report + the safeguarding_events trail.';

-- ════════════════════════════════════════════════════════════════════════════
-- 3. send_message — the authorization gate (gates BEFORE any write)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.send_message(_recipient_id uuid, _body text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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

  -- 2. Sender role (membership; handle_new_user guarantees a uid is in at most
  --    one role table). The admin (is_admin(): in NEITHER table) intentionally
  --    falls through to invalid_sender — admins never send chat; any "intervene
  --    in thread" capability must be a separate explicit DEFINER path.
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

  -- 3b. The mentor on this pair must be APPROVED (vetted). A minor must not be
  --     able to open OR continue a private channel with an unverified/pending/
  --     rejected adult — mirrors browse + book_session, which both gate on
  --     status='approved'. Applies to BOTH directions (the check is on the
  --     pair's mentor, not the sender), so a mentor who is later rejected is
  --     cut off from messaging the student.
  IF NOT EXISTS (
    SELECT 1 FROM public.mentors WHERE id = v_mentor_id AND status = 'approved'
  ) THEN
    RAISE EXCEPTION 'mentor_not_available' USING ERRCODE = 'P0001';
  END IF;

  -- 4. Load existing conversation (may be absent) + pair-has-session.
  SELECT * INTO v_convo FROM public.conversations
   WHERE student_id = v_student_id AND mentor_id = v_mentor_id;

  v_has_session := EXISTS (
    SELECT 1 FROM public.bookings b
     WHERE b.student_id = v_student_id AND b.mentor_id = v_mentor_id
       AND b.status IN ('confirmed','completed')
  );

  -- 5. Mentor no-cold-initiate (CHILD-SAFETY): a mentor may only send into an
  --    existing (student-started) conversation OR when a booking exists.
  IF v_sender_is_mentor AND v_convo.id IS NULL AND NOT v_has_session THEN
    RAISE EXCEPTION 'mentor_cannot_initiate' USING ERRCODE = 'P0001';
  END IF;

  -- 6. Block — read-only in both directions while blocked_by is set.
  IF v_convo.id IS NOT NULL AND v_convo.blocked_by IS NOT NULL THEN
    RAISE EXCEPTION 'blocked' USING ERRCODE = 'P0001';
  END IF;

  -- 7. Body length (DB CHECK is the hard floor; this gives the friendly reason).
  IF v_body = '' THEN
    RAISE EXCEPTION 'empty' USING ERRCODE = 'P0001';
  END IF;
  IF char_length(v_body) > c_max_chars THEN
    RAISE EXCEPTION 'too_long' USING ERRCODE = 'P0001';
  END IF;

  -- 8. PII-block — the ONLY gate that writes. Log then RETURN (must not RAISE,
  --    or the safeguarding_events row would roll back). No conversation/message
  --    is created. conversation_id is NULL for a first-message block.
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

  -- 10. Pre-booking cap — student only, no session, count student's messages in
  --     the EXISTING conversation (0 if none → first message never capped).
  IF NOT v_has_session AND v_sender_is_student AND v_convo.id IS NOT NULL THEN
    SELECT count(*) INTO v_student_msgs FROM public.messages
     WHERE conversation_id = v_convo.id AND sender_id = v_sender;  -- soft-deleted still count
    IF v_student_msgs >= c_pre_booking_cap THEN
      RAISE EXCEPTION 'pre_booking_cap' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- 11. WRITE PHASE — all gates passed. Race-safe upsert, then the message.
  INSERT INTO public.conversations (student_id, mentor_id, last_message_at)
  VALUES (v_student_id, v_mentor_id, now())
  ON CONFLICT (student_id, mentor_id) DO UPDATE SET last_message_at = now()
  RETURNING id INTO v_convo_id;

  INSERT INTO public.messages (conversation_id, sender_id, recipient_id, body)
  VALUES (v_convo_id, v_sender, _recipient_id, v_body)
  RETURNING id INTO v_msg_id;

  RETURN jsonb_build_object('ok', true, 'conversation_id', v_convo_id, 'message_id', v_msg_id);
END;
$$;

REVOKE ALL ON FUNCTION public.send_message(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.send_message(uuid, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.send_message(uuid, text) TO authenticated;
COMMENT ON FUNCTION public.send_message(uuid, text) IS
  'V1 chat gate (2026-05-31): SECURITY DEFINER. Re-derives sender from auth.uid(); runs ALL reject-gates before any write (auth, roles, mentor_cannot_initiate, blocked, empty/too_long, pii_blocked, rate_limited, pre_booking_cap[student/no-session/15]); only then upserts the conversation (race-safe) + inserts the message. No-side-effect rejects RAISE; the PII reject logs to safeguarding_events and RETURNs {ok:false,reason:pii_blocked} (commits); success RETURNs {ok:true,...}.';

-- ════════════════════════════════════════════════════════════════════════════
-- 4. new_message notification (reuse notifications; widen kind + nullable cols)
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_kind_check
  CHECK (kind IN ('booking_confirmed','session_completed','new_message'));

ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS conversation_id uuid
  REFERENCES public.conversations(id) ON DELETE CASCADE;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS sender_name text;
ALTER TABLE public.notifications ALTER COLUMN booking_date     DROP NOT NULL;
ALTER TABLE public.notifications ALTER COLUMN booking_time_slot DROP NOT NULL;
ALTER TABLE public.notifications ALTER COLUMN student_name      DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.create_new_message_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sender_name text;
BEGIN
  SELECT full_name INTO v_sender_name FROM public.students WHERE id = NEW.sender_id;
  IF v_sender_name IS NULL THEN
    SELECT full_name INTO v_sender_name FROM public.mentors WHERE id = NEW.sender_id;
  END IF;

  INSERT INTO public.notifications (recipient_id, kind, conversation_id, sender_name)
  VALUES (NEW.recipient_id, 'new_message', NEW.conversation_id, coalesce(v_sender_name, 'Someone'));
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- A notification failure must NEVER abort the message insert.
  RAISE WARNING '[chat] new_message notification failed for message %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_new_message_notification ON public.messages;
CREATE TRIGGER messages_new_message_notification
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.create_new_message_notification();

REVOKE ALL ON FUNCTION public.create_new_message_notification() FROM public;
REVOKE EXECUTE ON FUNCTION public.create_new_message_notification() FROM anon;
GRANT  EXECUTE ON FUNCTION public.create_new_message_notification() TO authenticated, service_role;

COMMENT ON FUNCTION public.create_new_message_notification() IS
  'V1 chat (2026-05-31): AFTER INSERT on messages → inserts a kind=new_message notification for the recipient (conversation_id + sender_name). SECURITY DEFINER; non-fatal (notification failure → WARNING, never aborts the send). Mirrors create_session_completed_notification.';

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Read RPCs
-- ════════════════════════════════════════════════════════════════════════════
-- Enriched conversation list for the caller (names joined server-side; preview +
-- unread exclude soft-deleted; controls PII to name/role fields).
CREATE OR REPLACE FUNCTION public.get_my_conversations()
RETURNS TABLE (
  conversation_id uuid,
  peer_id uuid,
  peer_name text,
  peer_subtitle text,
  peer_photo_url text,
  last_message text,
  last_message_at timestamptz,
  unread_count integer,
  is_blocked boolean,
  i_blocked boolean,
  has_session boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    c.id,
    CASE WHEN c.student_id = auth.uid() THEN c.mentor_id ELSE c.student_id END,
    CASE WHEN c.student_id = auth.uid() THEN m.full_name ELSE s.full_name END,
    CASE WHEN c.student_id = auth.uid() THEN m.university
         ELSE coalesce(s.grade,'') || ' · ' || coalesce(s.school,'') END,
    CASE WHEN c.student_id = auth.uid() THEN m.photo_url ELSE NULL END,
    left(lm.body, 80),
    c.last_message_at,
    coalesce(un.cnt, 0)::int,
    (c.blocked_by IS NOT NULL),
    (c.blocked_by = auth.uid()),
    EXISTS (SELECT 1 FROM public.bookings b
             WHERE b.student_id = c.student_id AND b.mentor_id = c.mentor_id
               AND b.status IN ('confirmed','completed'))
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
$$;
REVOKE ALL ON FUNCTION public.get_my_conversations() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_my_conversations() FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_my_conversations() TO authenticated;

-- Single-conversation header (deep-link / thread). Participant-authorized.
CREATE OR REPLACE FUNCTION public.get_conversation(_conversation_id uuid)
RETURNS TABLE (
  conversation_id uuid,
  peer_id uuid,
  peer_name text,
  peer_subtitle text,
  peer_photo_url text,
  is_blocked boolean,
  i_blocked boolean,
  has_session boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    c.id,
    CASE WHEN c.student_id = auth.uid() THEN c.mentor_id ELSE c.student_id END,
    CASE WHEN c.student_id = auth.uid() THEN m.full_name ELSE s.full_name END,
    CASE WHEN c.student_id = auth.uid() THEN m.university
         ELSE coalesce(s.grade,'') || ' · ' || coalesce(s.school,'') END,
    CASE WHEN c.student_id = auth.uid() THEN m.photo_url ELSE NULL END,
    (c.blocked_by IS NOT NULL),
    (c.blocked_by = auth.uid()),
    EXISTS (SELECT 1 FROM public.bookings b
             WHERE b.student_id = c.student_id AND b.mentor_id = c.mentor_id
               AND b.status IN ('confirmed','completed'))
  FROM public.conversations c
  LEFT JOIN public.mentors  m ON m.id = c.mentor_id
  LEFT JOIN public.students s ON s.id = c.student_id
  WHERE c.id = _conversation_id
    AND auth.uid() IN (c.student_id, c.mentor_id);
$$;
REVOKE ALL ON FUNCTION public.get_conversation(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_conversation(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_conversation(uuid) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 6. Action RPCs (block / unblock / report / soft-delete / mark-read)
-- ════════════════════════════════════════════════════════════════════════════

-- Block: any participant. If a STUDENT blocks a mentor, log the safeguarding event.
CREATE OR REPLACE FUNCTION public.block_conversation(_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_c public.conversations%ROWTYPE;
BEGIN
  SELECT * INTO v_c FROM public.conversations WHERE id = _conversation_id;
  IF NOT FOUND OR auth.uid() NOT IN (v_c.student_id, v_c.mentor_id) THEN
    RAISE EXCEPTION 'not_a_participant' USING ERRCODE = '42501';
  END IF;

  -- CHILD-SAFETY: do NOT let the OTHER party take over an existing block — that
  -- would make them the blocked_by and let them then unblock_conversation,
  -- resuming contact with a minor. A same-caller re-block is an idempotent no-op
  -- (and must not re-log the safeguarding event).
  IF v_c.blocked_by IS NOT NULL THEN
    IF v_c.blocked_by <> auth.uid() THEN
      RAISE EXCEPTION 'already_blocked' USING ERRCODE = 'P0001';
    END IF;
    RETURN;
  END IF;

  UPDATE public.conversations
     SET blocked_by = auth.uid(), blocked_at = now()
   WHERE id = _conversation_id;

  IF auth.uid() = v_c.student_id THEN
    INSERT INTO public.safeguarding_events (event_type, actor_id, conversation_id, detail)
    VALUES ('student_blocked_mentor', auth.uid(), _conversation_id, 'student blocked mentor');
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.block_conversation(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.block_conversation(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.block_conversation(uuid) TO authenticated;

-- Unblock: CHILD-SAFETY — only the user who blocked (or admin) may lift it.
CREATE OR REPLACE FUNCTION public.unblock_conversation(_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_blocked_by uuid; v_exists boolean;
BEGIN
  SELECT blocked_by, true INTO v_blocked_by, v_exists
    FROM public.conversations WHERE id = _conversation_id;
  IF NOT coalesce(v_exists, false) THEN
    RAISE EXCEPTION 'not_a_participant' USING ERRCODE = '42501';
  END IF;
  -- Only the blocker may unblock (admin override). A blocked party can NEVER
  -- unblock themselves — else a mentor a student blocked could resume contact.
  IF NOT (auth.uid() = v_blocked_by OR public.is_admin()) THEN
    RAISE EXCEPTION 'only_blocker_can_unblock' USING ERRCODE = '42501';
  END IF;

  UPDATE public.conversations
     SET blocked_by = NULL, blocked_at = NULL
   WHERE id = _conversation_id;
END;
$$;
REVOKE ALL ON FUNCTION public.unblock_conversation(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.unblock_conversation(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.unblock_conversation(uuid) TO authenticated;

-- Report a message (or the conversation/user if _message_id is NULL). Participant only.
CREATE OR REPLACE FUNCTION public.submit_report(_conversation_id uuid, _message_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_c public.conversations%ROWTYPE; v_reported_user uuid;
BEGIN
  SELECT * INTO v_c FROM public.conversations WHERE id = _conversation_id;
  IF NOT FOUND OR auth.uid() NOT IN (v_c.student_id, v_c.mentor_id) THEN
    RAISE EXCEPTION 'not_a_participant' USING ERRCODE = '42501';
  END IF;
  IF btrim(coalesce(_reason,'')) = '' THEN
    RAISE EXCEPTION 'empty_reason' USING ERRCODE = 'P0001';
  END IF;
  -- If a specific message is reported, it must belong to this conversation.
  IF _message_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.messages WHERE id = _message_id AND conversation_id = _conversation_id) THEN
      RAISE EXCEPTION 'message_not_in_conversation' USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.messages SET reported = true WHERE id = _message_id;
  END IF;

  v_reported_user := CASE WHEN auth.uid() = v_c.student_id THEN v_c.mentor_id ELSE v_c.student_id END;
  INSERT INTO public.message_reports
    (conversation_id, reporter_id, reported_message_id, reported_user_id, reason)
  VALUES (_conversation_id, auth.uid(), _message_id, v_reported_user, btrim(_reason));
END;
$$;
REVOKE ALL ON FUNCTION public.submit_report(uuid, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.submit_report(uuid, uuid, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.submit_report(uuid, uuid, text) TO authenticated;

-- Soft-delete: SENDER only. Hidden from both participants; retained for admin.
CREATE OR REPLACE FUNCTION public.soft_delete_message(_message_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_sender uuid;
BEGIN
  SELECT sender_id INTO v_sender FROM public.messages WHERE id = _message_id;
  IF v_sender IS NULL THEN
    RAISE EXCEPTION 'message_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF v_sender <> auth.uid() THEN
    RAISE EXCEPTION 'sender_only' USING ERRCODE = '42501';
  END IF;
  UPDATE public.messages SET soft_deleted = true WHERE id = _message_id;
END;
$$;
REVOKE ALL ON FUNCTION public.soft_delete_message(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.soft_delete_message(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.soft_delete_message(uuid) TO authenticated;

-- Mark the caller's unread new_message notifications for a conversation read.
CREATE OR REPLACE FUNCTION public.mark_conversation_read(_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.conversations
     WHERE id = _conversation_id AND auth.uid() IN (student_id, mentor_id)
  ) THEN
    RAISE EXCEPTION 'not_a_participant' USING ERRCODE = '42501';
  END IF;
  UPDATE public.notifications
     SET read_at = now()
   WHERE recipient_id = auth.uid() AND conversation_id = _conversation_id
     AND kind = 'new_message' AND read_at IS NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_conversation_read(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_conversation_read(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.mark_conversation_read(uuid) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 7. Realtime — deliver message inserts to subscribed participants (RLS-gated).
-- ════════════════════════════════════════════════════════════════════════════
-- CHILD-SAFETY (load-bearing — do NOT weaken these two lines): the messages
-- SELECT policy is re-evaluated per Realtime subscriber, and REPLICA IDENTITY
-- FULL is what makes that policy evaluable on UPDATE/DELETE payloads. Together
-- they ensure (a) non-participants receive NO message events and (b) a
-- soft-delete UPDATE is suppressed (NEW.soft_deleted=true fails the policy).
-- The client MUST subscribe on the RLS-authorized (authenticated/private)
-- Realtime channel — never an unauthenticated/public channel — or message
-- bodies (incl. soft-deleted) would broadcast to non-participants. A release
-- check verifies Realtime authorization mode against the live project.
ALTER TABLE public.messages REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
END $$;
