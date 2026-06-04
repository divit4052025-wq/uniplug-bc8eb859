-- ════════════════════════════════════════════════════════════════════════════
-- Phase 4c dev-seed: 30 / 60-minute sessions — collision + price invariants
-- ════════════════════════════════════════════════════════════════════════════
--
-- Pairs with supabase/migrations/20260604000001_p4c_30min_sessions.sql.
-- Setup (service_role claim → RLS + consent-gate bypass) creates an approved
-- mentor M (price ₹1000, availability hours 10/11/12 every weekday), an adult
-- student S1, and one prior COMPLETED booking M↔S1 (makes S1 a "regular" for the
-- reserve_slot eligibility gate).
--
-- Proves the headline P4c invariants:
--   • NO OVERLAPPING DOUBLE-BOOK across 30/60 combinations (the range EXCLUDE
--     guard catches 60-vs-30 overlaps the old string index could not), AND
--     adjacency is NOT a false positive (half-open [) ranges).
--   • PRICE-BY-DURATION: 30-min → ₹500, 60-min → ₹1000, server-derived.
--   • CALENDAR correctness: a 60-min booking marks BOTH 30-min sub-slots taken.
--   • HOLDS + RESCHEDULE still collision-safe under the new guard (exclusion_violation
--     surfaces as the friendly 'slot already booked', not a raw 23P01).
--   • NO DOUBLE-CHARGE for a 30-min booking (one confirmed + one captured ledger).
--   • Availability widening (60-min @ HH:30 needs HH and HH+1) + duration/format validation.
--
-- Run: docker exec -i supabase_db_<ref> psql "postgresql://postgres:postgres@localhost:5432/postgres" \
--        -v ON_ERROR_STOP=1 < this-file.sql
-- PASS CRITERIA: every row status = 'PASS'.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

