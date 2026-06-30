-- ════════════════════════════════════════════════════════════════════════════
-- Phase G4 dev-seed: safeguarding for minors
-- ════════════════════════════════════════════════════════════════════════════
--
-- Functional rejection + happy-path tests for the migration
--   20260523000008_g4_safeguarding_minors.sql
--
-- All inside BEGIN..ROLLBACK so live state is unaffected. The booking
-- attempts use book_session (the only INSERT path) so the trigger
-- fires through the same code path real users hit.
--
-- PASS CRITERIA
--   Every row status='PASS'. Any FAIL means a minor could either
--   book without parental consent (security regression) OR a
--   consenting setup got blocked (UX regression).
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

DO $$
DECLARE
  m_a constant uuid := '11111111-1111-1111-1111-1111111104a4';  -- approved mentor
  s_minor    constant uuid := '22222222-2222-2222-2222-222222220404';  -- student, DOB makes them 16
  s_minor_ok constant uuid := '22222222-2222-2222-2222-222222220405';  -- minor with consent on file
  s_adult    constant uuid := '22222222-2222-2222-2222-222222220406';  -- adult student (over 18)
  s_grandfathered constant uuid := '22222222-2222-2222-2222-222222220407';  -- DOB NULL
  v_token uuid := gen_random_uuid();
  v_future date := ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date + 7);
BEGIN
  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    created_at, updated_at, instance_id
  ) VALUES
    (m_a, 'authenticated', 'authenticated', 'm_a@g4-mn.local',
     crypt('pw', gen_salt('bf')), now(), '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','mentor','full_name','Approved M','university','T','course','T','year','2nd Year','date_of_birth','2000-01-01'),
     '', '', '', '', now(), now(), '00000000-0000-0000-0000-000000000000'),
    (s_minor, 'authenticated', 'authenticated', 's_min@g4-mn.local',
     crypt('pw', gen_salt('bf')), now(), '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','student','full_name','Minor S','phone','+91-0','school','T','grade','Grade 11'),
     '', '', '', '', now(), now(), '00000000-0000-0000-0000-000000000000'),
    (s_minor_ok, 'authenticated', 'authenticated', 's_minok@g4-mn.local',
     crypt('pw', gen_salt('bf')), now(), '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','student','full_name','Minor With Consent','phone','+91-0','school','T','grade','Grade 11'),
     '', '', '', '', now(), now(), '00000000-0000-0000-0000-000000000000'),
    (s_adult, 'authenticated', 'authenticated', 's_adt@g4-mn.local',
     crypt('pw', gen_salt('bf')), now(), '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','student','full_name','Adult S','phone','+91-0','school','T','grade','Grade 12'),
     '', '', '', '', now(), now(), '00000000-0000-0000-0000-000000000000'),
    (s_grandfathered, 'authenticated', 'authenticated', 's_grf@g4-mn.local',
     crypt('pw', gen_salt('bf')), now(), '{"provider":"email"}'::jsonb,
     jsonb_build_object('role','student','full_name','Grandfathered S','phone','+91-0','school','T','grade','Grade 11'),
     '', '', '', '', now(), now(), '00000000-0000-0000-0000-000000000000');

  UPDATE public.mentors SET status = 'approved' WHERE id = m_a;
  INSERT INTO public.mentor_availability (mentor_id, day_of_week, start_hour)
  VALUES (m_a, EXTRACT(ISODOW FROM v_future)::smallint, 14) ON CONFLICT DO NOTHING;

  -- Set DOBs: minor = 16 years ago, minor_ok = 16y + consent, adult = 25y, grandfathered = NULL
  UPDATE public.students SET date_of_birth = current_date - interval '16 years' WHERE id = s_minor;
  UPDATE public.students SET date_of_birth = current_date - interval '16 years', parental_consent_at = now() WHERE id = s_minor_ok;
  UPDATE public.students SET date_of_birth = current_date - interval '25 years' WHERE id = s_adult;
  UPDATE public.students SET parental_consent_token = v_token WHERE id = s_minor;
  -- s_grandfathered: DOB stays NULL on purpose
