-- ════════════════════════════════════════════════════════════════════════════
-- A3 dev-seed (child-safety) — live-consent predicate on every access gate +
--   the mark_consent_revoked revocation cascade.
-- Pairs with 20260630000003_a3_live_consent_gates_revocation.sql.
--
-- WHAT THIS PROVES, server-side:
--   Before A1/A2/A3, video-join, document access/overview and mentor/student
--   identity unmasking all rode on the BOOKING relationship (status only), NOT
--   on CURRENT consent — so revoking a minor's parental consent left video, docs
--   and identity reachable, and mark_consent_revoked only NULL'd the flags. A3
--   re-keys every gate on public.student_has_consent(...) and turns
--   mark_consent_revoked into a documented cascade (freeze paid / cancel unpaid /
--   delete unpaid shares / record admin-review rows).
--
-- STRUCTURE (single BEGIN..ROLLBACK; ON_ERROR_STOP aborts on the first failure):
--   • HAPPY PATH (consent on file): every gate ALLOWS / unmasks  → proves the
--     guard does NOT break consented flows.
--   • SELECT mark_consent_revoked(<minor>)  (as the admin).
--   • POST-REVOCATION: every gate FAILS CLOSED + the cascade fired as specified.
--
-- Each assertion keys on its SPECIFIC condition and re-raises a WRONG-REASON
-- marker otherwise, so a green run can never be a false pass.
--
-- RED (pre-migration): authorize_video_join has no consent guard, so the FIRST
-- post-revocation assertion sees the video join still AUTHORIZED and aborts with
-- 'A3-FAIL: video join allowed after revocation' (no 'A3 PASS').
-- GREEN (migration applied): each gate prints an 'A3 ok:' NOTICE and the script
-- ends with the 'A3 PASS' row.
--
-- Run:
--   docker exec -i supabase_db_ncfhmbugjeuerchleegq psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/dev-seeds/a3-live-consent-revocation-verification.sql
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;
SET LOCAL client_min_messages = NOTICE;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- Identities (created via the real signup path so handle_new_user + the A1/A2
-- triggers fire exactly as for real users):
--   admin  : is_admin() matches this email; calls mark_consent_revoked.
--   mentor : approved, 18+ DOB (A2 trigger blocks approving an under-18/DOB-null
--            mentor); two-word name + a photo so the unmask is observable.
--   minor  : Grade 10 (gated) genuine minor, DISTINCT parent_email (A1 blocks
--            parent==self), and STARTS with parental_consent_at set.
DO $$
DECLARE
  v_admin  constant uuid := 'a3000000-0000-0000-0000-0000000ad001';
  v_mentor constant uuid := 'a3000000-0000-0000-0000-0000000be001';
  v_minor  constant uuid := 'a3000000-0000-0000-0000-0000000c0001';
  b_conf   constant uuid := 'a3000000-0000-0000-0000-000000b00001';  -- confirmed (PAID) booking
  b_pend   constant uuid := 'a3000000-0000-0000-0000-000000b00002';  -- pending_payment (UNPAID)
  d_doc    constant uuid := 'a3000000-0000-0000-0000-0000000d0001';  -- restricted document
  c_conv   constant uuid := 'a3000000-0000-0000-0000-0000000cf001';  -- conversation
  v_today  date := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date;
  v_now_hh   text := to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata', 'HH24:00');
  v_other_hh text := to_char((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata') + interval '3 hours', 'HH24:00');
BEGIN
  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    created_at, updated_at, instance_id
  ) VALUES
    (v_admin, 'authenticated', 'authenticated', 'divitfatehpuria7@gmail.com',
     crypt('pw', gen_salt('bf')), now(), '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','student','full_name','A3 Admin','phone','+91-0',
                        'school','S','grade','Grade 12','date_of_birth','1990-01-01'),
     '', '', '', '', now(), now(), '00000000-0000-0000-0000-000000000000'),
    (v_mentor, 'authenticated', 'authenticated', 'a3_mentor@uniplug-a3.local',
     crypt('pw', gen_salt('bf')), now(), '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','mentor','full_name','Mentor Lastname','university','Real U',
                        'course','CS','year','2nd Year','date_of_birth','2000-01-01'),
     '', '', '', '', now(), now(), '00000000-0000-0000-0000-000000000000'),
    (v_minor, 'authenticated', 'authenticated', 'a3_minor@uniplug-a3.local',
     crypt('pw', gen_salt('bf')), now(), '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','student','full_name','Minor Lastname','phone','+91-1',
                        'school','S','grade','Grade 10','date_of_birth','2012-01-01',
                        'parent_email','a3_parent@uniplug-a3.local'),
     '', '', '', '', now(), now(), '00000000-0000-0000-0000-000000000000');

  -- Approve the mentor (A2 trigger allows: DOB indicates 18+) + give a photo.
  UPDATE public.mentors
     SET status = 'approved', price_inr = 1000, photo_url = 'https://x.example/photo.jpg'
   WHERE id = v_mentor;

  -- Minor STARTS consented (parental_consent_at set) so the happy path works
  -- pre-revocation. service_role bypasses the consent column-lock.
  UPDATE public.students SET parental_consent_at = now() WHERE id = v_minor;

  -- Bookings inserted directly as service_role (the JOIN/access gates are under
  -- test, not the booking path). Confirmed = PAID; pending_payment = UNPAID.
  -- Confirmed is today at the current IST hour so it is inside the join window.
  INSERT INTO public.bookings (id, mentor_id, student_id, date, time_slot, duration, price, status) VALUES
    (b_conf, v_mentor, v_minor, v_today, v_now_hh,   60, 1000, 'confirmed'),
    (b_pend, v_mentor, v_minor, v_today, v_other_hh, 60, 1000, 'pending_payment');

  -- A restricted document + an explicit share to the mentor (so the cascade's
  -- share-deletion is observable, and the non-owner access gate is exercised).
  INSERT INTO public.student_documents (id, student_id, file_name, storage_path, size_bytes, visibility)
  VALUES (d_doc, v_minor, 'private.pdf', v_minor::text || '/private.pdf', 2000, 'restricted');
  INSERT INTO public.document_shares (document_id, mentor_id, created_by)
  VALUES (d_doc, v_mentor, v_minor);

  -- A conversation between the two parties (for the identity re-mask check).
  INSERT INTO public.conversations (id, student_id, mentor_id) VALUES (c_conv, v_minor, v_mentor);

  -- A persisted video room for the confirmed booking (mirrors the video setup).
  INSERT INTO public.video_rooms (booking_id, daily_room_name, daily_room_url, created_by)
  VALUES (b_conf, 'uniplug-a3-room', 'https://x.daily.co/uniplug-a3-room', v_mentor);
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- HAPPY PATH — consent ON FILE: every gate ALLOWS / unmasks.
-- ════════════════════════════════════════════════════════════════════════════

