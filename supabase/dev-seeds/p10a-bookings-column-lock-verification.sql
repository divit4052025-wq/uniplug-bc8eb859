-- ════════════════════════════════════════════════════════════════════════════
-- P10a dev-seed: bookings per-party column visibility.
-- ════════════════════════════════════════════════════════════════════════════
--
-- WHAT THIS FILE IS
--   Runnable rejection + happy-path tests for the column lock in migration
--   20260611000001_p10a_bookings_per_party_column_lock.sql. Everything ROLLBACKs
--   at the end — DB state unchanged.
--
-- PASS CRITERIA — every test row ends 'PASS'. A 'FAIL' means either the
--   cross-party financial leak is still open (student can read payout_id /
--   razorpay_*) OR a legitimate path broke (mentor can't read their own payout_id
--   via the accessor / safe columns stopped being selectable).
--
-- Run: docker exec -i <supabase_db_container> psql -U postgres -d postgres \
--        < supabase/dev-seeds/p10a-bookings-column-lock-verification.sql
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

DO $$
DECLARE
  m   constant uuid := '11111111-1111-1111-1111-1111111110a1';  -- mentor
  s   constant uuid := '22222222-2222-2222-2222-2222222210a1';  -- student (booking owner)
  pay constant uuid := '33333333-3333-3333-3333-3333333310a1';  -- mentor_payouts row
  bk  constant uuid := '44444444-4444-4444-4444-4444444410a1';  -- the booking
BEGIN
  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    created_at, updated_at, instance_id
  ) VALUES
    (m, 'authenticated', 'authenticated', 'm@uniplug-p10a.local',
     crypt('pw', gen_salt('bf')), now(), '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','mentor','full_name','Mentor P10a','university','T','course','T','year','2nd Year','date_of_birth','2000-01-01'),
     '', '', '', '', now(), now(), '00000000-0000-0000-0000-000000000000'),
    (s, 'authenticated', 'authenticated', 's@uniplug-p10a.local',
     crypt('pw', gen_salt('bf')), now(), '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','student','full_name','Student P10a','phone','+91-0','school','T','grade','Grade 11'),
     '', '', '', '', now(), now(), '00000000-0000-0000-0000-000000000000');

  UPDATE public.mentors SET status = 'approved' WHERE id = m;

  -- A payout accrual to stamp on the booking (the cross-party value the student
  -- must NOT be able to read).
  INSERT INTO public.mentor_payouts (id, mentor_id, amount_inr, payout_date, status)
  VALUES (pay, m, 400, current_date, 'scheduled');

  -- A completed+paid booking carrying ALL the sensitive identifiers.
  INSERT INTO public.bookings (
    id, student_id, mentor_id, date, time_slot, duration, price, status,
    paid_at, razorpay_order_id, razorpay_payment_id, payout_id
  ) VALUES (
    bk, s, m, '2026-05-20', '14:00', 60, 500, 'completed',
    now(), 'order_p10a_test', 'pay_p10a_test', pay
  );
END $$;

CREATE TEMP TABLE _p10a_results (
  test_id text PRIMARY KEY,
  status  text NOT NULL,
  detail  text NOT NULL
);

