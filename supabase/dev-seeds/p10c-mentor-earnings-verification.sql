-- ════════════════════════════════════════════════════════════════════════════
-- P10c dev-seed: get_mentor_earnings() — authoritative, scoped, ledger-sourced.
-- ════════════════════════════════════════════════════════════════════════════
--
-- WHAT THIS FILE IS
--   Tests for migration 20260611000002_p10c_mentor_earnings.sql. Everything
--   ROLLBACKs — DB state unchanged.
--
-- PASS CRITERIA — every row 'PASS'. A 'FAIL' means the mentor money view is
--   wrong (gross instead of 80% share / bucket math off), leaks another mentor's
--   money, or is callable unauthenticated.
--
-- SCENARIO (mentor m): three captured sessions, gross fee 500/400/300 →
--   mentor_share (80%) 400/320/240.
--     b1: completed, NOT swept            → PENDING 400 (from ledger share)
--     b2: completed, swept → 'scheduled'  → SCHEDULED 320 (from mentor_payouts)
--     b3: paid out then refunded          → PAID 240 + CLAWBACK_OWED 240
--   lifetime_net = paid(240) + scheduled(320) + pending(400) − clawback(240) = 720
--   A second mentor m2 has a 999-share session that must NEVER appear in m's view.
--
-- Run: docker exec -i <supabase_db_container> psql -U postgres -d postgres \
--        < supabase/dev-seeds/p10c-mentor-earnings-verification.sql
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

DO $$
DECLARE
  m   constant uuid := '11111111-1111-1111-1111-1111111120c1';
  m2  constant uuid := '11111111-1111-1111-1111-1111111120c2';
  s   constant uuid := '22222222-2222-2222-2222-2222222220c1';
  p_sched constant uuid := '33333333-3333-3333-3333-3333333320c1';
  p_paid  constant uuid := '33333333-3333-3333-3333-3333333320c2';
  b1 constant uuid := '44444444-4444-4444-4444-4444444420c1';
  b2 constant uuid := '44444444-4444-4444-4444-4444444420c2';
  b3 constant uuid := '44444444-4444-4444-4444-4444444420c3';
  bo constant uuid := '44444444-4444-4444-4444-4444444420c9';