-- H1: consented minor CAN join the confirmed, in-window call.
DO $$
DECLARE v_role text;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"a3000000-0000-0000-0000-0000000c0001","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT av.role INTO v_role
    FROM public.authorize_video_join('a3000000-0000-0000-0000-000000b00001'::uuid) av;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  IF v_role IS DISTINCT FROM 'student' THEN
    RAISE EXCEPTION 'A3-FAIL: consented minor could not join (role=%)', coalesce(v_role,'NULL');
  END IF;
  RAISE NOTICE 'A3 ok: consented minor video join allowed (role=%).', v_role;
END $$;

-- H2: booked mentor CAN access the shared document (consent on file).
DO $$
DECLARE v_ok boolean;
BEGIN
  v_ok := public.can_access_document('a3000000-0000-0000-0000-0000000d0001'::uuid,
                                     'a3000000-0000-0000-0000-0000000be001'::uuid);
  IF NOT v_ok THEN RAISE EXCEPTION 'A3-FAIL: booked mentor denied shared doc while consented'; END IF;
  RAISE NOTICE 'A3 ok: booked mentor can access shared doc while consented.';
END $$;

-- H3: booked mentor overview returns the student (consent on file).
DO $$
DECLARE v_cnt int;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"a3000000-0000-0000-0000-0000000be001","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO v_cnt FROM public.get_student_overview_for_mentor('a3000000-0000-0000-0000-0000000c0001'::uuid);
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'A3-FAIL: overview returned % rows while consented (expect 1)', v_cnt; END IF;
  RAISE NOTICE 'A3 ok: mentor overview returns the consented student (1 row).';
