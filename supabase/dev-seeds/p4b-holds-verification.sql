-- ════════════════════════════════════════════════════════════════════════════
-- Phase 4b dev-seed: reserve-a-slot holds — money invariants
-- ════════════════════════════════════════════════════════════════════════════
--
-- Pairs with supabase/migrations/20260603000009_p4b_holds.sql.
-- Setup (bootstrap role, service_role claim → RLS + consent-gate bypass) creates
-- an approved mentor M, a non-owner mentor M2, a regular student S1 (one prior
-- completed booking with M), a non-regular student S2, mentor availability, and
-- two pre-aged holds for the 48h test.
--
-- Proves: no-double-book (a reserved hold blocks book_session), no-double-charge
-- (claim flips reserved→pending_payment on the SAME id; pay → exactly one
-- confirmed booking + one payment_captured ledger row), 48h auto-release,
-- calendar-shows-taken, eligibility, and the RLS / ownership rules.
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
('b4b00000-0000-0000-0000-00000000000a'::uuid,'authenticated','authenticated','p4b-mentor@example.com',
  crypt('p4b',gen_salt('bf')),now(),'{"provider":"email"}'::jsonb,
  jsonb_build_object('role','mentor','full_name','P4b Mentor','university','IIT Bombay','course','CS','year','3rd Year','date_of_birth','2000-01-01'),
  '','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
('b4b00000-0000-0000-0000-00000000000b'::uuid,'authenticated','authenticated','p4b-mentor2@example.com',
  crypt('p4b',gen_salt('bf')),now(),'{"provider":"email"}'::jsonb,
  jsonb_build_object('role','mentor','full_name','P4b Mentor Two','university','IIT Delhi','course','ME','year','2nd Year','date_of_birth','2000-01-01'),
  '','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
('b4b00000-0000-0000-0000-0000000000c1'::uuid,'authenticated','authenticated','p4b-s1@example.com',
  crypt('p4b',gen_salt('bf')),now(),'{"provider":"email"}'::jsonb,
  jsonb_build_object('role','student','full_name','P4b Student One','phone','+91-1','school','Sch','grade','Grade 12','date_of_birth','2000-01-01'),
  '','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
('b4b00000-0000-0000-0000-0000000000c2'::uuid,'authenticated','authenticated','p4b-s2@example.com',
  crypt('p4b',gen_salt('bf')),now(),'{"provider":"email"}'::jsonb,
  jsonb_build_object('role','student','full_name','P4b Student Two','phone','+91-2','school','Sch','grade','Grade 12','date_of_birth','2000-01-01'),
  '','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
-- S3: a MINOR (Grade 10) with NO parental consent recorded — used to prove
-- reserve_slot inherits the BEFORE-INSERT minor-consent gate.
('b4b00000-0000-0000-0000-0000000000c3'::uuid,'authenticated','authenticated','p4b-s3@example.com',
  crypt('p4b',gen_salt('bf')),now(),'{"provider":"email"}'::jsonb,
  jsonb_build_object('role','student','full_name','P4b Student Three (minor)','phone','+91-3','school','Sch','grade','Grade 10','parent_email','p4b-parent@example.com'),
  '','','','',now(),now(),'00000000-0000-0000-0000-000000000000')
ON CONFLICT (id) DO NOTHING;

UPDATE public.mentors SET status='approved' WHERE id IN ('b4b00000-0000-0000-0000-00000000000a','b4b00000-0000-0000-0000-00000000000b');

INSERT INTO public.mentor_availability (mentor_id, day_of_week, start_hour)
SELECT 'b4b00000-0000-0000-0000-00000000000a'::uuid, d::smallint, h
FROM generate_series(1,7) d, unnest(ARRAY[10,11,12]::smallint[]) h
ON CONFLICT DO NOTHING;

-- Eligibility seed: one prior COMPLETED booking between M and S1 (makes S1 a "regular").
-- (status='completed' is NOT in the slot unique index, so it occupies no slot.)
INSERT INTO public.bookings (id, mentor_id, student_id, date, time_slot, duration, price, status, paid_at)
VALUES
('b4b00000-0000-0000-0000-0000000000d0','b4b00000-0000-0000-0000-00000000000a','b4b00000-0000-0000-0000-0000000000c1',
   CURRENT_DATE-7,'10:00',60,1000,'completed',now()-interval '7 days'),
-- S3 (minor) is ALSO a regular (passes the eligibility gate) so P4b.13 reaches the consent gate.
('b4b00000-0000-0000-0000-0000000000d1','b4b00000-0000-0000-0000-00000000000a','b4b00000-0000-0000-0000-0000000000c3',
   CURRENT_DATE-7,'11:00',60,1000,'completed',now()-interval '7 days')
ON CONFLICT (id) DO NOTHING;

-- 48h test holds: one aged (49h, should expire), one fresh (should survive).
INSERT INTO public.bookings (id, mentor_id, student_id, date, time_slot, duration, price, status, created_at)
VALUES
('b4b00000-0000-0000-0000-0000000000e1','b4b00000-0000-0000-0000-00000000000a','b4b00000-0000-0000-0000-0000000000c1',
   CURRENT_DATE+20,'10:00',60,1000,'reserved', now()-interval '49 hours'),
('b4b00000-0000-0000-0000-0000000000e2','b4b00000-0000-0000-0000-00000000000a','b4b00000-0000-0000-0000-0000000000c1',
   CURRENT_DATE+20,'11:00',60,1000,'reserved', now())
ON CONFLICT (id) DO NOTHING;

CREATE TEMP TABLE _p4b (test_id text PRIMARY KEY, status text NOT NULL, detail text NOT NULL);

-- ─── P4b.01 (HAPPY): mentor reserves a slot for a regular student ───
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_id uuid; v_status text; v_price int; v_stu uuid;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"b4b00000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    v_id := public.reserve_slot('b4b00000-0000-0000-0000-0000000000c1', CURRENT_DATE+7, '10:00');
  EXCEPTION WHEN OTHERS THEN v_msg := 'reserve errored ['||SQLSTATE||']: '||SQLERRM; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  IF v_id IS NOT NULL THEN
    SELECT status, price, student_id INTO v_status, v_price, v_stu FROM public.bookings WHERE id=v_id;
    v_pass := (v_status='reserved' AND v_price=1000 AND v_stu='b4b00000-0000-0000-0000-0000000000c1');
    v_msg := 'reserved id='||left(v_id::text,8)||' status='||v_status||' price='||v_price||' for S1='||(v_stu='b4b00000-0000-0000-0000-0000000000c1')::text;
  END IF;
  INSERT INTO _p4b VALUES ('P4b.01_reserve_happy', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P4b.02 (REJECTION): cannot reserve for a NON-regular student ───
DO $$
DECLARE v_pass boolean := false; v_msg text := '';
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"b4b00000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.reserve_slot('b4b00000-0000-0000-0000-0000000000c2', CURRENT_DATE+7, '11:00');
    v_msg := 'reserve for non-regular ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE='P0001' AND SQLERRM ILIKE '%already mentored%' THEN v_pass:=true; v_msg:='denied: '||SQLERRM;
    ELSE v_msg:='unexpected ['||SQLSTATE||']: '||SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p4b VALUES ('P4b.02_eligibility_nonregular_blocked', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P4b.03 (INVARIANT: no double-book): a reserved hold blocks another student's book_session ───
DO $$
DECLARE v_pass boolean := false; v_msg text := '';
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"b4b00000-0000-0000-0000-0000000000c2","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.book_session('b4b00000-0000-0000-0000-00000000000a', CURRENT_DATE+7, '10:00');
    v_msg := 'book_session over a reserved slot ACCEPTED (double-book!)';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE '%slot already booked%' THEN v_pass:=true; v_msg:='blocked: '||SQLERRM;
    ELSE v_msg:='unexpected ['||SQLSTATE||']: '||SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p4b VALUES ('P4b.03_reserved_blocks_double_book', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P4b.04 (INVARIANT: claim morph): reserved→pending_payment, SAME id, no 2nd row ───
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_id uuid; v_status text; v_cnt int; v_acted boolean := false;
BEGIN
  SELECT id INTO v_id FROM public.bookings
   WHERE mentor_id='b4b00000-0000-0000-0000-00000000000a' AND student_id='b4b00000-0000-0000-0000-0000000000c1'
     AND date=CURRENT_DATE+7 AND time_slot='10:00';
  PERFORM set_config('request.jwt.claims','{"sub":"b4b00000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.claim_reserved_booking(v_id);
    v_acted := true;
  EXCEPTION WHEN OTHERS THEN v_msg := 'claim errored ['||SQLSTATE||']: '||SQLERRM; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  IF v_acted THEN
    SELECT status INTO v_status FROM public.bookings WHERE id=v_id;
    SELECT count(*) INTO v_cnt FROM public.bookings
      WHERE mentor_id='b4b00000-0000-0000-0000-00000000000a' AND date=CURRENT_DATE+7 AND time_slot='10:00';
    v_pass := (v_status='pending_payment' AND v_cnt=1);
    v_msg := 'same id now status='||v_status||'; rows at slot='||v_cnt||' (expect 1, no second booking)';
  END IF;
  INSERT INTO _p4b VALUES ('P4b.04_claim_morph_same_id', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P4b.05 (INVARIANT: no double-charge): pay the claimed hold → ONE confirmed + ONE captured ledger ───
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_id uuid; v_status text; v_rows int; v_ledger int;
BEGIN
  SELECT id INTO v_id FROM public.bookings
   WHERE mentor_id='b4b00000-0000-0000-0000-00000000000a' AND student_id='b4b00000-0000-0000-0000-0000000000c1'
     AND date=CURRENT_DATE+7 AND time_slot='10:00';
  -- mark_booking_paid is the webhook (service_role) path; call it directly here.
  BEGIN
    PERFORM public.mark_booking_paid(v_id, 'order_claim_b1', 'pay_claim_b1', 1000, '{}'::jsonb);
    -- redelivery of the SAME capture must be idempotent (no second ledger row).
    PERFORM public.mark_booking_paid(v_id, 'order_claim_b1', 'pay_claim_b1', 1000, '{}'::jsonb);
  EXCEPTION WHEN OTHERS THEN v_msg := 'mark_booking_paid errored ['||SQLSTATE||']: '||SQLERRM; END;
  SELECT status INTO v_status FROM public.bookings WHERE id=v_id;
  SELECT count(*) INTO v_rows FROM public.bookings
    WHERE mentor_id='b4b00000-0000-0000-0000-00000000000a' AND date=CURRENT_DATE+7 AND time_slot='10:00';
  SELECT count(*) INTO v_ledger FROM public.payment_ledger WHERE booking_id=v_id AND event_type='payment_captured';
  v_pass := (v_status='confirmed' AND v_rows=1 AND v_ledger=1);
  v_msg := 'status='||v_status||'; bookings at slot='||v_rows||'; payment_captured rows='||v_ledger||' (expect confirmed,1,1 even after redelivery)';
  INSERT INTO _p4b VALUES ('P4b.05_claim_pay_no_double_charge', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P4b.06 (REJECTION): a different student cannot claim a hold reserved for someone else ───
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_id uuid;
BEGIN
  -- fresh hold for S1
  PERFORM set_config('request.jwt.claims','{"sub":"b4b00000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_id := public.reserve_slot('b4b00000-0000-0000-0000-0000000000c1', CURRENT_DATE+8, '10:00');
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  -- S2 tries to claim it
  PERFORM set_config('request.jwt.claims','{"sub":"b4b00000-0000-0000-0000-0000000000c2","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.claim_reserved_booking(v_id);
    v_msg := 'wrong-student claim ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE='42501' AND SQLERRM ILIKE '%not reserved for you%' THEN v_pass:=true; v_msg:='denied: '||SQLERRM;
    ELSE v_msg:='unexpected ['||SQLSTATE||']: '||SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p4b VALUES ('P4b.06_wrong_student_claim_blocked', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P4b.07 (HAPPY): the mentor releases a hold ───
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_id uuid; v_status text; v_acted boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"b4b00000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_id := public.reserve_slot('b4b00000-0000-0000-0000-0000000000c1', CURRENT_DATE+8, '11:00');
  BEGIN PERFORM public.release_reserved_booking(v_id); v_acted := true;
  EXCEPTION WHEN OTHERS THEN v_msg := 'mentor release errored ['||SQLSTATE||']: '||SQLERRM; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  IF v_acted THEN
    SELECT status INTO v_status FROM public.bookings WHERE id=v_id;
    v_pass := (v_status='expired');
    v_msg := 'mentor released → status='||v_status||' (slot freed)';
  END IF;
  INSERT INTO _p4b VALUES ('P4b.07_mentor_release', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P4b.08 (HAPPY): the student releases a hold reserved for them ───
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_id uuid; v_status text; v_acted boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"b4b00000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_id := public.reserve_slot('b4b00000-0000-0000-0000-0000000000c1', CURRENT_DATE+8, '12:00');
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  PERFORM set_config('request.jwt.claims','{"sub":"b4b00000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN PERFORM public.release_reserved_booking(v_id); v_acted := true;
  EXCEPTION WHEN OTHERS THEN v_msg := 'student release errored ['||SQLSTATE||']: '||SQLERRM; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  IF v_acted THEN
    SELECT status INTO v_status FROM public.bookings WHERE id=v_id;
    v_pass := (v_status='expired');
    v_msg := 'student released → status='||v_status;
  END IF;
  INSERT INTO _p4b VALUES ('P4b.08_student_release', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P4b.09 (REJECTION): a non-owner mentor cannot release the hold ───
-- ─── P4b.10 (REJECTION): a different student cannot even SEE the hold ───
DO $$
DECLARE v_pass9 boolean := false; v_msg9 text := ''; v_pass10 boolean := false; v_msg10 text := ''; v_id uuid; v_seen int;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"b4b00000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_id := public.reserve_slot('b4b00000-0000-0000-0000-0000000000c1', CURRENT_DATE+9, '10:00');
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  -- P4b.09: M2 (non-owner mentor) tries to release
  PERFORM set_config('request.jwt.claims','{"sub":"b4b00000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.release_reserved_booking(v_id);
    v_msg9 := 'non-owner mentor release ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE='42501' AND SQLERRM ILIKE '%cannot release%' THEN v_pass9:=true; v_msg9:='denied: '||SQLERRM;
    ELSE v_msg9:='unexpected ['||SQLSTATE||']: '||SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  -- P4b.10: S2 (different student) tries to SEE it
  PERFORM set_config('request.jwt.claims','{"sub":"b4b00000-0000-0000-0000-0000000000c2","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO v_seen FROM public.bookings WHERE id=v_id;
  v_pass10 := (v_seen=0);
  v_msg10 := 'other student sees '||v_seen||' rows of the hold (expect 0)';
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p4b VALUES ('P4b.09_nonowner_mentor_release_blocked', CASE WHEN v_pass9 THEN 'PASS' ELSE 'FAIL' END, v_msg9);
  INSERT INTO _p4b VALUES ('P4b.10_other_student_cannot_see', CASE WHEN v_pass10 THEN 'PASS' ELSE 'FAIL' END, v_msg10);
END $$;

-- ─── P4b.11 (INVARIANT: 48h auto-release): aged hold expires, fresh hold survives ───
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_aged text; v_fresh text;
BEGIN
  -- Run the cron's UPDATE directly (same statement the scheduled job runs).
  UPDATE public.bookings SET status='expired'
   WHERE status='reserved' AND created_at < now() - interval '48 hours';
  SELECT status INTO v_aged  FROM public.bookings WHERE id='b4b00000-0000-0000-0000-0000000000e1';
  SELECT status INTO v_fresh FROM public.bookings WHERE id='b4b00000-0000-0000-0000-0000000000e2';
  v_pass := (v_aged='expired' AND v_fresh='reserved');
  v_msg := 'aged(49h)='||v_aged||' (expect expired); fresh(0h)='||v_fresh||' (expect reserved)';
  INSERT INTO _p4b VALUES ('P4b.11_48h_auto_release', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P4b.12 (INVARIANT: calendar): a reserved slot shows as taken ───
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_id uuid; v_state text;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"b4b00000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_id := public.reserve_slot('b4b00000-0000-0000-0000-0000000000c1', CURRENT_DATE+10, '10:00');
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  SELECT state INTO v_state FROM public.get_mentor_calendar('b4b00000-0000-0000-0000-00000000000a', CURRENT_DATE, 30)
    WHERE date=CURRENT_DATE+10 AND time_slot='10:00';
  v_pass := (v_state='booked');
  v_msg := 'calendar state for the reserved slot = '||coalesce(v_state,'<not returned>')||' (expect booked)';
  INSERT INTO _p4b VALUES ('P4b.12_calendar_shows_reserved_taken', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P4b.13 (REJECTION, child-safety): cannot reserve for an un-consented minor ───
-- S3 is a regular (passes eligibility) but a Grade-10 minor with no consent →
-- reserve_slot's INSERT trips the BEFORE-INSERT minor-consent gate.
DO $$
DECLARE v_pass boolean := false; v_msg text := '';
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"b4b00000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.reserve_slot('b4b00000-0000-0000-0000-0000000000c3', CURRENT_DATE+12, '10:00');
    v_msg := 'reserve for un-consented minor ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE='P0001' AND SQLERRM ILIKE '%consent%' THEN v_pass:=true; v_msg:='denied: '||SQLERRM;
    ELSE v_msg:='unexpected ['||SQLSTATE||']: '||SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p4b VALUES ('P4b.13_reserve_minor_no_consent_blocked', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── P4b.14 (INVARIANT): a stray capture on an UNCLAIMED hold cannot confirm it ───
-- mark_booking_paid flips ONLY pending_payment→confirmed, so a capture arriving
-- against a still-'reserved' hold leaves it 'reserved' (the slot is never
-- silently sold out from under the claim handshake).
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_id uuid; v_status text;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"b4b00000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_id := public.reserve_slot('b4b00000-0000-0000-0000-0000000000c1', CURRENT_DATE+11, '10:00');
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  -- capture arrives WITHOUT a claim (hold still 'reserved')
  PERFORM public.mark_booking_paid(v_id, 'order_unclaimed', 'pay_unclaimed', 1000, '{}'::jsonb);
  SELECT status INTO v_status FROM public.bookings WHERE id=v_id;
  v_pass := (v_status='reserved');
  v_msg := 'unclaimed hold after stray capture: status='||v_status||' (expect reserved — NOT confirmed)';
  INSERT INTO _p4b VALUES ('P4b.14_unclaimed_hold_not_confirmed_by_capture', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

SELECT test_id, status, detail FROM _p4b ORDER BY test_id;

ROLLBACK;
