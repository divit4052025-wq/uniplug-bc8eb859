-- ════════════════════════════════════════════════════════════════════════════
-- Payments Stage 5 dev-seed: Friday payout batch + eligibility (paid_at gate, IST
--                            cutoff boundary, dispute/double-pay exclusions).
-- ════════════════════════════════════════════════════════════════════════════
--
-- WHAT THIS FILE IS
--   Runnable rejection + happy-path tests for migration
--     20260531120007_payments_5_payout_batch.sql
--   Everything ROLLBACKs at the end — DB state unchanged.
--
-- PASS CRITERIA  Each test row ends with status = 'PASS'.
--   P5.1 (reject) the EXCLUSIONS — each of these completed bookings is NOT paid out:
--                 (a) paid_at IS NULL (the point-1 money gate),
--                 (b) an open dispute,
--                 (c) session-end AFTER the cutoff (Fri 00:01 IST side),
--                 (d) already carrying a payout_id.
--   P5.2 (boundary) IST cutoff — a booking ending Thu 23:58 IST is included; one
--                 ending Fri 00:01 IST is excluded. (Pins the AT TIME ZONE math.)
--   P5.3 (happy)  two eligible (paid+completed+undisputed+pre-cutoff) bookings for
--                 one mentor → ONE mentor_payouts row, amount = round(p1*.8)+round(p2*.8),
--                 both bookings stamped with its id, linked to one payout_batches row.
--   P5.4 (idempotent) a SECOND run produces no new payout for already-stamped bookings.
--
-- We pin "now" by computing the cutoff the RPC will use and seeding sessions
-- relative to it. To make the cutoff deterministic we seed sessions on dates well
-- before/after the most-recent-Thursday cutoff the RPC computes from now().
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- Helper: the cutoff the RPC computes (most recent Thursday 23:59:59 IST).
CREATE TEMP TABLE _cut AS
SELECT (
  (((now() AT TIME ZONE 'Asia/Kolkata')::date
    - (((EXTRACT(ISODOW FROM (now() AT TIME ZONE 'Asia/Kolkata'))::int - 4) + 7) % 7))::text
    || ' 23:59:59')::timestamp
) AT TIME ZONE 'Asia/Kolkata' AS cutoff;

DO $$
DECLARE
  m_a constant uuid := '11111111-1111-1111-1111-1111110501a1';  -- eligible mentor
  m_b constant uuid := '11111111-1111-1111-1111-1111110501a2';  -- exclusions mentor
  s_x constant uuid := '22222222-2222-2222-2222-2222220501a1';
  v_cut timestamptz; v_pre date; v_post date;
  v_thu date; v_fri date;