END $$;

-- H4: mentor identity is UNMASKED to the consented booked student.
DO $$
DECLARE v_name text; v_photo text;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"a3000000-0000-0000-0000-0000000c0001","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT full_name, photo_url INTO v_name, v_photo
    FROM public.get_mentor_public_profile('a3000000-0000-0000-0000-0000000be001'::uuid);
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  IF v_name IS DISTINCT FROM 'Mentor Lastname' OR v_photo IS NULL THEN
    RAISE EXCEPTION 'A3-FAIL: mentor identity not unmasked while consented (name=%, photo=%)',
      coalesce(v_name,'NULL'), coalesce(v_photo,'NULL');
  END IF;
  RAISE NOTICE 'A3 ok: mentor full name + photo unmasked to consented student.';
END $$;

-- H5: mentor identity is UNMASKED in the conversation header (consented).
DO $$
DECLARE v_name text; v_photo text;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"a3000000-0000-0000-0000-0000000c0001","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT peer_name, peer_photo_url INTO v_name, v_photo
    FROM public.get_conversation('a3000000-0000-0000-0000-0000000cf001'::uuid);
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  IF v_name IS DISTINCT FROM 'Mentor Lastname' OR v_photo IS NULL THEN
    RAISE EXCEPTION 'A3-FAIL: conversation peer not unmasked while consented (name=%, photo=%)',
      coalesce(v_name,'NULL'), coalesce(v_photo,'NULL');
  END IF;
  RAISE NOTICE 'A3 ok: conversation peer (mentor) unmasked to consented student.';
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- REVOKE — admin pulls parental consent (triggers the cascade).
-- ════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"a3000000-0000-0000-0000-0000000ad001","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.mark_consent_revoked('a3000000-0000-0000-0000-0000000c0001'::uuid);
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  RAISE NOTICE 'A3 ok: admin mark_consent_revoked(minor) executed.';
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- POST-REVOCATION — every gate FAILS CLOSED + the cascade fired.
-- ════════════════════════════════════════════════════════════════════════════

-- (a) video join now RAISES consent_revoked.
DO $$
DECLARE v_role text;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"a3000000-0000-0000-0000-0000000c0001","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    SELECT av.role INTO v_role
      FROM public.authorize_video_join('a3000000-0000-0000-0000-000000b00001'::uuid) av;
    EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
    RAISE EXCEPTION 'A3-FAIL: video join allowed after revocation';
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE 'A3-FAIL%' THEN RAISE; END IF;
    EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
    IF SQLERRM NOT LIKE '%consent_revoked%' THEN
      RAISE EXCEPTION 'A3-FAIL: video join blocked for the WRONG reason: %', SQLERRM;
    END IF;
    RAISE NOTICE 'A3 ok: video join blocked after revocation (%).', SQLERRM;
  END;
END $$;

