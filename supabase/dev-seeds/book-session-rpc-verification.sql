-- ════════════════════════════════════════════════════════════════════════════
-- Phase A1 dev-seed: book_session RPC + INSERT-policy retirement
-- ════════════════════════════════════════════════════════════════════════════
--
-- WHAT THIS FILE IS
--   Runnable rejection + happy-path tests for the new public.book_session()
--   RPC introduced in migration
--     20260523000001_book_session_rpc.sql
--   plus a regression for the simultaneously-dropped INSERT policy on
--   public.bookings (direct INSERT must now be rejected entirely).
--
--   Everything ROLLBACKs at the end — DB state unchanged.
--
-- PASS CRITERIA
--   Each test row ends with status = 'PASS'. Any 'FAIL' means a real
--   attacker could still create bookings via a path the RPC was meant to
--   close (under-priced, unapproved mentor, past slot, unavailable slot,
--   self-booking, direct INSERT, malformed input).
--
-- SUPERSEDES
--   bug-audit-rls-risk4-verification.sql tested the *direct INSERT policy*.
--   That policy is dropped by 20260523000001; this dev-seed exercises the
--   same scenarios through the RPC and adds the cases the old INSERT path
--   could not catch (availability, server-side price, past-slot, self-book,
--   malformed time_slot, double-book race).
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

DO $$
DECLARE
  m_p constant uuid := '11111111-1111-1111-1111-111111110a01';  -- pending
  m_a constant uuid := '11111111-1111-1111-1111-111111110a02';  -- approved
  m_r constant uuid := '11111111-1111-1111-1111-111111110a03';  -- rejected
  m_x constant uuid := '11111111-1111-1111-1111-111111110a04';  -- approved, self-book target
  s_x constant uuid := '22222222-2222-2222-2222-222222220a01';  -- student
  v_future date    := ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date + 7);
  v_past   date    := ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date - 1);
BEGIN
  -- Four mentors + one student. handle_new_user cascades public.mentors /
  -- public.students rows from raw_user_meta_data.role.
  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    created_at, updated_at, instance_id
  ) VALUES
    (m_p, 'authenticated', 'authenticated', 'm_p@a1-bk.local',
     crypt('pw', gen_salt('bf')), now(), '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','mentor','full_name','Pending M','university','T','course','T','year','2nd Year'),
     '', '', '', '', now(), now(), '00000000-0000-0000-0000-000000000000'),
    (m_a, 'authenticated', 'authenticated', 'm_a@a1-bk.local',
     crypt('pw', gen_salt('bf')), now(), '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','mentor','full_name','Approved M','university','T','course','T','year','2nd Year'),
     '', '', '', '', now(), now(), '00000000-0000-0000-0000-000000000000'),
    (m_r, 'authenticated', 'authenticated', 'm_r@a1-bk.local',
     crypt('pw', gen_salt('bf')), now(), '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','mentor','full_name','Rejected M','university','T','course','T','year','2nd Year'),
     '', '', '', '', now(), now(), '00000000-0000-0000-0000-000000000000'),
    (m_x, 'authenticated', 'authenticated', 'm_x@a1-bk.local',
     crypt('pw', gen_salt('bf')), now(), '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','mentor','full_name','SelfBook M','university','T','course','T','year','2nd Year'),
     '', '', '', '', now(), now(), '00000000-0000-0000-0000-000000000000'),
    (s_x, 'authenticated', 'authenticated', 's_x@a1-bk.local',
     crypt('pw', gen_salt('bf')), now(), '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','student','full_name','Student X','phone','+91-0','school','T','grade','Grade 11'),
     '', '', '', '', now(), now(), '00000000-0000-0000-0000-000000000000');

  UPDATE public.mentors SET status = 'approved'                  WHERE id = m_a;
  UPDATE public.mentors SET status = 'approved', price_inr = 2500 WHERE id = m_x;
  UPDATE public.mentors SET status = 'rejected'                  WHERE id = m_r;
  -- m_p stays at default 'pending'

  -- Availability for the slots we will book / probe.
  --   * m_a has 14:00 on both v_future's day AND v_past's day,
  --     so A1.6 (past) hits the past-guard, not the availability check.
  --   * m_a has NO 09:00 on v_future's day, used by A1.5 (unavailable slot).
  INSERT INTO public.mentor_availability (mentor_id, day_of_week, start_hour) VALUES
    (m_a, EXTRACT(ISODOW FROM v_future)::smallint, 14),
    (m_a, EXTRACT(ISODOW FROM v_past)::smallint,   14),
    (m_p, EXTRACT(ISODOW FROM v_future)::smallint, 14),
    (m_r, EXTRACT(ISODOW FROM v_future)::smallint, 14),
    (m_x, EXTRACT(ISODOW FROM v_future)::smallint, 14)
  ON CONFLICT DO NOTHING;
