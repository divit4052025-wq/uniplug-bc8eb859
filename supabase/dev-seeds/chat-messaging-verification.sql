-- ════════════════════════════════════════════════════════════════════════════
-- V1 chat dev-seed: send_message gate + RLS isolation + block/report/soft-delete
-- ════════════════════════════════════════════════════════════════════════════
-- Runnable reject + happy-path tests for migration 20260530000004_chat_messaging.
-- Everything ROLLBACKs at the end — DB state unchanged.
--
-- PASS = each row 'PASS'. A 'FAIL' means a real safeguarding control is broken
-- (an adult could cold-DM a minor, a blocked party could resume contact, a
-- non-participant could read a minor's thread, the cap could be bypassed, a
-- grooming-signal log could be lost, etc.).
--
-- COVERAGE (maps to plan §4 a–o):
--   C.1 too_long · C.2–4 pii email/phone/url · C.5 pii log persists + no msg (o)
--   C.6 16th pre-booking capped (c) · C.7 mentor reply uncapped (c)
--   C.8 cap lifts on confirmed (c) · C.9 cap lifts on completed (c)
--   C.10 soft-delete does NOT reset cap (n) · C.11 mentor_cannot_initiate (i)
--   C.12 cancelled-only still mentor_cannot_initiate (j) · C.13 block both ways (g)
--   C.14 blocked party CANNOT unblock; blocker can (k) · C.15 non-participant
--   direct RLS read → 0 rows (d) · C.16 authed INSERT/UPDATE/DELETE denied (e)
--   C.17 soft-deleted hidden from participant, visible to service_role (f)
--   C.18 recipient cannot soft_delete (sender-only) (m) · C.19 report row +
--   immutable (h) · C.20 non-participant cannot block/report foreign pair (l)
--   C.21 block-takeover prevented (blocked party can't re-block→unblock — HIGH)
--   C.22 student → pending/unvetted mentor → mentor_not_available (approval gate)
--   C.23 wrong-role recipient → invalid_recipient · C.24 student initiates new
--   conversation with an approved mentor → ok (happy path)
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

DO $$
DECLARE
  m   constant uuid := '11111111-1111-1111-1111-1111110d0001';  -- mentor (APPROVED below)
  m_p constant uuid := '11111111-1111-1111-1111-1111110d0002';  -- mentor, PENDING (never approved)
  s_a constant uuid := '22222222-2222-2222-2222-2222220d0001';  -- student, pre-booking w/ m
  s_b constant uuid := '22222222-2222-2222-2222-2222220d0002';  -- student, CONFIRMED booking w/ m
  s_c constant uuid := '22222222-2222-2222-2222-2222220d0003';  -- student, COMPLETED booking w/ m
  s_d constant uuid := '22222222-2222-2222-2222-2222220d0004';  -- student, CANCELLED-only booking w/ m
  s_e constant uuid := '22222222-2222-2222-2222-2222220d0005';  -- student, no booking / no convo
  s_x constant uuid := '22222222-2222-2222-2222-2222220d0006';  -- student, NON-participant
  convo_a constant uuid := '44444444-4444-4444-4444-4444440d00a1';
  convo_b constant uuid := '44444444-4444-4444-4444-4444440d00b1';
  convo_c constant uuid := '44444444-4444-4444-4444-4444440d00c1';
  msg_a1  constant uuid := '55555555-5555-5555-5555-5555550d0a01';
BEGIN
  -- Users (handle_new_user cascades students/mentors). Students are ADULTS
  -- (DOB 2000, Grade 12) so consent never blocks the booking fixtures.
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    created_at, updated_at
  )
  SELECT u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         u.email, crypt('pw', gen_salt('bf')), now(), '{"provider":"email"}'::jsonb, u.meta,
         '', '', '', '', now(), now()
  FROM (VALUES
    (m,   'm@chat.local',   jsonb_build_object('role','mentor','full_name','Chat M','university','T','course','T','year','2nd Year','date_of_birth','2000-01-01')),
    (m_p, 'm_p@chat.local', jsonb_build_object('role','mentor','full_name','Pending M','university','T','course','T','year','2nd Year','date_of_birth','2000-01-01')),
    (s_a, 's_a@chat.local', jsonb_build_object('role','student','full_name','Stu A','phone','+91-0','school','T','grade','Grade 12','date_of_birth','2000-01-01')),
    (s_b, 's_b@chat.local', jsonb_build_object('role','student','full_name','Stu B','phone','+91-0','school','T','grade','Grade 12','date_of_birth','2000-01-01')),
    (s_c, 's_c@chat.local', jsonb_build_object('role','student','full_name','Stu C','phone','+91-0','school','T','grade','Grade 12','date_of_birth','2000-01-01')),
    (s_d, 's_d@chat.local', jsonb_build_object('role','student','full_name','Stu D','phone','+91-0','school','T','grade','Grade 12','date_of_birth','2000-01-01')),
    (s_e, 's_e@chat.local', jsonb_build_object('role','student','full_name','Stu E','phone','+91-0','school','T','grade','Grade 12','date_of_birth','2000-01-01')),
    (s_x, 's_x@chat.local', jsonb_build_object('role','student','full_name','Stu X','phone','+91-0','school','T','grade','Grade 12','date_of_birth','2000-01-01'))
  ) AS u(id, email, meta);

  -- Approve mentor m (chat requires an APPROVED mentor); m_p stays 'pending'.
  -- service_role context bypasses the prevent_mentor_self_approval lock.
  UPDATE public.mentors SET status = 'approved'::public.mentor_status, verified_at = now() WHERE id = m;

  -- Bookings (service_role bypasses consent gate; status is all that matters here).
  INSERT INTO public.bookings (mentor_id, student_id, date, time_slot, duration, price, status) VALUES
    (m, s_b, (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date, '10:00', 60, 0, 'confirmed'),
    (m, s_c, ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date - 3), '10:00', 60, 0, 'completed'),
    (m, s_d, (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date, '11:00', 60, 0, 'cancelled');

  -- Conversations for s_a/s_b/s_c with m.
  INSERT INTO public.conversations (id, student_id, mentor_id, last_message_at) VALUES
    (convo_a, s_a, m, now()), (convo_b, s_b, m, now()), (convo_c, s_c, m, now());

  -- 15 student messages in each conversation (1 fixed-id in convo_a for delete tests).
  INSERT INTO public.messages (id, conversation_id, sender_id, recipient_id, body)
  VALUES (msg_a1, convo_a, s_a, m, 'fixture 1');
  INSERT INTO public.messages (conversation_id, sender_id, recipient_id, body)
  SELECT convo_a, s_a, m, 'fixture '||g FROM generate_series(2,15) g;
  INSERT INTO public.messages (conversation_id, sender_id, recipient_id, body)
  SELECT convo_b, s_b, m, 'fixture '||g FROM generate_series(1,15) g;
  INSERT INTO public.messages (conversation_id, sender_id, recipient_id, body)
  SELECT convo_c, s_c, m, 'fixture '||g FROM generate_series(1,15) g;
END $$;

CREATE TEMP TABLE _chat_results (test_id text PRIMARY KEY, status text NOT NULL, detail text NOT NULL);

-- helpers: claims setters used throughout
-- (inlined per-block to keep each test self-contained)

-- ─── C.1 >500 chars → too_long ──────────────────────────────────────────────
DO $$
DECLARE v_pass boolean := false; v_msg text := '';
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-2222220d0001","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.send_message('11111111-1111-1111-1111-1111110d0001'::uuid, repeat('x', 501));
    v_msg := 'over-length ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE '%too_long%' THEN v_pass := true; v_msg := 'rejected: '||SQLERRM;
    ELSE v_msg := 'wrong reject: '||SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _chat_results VALUES ('C.1_too_long', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── C.2/3/4 PII (email / phone / url) → pii_blocked (RETURNED, not raised) ──
DO $$
DECLARE v_pass boolean := true; v_msg text := ''; r jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-2222220d0001","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  r := public.send_message('11111111-1111-1111-1111-1111110d0001'::uuid, 'reach me at stu@gmail.com please');
  IF (r->>'reason') IS DISTINCT FROM 'pii_blocked' THEN v_pass := false; v_msg := v_msg||'email NOT blocked('||coalesce(r::text,'null')||') '; END IF;
  r := public.send_message('11111111-1111-1111-1111-1111110d0001'::uuid, 'call me 9876543210 ok');
  IF (r->>'reason') IS DISTINCT FROM 'pii_blocked' THEN v_pass := false; v_msg := v_msg||'phone NOT blocked('||coalesce(r::text,'null')||') '; END IF;
  r := public.send_message('11111111-1111-1111-1111-1111110d0001'::uuid, 'see https://t.me/mychan');
  IF (r->>'reason') IS DISTINCT FROM 'pii_blocked' THEN v_pass := false; v_msg := v_msg||'url NOT blocked('||coalesce(r::text,'null')||') '; END IF;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  IF v_pass THEN v_msg := 'email/phone/url all pii_blocked'; END IF;
  INSERT INTO _chat_results VALUES ('C.2-4_pii_blocked', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── C.5 PII log PERSISTED + NO conversation/message created (o) ────────────
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_events int; v_msgs int;
BEGIN
  SELECT count(*) INTO v_events FROM public.safeguarding_events
   WHERE actor_id = '22222222-2222-2222-2222-2222220d0001'::uuid AND event_type = 'pii_blocked';
  SELECT count(*) INTO v_msgs FROM public.messages
   WHERE conversation_id = '44444444-4444-4444-4444-4444440d00a1'::uuid AND sender_id = '22222222-2222-2222-2222-2222220d0001'::uuid;
  IF v_events >= 3 AND v_msgs = 15 THEN
    v_pass := true; v_msg := 'safeguarding_events='||v_events||' persisted; s_a messages still '||v_msgs||' (no msg created by PII attempts)';
  ELSE
    v_msg := 'events='||v_events||' (want>=3), s_a msgs='||v_msgs||' (want 15)';
  END IF;
  INSERT INTO _chat_results VALUES ('C.5_pii_log_persists_no_msg', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── C.6 student's 16th pre-booking message → pre_booking_cap (c) ────────────
DO $$
DECLARE v_pass boolean := false; v_msg text := '';
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-2222220d0001","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.send_message('11111111-1111-1111-1111-1111110d0001'::uuid, 'message sixteen');
    v_msg := '16th pre-booking ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE '%pre_booking_cap%' THEN v_pass := true; v_msg := 'rejected: '||SQLERRM;
    ELSE v_msg := 'wrong reject: '||SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _chat_results VALUES ('C.6_pre_booking_cap', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── C.7 mentor reply is NOT capped (existing convo) (c) ────────────────────
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; r jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-1111110d0001","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    r := public.send_message('22222222-2222-2222-2222-2222220d0001'::uuid, 'mentor reply, uncapped');
    IF (r->>'ok')::boolean THEN v_pass := true; v_msg := 'mentor reply accepted (uncapped)';
    ELSE v_msg := 'mentor reply rejected: '||coalesce(r::text,'null'); END IF;
  EXCEPTION WHEN OTHERS THEN v_msg := 'mentor reply errored: '||SQLERRM; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _chat_results VALUES ('C.7_mentor_reply_uncapped', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── C.8 cap lifts once a CONFIRMED booking exists (c) ──────────────────────
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; r jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-2222220d0002","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    r := public.send_message('11111111-1111-1111-1111-1111110d0001'::uuid, 'post-cap msg (confirmed booking)');
    IF (r->>'ok')::boolean THEN v_pass := true; v_msg := 'accepted past 15 (confirmed booking lifts cap)';
    ELSE v_msg := 'rejected despite confirmed booking: '||coalesce(r::text,'null'); END IF;
  EXCEPTION WHEN OTHERS THEN v_msg := 'errored: '||SQLERRM; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _chat_results VALUES ('C.8_cap_lifts_confirmed', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── C.9 cap lifts once a COMPLETED booking exists (c) ──────────────────────
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; r jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-2222220d0003","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    r := public.send_message('11111111-1111-1111-1111-1111110d0001'::uuid, 'post-cap msg (completed booking)');
    IF (r->>'ok')::boolean THEN v_pass := true; v_msg := 'accepted past 15 (completed booking lifts cap)';
    ELSE v_msg := 'rejected despite completed booking: '||coalesce(r::text,'null'); END IF;
  EXCEPTION WHEN OTHERS THEN v_msg := 'errored: '||SQLERRM; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _chat_results VALUES ('C.9_cap_lifts_completed', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── C.10 soft-delete does NOT reset the pre-booking cap (n) ─────────────────
DO $$
DECLARE v_pass boolean := false; v_msg text := '';
BEGIN
  -- soft-delete one of s_a's messages (as s_a, the sender)
  PERFORM set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-2222220d0001","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.soft_delete_message('55555555-5555-5555-5555-5555550d0a01'::uuid);
  BEGIN
    PERFORM public.send_message('11111111-1111-1111-1111-1111110d0001'::uuid, 'still capped after delete');
    v_msg := 'send ACCEPTED after soft-delete (cap reset!)';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE '%pre_booking_cap%' THEN v_pass := true; v_msg := 'still capped: '||SQLERRM;
    ELSE v_msg := 'wrong reject: '||SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _chat_results VALUES ('C.10_softdelete_no_cap_reset', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── C.11 mentor_cannot_initiate (no convo, no booking) (i) ─────────────────
DO $$
DECLARE v_pass boolean := false; v_msg text := '';
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-1111110d0001","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.send_message('22222222-2222-2222-2222-2222220d0005'::uuid, 'cold DM from mentor');
    v_msg := 'mentor COLD-INITIATE ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE '%mentor_cannot_initiate%' THEN v_pass := true; v_msg := 'rejected: '||SQLERRM;
    ELSE v_msg := 'wrong reject: '||SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _chat_results VALUES ('C.11_mentor_cannot_initiate', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── C.12 cancelled-only booking still → mentor_cannot_initiate (j) ─────────
DO $$
DECLARE v_pass boolean := false; v_msg text := '';
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-1111110d0001","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.send_message('22222222-2222-2222-2222-2222220d0004'::uuid, 'cold DM (only cancelled booking)');
    v_msg := 'cancelled-booking cold-initiate ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE '%mentor_cannot_initiate%' THEN v_pass := true; v_msg := 'rejected (cancelled ≠ relationship): '||SQLERRM;
    ELSE v_msg := 'wrong reject: '||SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _chat_results VALUES ('C.12_cancelled_not_relationship', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── C.13 block → both directions rejected (g) ──────────────────────────────
DO $$
DECLARE v_pass boolean := true; v_msg text := '';
BEGIN
  -- s_a (student) blocks the conversation
  PERFORM set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-2222220d0001","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.block_conversation('44444444-4444-4444-4444-4444440d00a1'::uuid);
  BEGIN
    PERFORM public.send_message('11111111-1111-1111-1111-1111110d0001'::uuid, 'student after block');
    v_pass := false; v_msg := v_msg||'student->mentor NOT blocked ';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT ILIKE '%blocked%' THEN v_pass:=false; v_msg:=v_msg||'student wrong reject('||SQLERRM||') '; END IF; END;
  EXECUTE 'RESET ROLE';
  -- mentor direction
  PERFORM set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-1111110d0001","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.send_message('22222222-2222-2222-2222-2222220d0001'::uuid, 'mentor after block');
    v_pass := false; v_msg := v_msg||'mentor->student NOT blocked ';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT ILIKE '%blocked%' THEN v_pass:=false; v_msg:=v_msg||'mentor wrong reject('||SQLERRM||') '; END IF; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  IF v_pass THEN v_msg := 'both directions blocked'; END IF;
  INSERT INTO _chat_results VALUES ('C.13_block_both_directions', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── C.14 blocked party CANNOT unblock; only the blocker can (k) ────────────
DO $$
DECLARE v_pass boolean := true; v_msg text := '';
BEGIN
  -- mentor (the BLOCKED party) tries to unblock → must fail
  PERFORM set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-1111110d0001","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.unblock_conversation('44444444-4444-4444-4444-4444440d00a1'::uuid);
    v_pass := false; v_msg := v_msg||'BLOCKED PARTY UNBLOCKED (child-safety hole!) ';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT ILIKE '%only_blocker_can_unblock%' THEN v_pass:=false; v_msg:=v_msg||'wrong reject('||SQLERRM||') '; END IF; END;
  EXECUTE 'RESET ROLE';
  -- s_a (the blocker) unblocks → must succeed
  PERFORM set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-2222220d0001","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.unblock_conversation('44444444-4444-4444-4444-4444440d00a1'::uuid);
  EXCEPTION WHEN OTHERS THEN v_pass := false; v_msg := v_msg||'blocker could NOT unblock('||SQLERRM||') '; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  IF v_pass THEN v_msg := 'blocked party denied; blocker unblocked'; END IF;
  INSERT INTO _chat_results VALUES ('C.14_only_blocker_unblocks', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── C.15 non-participant DIRECT RLS read → 0 rows (d) ──────────────────────
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_n int;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-2222220d0006","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO v_n FROM public.messages WHERE conversation_id = '44444444-4444-4444-4444-4444440d00a1'::uuid;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  IF v_n = 0 THEN v_pass := true; v_msg := 'non-participant sees 0 rows of foreign thread';
  ELSE v_msg := 'LEAK: non-participant saw '||v_n||' messages'; END IF;
  INSERT INTO _chat_results VALUES ('C.15_nonparticipant_read_isolated', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── C.16 authenticated direct INSERT/UPDATE/DELETE on messages → denied (e) ─
DO $$
DECLARE v_pass boolean := true; v_msg text := '';
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-2222220d0001","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    INSERT INTO public.messages (conversation_id, sender_id, recipient_id, body)
    VALUES ('44444444-4444-4444-4444-4444440d00a1'::uuid, '22222222-2222-2222-2222-2222220d0001'::uuid, '11111111-1111-1111-1111-1111110d0001'::uuid, 'direct insert');
    v_pass := false; v_msg := v_msg||'INSERT allowed ';
  EXCEPTION WHEN OTHERS THEN IF SQLSTATE <> '42501' THEN v_pass:=false; v_msg:=v_msg||'INSERT wrong['||SQLSTATE||'] '; END IF; END;
  BEGIN
    UPDATE public.messages SET body = 'tamper' WHERE conversation_id = '44444444-4444-4444-4444-4444440d00a1'::uuid;
    v_pass := false; v_msg := v_msg||'UPDATE allowed ';
  EXCEPTION WHEN OTHERS THEN IF SQLSTATE <> '42501' THEN v_pass:=false; v_msg:=v_msg||'UPDATE wrong['||SQLSTATE||'] '; END IF; END;
  BEGIN
    DELETE FROM public.messages WHERE conversation_id = '44444444-4444-4444-4444-4444440d00a1'::uuid;
    v_pass := false; v_msg := v_msg||'DELETE allowed ';
  EXCEPTION WHEN OTHERS THEN IF SQLSTATE <> '42501' THEN v_pass:=false; v_msg:=v_msg||'DELETE wrong['||SQLSTATE||'] '; END IF; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  IF v_pass THEN v_msg := 'direct INSERT/UPDATE/DELETE all denied (42501)'; END IF;
  INSERT INTO _chat_results VALUES ('C.16_direct_writes_denied', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── C.17 soft-deleted hidden from participant, visible to service_role (f) ──
DO $$
DECLARE v_pass boolean := true; v_msg text := ''; v_participant int; v_service int;
BEGIN
  -- msg_a1 was soft-deleted in C.10. As participant (s_a): hidden.
  PERFORM set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-2222220d0001","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO v_participant FROM public.messages WHERE id = '55555555-5555-5555-5555-5555550d0a01'::uuid;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  -- As service_role (RLS-bypass / superuser): visible.
  SELECT count(*) INTO v_service FROM public.messages WHERE id = '55555555-5555-5555-5555-5555550d0a01'::uuid;
  IF v_participant = 0 AND v_service = 1 THEN v_pass := true; v_msg := 'hidden from participant, visible to service_role';
  ELSE v_pass := false; v_msg := 'participant_sees='||v_participant||' service_sees='||v_service; END IF;
  INSERT INTO _chat_results VALUES ('C.17_softdelete_visibility', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── C.18 recipient cannot soft_delete sender's message (sender-only) (m) ───
DO $$
DECLARE v_pass boolean := false; v_msg text := '';
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-1111110d0001","role":"authenticated"}', true);  -- mentor = recipient
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.soft_delete_message('55555555-5555-5555-5555-5555550d0a01'::uuid);
    v_msg := 'recipient soft-deleted sender''s message!';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE '%sender_only%' THEN v_pass := true; v_msg := 'rejected: '||SQLERRM;
    ELSE v_msg := 'wrong reject: '||SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _chat_results VALUES ('C.18_softdelete_sender_only', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── C.19 report writes a row + immutable (h) ───────────────────────────────
DO $$
DECLARE v_pass boolean := true; v_msg text := ''; v_n int;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-2222220d0001","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.submit_report('44444444-4444-4444-4444-4444440d00a1'::uuid, NULL, 'felt unsafe');
  -- authenticated cannot UPDATE or DELETE the report (REVOKE ALL)
  BEGIN
    UPDATE public.message_reports SET reason = 'tamper' WHERE conversation_id = '44444444-4444-4444-4444-4444440d00a1'::uuid;
    v_pass := false; v_msg := v_msg||'UPDATE allowed ';
  EXCEPTION WHEN OTHERS THEN IF SQLSTATE <> '42501' THEN v_pass:=false; v_msg:=v_msg||'UPDATE wrong['||SQLSTATE||'] '; END IF; END;
  BEGIN
    DELETE FROM public.message_reports WHERE conversation_id = '44444444-4444-4444-4444-4444440d00a1'::uuid;
    v_pass := false; v_msg := v_msg||'DELETE allowed ';
  EXCEPTION WHEN OTHERS THEN IF SQLSTATE <> '42501' THEN v_pass:=false; v_msg:=v_msg||'DELETE wrong['||SQLSTATE||'] '; END IF; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  SELECT count(*) INTO v_n FROM public.message_reports WHERE conversation_id = '44444444-4444-4444-4444-4444440d00a1'::uuid;
  IF v_n < 1 THEN v_pass := false; v_msg := v_msg||'no report row written '; END IF;
  IF v_pass THEN v_msg := 'report row written + immutable (UPDATE/DELETE denied)'; END IF;
  INSERT INTO _chat_results VALUES ('C.19_report_written_immutable', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── C.20 non-participant cannot block/report a foreign pair (l) ────────────
DO $$
DECLARE v_pass boolean := true; v_msg text := '';
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-2222220d0006","role":"authenticated"}', true);  -- s_x
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.block_conversation('44444444-4444-4444-4444-4444440d00a1'::uuid);
    v_pass := false; v_msg := v_msg||'non-participant BLOCKED foreign pair ';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT ILIKE '%not_a_participant%' THEN v_pass:=false; v_msg:=v_msg||'block wrong('||SQLERRM||') '; END IF; END;
  BEGIN
    PERFORM public.submit_report('44444444-4444-4444-4444-4444440d00a1'::uuid, NULL, 'meddling');
    v_pass := false; v_msg := v_msg||'non-participant REPORTED foreign pair ';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT ILIKE '%not_a_participant%' THEN v_pass:=false; v_msg:=v_msg||'report wrong('||SQLERRM||') '; END IF; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  IF v_pass THEN v_msg := 'non-participant denied block + report'; END IF;
  INSERT INTO _chat_results VALUES ('C.20_nonparticipant_no_block_report', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── C.21 block takeover prevented: blocked party can't re-block then unblock (HIGH) ─
DO $$
DECLARE v_pass boolean := true; v_msg text := ''; v_blocked_by uuid;
BEGIN
  -- s_a (student) blocks convo_a (left UNBLOCKED after C.14).
  PERFORM set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-2222220d0001","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.block_conversation('44444444-4444-4444-4444-4444440d00a1'::uuid);
  EXECUTE 'RESET ROLE';
  -- mentor (the BLOCKED party) tries to take over the block, then unblock.
  PERFORM set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-1111110d0001","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.block_conversation('44444444-4444-4444-4444-4444440d00a1'::uuid);
    v_pass := false; v_msg := v_msg||'blocked party TOOK OVER block ';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT ILIKE '%already_blocked%' THEN v_pass:=false; v_msg:=v_msg||'block wrong('||SQLERRM||') '; END IF; END;
  BEGIN
    PERFORM public.unblock_conversation('44444444-4444-4444-4444-4444440d00a1'::uuid);
    v_pass := false; v_msg := v_msg||'blocked party UNBLOCKED ';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT ILIKE '%only_blocker_can_unblock%' THEN v_pass:=false; v_msg:=v_msg||'unblock wrong('||SQLERRM||') '; END IF; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  SELECT blocked_by INTO v_blocked_by FROM public.conversations WHERE id = '44444444-4444-4444-4444-4444440d00a1'::uuid;
  IF v_blocked_by IS DISTINCT FROM '22222222-2222-2222-2222-2222220d0001'::uuid THEN
    v_pass := false; v_msg := v_msg||'blocked_by changed to '||coalesce(v_blocked_by::text,'null');
  END IF;
  IF v_pass THEN v_msg := 'takeover refused; still blocked_by student'; END IF;
  INSERT INTO _chat_results VALUES ('C.21_block_takeover_prevented', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── C.22 student → PENDING (unvetted) mentor → mentor_not_available ─────────
DO $$
DECLARE v_pass boolean := false; v_msg text := '';
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-2222220d0001","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.send_message('11111111-1111-1111-1111-1111110d0002'::uuid, 'hello pending mentor');
    v_msg := 'message to PENDING mentor ACCEPTED (unvetted adult reachable!)';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE '%mentor_not_available%' THEN v_pass := true; v_msg := 'rejected: '||SQLERRM;
    ELSE v_msg := 'wrong reject: '||SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _chat_results VALUES ('C.22_pending_mentor_blocked', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── C.23 wrong-role recipient (student → student) → invalid_recipient ──────
DO $$
DECLARE v_pass boolean := false; v_msg text := '';
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-2222220d0001","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.send_message('22222222-2222-2222-2222-2222220d0002'::uuid, 'hi fellow student');
    v_msg := 'student→student ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE '%invalid_recipient%' THEN v_pass := true; v_msg := 'rejected: '||SQLERRM;
    ELSE v_msg := 'wrong reject: '||SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _chat_results VALUES ('C.23_invalid_recipient', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── C.24 student initiates a NEW conversation with an APPROVED mentor (happy) ─
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; r jsonb; v_cnt int;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-2222220d0005","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    r := public.send_message('11111111-1111-1111-1111-1111110d0001'::uuid, 'hello, I would like to learn about your subject');
  EXCEPTION WHEN OTHERS THEN r := jsonb_build_object('ok', false, 'err', SQLERRM); END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  SELECT count(*) INTO v_cnt FROM public.conversations
   WHERE student_id = '22222222-2222-2222-2222-2222220d0005'::uuid AND mentor_id = '11111111-1111-1111-1111-1111110d0001'::uuid;
  IF (r->>'ok')::boolean IS TRUE AND v_cnt = 1 THEN v_pass := true; v_msg := 'student initiated; fresh conversation created';
  ELSE v_msg := 'result='||coalesce(r::text,'null')||' convo_count='||v_cnt; END IF;
  INSERT INTO _chat_results VALUES ('C.24_student_initiates_happy', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

SELECT test_id, status, detail FROM _chat_results ORDER BY test_id;

ROLLBACK;
