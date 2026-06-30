-- ════════════════════════════════════════════════════════════════════════════
-- C dev-seed: admin actions — approve / reject(reason) / clear_re_review / list
-- Pairs with 20260604000030_c_admin_actions.sql.
-- Proves the admin gate, the state changes, reject-reason storage, re_review
-- clear, and the add-request list reader. (Email dispatch is best-effort via
-- notify_event_email → net.http_post; not asserted here.)
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- admin (is_admin() matches this email), a mentor, a non-admin context.
INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token, email_change, email_change_token_new, created_at, updated_at, instance_id) VALUES
('dc000000-0000-0000-0000-0000000000a0','authenticated','authenticated','divitfatehpuria7@gmail.com',crypt('x',gen_salt('bf')),now(),'{"provider":"email"}','{"role":"student","full_name":"Admin","phone":"+91","school":"S","grade":"Grade 12","date_of_birth":"1990-01-01"}','','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
('dc000000-0000-0000-0000-0000000000b0','authenticated','authenticated','c-mentor@example.com',crypt('x',gen_salt('bf')),now(),'{"provider":"email"}','{"role":"mentor","full_name":"C Mentor","university":"U","course":"C","year":"3rd Year","date_of_birth":"2000-01-01"}','','','','',now(),now(),'00000000-0000-0000-0000-000000000000')
ON CONFLICT (id) DO NOTHING;
UPDATE public.mentors SET status='pending' WHERE id='dc000000-0000-0000-0000-0000000000b0';
INSERT INTO public.ref_add_requests (id, kind, proposed_name, requested_by, status)
VALUES ('dc000000-0000-0000-0000-0000000000e0','university','New Test University','dc000000-0000-0000-0000-0000000000a0','pending')
ON CONFLICT (id) DO NOTHING;

CREATE TEMP TABLE _c (test_id text PRIMARY KEY, status text NOT NULL, detail text NOT NULL);

-- helper to act as admin / non-admin
-- C.01: admin approve_mentor → approved + verified_at + re_review cleared
DO $$
DECLARE v_status text; v_verified timestamptz; v_rr bool;
BEGIN
  -- arm re_review_pending first (service_role) to prove approve clears it
  UPDATE public.mentors SET re_review_pending=true WHERE id='dc000000-0000-0000-0000-0000000000b0';
  PERFORM set_config('request.jwt.claims','{"sub":"dc000000-0000-0000-0000-0000000000a0","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.approve_mentor('dc000000-0000-0000-0000-0000000000b0');
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  SELECT status::text, verified_at, re_review_pending INTO v_status, v_verified, v_rr FROM public.mentors WHERE id='dc000000-0000-0000-0000-0000000000b0';
  INSERT INTO _c VALUES ('C.01_approve_mentor',
    CASE WHEN v_status='approved' AND v_verified IS NOT NULL AND v_rr=false THEN 'PASS' ELSE 'FAIL' END,
    'status='||v_status||' verified_at_set='||(v_verified IS NOT NULL)::text||' re_review='||v_rr||' (expect approved,true,false)');
END $$;

-- C.02: admin reject_mentor(reason) → rejected + reason stored + verified cleared
DO $$
DECLARE v_status text; v_notes text; v_verified timestamptz;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"dc000000-0000-0000-0000-0000000000a0","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.reject_mentor('dc000000-0000-0000-0000-0000000000b0', 'enrollment letter unreadable');
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  SELECT status::text, verification_notes, verified_at INTO v_status, v_notes, v_verified FROM public.mentors WHERE id='dc000000-0000-0000-0000-0000000000b0';
  INSERT INTO _c VALUES ('C.02_reject_mentor_with_reason',
    CASE WHEN v_status='rejected' AND v_notes='enrollment letter unreadable' AND v_verified IS NULL THEN 'PASS' ELSE 'FAIL' END,
    'status='||v_status||' notes='||coalesce(v_notes,'∅')||' verified_at='||coalesce(v_verified::text,'NULL'));
END $$;

-- C.03: admin_clear_re_review → re_review_pending false
DO $$
DECLARE v_rr bool;
BEGIN
  UPDATE public.mentors SET status='approved', re_review_pending=true WHERE id='dc000000-0000-0000-0000-0000000000b0';
  PERFORM set_config('request.jwt.claims','{"sub":"dc000000-0000-0000-0000-0000000000a0","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.admin_clear_re_review('dc000000-0000-0000-0000-0000000000b0');
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  SELECT re_review_pending INTO v_rr FROM public.mentors WHERE id='dc000000-0000-0000-0000-0000000000b0';
  INSERT INTO _c VALUES ('C.03_admin_clear_re_review',
    CASE WHEN v_rr=false THEN 'PASS' ELSE 'FAIL' END, 're_review_pending after clear='||v_rr||' (expect false)');
END $$;

-- C.04: non-admin approve_mentor → forbidden
DO $$
DECLARE v_blocked bool := false;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"dc000000-0000-0000-0000-0000000000b0","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN PERFORM public.approve_mentor('dc000000-0000-0000-0000-0000000000b0'); EXCEPTION WHEN OTHERS THEN IF SQLERRM ILIKE '%forbidden%' THEN v_blocked := true; END IF; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _c VALUES ('C.04_nonadmin_approve_forbidden',
    CASE WHEN v_blocked THEN 'PASS' ELSE 'FAIL' END, 'non-admin approve blocked='||v_blocked);
END $$;

-- C.05: add-request list — admin sees pending; non-admin forbidden
DO $$
DECLARE v_seen int; v_blocked bool := false;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"dc000000-0000-0000-0000-0000000000a0","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO v_seen FROM public.admin_list_add_requests('pending') WHERE id='dc000000-0000-0000-0000-0000000000e0';
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"sub":"dc000000-0000-0000-0000-0000000000b0","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN PERFORM public.admin_list_add_requests('pending'); EXCEPTION WHEN OTHERS THEN IF SQLERRM ILIKE '%forbidden%' THEN v_blocked := true; END IF; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _c VALUES ('C.05_add_request_list_admin_only',
    CASE WHEN v_seen=1 AND v_blocked THEN 'PASS' ELSE 'FAIL' END,
    'admin sees pending request='||v_seen||' (expect 1); non-admin blocked='||v_blocked);
END $$;

SELECT test_id, status, detail FROM _c ORDER BY test_id;
ROLLBACK;