-- ─── A1: STUDENT direct SELECT payout_id (own row) → DENIED (42501) ──────────
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_x uuid;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"22222222-2222-2222-2222-2222222210a1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    SELECT payout_id INTO v_x FROM public.bookings
     WHERE id = '44444444-4444-4444-4444-4444444410a1';
    v_msg := 'student READ payout_id = '||coalesce(v_x::text,'NULL')||' (LEAK)';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = '42501' THEN v_pass := true; v_msg := 'denied [42501]: '||SQLERRM;
    ELSE v_msg := 'unexpected SQLSTATE '||SQLSTATE||': '||SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _p10a_results VALUES ('A1_student_payout_id_denied',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── A2: STUDENT direct SELECT razorpay_order_id → DENIED (42501) ────────────
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_x text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"22222222-2222-2222-2222-2222222210a1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    SELECT razorpay_order_id INTO v_x FROM public.bookings
     WHERE id = '44444444-4444-4444-4444-4444444410a1';
    v_msg := 'student READ razorpay_order_id = '||coalesce(v_x,'NULL')||' (LEAK)';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = '42501' THEN v_pass := true; v_msg := 'denied [42501]: '||SQLERRM;
    ELSE v_msg := 'unexpected SQLSTATE '||SQLSTATE||': '||SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _p10a_results VALUES ('A2_student_razorpay_order_denied',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── A3: STUDENT direct SELECT razorpay_payment_id → DENIED (42501) ──────────
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_x text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"22222222-2222-2222-2222-2222222210a1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    SELECT razorpay_payment_id INTO v_x FROM public.bookings
     WHERE id = '44444444-4444-4444-4444-4444444410a1';
    v_msg := 'student READ razorpay_payment_id = '||coalesce(v_x,'NULL')||' (LEAK)';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = '42501' THEN v_pass := true; v_msg := 'denied [42501]: '||SQLERRM;
    ELSE v_msg := 'unexpected SQLSTATE '||SQLSTATE||': '||SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _p10a_results VALUES ('A3_student_razorpay_payment_denied',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── A4: STUDENT direct SELECT of SAFE columns (own row) → STILL WORKS ───────
--    Proves the REVOKE did not break the legitimate student dashboard reads.
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_price integer; v_status text;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"22222222-2222-2222-2222-2222222210a1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    SELECT price, status INTO v_price, v_status FROM public.bookings
     WHERE id = '44444444-4444-4444-4444-4444444410a1';
    IF v_price = 500 AND v_status = 'completed' THEN
      v_pass := true; v_msg := 'safe columns readable (price=500, status=completed)';
    ELSE
      v_msg := 'safe columns returned unexpected row: price='||coalesce(v_price::text,'NULL');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_msg := 'unexpected denial ['||SQLSTATE||']: '||SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _p10a_results VALUES ('A4_student_safe_columns_ok',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── A5: MENTOR direct SELECT payout_id → DENIED (42501) — SYMMETRIC lock ────
--    The raw column is locked from end-user roles entirely (not a per-role
--    half-measure). The mentor's legitimate access is the DEFINER accessor (A6).
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_x uuid;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-1111111110a1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    SELECT payout_id INTO v_x FROM public.bookings
     WHERE id = '44444444-4444-4444-4444-4444444410a1';
    v_msg := 'mentor READ payout_id directly = '||coalesce(v_x::text,'NULL')||' (column not locked)';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = '42501' THEN v_pass := true; v_msg := 'denied [42501]: '||SQLERRM;
    ELSE v_msg := 'unexpected SQLSTATE '||SQLSTATE||': '||SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _p10a_results VALUES ('A5_mentor_direct_payout_id_denied',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── A6: MENTOR get_my_bookings_as_mentor() → payout_id RESTORED for own row ─
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_x uuid;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-1111111110a1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    SELECT payout_id INTO v_x FROM public.get_my_bookings_as_mentor()
     WHERE id = '44444444-4444-4444-4444-4444444410a1';
    IF v_x = '33333333-3333-3333-3333-3333333310a1' THEN
      v_pass := true; v_msg := 'mentor reads own payout_id via accessor = '||v_x::text;
    ELSE
      v_msg := 'accessor returned payout_id = '||coalesce(v_x::text,'NULL')||' (expected the stamped payout)';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_msg := 'unexpected error ['||SQLSTATE||']: '||SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _p10a_results VALUES ('A6_mentor_accessor_payout_id_ok',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── A7: STUDENT calling get_my_bookings_as_mentor() → 0 rows (not a mentor) ─
--    The accessor authorizes on auth.uid()=mentor_id, so the student (who owns
--    the row as the STUDENT) sees nothing through the mentor accessor.
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_n integer;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"22222222-2222-2222-2222-2222222210a1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    SELECT count(*) INTO v_n FROM public.get_my_bookings_as_mentor();
    IF v_n = 0 THEN v_pass := true; v_msg := 'student sees 0 rows through mentor accessor';
    ELSE v_msg := 'student saw '||v_n||' rows through mentor accessor (LEAK)'; END IF;
  EXCEPTION WHEN OTHERS THEN
    v_msg := 'unexpected error ['||SQLSTATE||']: '||SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _p10a_results VALUES ('A7_student_via_mentor_accessor_empty',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── A8: service_role direct SELECT payout_id → UNAFFECTED (admin paths keep it)
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_x uuid;
BEGIN
  -- already service_role here
  BEGIN
    SELECT payout_id INTO v_x FROM public.bookings
     WHERE id = '44444444-4444-4444-4444-4444444410a1';
    IF v_x = '33333333-3333-3333-3333-3333333310a1' THEN
      v_pass := true; v_msg := 'service_role still reads payout_id';
    ELSE v_msg := 'service_role payout_id = '||coalesce(v_x::text,'NULL'); END IF;
  EXCEPTION WHEN OTHERS THEN
    v_msg := 'service_role unexpectedly denied ['||SQLSTATE||']: '||SQLERRM;
  END;
  INSERT INTO _p10a_results VALUES ('A8_service_role_payout_id_ok',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

SELECT test_id, status, detail FROM _p10a_results ORDER BY test_id;

ROLLBACK;