END $$;

CREATE TEMP TABLE _g4_results (test_id text PRIMARY KEY, status text NOT NULL, detail text NOT NULL);

-- G4.1: minor without consent → book_session rejects via trigger
DO $$
DECLARE v_pass boolean := false; v_msg text := '';
  v_future date := ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date + 7);
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222220404","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.book_session('11111111-1111-1111-1111-1111111104a4'::uuid, v_future, '14:00');
    v_msg := 'minor without consent ACCEPTED — security regression';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE '%parental consent required%' THEN v_pass := true; v_msg := 'rejected ['||SQLSTATE||']: '||SQLERRM;
    ELSE v_msg := 'wrong reject ['||SQLSTATE||']: '||SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _g4_results VALUES ('G4.1_minor_no_consent_reject', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- G4.2: minor WITH consent → book_session succeeds
DO $$
DECLARE v_pass boolean := false; v_msg text := '';
  v_future date := ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date + 7);
  v_id uuid;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222220405","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    v_id := public.book_session('11111111-1111-1111-1111-1111111104a4'::uuid, v_future, '14:00');
    IF v_id IS NOT NULL THEN v_pass := true; v_msg := 'consenting minor booking succeeded, id='||v_id;
    ELSE v_msg := 'booking returned NULL id'; END IF;
  EXCEPTION WHEN OTHERS THEN
    v_msg := 'unexpected denial ['||SQLSTATE||']: '||SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _g4_results VALUES ('G4.2_minor_with_consent_accept', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- G4.3: adult (>= 18) → book_session succeeds (different mentor slot to avoid double-book)
DO $$
DECLARE v_pass boolean := false; v_msg text := '';
  v_future_15 date := ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date + 14);
  v_id uuid;
BEGIN
  -- Seed mentor availability for the further-out day too
  INSERT INTO public.mentor_availability (mentor_id, day_of_week, start_hour)
  VALUES ('11111111-1111-1111-1111-1111111104a4'::uuid, EXTRACT(ISODOW FROM v_future_15)::smallint, 14) ON CONFLICT DO NOTHING;
  PERFORM set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222220406","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    v_id := public.book_session('11111111-1111-1111-1111-1111111104a4'::uuid, v_future_15, '14:00');
    IF v_id IS NOT NULL THEN v_pass := true; v_msg := 'adult booking succeeded';
    ELSE v_msg := 'booking returned NULL'; END IF;
  EXCEPTION WHEN OTHERS THEN
    v_msg := 'unexpected denial ['||SQLSTATE||']: '||SQLERRM;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _g4_results VALUES ('G4.3_adult_no_consent_needed', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- G4.4: NULL-DOB student → book_session BLOCKED [P0001] (fail-closed).
--       SUPERSEDED ASSUMPTION: G4 originally grandfathered NULL-DOB rows
--       (booking allowed, "the UI gate will catch this"). The 2026-05-30
--       parental-consent migration changed the gate to FAIL CLOSED on unknown
--       age — a NULL DOB now requires consent and cannot book. This case is
--       inverted accordingly (s_grandfathered is DOB NULL, Grade 11).
DO $$
DECLARE v_pass boolean := false; v_msg text := '';
  v_future_21 date := ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date + 21);