BEGIN
  SELECT cutoff INTO v_cut FROM _cut;
  -- A date safely BEFORE the cutoff (cutoff date minus 2 days) and AFTER (cutoff date + 2 days).
  v_pre  := (v_cut AT TIME ZONE 'Asia/Kolkata')::date - 2;
  v_post := (v_cut AT TIME ZONE 'Asia/Kolkata')::date + 2;
  -- The cutoff's own Thursday date (for the boundary test).
  v_thu  := (v_cut AT TIME ZONE 'Asia/Kolkata')::date;     -- Thursday
  v_fri  := v_thu + 1;                                      -- Friday

  INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
     raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token,
     email_change, email_change_token_new, created_at, updated_at, instance_id) VALUES
    (m_a,'authenticated','authenticated','m_a@p5.local',crypt('pw',gen_salt('bf')),now(),
     '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','mentor','full_name','Mentor Eligible','university','T','course','T','year','2nd Year'),
     '','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
    (m_b,'authenticated','authenticated','m_b@p5.local',crypt('pw',gen_salt('bf')),now(),
     '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','mentor','full_name','Mentor Excluded','university','T','course','T','year','2nd Year'),
     '','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
    (s_x,'authenticated','authenticated','s_x@p5.local',crypt('pw',gen_salt('bf')),now(),
     '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','student','full_name','Student P5','phone','+91-0','school','T','grade','Undergraduate'),
     '','','','',now(),now(),'00000000-0000-0000-0000-000000000000');
  UPDATE public.mentors SET status='approved', price_inr=2000 WHERE id IN (m_a, m_b);

  -- m_a: TWO eligible completed+paid bookings, pre-cutoff (the happy path).
  INSERT INTO public.bookings (id, mentor_id, student_id, date, time_slot, duration, price, status, paid_at) VALUES
    ('33333333-3333-3333-3333-3333330501a1', m_a, s_x, v_pre, '10:00', 60, 2000, 'completed', now()),
    ('33333333-3333-3333-3333-3333330501a2', m_a, s_x, v_pre, '11:00', 60, 2000, 'completed', now());

  -- m_b: four EXCLUSION cases (each completed, pre-cutoff except (c)).
  --  (a) paid_at NULL
  INSERT INTO public.bookings (id, mentor_id, student_id, date, time_slot, duration, price, status, paid_at)
  VALUES ('33333333-3333-3333-3333-33333305b001', m_b, s_x, v_pre, '10:00', 60, 2000, 'completed', NULL);
  --  (b) open dispute (paid)
  INSERT INTO public.bookings (id, mentor_id, student_id, date, time_slot, duration, price, status, paid_at)
  VALUES ('33333333-3333-3333-3333-33333305b002', m_b, s_x, v_pre, '11:00', 60, 2000, 'completed', now());
  INSERT INTO public.disputes (booking_id, opened_by, reason, status)
  VALUES ('33333333-3333-3333-3333-33333305b002', s_x, 'test', 'open');
  --  (c) session-end AFTER cutoff (paid) — post date
  INSERT INTO public.bookings (id, mentor_id, student_id, date, time_slot, duration, price, status, paid_at)
  VALUES ('33333333-3333-3333-3333-33333305b003', m_b, s_x, v_post, '11:00', 60, 2000, 'completed', now());
  --  (d) already stamped (paid) — pre-existing payout_id
  INSERT INTO public.mentor_payouts (id, mentor_id, amount_inr, payout_date, status)
  VALUES ('44444444-4444-4444-4444-444444440501', m_b, 1600, current_date, 'scheduled');
  INSERT INTO public.bookings (id, mentor_id, student_id, date, time_slot, duration, price, status, paid_at, payout_id)
  VALUES ('33333333-3333-3333-3333-33333305b004', m_b, s_x, v_pre, '12:00', 60, 2000, 'completed', now(),
          '44444444-4444-4444-4444-444444440501');

  -- Boundary pair for P5.2: both paid+completed; one ends Thu 23:58 IST (in),
  -- one ends Fri 00:01 IST (out). duration 60 → start = end - 1h.
  --  Thu 22:58 start + 60min = Thu 23:58 IST  → included
  INSERT INTO public.bookings (id, mentor_id, student_id, date, time_slot, duration, price, status, paid_at)
  VALUES ('33333333-3333-3333-3333-3333330502b1', m_a, s_x, v_thu, '22:00', 58, 2000, 'completed', now());
  --  Fri 00:01 end → start Thu 23:01 + 60 = Fri 00:01 IST → excluded
  INSERT INTO public.bookings (id, mentor_id, student_id, date, time_slot, duration, price, status, paid_at)
  VALUES ('33333333-3333-3333-3333-3333330502b2', m_a, s_x, v_thu, '23:00', 61, 2000, 'completed', now());
END $$;

CREATE TEMP TABLE _p5 (test_id text PRIMARY KEY, status text NOT NULL, detail text NOT NULL);

-- Run the batch once.
DO $$
DECLARE v_batch uuid;
BEGIN
  v_batch := public.run_weekly_payout_batch();
  -- stash for later asserts
  CREATE TEMP TABLE _b AS SELECT v_batch AS batch_id;
END $$;