END $$;

CREATE TEMP TABLE _a1_results (
  test_id text PRIMARY KEY,
  status  text NOT NULL,
  detail  text NOT NULL
);

-- ─── A1.1: book PENDING mentor → reject ─────────────────────────────────────
DO $$
DECLARE
  v_pass boolean := false; v_msg text := '';
  v_future date := ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date + 7);
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"22222222-2222-2222-2222-222222220a01","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.book_session(
      '11111111-1111-1111-1111-111111110a01'::uuid, v_future, '14:00');
    v_msg := 'pending-mentor booking ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE '%not available for booking%' THEN
      v_pass := true; v_msg := 'rejected ['||SQLSTATE||']: '||SQLERRM;
    ELSE
      v_msg := 'wrong reject ['||SQLSTATE||']: '||SQLERRM;
    END IF;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _a1_results VALUES ('A1.1_pending_mentor_reject',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── A1.2: book REJECTED mentor → reject ────────────────────────────────────
DO $$
DECLARE
  v_pass boolean := false; v_msg text := '';
  v_future date := ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date + 7);
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"22222222-2222-2222-2222-222222220a01","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.book_session(
      '11111111-1111-1111-1111-111111110a03'::uuid, v_future, '14:00');
    v_msg := 'rejected-mentor booking ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE '%not available for booking%' THEN
      v_pass := true; v_msg := 'rejected ['||SQLSTATE||']: '||SQLERRM;
    ELSE
      v_msg := 'wrong reject ['||SQLSTATE||']: '||SQLERRM;
    END IF;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _a1_results VALUES ('A1.2_rejected_mentor_reject',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── A1.3: malformed _time_slot → reject ────────────────────────────────────
DO $$
DECLARE
  v_pass boolean := false; v_msg text := '';
  v_future date := ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date + 7);
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"22222222-2222-2222-2222-222222220a01","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    -- Phase 4c made :30 a valid grid minute; use an off-grid minute (:45) so this
    -- still exercises the format-regex rejection, not availability.
    PERFORM public.book_session(
      '11111111-1111-1111-1111-111111110a02'::uuid, v_future, '14:45');
    v_msg := 'malformed time_slot ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE '%time_slot must be HH:00%' THEN
      v_pass := true; v_msg := 'rejected ['||SQLSTATE||']: '||SQLERRM;
    ELSE
      v_msg := 'wrong reject ['||SQLSTATE||']: '||SQLERRM;
    END IF;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _a1_results VALUES ('A1.3_malformed_time_slot_reject',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── A1.4: slot NOT in mentor_availability → reject ─────────────────────────
DO $$
DECLARE
  v_pass boolean := false; v_msg text := '';
  v_future date := ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date + 7);
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"22222222-2222-2222-2222-222222220a01","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.book_session(
      '11111111-1111-1111-1111-111111110a02'::uuid, v_future, '09:00');
    v_msg := 'unavailable-slot booking ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE '%not available at this time%' THEN
      v_pass := true; v_msg := 'rejected ['||SQLSTATE||']: '||SQLERRM;
    ELSE
      v_msg := 'wrong reject ['||SQLSTATE||']: '||SQLERRM;
    END IF;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _a1_results VALUES ('A1.4_unavailable_slot_reject',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── A1.5: PAST slot (IST) with availability → reject by past-guard ─────────
DO $$
DECLARE
  v_pass boolean := false; v_msg text := '';
  v_past date := ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date - 1);
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"22222222-2222-2222-2222-222222220a01","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.book_session(
      '11111111-1111-1111-1111-111111110a02'::uuid, v_past, '14:00');
    v_msg := 'past-slot booking ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE '%cannot book a past time slot%' THEN
      v_pass := true; v_msg := 'rejected ['||SQLSTATE||']: '||SQLERRM;
    ELSE
      v_msg := 'wrong reject ['||SQLSTATE||']: '||SQLERRM;
    END IF;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _a1_results VALUES ('A1.5_past_slot_reject',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── A1.6: anon caller → reject ─────────────────────────────────────────────
--          Proves the property without actually switching to the anon role.
--          The earlier role-switching variant of this test caused a hard
--          Postgres connection drop on the Supabase CLI's local-dev
--          Postgres image (CI run 26366818927); replaced with a privilege-
--          table check that is functionally equivalent — book_session
--          must NOT have EXECUTE granted to anon. The privilege table
--          itself is the source of truth for the GRANT/REVOKE semantics
--          that would 42501 a real anon caller.
DO $$
DECLARE
  v_pass boolean := false; v_msg text := '';
  v_anon_can_exec boolean;
BEGIN
  v_anon_can_exec := has_function_privilege(
    'anon',
    -- Phase 3 widened book_session to 5 args; Phase 4c added _duration → 6 args.
    -- has_function_privilege resolves by EXACT signature, so this must name the
    -- current 6-arg form (a positional 3-arg call resolves via defaults, but this
    -- privilege check does not).
    'public.book_session(uuid, date, text, uuid, text, integer)',
    'execute'
  );
  IF v_anon_can_exec THEN
    v_msg := 'anon has EXECUTE on book_session — should be revoked';
  ELSE
    v_pass := true;
    v_msg := 'anon has no EXECUTE on book_session (REVOKE in effect)';
  END IF;
  INSERT INTO _a1_results VALUES ('A1.6_anon_reject',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── A1.7: mentor caller (not a student) → reject ───────────────────────────
DO $$
DECLARE
  v_pass boolean := false; v_msg text := '';
  v_future date := ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date + 7);
BEGIN
  -- m_a is a mentor; calling book_session for m_x (different mentor).
  PERFORM set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-111111110a02","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.book_session(
      '11111111-1111-1111-1111-111111110a04'::uuid, v_future, '14:00');
    v_msg := 'mentor caller booking ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE '%only students may book%' THEN
      v_pass := true; v_msg := 'rejected ['||SQLSTATE||']: '||SQLERRM;
    ELSE
      v_msg := 'wrong reject ['||SQLSTATE||']: '||SQLERRM;
    END IF;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _a1_results VALUES ('A1.7_mentor_caller_reject',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── A1.8: self-book (caller = _mentor_id) → reject ─────────────────────────
DO $$
DECLARE
  v_pass boolean := false; v_msg text := '';
  v_future date := ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date + 7);
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"11111111-1111-1111-1111-111111110a04","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.book_session(
      '11111111-1111-1111-1111-111111110a04'::uuid, v_future, '14:00');
    v_msg := 'self-booking ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE '%cannot book themselves%' THEN
      v_pass := true; v_msg := 'rejected ['||SQLSTATE||']: '||SQLERRM;
    ELSE
      v_msg := 'wrong reject ['||SQLSTATE||']: '||SQLERRM;
    END IF;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _a1_results VALUES ('A1.8_self_book_reject',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── A1.9: direct INSERT INTO bookings as authenticated student → reject ────
--          (regression for the dropped "Students can create own bookings"
--          INSERT policy — there is no INSERT policy left, so any direct
--          INSERT must fail with 42501.)
DO $$
DECLARE
  v_pass boolean := false; v_msg text := '';
  v_future date := ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date + 7);
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"22222222-2222-2222-2222-222222220a01","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    INSERT INTO public.bookings (mentor_id, student_id, date, time_slot, duration, price, status)
    VALUES ('11111111-1111-1111-1111-111111110a02'::uuid,
            '22222222-2222-2222-2222-222222220a01'::uuid,
            v_future, '14:00', 60, 1800, 'confirmed');
    v_msg := 'direct INSERT ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = '42501' THEN
      v_pass := true; v_msg := 'denied ['||SQLSTATE||']: '||SQLERRM;
    ELSE
      v_msg := 'unexpected ['||SQLSTATE||']: '||SQLERRM;
    END IF;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _a1_results VALUES ('A1.9_direct_insert_reject',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── A1.10: HAPPY PATH — approved mentor, future slot, student → succeed ───
--           + assert server-side price (mentor.price_inr default 1800) and
--           returned uuid maps to a row with status='confirmed', duration=60.
DO $$
DECLARE
  v_pass boolean := false; v_msg text := '';
  v_future date := ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date + 7);
  v_id    uuid;
  v_price integer; v_status text; v_duration integer;
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"22222222-2222-2222-2222-222222220a01","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    v_id := public.book_session(
      '11111111-1111-1111-1111-111111110a02'::uuid, v_future, '14:00');
    -- Read back as authenticated student (own row, allowed by SELECT policy).
    SELECT price, status, duration
      INTO v_price, v_status, v_duration
      FROM public.bookings
     WHERE id = v_id;
    IF v_id IS NOT NULL
       AND v_price = 1800
       AND v_status = 'confirmed'
       AND v_duration = 60 THEN
      v_pass := true;
      v_msg := 'happy path: id='||v_id||', price='||v_price||', status='||v_status;
    ELSE
      v_msg := 'returned but row mismatch: id='||coalesce(v_id::text,'NULL')||
               ', price='||coalesce(v_price::text,'NULL')||
               ', status='||coalesce(v_status,'NULL')||
               ', duration='||coalesce(v_duration::text,'NULL');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_msg := 'unexpected denial ['||SQLSTATE||']: '||SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _a1_results VALUES ('A1.10_happy_path_default_price',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── A1.11: double-book same slot → first wins, second rejects ──────────────
--           Note: A1.10 already booked (m_a, v_future, 14:00). A1.11 retries.
DO $$
DECLARE
  v_pass boolean := false; v_msg text := '';
  v_future date := ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date + 7);
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"22222222-2222-2222-2222-222222220a01","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.book_session(
      '11111111-1111-1111-1111-111111110a02'::uuid, v_future, '14:00');
    v_msg := 'double-book ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE '%slot already booked%' THEN
      v_pass := true; v_msg := 'rejected ['||SQLSTATE||']: '||SQLERRM;
    ELSE
      v_msg := 'wrong reject ['||SQLSTATE||']: '||SQLERRM;
    END IF;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _a1_results VALUES ('A1.11_double_book_reject',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- ─── A1.12: out-of-range hour (e.g. 25:00) → reject by malformed regex ─────
--           Locks the tightened regex from migration 20260523000001 against
--           regressions. Without the tighter '^([01][0-9]|2[0-3]):00$' the
--           call would reach availability EXISTS and reject with the wrong
--           "not available at this time" message, creating an oracle.
DO $$
DECLARE
  v_pass boolean := false; v_msg text := '';
  v_future date := ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date + 7);
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"22222222-2222-2222-2222-222222220a01","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.book_session(
      '11111111-1111-1111-1111-111111110a02'::uuid, v_future, '25:00');
    v_msg := 'out-of-range hour ACCEPTED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE '%time_slot must be HH:00%' THEN
      v_pass := true; v_msg := 'rejected (malformed) ['||SQLSTATE||']: '||SQLERRM;
    ELSE
      v_msg := 'wrong reject ['||SQLSTATE||']: '||SQLERRM;
    END IF;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _a1_results VALUES ('A1.12_out_of_range_hour_reject',
    CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

SELECT test_id, status, detail FROM _a1_results ORDER BY test_id;

ROLLBACK;
