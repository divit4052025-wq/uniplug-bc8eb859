-- ════════════════════════════════════════════════════════════════════════════
-- Consent column-lock dev-seed (child-safety) — hardened
-- Pairs with 20260604000060_consent_column_lock.sql.
-- Proves a student CANNOT self-grant parental consent by ANY path:
--   • direct UPDATE of parental_consent_at / token → permission denied (privilege)
--   • READING their own consent token → permission denied (so it can't be replayed)
--   • REPLAYING record_parental_consent as the logged-in student → rejected
-- while the legitimate parent flow (anon + token) + admin revoke still work, and
-- both the booking gate and the messaging gate still hold. Plus no collateral
-- damage to ordinary student profile edits / consent-status reads.
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token, email_change, email_change_token_new, created_at, updated_at, instance_id) VALUES
('c1000000-0000-0000-0000-0000000000a0','authenticated','authenticated','divitfatehpuria7@gmail.com',crypt('x',gen_salt('bf')),now(),'{"provider":"email"}','{"role":"student","full_name":"Admin","phone":"+91","school":"S","grade":"Grade 12","date_of_birth":"1990-01-01"}','','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
('c1000000-0000-0000-0000-0000000000b0','authenticated','authenticated','cl-m@example.com',crypt('x',gen_salt('bf')),now(),'{"provider":"email"}','{"role":"mentor","full_name":"CL Mentor","university":"U","course":"C","year":"3rd Year","date_of_birth":"2000-01-01"}','','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
('c1000000-0000-0000-0000-0000000000c0','authenticated','authenticated','cl-minor@example.com',crypt('x',gen_salt('bf')),now(),'{"provider":"email"}','{"role":"student","full_name":"CL Minor","phone":"+91","school":"S","grade":"Grade 10","date_of_birth":"2012-01-01","parent_email":"parent@example.com"}','','','','',now(),now(),'00000000-0000-0000-0000-000000000000')
ON CONFLICT (id) DO NOTHING;
UPDATE public.mentors SET status='approved', price_inr=1000 WHERE id='c1000000-0000-0000-0000-0000000000b0';
INSERT INTO public.mentor_availability (mentor_id, day_of_week, start_hour)
SELECT 'c1000000-0000-0000-0000-0000000000b0'::uuid, d::smallint, h FROM generate_series(1,7) d, unnest(ARRAY[10,11]::smallint[]) h
ON CONFLICT DO NOTHING;

CREATE TEMP TABLE _cl (test_id text PRIMARY KEY, status text NOT NULL, detail text NOT NULL);

-- CL.01 (REJECT): student direct UPDATE of parental_consent_at → privilege denied; value stays NULL
DO $$
DECLARE v_blocked bool := false; v_at timestamptz;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"c1000000-0000-0000-0000-0000000000c0","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    UPDATE public.students SET parental_consent_at = now() WHERE id = 'c1000000-0000-0000-0000-0000000000c0';
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := true;
           WHEN OTHERS THEN IF SQLERRM ILIKE '%permission denied%' THEN v_blocked := true; END IF;
  END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  SELECT parental_consent_at INTO v_at FROM public.students WHERE id='c1000000-0000-0000-0000-0000000000c0';
  INSERT INTO _cl VALUES ('CL.01_self_update_consent_at_denied',
    CASE WHEN v_blocked AND v_at IS NULL THEN 'PASS' ELSE 'FAIL' END,
    'direct UPDATE denied='||v_blocked||'; consent_at='||coalesce(v_at::text,'NULL')||' (expect true, NULL)');
END $$;

-- CL.02 (REJECT): student direct UPDATE of the token → privilege denied
DO $$
DECLARE v_blocked bool := false;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"c1000000-0000-0000-0000-0000000000c0","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    UPDATE public.students SET parental_consent_token = gen_random_uuid() WHERE id = 'c1000000-0000-0000-0000-0000000000c0';
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := true;
           WHEN OTHERS THEN IF SQLERRM ILIKE '%permission denied%' THEN v_blocked := true; END IF;
  END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _cl VALUES ('CL.02_self_update_token_denied',
    CASE WHEN v_blocked THEN 'PASS' ELSE 'FAIL' END, 'direct token UPDATE denied='||v_blocked);
END $$;

-- CL.03 (REJECT, the read half): student cannot READ their own consent token
DO $$
DECLARE v_blocked bool := false; v_tok uuid;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"c1000000-0000-0000-0000-0000000000c0","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    SELECT parental_consent_token INTO v_tok FROM public.students WHERE id = 'c1000000-0000-0000-0000-0000000000c0';
  EXCEPTION WHEN insufficient_privilege THEN v_blocked := true;
           WHEN OTHERS THEN IF SQLERRM ILIKE '%permission denied%' THEN v_blocked := true; END IF;
  END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _cl VALUES ('CL.03_student_cannot_read_token',
    CASE WHEN v_blocked THEN 'PASS' ELSE 'FAIL' END, 'token SELECT denied to student='||v_blocked||' (closes the replay)');
END $$;

-- CL.04 (REJECT, the write half / replay): even handed the token, a LOGGED-IN
-- student calling record_parental_consent for themselves is rejected; consent stays NULL.
DO $$
DECLARE v_tok uuid; v_ret uuid; v_at timestamptz;
BEGIN
  SELECT parental_consent_token INTO v_tok FROM public.students WHERE id='c1000000-0000-0000-0000-0000000000c0';  -- as service_role (test only)
  PERFORM set_config('request.jwt.claims','{"sub":"c1000000-0000-0000-0000-0000000000c0","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_ret := public.record_parental_consent(v_tok);
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  SELECT parental_consent_at INTO v_at FROM public.students WHERE id='c1000000-0000-0000-0000-0000000000c0';
  INSERT INTO _cl VALUES ('CL.04_student_replay_rejected',
    CASE WHEN v_ret IS NULL AND v_at IS NULL THEN 'PASS' ELSE 'FAIL' END,
    'logged-in student replay ret='||coalesce(v_ret::text,'NULL')||' consent_at='||coalesce(v_at::text,'NULL')||' (expect NULL, NULL)');
END $$;

-- CL.05 (HAPPY): the legitimate parent flow — anon caller + token — still works
DO $$
DECLARE v_tok uuid; v_ret uuid; v_at timestamptz; v_records int;
BEGIN
  SELECT parental_consent_token INTO v_tok FROM public.students WHERE id='c1000000-0000-0000-0000-0000000000c0';
  PERFORM set_config('request.jwt.claims','{"role":"anon"}', true);
  EXECUTE 'SET LOCAL ROLE anon';
  v_ret := public.record_parental_consent(v_tok);
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  SELECT parental_consent_at INTO v_at FROM public.students WHERE id='c1000000-0000-0000-0000-0000000000c0';
  SELECT count(*) INTO v_records FROM public.parental_consent_records WHERE student_id='c1000000-0000-0000-0000-0000000000c0';
  INSERT INTO _cl VALUES ('CL.05_parent_anon_flow_still_works',
    CASE WHEN v_ret='c1000000-0000-0000-0000-0000000000c0' AND v_at IS NOT NULL AND v_records=1 THEN 'PASS' ELSE 'FAIL' END,
    'anon record ret_ok='||(v_ret='c1000000-0000-0000-0000-0000000000c0')::text||' consent_set='||(v_at IS NOT NULL)::text||' audit='||v_records);
END $$;

-- CL.06 (HAPPY): admin mark_consent_revoked still works (owner-DEFINER write)
DO $$
DECLARE v_at timestamptz; v_tok uuid;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"c1000000-0000-0000-0000-0000000000a0","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.mark_consent_revoked('c1000000-0000-0000-0000-0000000000c0');
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  SELECT parental_consent_at, parental_consent_token INTO v_at, v_tok FROM public.students WHERE id='c1000000-0000-0000-0000-0000000000c0';
  INSERT INTO _cl VALUES ('CL.06_admin_revoke_still_works',
    CASE WHEN v_at IS NULL AND v_tok IS NULL THEN 'PASS' ELSE 'FAIL' END,
    'after admin revoke consent_at='||coalesce(v_at::text,'NULL')||' token='||coalesce(v_tok::text,'NULL'));
END $$;

-- CL.07 (NO COLLATERAL): student can still edit a non-consent column AND read their consent STATUS
DO $$
DECLARE v_edit_ok bool := false; v_bio text; v_read_at_ok bool := false; v_seen_at timestamptz;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"c1000000-0000-0000-0000-0000000000c0","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN UPDATE public.students SET bio='I love physics' WHERE id='c1000000-0000-0000-0000-0000000000c0'; v_edit_ok := true; EXCEPTION WHEN OTHERS THEN v_edit_ok := false; END;
  BEGIN SELECT parental_consent_at INTO v_seen_at FROM public.students WHERE id='c1000000-0000-0000-0000-0000000000c0'; v_read_at_ok := true; EXCEPTION WHEN OTHERS THEN v_read_at_ok := false; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  SELECT bio INTO v_bio FROM public.students WHERE id='c1000000-0000-0000-0000-0000000000c0';
  INSERT INTO _cl VALUES ('CL.07_no_collateral_damage',
    CASE WHEN v_edit_ok AND v_bio='I love physics' AND v_read_at_ok THEN 'PASS' ELSE 'FAIL' END,
    'bio edit ok='||v_edit_ok||'; can read consent_at status='||v_read_at_ok);
END $$;

-- CL.08 (PARITY): consent is NULL (every self-set attempt failed) → both gates hold
DO $$
DECLARE v_book_blocked bool := false; v_msg jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"c1000000-0000-0000-0000-0000000000c0","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN PERFORM public.book_session('c1000000-0000-0000-0000-0000000000b0', CURRENT_DATE+7, '10:00');
  EXCEPTION WHEN OTHERS THEN IF SQLERRM ILIKE '%consent%' THEN v_book_blocked := true; END IF; END;
  v_msg := public.send_message('c1000000-0000-0000-0000-0000000000b0','hello mentor');
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _cl VALUES ('CL.08_both_gates_hold',
    CASE WHEN v_book_blocked AND (v_msg->>'reason')='consent_required' THEN 'PASS' ELSE 'FAIL' END,
    'booking consent-blocked='||v_book_blocked||'; messaging='||v_msg::text);
END $$;

SELECT test_id, status, detail FROM _cl ORDER BY test_id;
ROLLBACK;