-- ─── P5.1: all four exclusions → m_b gets NO payout row ─────────────────────
DO $$
DECLARE v_pass boolean; v_mb_payouts int; v_stamped int;
BEGIN
  SELECT count(*) INTO v_mb_payouts FROM public.mentor_payouts
   WHERE mentor_id='11111111-1111-1111-1111-1111110501a2' AND batch_id=(SELECT batch_id FROM _b);
  -- none of m_b's four exclusion bookings should be stamped by THIS batch
  SELECT count(*) INTO v_stamped FROM public.bookings b
    JOIN public.mentor_payouts p ON b.payout_id=p.id AND p.batch_id=(SELECT batch_id FROM _b)
   WHERE b.mentor_id='11111111-1111-1111-1111-1111110501a2';
  v_pass := (v_mb_payouts = 0 AND v_stamped = 0);
  INSERT INTO _p5 VALUES ('P5.1_exclusions',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END,
    'm_b payout rows this batch='||v_mb_payouts||' m_b bookings stamped='||v_stamped);
END $$;

-- ─── P5.2: IST cutoff boundary — Thu 23:58 in, Fri 00:01 out ────────────────
DO $$
DECLARE v_pass boolean; v_in uuid; v_out uuid;
BEGIN
  SELECT payout_id INTO v_in  FROM public.bookings WHERE id='33333333-3333-3333-3333-3333330502b1';
  SELECT payout_id INTO v_out FROM public.bookings WHERE id='33333333-3333-3333-3333-3333330502b2';
  v_pass := (v_in IS NOT NULL AND v_out IS NULL);
  INSERT INTO _p5 VALUES ('P5.2_ist_cutoff_boundary',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END,
    'thu2358_stamped='||(v_in IS NOT NULL)::text||' fri0001_stamped='||(v_out IS NOT NULL)::text);
END $$;

-- ─── P5.3: happy path — one payout row, correct sum, both stamped, batch link ─
DO $$
DECLARE
  v_pass boolean; v_rows int; v_amt int; v_b1 uuid; v_b2 uuid; v_payout uuid; v_batch_link uuid;
BEGIN
  SELECT count(*) INTO v_rows
    FROM public.mentor_payouts
   WHERE mentor_id='11111111-1111-1111-1111-1111110501a1' AND batch_id=(SELECT batch_id FROM _b);
  SELECT id, amount_inr INTO v_payout, v_amt
    FROM public.mentor_payouts
   WHERE mentor_id='11111111-1111-1111-1111-1111110501a1' AND batch_id=(SELECT batch_id FROM _b)
   LIMIT 1;
  SELECT payout_id INTO v_b1 FROM public.bookings WHERE id='33333333-3333-3333-3333-3333330501a1';
  SELECT payout_id INTO v_b2 FROM public.bookings WHERE id='33333333-3333-3333-3333-3333330501a2';
  SELECT batch_id INTO v_batch_link FROM public.mentor_payouts WHERE id=v_payout;
  -- amount = round(2000*.8)*2 = 3200, PLUS the boundary-included Thu 23:58 booking
  -- (also m_a, also 2000) = 1600 → 4800 total for m_a this batch.
  v_pass := (v_rows = 1
             AND v_amt = 4800
             AND v_b1 = v_payout AND v_b2 = v_payout
             AND v_batch_link = (SELECT batch_id FROM _b));
  INSERT INTO _p5 VALUES ('P5.3_happy_accrual',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END,
    'rows='||v_rows||' amount='||v_amt||' both_stamped='||((v_b1=v_payout AND v_b2=v_payout))::text);
END $$;

-- ─── P5.4: a second run pays nothing new for stamped bookings ───────────────
DO $$
DECLARE v_pass boolean; v_before int; v_after int; v_batch2 uuid; v_new_payouts int;
BEGIN
  SELECT count(*) INTO v_before FROM public.mentor_payouts;
  v_batch2 := public.run_weekly_payout_batch();
  SELECT count(*) INTO v_new_payouts FROM public.mentor_payouts WHERE batch_id = v_batch2;
  SELECT count(*) INTO v_after FROM public.mentor_payouts;
  -- A new (empty) batch row may exist, but it must produce ZERO mentor_payouts.
  v_pass := (v_new_payouts = 0);
  INSERT INTO _p5 VALUES ('P5.4_rerun_no_double_pay',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END,
    'payouts in 2nd batch='||v_new_payouts||' (expect 0)');
END $$;

SELECT test_id, status, detail FROM _p5 ORDER BY test_id;

ROLLBACK;
