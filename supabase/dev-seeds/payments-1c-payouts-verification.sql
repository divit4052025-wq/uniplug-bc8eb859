-- ════════════════════════════════════════════════════════════════════════════
-- Payments Stage 1c dev-seed: payout-batch schema.
-- ════════════════════════════════════════════════════════════════════════════
--
-- WHAT THIS FILE IS
--   Runnable rejection + happy-path tests for migration
--     20260531120003_payments_1c_payouts.sql
--   Everything ROLLBACKs at the end — DB state unchanged.
--
-- PASS CRITERIA  Each test row ends with status = 'PASS'.
--   P1c.1 (reject) mentor_payouts.status = 'nonsense' violates the new CHECK.
--   P1c.2 (reject) payout_batches.status = 'nonsense' violates its CHECK.
--   P1c.3 (happy)  create a batch, a payout row linked to it (batch_id +
--                  period_end), stamp a booking's payout_id; confirm the stamped
--                  booking is EXCLUDED from a `payout_id IS NULL` re-run selection
--                  (the double-pay guard) while an unstamped booking is included.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

DO $$
DECLARE
  m_a constant uuid := '11111111-1111-1111-1111-1111110c1c01';
  s_x constant uuid := '22222222-2222-2222-2222-2222220c1c01';
  v_past date := ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date - 7);
BEGIN
  INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
     raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token,
     email_change, email_change_token_new, created_at, updated_at, instance_id) VALUES
    (m_a,'authenticated','authenticated','m_a@p1c.local',crypt('pw',gen_salt('bf')),now(),
     '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','mentor','full_name','Mentor C','university','T','course','T','year','2nd Year'),
     '','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
    (s_x,'authenticated','authenticated','s_x@p1c.local',crypt('pw',gen_salt('bf')),now(),
     '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','student','full_name','Student C','phone','+91-0','school','T','grade','Grade 11'),
     '','','','',now(),now(),'00000000-0000-0000-0000-000000000000');
  UPDATE public.mentors SET status='approved', price_inr=2000 WHERE id=m_a;
  -- Two completed+paid past bookings for the same mentor.
  INSERT INTO public.bookings (id, mentor_id, student_id, date, time_slot, duration, price, status, paid_at) VALUES
    ('33333333-3333-3333-3333-3333330c1c01', m_a, s_x, v_past, '10:00', 60, 2000, 'completed', now()),
    ('33333333-3333-3333-3333-3333330c1c02', m_a, s_x, v_past, '11:00', 60, 2000, 'completed', now());
END $$;

CREATE TEMP TABLE _p1c (test_id text PRIMARY KEY, status text NOT NULL, detail text NOT NULL);

-- ─── P1c.1: mentor_payouts.status outside set → reject ──────────────────────
DO $$
DECLARE v_pass boolean := false; v_msg text := '';
BEGIN
  BEGIN
    INSERT INTO public.mentor_payouts (mentor_id, amount_inr, payout_date, status)
    VALUES ('11111111-1111-1111-1111-1111110c1c01', 1600, current_date, 'nonsense');
    v_msg := 'bogus mentor_payouts.status ACCEPTED';
  EXCEPTION WHEN check_violation THEN
    v_pass := true; v_msg := 'rejected ['||SQLSTATE||']';
  WHEN OTHERS THEN v_msg := 'wrong reject ['||SQLSTATE||']: '||SQLERRM;
  END;
  INSERT INTO _p1c VALUES ('P1c.1_mentor_payouts_status_check', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P1c.2: payout_batches.status outside set → reject ──────────────────────
DO $$
DECLARE v_pass boolean := false; v_msg text := '';
BEGIN
  BEGIN
    INSERT INTO public.payout_batches (cutoff_at, status) VALUES (now(), 'nonsense');
    v_msg := 'bogus payout_batches.status ACCEPTED';
  EXCEPTION WHEN check_violation THEN
    v_pass := true; v_msg := 'rejected ['||SQLSTATE||']';
  WHEN OTHERS THEN v_msg := 'wrong reject ['||SQLSTATE||']: '||SQLERRM;
  END;
  INSERT INTO _p1c VALUES ('P1c.2_payout_batches_status_check', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P1c.3: batch → payout → stamp → double-pay guard excludes stamped row ───
DO $$
DECLARE
  v_pass boolean := false; v_msg text := '';
  v_batch uuid; v_payout uuid; v_eligible int;
  bk1 constant uuid := '33333333-3333-3333-3333-3333330c1c01';  -- will be stamped
  bk2 constant uuid := '33333333-3333-3333-3333-3333330c1c02';  -- left unstamped
BEGIN
  INSERT INTO public.payout_batches (cutoff_at, status)
  VALUES (now(), 'accrued') RETURNING id INTO v_batch;

  INSERT INTO public.mentor_payouts (mentor_id, amount_inr, payout_date, status, batch_id, period_end)
  VALUES ('11111111-1111-1111-1111-1111110c1c01', 1600, current_date, 'scheduled', v_batch, now())
  RETURNING id INTO v_payout;

  UPDATE public.bookings SET payout_id = v_payout WHERE id = bk1;

  -- Double-pay guard: a re-run selects only completed+paid bookings with payout_id IS NULL.
  SELECT count(*) INTO v_eligible
    FROM public.bookings
   WHERE mentor_id = '11111111-1111-1111-1111-1111110c1c01'
     AND status = 'completed' AND paid_at IS NOT NULL
     AND payout_id IS NULL;

  -- Expect exactly 1: bk2 (unstamped) included, bk1 (stamped) excluded.
  v_pass := (v_eligible = 1
             AND (SELECT payout_id FROM public.bookings WHERE id = bk1) = v_payout
             AND (SELECT payout_id FROM public.bookings WHERE id = bk2) IS NULL
             AND (SELECT batch_id  FROM public.mentor_payouts WHERE id = v_payout) = v_batch);
  v_msg := 'eligible-after-stamp='||v_eligible||' (expect 1: stamped row excluded, unstamped included)';
  INSERT INTO _p1c VALUES ('P1c.3_stamp_double_pay_guard', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

SELECT test_id, status, detail FROM _p1c ORDER BY test_id;

ROLLBACK;