-- (b) document access now false (both the explicit-viewer predicate and the
--     JWT-derived download gate).
DO $$
DECLARE v_direct boolean; v_download boolean;
BEGIN
  v_direct := public.can_access_document('a3000000-0000-0000-0000-0000000d0001'::uuid,
                                         'a3000000-0000-0000-0000-0000000be001'::uuid);
  PERFORM set_config('request.jwt.claims','{"sub":"a3000000-0000-0000-0000-0000000be001","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_download := public.can_mentor_access_document('a3000000-0000-0000-0000-0000000d0001'::uuid);
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  IF v_direct OR v_download THEN
    RAISE EXCEPTION 'A3-FAIL: doc still accessible after revocation (direct=%, download=%)', v_direct, v_download;
  END IF;
  RAISE NOTICE 'A3 ok: document access denied after revocation (direct + download gate).';
END $$;

-- (c) overview now returns 0 rows.
DO $$
DECLARE v_cnt int;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"a3000000-0000-0000-0000-0000000be001","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO v_cnt FROM public.get_student_overview_for_mentor('a3000000-0000-0000-0000-0000000c0001'::uuid);
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  IF v_cnt <> 0 THEN RAISE EXCEPTION 'A3-FAIL: overview returned % rows after revocation (expect 0)', v_cnt; END IF;
  RAISE NOTICE 'A3 ok: mentor overview returns 0 rows after revocation.';
END $$;

-- (d) mentor identity RE-MASKS (profile + conversation header): first-name only,
--     photo NULL.
DO $$
DECLARE v_pname text; v_pphoto text; v_cname text; v_cphoto text;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"a3000000-0000-0000-0000-0000000c0001","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT full_name, photo_url INTO v_pname, v_pphoto
    FROM public.get_mentor_public_profile('a3000000-0000-0000-0000-0000000be001'::uuid);
  SELECT peer_name, peer_photo_url INTO v_cname, v_cphoto
    FROM public.get_conversation('a3000000-0000-0000-0000-0000000cf001'::uuid);
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  IF v_pname IS DISTINCT FROM 'Mentor' OR v_pphoto IS NOT NULL THEN
    RAISE EXCEPTION 'A3-FAIL: profile identity not re-masked (name=%, photo=%)',
      coalesce(v_pname,'NULL'), coalesce(v_pphoto,'NULL');
  END IF;
  IF v_cname IS DISTINCT FROM 'Mentor' OR v_cphoto IS NOT NULL THEN
    RAISE EXCEPTION 'A3-FAIL: conversation identity not re-masked (name=%, photo=%)',
      coalesce(v_cname,'NULL'), coalesce(v_cphoto,'NULL');
  END IF;
  RAISE NOTICE 'A3 ok: mentor identity re-masked to first-name/no-photo after revocation.';
END $$;

-- (e) the UNPAID pending_payment booking is now cancelled.
DO $$
DECLARE v_status text;
BEGIN
  SELECT status INTO v_status FROM public.bookings WHERE id = 'a3000000-0000-0000-0000-000000b00002'::uuid;
  IF v_status IS DISTINCT FROM 'cancelled' THEN
    RAISE EXCEPTION 'A3-FAIL: unpaid booking not cancelled (status=%)', coalesce(v_status,'NULL');
  END IF;
  RAISE NOTICE 'A3 ok: unpaid pending_payment booking cancelled by cascade.';
END $$;

-- (f) the PAID confirmed booking is STILL confirmed (frozen, never cancelled)
--     AND a consent_revocation_events 'frozen_paid' row was recorded for it.
DO $$
DECLARE v_status text; v_events int;
BEGIN
  SELECT status INTO v_status FROM public.bookings WHERE id = 'a3000000-0000-0000-0000-000000b00001'::uuid;
  SELECT count(*) INTO v_events FROM public.consent_revocation_events
   WHERE student_id = 'a3000000-0000-0000-0000-0000000c0001'::uuid
     AND booking_id = 'a3000000-0000-0000-0000-000000b00001'::uuid
     AND action = 'frozen_paid';
  IF v_status IS DISTINCT FROM 'confirmed' THEN
    RAISE EXCEPTION 'A3-FAIL: PAID booking was mutated (status=% — refund implied!)', coalesce(v_status,'NULL');
  END IF;
  IF v_events <> 1 THEN
    RAISE EXCEPTION 'A3-FAIL: paid booking not recorded for admin review (frozen_paid rows=%)', v_events;
  END IF;
  RAISE NOTICE 'A3 ok: paid booking frozen in place (still confirmed) + recorded frozen_paid for admin review.';
END $$;

-- (g) the student's document_shares are gone (defense-in-depth deletion).
DO $$
DECLARE v_cnt int;
BEGIN
  SELECT count(*) INTO v_cnt
    FROM public.document_shares ds
    JOIN public.student_documents sd ON sd.id = ds.document_id
   WHERE sd.student_id = 'a3000000-0000-0000-0000-0000000c0001'::uuid;
  IF v_cnt <> 0 THEN RAISE EXCEPTION 'A3-FAIL: document_shares not revoked (rows=%)', v_cnt; END IF;
  RAISE NOTICE 'A3 ok: student document_shares deleted by cascade.';
END $$;

SELECT 'A3 PASS' AS result;
ROLLBACK;