INSERT INTO auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  created_at, updated_at, instance_id
) VALUES
('b4c00000-0000-0000-0000-00000000000a'::uuid,'authenticated','authenticated','p4c-mentor@example.com',
  crypt('p4c',gen_salt('bf')),now(),'{"provider":"email"}'::jsonb,
  jsonb_build_object('role','mentor','full_name','P4c Mentor','university','IIT Madras','course','CS','year','4th Year'),
  '','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
('b4c00000-0000-0000-0000-0000000000c1'::uuid,'authenticated','authenticated','p4c-s1@example.com',
  crypt('p4c',gen_salt('bf')),now(),'{"provider":"email"}'::jsonb,
  jsonb_build_object('role','student','full_name','P4c Student One','phone','+91-9','school','Sch','grade','Grade 12','date_of_birth','2000-01-01'),
  '','','','',now(),now(),'00000000-0000-0000-0000-000000000000')
ON CONFLICT (id) DO NOTHING;

UPDATE public.mentors SET status='approved', price_inr=1000 WHERE id='b4c00000-0000-0000-0000-00000000000a';

INSERT INTO public.mentor_availability (mentor_id, day_of_week, start_hour)
SELECT 'b4c00000-0000-0000-0000-00000000000a'::uuid, d::smallint, h
FROM generate_series(1,7) d, unnest(ARRAY[10,11,12]::smallint[]) h
ON CONFLICT DO NOTHING;

-- Eligibility seed: a prior COMPLETED booking M↔S1 (not slot-occupying → status
-- 'completed' is outside the active guard predicate).
INSERT INTO public.bookings (id, mentor_id, student_id, date, time_slot, duration, price, status, paid_at)
VALUES ('b4c00000-0000-0000-0000-0000000000d0','b4c00000-0000-0000-0000-00000000000a','b4c00000-0000-0000-0000-0000000000c1',
   CURRENT_DATE-7,'10:00',60,1000,'completed',now()-interval '7 days')
ON CONFLICT (id) DO NOTHING;

CREATE TEMP TABLE _p4c (test_id text PRIMARY KEY, status text NOT NULL, detail text NOT NULL);

-- helper: act as S1 (student)
-- helper: act as M  (mentor)

-- ─── P4c.01 (HAPPY 60-min): book 60@10:00 → duration 60, price ₹1000 ───
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_id uuid; v_dur int; v_price int;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"b4c00000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    v_id := public.book_session('b4c00000-0000-0000-0000-00000000000a', CURRENT_DATE+1, '10:00', NULL, NULL, 60);
  EXCEPTION WHEN OTHERS THEN v_msg := 'book 60 errored ['||SQLSTATE||']: '||SQLERRM; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  IF v_id IS NOT NULL THEN
    SELECT duration, price INTO v_dur, v_price FROM public.bookings WHERE id=v_id;
    v_pass := (v_dur=60 AND v_price=1000);
    v_msg := '60-min booked: duration='||v_dur||' price='||v_price||' (expect 60, 1000)';
  END IF;
  INSERT INTO _p4c VALUES ('P4c.01_book_60min_happy', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P4c.02 (PRICE-BY-DURATION): book 30@12:00 → duration 30, price ₹500 ───
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_id uuid; v_dur int; v_price int;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"b4c00000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    v_id := public.book_session('b4c00000-0000-0000-0000-00000000000a', CURRENT_DATE+1, '12:00', NULL, NULL, 30);
  EXCEPTION WHEN OTHERS THEN v_msg := 'book 30 errored ['||SQLSTATE||']: '||SQLERRM; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  IF v_id IS NOT NULL THEN
    SELECT duration, price INTO v_dur, v_price FROM public.bookings WHERE id=v_id;
    v_pass := (v_dur=30 AND v_price=500);
    v_msg := '30-min booked: duration='||v_dur||' price='||v_price||' (expect 30, 500)';
  END IF;
  INSERT INTO _p4c VALUES ('P4c.02_book_30min_price_500', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P4c.03 (NO DOUBLE-BOOK, 60-then-30-inside): 30@10:30 overlaps the 60@10:00 → reject ───
DO $$
DECLARE v_pass boolean := false; v_msg text := '';
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"b4c00000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.book_session('b4c00000-0000-0000-0000-00000000000a', CURRENT_DATE+1, '10:30', NULL, NULL, 30);
    v_msg := '30@10:30 over a 60@10:00 ACCEPTED (overlap double-book!)';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE '%slot already booked%' THEN v_pass:=true; v_msg:='blocked (friendly msg, not raw 23P01): '||SQLERRM;
    ELSE v_msg:='unexpected ['||SQLSTATE||']: '||SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p4c VALUES ('P4c.03_overlap_60_then_30_blocked', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P4c.04 (ADJACENCY ok — NOT a false positive): 30@11:00 after 60@10:00 → success ───
-- The 60@10:00 is [10:00,11:00); a 30@11:00 is [11:00,11:30) — half-open, no overlap.
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_id uuid;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"b4c00000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    v_id := public.book_session('b4c00000-0000-0000-0000-00000000000a', CURRENT_DATE+1, '11:00', NULL, NULL, 30);
  EXCEPTION WHEN OTHERS THEN v_msg := 'adjacent 30@11:00 wrongly blocked ['||SQLSTATE||']: '||SQLERRM; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  v_pass := (v_id IS NOT NULL);
  IF v_pass THEN v_msg := 'adjacent 30@11:00 booked (correctly NOT treated as overlap)'; END IF;
  INSERT INTO _p4c VALUES ('P4c.04_adjacency_not_false_overlap', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P4c.05 (TWO 30-min in one declared hour): 30@10:00 + 30@10:30 (D+2) → both succeed ───
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_id1 uuid; v_id2 uuid; v_cnt int;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"b4c00000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    v_id1 := public.book_session('b4c00000-0000-0000-0000-00000000000a', CURRENT_DATE+2, '10:00', NULL, NULL, 30);
    v_id2 := public.book_session('b4c00000-0000-0000-0000-00000000000a', CURRENT_DATE+2, '10:30', NULL, NULL, 30);
  EXCEPTION WHEN OTHERS THEN v_msg := 'two 30-min in one hour errored ['||SQLSTATE||']: '||SQLERRM; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  SELECT count(*) INTO v_cnt FROM public.bookings
    WHERE mentor_id='b4c00000-0000-0000-0000-00000000000a' AND date=CURRENT_DATE+2 AND time_slot IN ('10:00','10:30');
  v_pass := (v_id1 IS NOT NULL AND v_id2 IS NOT NULL AND v_cnt=2);
  v_msg := 'two adjacent 30-min in hour 10: rows='||v_cnt||' (expect 2)';
  INSERT INTO _p4c VALUES ('P4c.05_two_30min_one_hour', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P4c.06 (NO DOUBLE-BOOK, REVERSE 30-then-60): 30@10:30 then 60@10:00 (D+3) → second reject ───
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_id uuid;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"b4c00000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_id := public.book_session('b4c00000-0000-0000-0000-00000000000a', CURRENT_DATE+3, '10:30', NULL, NULL, 30);
  BEGIN
    PERFORM public.book_session('b4c00000-0000-0000-0000-00000000000a', CURRENT_DATE+3, '10:00', NULL, NULL, 60);
    v_msg := '60@10:00 over a 30@10:30 ACCEPTED (reverse overlap double-book!)';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE '%slot already booked%' THEN v_pass:=true; v_msg:='blocked: '||SQLERRM;
    ELSE v_msg:='unexpected ['||SQLSTATE||']: '||SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p4c VALUES ('P4c.06_overlap_30_then_60_blocked', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P4c.07 (AVAILABILITY widening): 60@12:30 needs hour 13 (undeclared) → reject; 30@12:30 → ok ───
DO $$
DECLARE v_pass60 boolean := false; v_msg60 text := ''; v_pass30 boolean := false; v_msg30 text := ''; v_id uuid;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"b4c00000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  -- 60@12:30 spans 12:30–13:30 → needs hours 12 AND 13; 13 is not declared.
  BEGIN
    PERFORM public.book_session('b4c00000-0000-0000-0000-00000000000a', CURRENT_DATE+4, '12:30', NULL, NULL, 60);
    v_msg60 := '60@12:30 ACCEPTED (should need undeclared hour 13)';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE '%not available%' THEN v_pass60:=true; v_msg60:='blocked (spillover into undeclared hour 13): '||SQLERRM;
    ELSE v_msg60:='unexpected ['||SQLSTATE||']: '||SQLERRM; END IF;
  END;
  -- 30@12:30 stays within hour 12 → allowed.
  BEGIN
    v_id := public.book_session('b4c00000-0000-0000-0000-00000000000a', CURRENT_DATE+4, '12:30', NULL, NULL, 30);
    v_pass30 := (v_id IS NOT NULL); v_msg30 := '30@12:30 booked (within declared hour 12)';
  EXCEPTION WHEN OTHERS THEN v_msg30 := '30@12:30 wrongly blocked ['||SQLSTATE||']: '||SQLERRM; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p4c VALUES ('P4c.07a_60min_spillover_blocked', CASE WHEN v_pass60 THEN 'PASS' ELSE 'FAIL' END, v_msg60);
  INSERT INTO _p4c VALUES ('P4c.07b_30min_within_hour_ok',   CASE WHEN v_pass30 THEN 'PASS' ELSE 'FAIL' END, v_msg30);
END $$;

-- ─── P4c.08 (CALENDAR correctness): 60@10:00 (D+5) marks 10:00 + 10:30 booked, 11:00 available ───
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_id uuid; v_s1000 text; v_s1030 text; v_s1100 text;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"b4c00000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_id := public.book_session('b4c00000-0000-0000-0000-00000000000a', CURRENT_DATE+5, '10:00', NULL, NULL, 60);
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  SELECT state INTO v_s1000 FROM public.get_mentor_calendar('b4c00000-0000-0000-0000-00000000000a', CURRENT_DATE, 30) WHERE date=CURRENT_DATE+5 AND time_slot='10:00';
  SELECT state INTO v_s1030 FROM public.get_mentor_calendar('b4c00000-0000-0000-0000-00000000000a', CURRENT_DATE, 30) WHERE date=CURRENT_DATE+5 AND time_slot='10:30';
  SELECT state INTO v_s1100 FROM public.get_mentor_calendar('b4c00000-0000-0000-0000-00000000000a', CURRENT_DATE, 30) WHERE date=CURRENT_DATE+5 AND time_slot='11:00';
  v_pass := (v_s1000='booked' AND v_s1030='booked' AND v_s1100='available');
  v_msg := '60@10:00 → 10:00='||coalesce(v_s1000,'∅')||' 10:30='||coalesce(v_s1030,'∅')||' 11:00='||coalesce(v_s1100,'∅')||' (expect booked,booked,available)';
  INSERT INTO _p4c VALUES ('P4c.08_calendar_60min_marks_both_subslots', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P4c.09 (HOLDS collision under new guard): reserved 30@11:00 blocks a 60@10:30 (overlap) ───
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_hold uuid;
BEGIN
  -- mentor reserves 30@11:00 (D+6) for regular S1
  PERFORM set_config('request.jwt.claims','{"sub":"b4c00000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_hold := public.reserve_slot('b4c00000-0000-0000-0000-0000000000c1', CURRENT_DATE+6, '11:00', 30);
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  -- S1 tries a 60@10:30 (spans 10:30–11:30) which overlaps the 11:00–11:30 hold
  PERFORM set_config('request.jwt.claims','{"sub":"b4c00000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.book_session('b4c00000-0000-0000-0000-00000000000a', CURRENT_DATE+6, '10:30', NULL, NULL, 60);
    v_msg := '60@10:30 over a reserved 30@11:00 ACCEPTED (hold collision missed!)';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE '%slot already booked%' THEN v_pass:=true; v_msg:='blocked by the hold under the range guard: '||SQLERRM;
    ELSE v_msg:='unexpected ['||SQLSTATE||']: '||SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p4c VALUES ('P4c.09_hold_blocks_overlapping_book', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P4c.10 (RESCHEDULE under new guard): reschedule onto an overlapping slot → reject; clean move → ok ───
DO $$
DECLARE v_pass_rej boolean := false; v_msg_rej text := ''; v_pass_ok boolean := false; v_msg_ok text := '';
        v_id uuid; v_blocker uuid; v_status text; v_cnt int;
BEGIN
  -- a confirmed 60-min booking to reschedule (D+14 11:00)
  PERFORM set_config('request.jwt.claims','{"sub":"b4c00000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_id := public.book_session('b4c00000-0000-0000-0000-00000000000a', CURRENT_DATE+14, '11:00', NULL, NULL, 60);
  -- a blocker at D+15 10:00 (30-min)
  v_blocker := public.book_session('b4c00000-0000-0000-0000-00000000000a', CURRENT_DATE+15, '10:00', NULL, NULL, 30);
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  PERFORM public.mark_booking_paid(v_id, 'o_resched', 'p_resched', 1000, '{}'::jsonb);  -- → confirmed

  -- (a) reschedule the confirmed 60-min onto D+15 10:00 → its [10:00,11:00) overlaps the 30@10:00 blocker → reject
  PERFORM set_config('request.jwt.claims','{"sub":"b4c00000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.reschedule_booking(v_id, CURRENT_DATE+15, '10:00');
    v_msg_rej := 'reschedule onto an overlapping slot ACCEPTED (range guard missed!)';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE '%slot already booked%' THEN v_pass_rej:=true; v_msg_rej:='blocked (exclusion_violation → friendly): '||SQLERRM;
    ELSE v_msg_rej:='unexpected ['||SQLSTATE||']: '||SQLERRM; END IF;
  END;
  -- (b) clean reschedule onto a free slot (D+16 12:00) → success, payment carries
  BEGIN
    PERFORM public.reschedule_booking(v_id, CURRENT_DATE+16, '12:00');
  EXCEPTION WHEN OTHERS THEN v_msg_ok := 'clean reschedule errored ['||SQLSTATE||']: '||SQLERRM; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  SELECT status, reschedule_count INTO v_status, v_cnt FROM public.bookings WHERE id=v_id;
  v_pass_ok := (v_status='confirmed' AND v_cnt=1
                AND EXISTS (SELECT 1 FROM public.bookings WHERE id=v_id AND date=CURRENT_DATE+16 AND time_slot='12:00'));
  v_msg_ok := COALESCE(NULLIF(v_msg_ok,''), 'clean move → status='||v_status||' reschedule_count='||v_cnt||' at D+16 12:00 (payment carried)');
  INSERT INTO _p4c VALUES ('P4c.10a_reschedule_overlap_blocked', CASE WHEN v_pass_rej THEN 'PASS' ELSE 'FAIL' END, v_msg_rej);
  INSERT INTO _p4c VALUES ('P4c.10b_reschedule_clean_ok',       CASE WHEN v_pass_ok  THEN 'PASS' ELSE 'FAIL' END, v_msg_ok);
END $$;

-- ─── P4c.11 (NO DOUBLE-CHARGE, 30-min): book 30 → pay×2 → confirmed, 1 booking, 1 captured, price ₹500 ───
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_id uuid; v_status text; v_rows int; v_ledger int; v_price int;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"b4c00000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_id := public.book_session('b4c00000-0000-0000-0000-00000000000a', CURRENT_DATE+8, '10:00', NULL, NULL, 30);
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  SELECT price INTO v_price FROM public.bookings WHERE id=v_id;
  -- capture + redelivery (idempotent)
  PERFORM public.mark_booking_paid(v_id, 'o_30', 'p_30', v_price, '{}'::jsonb);
  PERFORM public.mark_booking_paid(v_id, 'o_30', 'p_30', v_price, '{}'::jsonb);
  SELECT status INTO v_status FROM public.bookings WHERE id=v_id;
  SELECT count(*) INTO v_rows FROM public.bookings
    WHERE mentor_id='b4c00000-0000-0000-0000-00000000000a' AND date=CURRENT_DATE+8 AND time_slot='10:00';
  SELECT count(*) INTO v_ledger FROM public.payment_ledger WHERE booking_id=v_id AND event_type='payment_captured';
  v_pass := (v_status='confirmed' AND v_rows=1 AND v_ledger=1 AND v_price=500);
  v_msg := '30-min: price='||v_price||' status='||v_status||' rows='||v_rows||' captured_ledger='||v_ledger||' (expect 500,confirmed,1,1)';
  INSERT INTO _p4c VALUES ('P4c.11_30min_no_double_charge', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P4c.12 (VALIDATION): a 45-min duration is rejected ───
DO $$
DECLARE v_pass boolean := false; v_msg text := '';
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"b4c00000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.book_session('b4c00000-0000-0000-0000-00000000000a', CURRENT_DATE+9, '10:00', NULL, NULL, 45);
    v_msg := '45-min ACCEPTED (should be 30/60 only)';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE '%duration must be 30 or 60%' THEN v_pass:=true; v_msg:='rejected: '||SQLERRM;
    ELSE v_msg:='unexpected ['||SQLSTATE||']: '||SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p4c VALUES ('P4c.12_invalid_duration_rejected', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P4c.13 (VALIDATION): an off-grid minute (:15) is rejected ───
DO $$
DECLARE v_pass boolean := false; v_msg text := '';
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"b4c00000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.book_session('b4c00000-0000-0000-0000-00000000000a', CURRENT_DATE+9, '10:15', NULL, NULL, 30);
    v_msg := '10:15 ACCEPTED (should be HH:00 or HH:30 only)';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE '%HH:00 or HH:30%' THEN v_pass:=true; v_msg:='rejected: '||SQLERRM;
    ELSE v_msg:='unexpected ['||SQLSTATE||']: '||SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p4c VALUES ('P4c.13_offgrid_minute_rejected', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

SELECT test_id, status, detail FROM _p4c ORDER BY test_id;

ROLLBACK;