BEGIN
  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    created_at, updated_at, instance_id
  ) VALUES
    (m, 'authenticated','authenticated','m@uniplug-p10c.local',crypt('pw',gen_salt('bf')),now(),
     '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','mentor','full_name','Mentor C','university','T','course','T','year','2nd Year'),
     '','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
    (m2,'authenticated','authenticated','m2@uniplug-p10c.local',crypt('pw',gen_salt('bf')),now(),
     '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','mentor','full_name','Mentor C2','university','T','course','T','year','2nd Year'),
     '','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
    (s,'authenticated','authenticated','s@uniplug-p10c.local',crypt('pw',gen_salt('bf')),now(),
     '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','student','full_name','Student C','phone','+91-0','school','T','grade','Grade 11'),
     '','','','',now(),now(),'00000000-0000-0000-0000-000000000000');

  UPDATE public.mentors SET status='approved' WHERE id IN (m, m2);

  -- Payout accruals for m.
  INSERT INTO public.mentor_payouts (id, mentor_id, amount_inr, payout_date, status) VALUES
    (p_sched, m, 320, current_date + 2, 'scheduled'),
    (p_paid,  m, 240, current_date - 5, 'paid');

  -- Bookings (gross price 500/400/300; bo is m2's 999-share session).
  INSERT INTO public.bookings (id, student_id, mentor_id, date, time_slot, duration, price, status, paid_at, payout_id) VALUES
    (b1, s, m,  '2026-05-10','10:00',60,500,'completed', now(), NULL),       -- pending
    (b2, s, m,  '2026-05-11','11:00',60,400,'completed', now(), p_sched),    -- scheduled
    (b3, s, m,  '2026-05-12','12:00',60,300,'cancelled', now(), p_paid),     -- paid-then-refunded
    (bo, s, m2, '2026-05-13','13:00',60,1249,'completed', now(), NULL);      -- m2 only

  -- Immutable ledger: one capture per booking (mentor_share = 80% snapshot).
  INSERT INTO public.payment_ledger (booking_id, event_type, idempotency_key, amount_inr, mentor_share_inr) VALUES
    (b1,'payment_captured','captured:p10c-b1',500,400),
    (b2,'payment_captured','captured:p10c-b2',400,320),
    (b3,'payment_captured','captured:p10c-b3',300,240),
    (bo,'payment_captured','captured:p10c-bo',1249,999);
  -- b3 was paid out then refunded → clawback_owed row.
  INSERT INTO public.payment_ledger (booking_id, event_type, idempotency_key, amount_inr, mentor_share_inr) VALUES
    (b3,'clawback_owed','clawback_owed:p10c-b3',300,240);
END $$;

CREATE TEMP TABLE _p10c_results (
  test_id text PRIMARY KEY, status text NOT NULL, detail text NOT NULL
);

-- ─── C1: PENDING is the 80% SHARE (400), not the gross fee (500) ────────────
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v jsonb; v_pending int;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-1111111120c1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v := public.get_mentor_earnings();
  v_pending := (v->'summary'->>'pending_inr')::int;
  IF v_pending = 400 THEN v_pass := true; v_msg := 'pending = 400 (80% share, not gross 500)';
  ELSE v_msg := 'pending_inr = '||v_pending||' (expected 400 share)'; END IF;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _p10c_results VALUES ('C1_pending_is_share_not_gross',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── C2: bucket math (scheduled/paid/clawback/lifetime_net) ──────────────────
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v jsonb;
        v_sch int; v_paid int; v_claw int; v_net int; v_cnt int;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-1111111120c1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v := public.get_mentor_earnings();
  v_sch  := (v->'summary'->>'scheduled_inr')::int;
  v_paid := (v->'summary'->>'paid_inr')::int;
  v_claw := (v->'summary'->>'clawback_owed_inr')::int;
  v_net  := (v->'summary'->>'lifetime_net_inr')::int;
  v_cnt  := (v->'summary'->>'paid_session_count')::int;
  IF v_sch=320 AND v_paid=240 AND v_claw=240 AND v_net=720 AND v_cnt=3 THEN
    v_pass := true; v_msg := 'scheduled=320 paid=240 clawback=240 net=720 count=3';
  ELSE
    v_msg := format('scheduled=%s paid=%s clawback=%s net=%s count=%s (want 320/240/240/720/3)',
                    v_sch,v_paid,v_claw,v_net,v_cnt);
  END IF;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _p10c_results VALUES ('C2_bucket_math',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── C3: ISOLATION — m's net excludes m2's 999 share; sessions = m's 3 only ──
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v jsonb; v_net int; v_n int;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-1111111120c1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v := public.get_mentor_earnings();
  v_net := (v->'summary'->>'lifetime_net_inr')::int;
  v_n   := jsonb_array_length(v->'sessions');
  IF v_net = 720 AND v_n = 3 THEN
    v_pass := true; v_msg := 'net=720 (no m2 money) and exactly 3 own sessions';
  ELSE
    v_msg := 'net='||v_net||' sessions='||v_n||' (m2 leak if net>720 or sessions>3)';
  END IF;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _p10c_results VALUES ('C3_mentor_isolation',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── C4: ANON cannot call it → 42501 ────────────────────────────────────────
DO $$
DECLARE v_pass boolean := false; v_msg text := '';
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN
    PERFORM public.get_mentor_earnings();
    v_msg := 'anon CALLED get_mentor_earnings (should be denied)';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE IN ('42501','42883') THEN v_pass := true; v_msg := 'denied ['||SQLSTATE||']: '||SQLERRM;
    ELSE v_msg := 'unexpected SQLSTATE '||SQLSTATE||': '||SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _p10c_results VALUES ('C4_anon_denied',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── C5: refunded session shows payout_state='refunded' in the breakdown ─────
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v jsonb; v_state text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-1111111120c1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v := public.get_mentor_earnings();
  SELECT elem->>'payout_state' INTO v_state
  FROM jsonb_array_elements(v->'sessions') elem
  WHERE elem->>'booking_id' = '44444444-4444-4444-4444-4444444420c3';
  IF v_state = 'refunded' THEN v_pass := true; v_msg := 'refunded session labelled honestly';
  ELSE v_msg := 'b3 payout_state = '||coalesce(v_state,'(missing)')||' (expected refunded)'; END IF;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _p10c_results VALUES ('C5_refunded_state_honest',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── C6: SCHEDULED-stage reversal — apply_refund on a scheduled booking pulls
--    the share out of the accrual (320→0), writes NO clawback_owed row, and
--    does NOT double-count. Proves the subtler of the two reversal branches.
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v jsonb;
        v_sch int; v_claw int; v_net int;
BEGIN
  -- Drive the reversal as service_role (the apply_refund SECDEF authority path).
  PERFORM public.apply_refund('44444444-4444-4444-4444-4444444420c2', NULL,
    jsonb_build_object('source','dev_seed_scheduled_reversal'));

  PERFORM set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-1111111120c1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v := public.get_mentor_earnings();
  v_sch  := (v->'summary'->>'scheduled_inr')::int;
  v_claw := (v->'summary'->>'clawback_owed_inr')::int;
  v_net  := (v->'summary'->>'lifetime_net_inr')::int;
  -- After reversal: scheduled 320→0; clawback STAYS 240 (b3's pre-existing row —
  -- the scheduled reversal writes NO new clawback_owed row, the key proof);
  -- pending(400)+paid(240) unchanged → net = 240+0+400−240 = 400.
  IF v_sch = 0 AND v_claw = 240 AND v_net = 400 THEN
    v_pass := true; v_msg := 'scheduled pulled to 0; no new clawback row (stays 240); net=400';
  ELSE
    v_msg := format('scheduled=%s clawback=%s net=%s (want 0/240/400)', v_sch, v_claw, v_net);
  END IF;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _p10c_results VALUES ('C6_scheduled_stage_reversal',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

SELECT test_id, status, detail FROM _p10c_results ORDER BY test_id;

ROLLBACK;