BEGIN
  INSERT INTO public.mentor_availability (mentor_id, day_of_week, start_hour)
  VALUES ('11111111-1111-1111-1111-1111111104a4'::uuid, EXTRACT(ISODOW FROM v_future_21)::smallint, 14) ON CONFLICT DO NOTHING;
  PERFORM set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222220407","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.book_session('11111111-1111-1111-1111-1111111104a4'::uuid, v_future_21, '14:00');
    v_msg := 'NULL-DOB booking ACCEPTED — fail-closed regression';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE '%parental consent required%' THEN v_pass := true; v_msg := 'rejected ['||SQLSTATE||']: '||SQLERRM;
    ELSE v_msg := 'wrong reject ['||SQLSTATE||']: '||SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _g4_results VALUES ('G4.4_null_dob_fails_closed', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- G4.5: record_parental_consent with valid token → returns student id + sets timestamp
--       Split into TWO assertions: (a) anon HAS EXECUTE on the fn (so a
--       real parent with the link can call it without being signed in),
--       (b) the fn logic correctly resolves a valid token. We call as
--       service_role rather than SET LOCAL ROLE anon to avoid the local
--       Postgres image crash pattern from Phase B A1.6 — the function's
--       logic does not depend on the caller's role (it dispatches by
--       token alone), so the service_role call is functionally equivalent.
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_returned uuid; v_token uuid; v_consent_at timestamptz;
  v_anon_can_call boolean;
BEGIN
  v_anon_can_call := has_function_privilege('anon', 'public.record_parental_consent(uuid)', 'execute');
  IF NOT v_anon_can_call THEN
    v_msg := 'anon lacks EXECUTE on record_parental_consent — parents could not use the consent link';
  ELSE
    SELECT parental_consent_token INTO v_token FROM public.students WHERE id = '22222222-2222-2222-2222-222222220404'::uuid;
    BEGIN
      v_returned := public.record_parental_consent(v_token);
    EXCEPTION WHEN OTHERS THEN
      v_msg := 'unexpected error ['||SQLSTATE||']: '||SQLERRM;
    END;
    IF v_msg = '' THEN
      SELECT parental_consent_at INTO v_consent_at FROM public.students WHERE id = '22222222-2222-2222-2222-222222220404'::uuid;
      IF v_returned = '22222222-2222-2222-2222-222222220404'::uuid AND v_consent_at IS NOT NULL THEN
        v_pass := true; v_msg := 'consent recorded; anon also has EXECUTE per privilege table';
      ELSE
        v_msg := 'returned '||coalesce(v_returned::text,'NULL')||' consent_at='||coalesce(v_consent_at::text,'NULL');
      END IF;
    END IF;
  END IF;
  INSERT INTO _g4_results VALUES ('G4.5_record_consent_happy_path', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- G4.6: record_parental_consent with bogus token → returns NULL, no error
--       Calling as service_role (same defensive refactor as G4.5); the
--       function's bogus-token branch returns NULL regardless of caller
--       role. The anon-has-EXECUTE assertion is already proven in G4.5
--       so we don't repeat it here.
DO $$
DECLARE v_pass boolean := false; v_msg text := ''; v_returned uuid;
BEGIN
  BEGIN
    v_returned := public.record_parental_consent('00000000-0000-0000-0000-000000000000'::uuid);
    IF v_returned IS NULL THEN v_pass := true; v_msg := 'bogus token returned NULL (no error, clean)';
    ELSE v_msg := 'unexpected uuid: '||v_returned; END IF;
  EXCEPTION WHEN OTHERS THEN
    v_msg := 'unexpected throw ['||SQLSTATE||']: '||SQLERRM;
  END;
  INSERT INTO _g4_results VALUES ('G4.6_record_consent_bogus_token', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

-- G4.7: mark_consent_revoked as non-admin → forbidden
DO $$
DECLARE v_pass boolean := false; v_msg text := '';
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222220404","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.mark_consent_revoked('22222222-2222-2222-2222-222222220404'::uuid);
    v_msg := 'non-admin call ACCEPTED — security regression';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE '%forbidden%' THEN v_pass := true; v_msg := 'rejected ['||SQLSTATE||']: '||SQLERRM;
    ELSE v_msg := 'wrong reject ['||SQLSTATE||']: '||SQLERRM; END IF;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  INSERT INTO _g4_results VALUES ('G4.7_revoke_non_admin_reject', CASE WHEN v_pass THEN 'PASS' ELSE 'FAIL' END, v_msg);
END $$;

SELECT test_id, status, detail FROM _g4_results ORDER BY test_id;

ROLLBACK;
