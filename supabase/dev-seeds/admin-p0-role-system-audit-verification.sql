-- ════════════════════════════════════════════════════════════════════════════
-- ADMIN P0 dev-seed: role system + immutable audit log
-- Pairs with 20260701000001_admin_p0_role_system_audit.sql.
-- Proves: founder bootstrap → super_admin; is_admin()/is_super_admin()/
-- current_admin_role() are data-driven; non-admin is rejected everywhere;
-- admin_roles + admin_audit_log are locked to direct client access (immutable
-- append-only); grant/revoke work + self-log; last-super-admin revoke guard.
-- BEGIN..ROLLBACK — does not persist.
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- Fixtures: the founder (email matches the bootstrap → auto super_admin via the
-- AFTER INSERT trigger) + a plain student (non-admin). Both carry valid signup
-- metadata so handle_new_user() succeeds.
INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token, email_change, email_change_token_new, created_at, updated_at, instance_id) VALUES
('da000000-0000-0000-0000-0000000000a0','authenticated','authenticated','divitfatehpuria7@gmail.com',crypt('x',gen_salt('bf')),now(),'{"provider":"email"}','{"role":"student","full_name":"Founder","phone":"+91","school":"S","grade":"Grade 12","date_of_birth":"1990-01-01"}','','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
('da000000-0000-0000-0000-0000000000b0','authenticated','authenticated','p0-student@example.com',crypt('x',gen_salt('bf')),now(),'{"provider":"email"}','{"role":"student","full_name":"P0 Student","phone":"+91","school":"S","grade":"Grade 12","date_of_birth":"2010-01-01"}','','','','',now(),now(),'00000000-0000-0000-0000-000000000000')
ON CONFLICT (id) DO NOTHING;

-- Isolation: the lockout-guard tests reason about the GLOBAL super_admin count, so
-- drop any admin_roles that don't belong to these fixtures (e.g. a persisting local
-- browser-admin) to make the seed deterministic. On a clean db-reset DB this is a
-- no-op; either way it is rolled back with the rest of the transaction.
DELETE FROM public.admin_roles
WHERE user_id NOT IN ('da000000-0000-0000-0000-0000000000a0', 'da000000-0000-0000-0000-0000000000b0');

CREATE TEMP TABLE _p0 (test_id text PRIMARY KEY, status text NOT NULL, detail text NOT NULL);

-- P0.01 (happy): founder bootstrapped to super_admin; all three helpers agree.
DO $$
DECLARE v_admin bool; v_super bool; v_role text;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-0000000000a0","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT public.is_admin(), public.is_super_admin(), public.current_admin_role() INTO v_admin, v_super, v_role;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p0 VALUES ('P0.01_founder_bootstrap_super_admin',
    CASE WHEN v_admin AND v_super AND v_role='super_admin' THEN 'PASS' ELSE 'FAIL' END,
    'is_admin='||v_admin||' is_super='||v_super||' role='||coalesce(v_role,'NULL')||' (expect true,true,super_admin)');
END $$;

-- P0.02 (reject): a plain student is not an admin by any helper.
DO $$
DECLARE v_admin bool; v_super bool; v_role text;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-0000000000b0","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT public.is_admin(), public.is_super_admin(), public.current_admin_role() INTO v_admin, v_super, v_role;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p0 VALUES ('P0.02_nonadmin_denied_by_helpers',
    CASE WHEN v_admin=false AND v_super=false AND v_role IS NULL THEN 'PASS' ELSE 'FAIL' END,
    'is_admin='||v_admin||' is_super='||v_super||' role='||coalesce(v_role,'NULL')||' (expect false,false,NULL)');
END $$;

-- P0.03 (reject): non-admin cannot append to the audit log via the RPC.
DO $$
DECLARE v_blocked bool := false;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-0000000000b0","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN PERFORM public.log_admin_action('test.illegal'); EXCEPTION WHEN OTHERS THEN IF SQLERRM ILIKE '%forbidden%' THEN v_blocked := true; END IF; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p0 VALUES ('P0.03_nonadmin_log_forbidden',
    CASE WHEN v_blocked THEN 'PASS' ELSE 'FAIL' END, 'non-admin log_admin_action blocked='||v_blocked);
END $$;

-- P0.04 (reject): non-admin cannot grant roles.
DO $$
DECLARE v_blocked bool := false;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-0000000000b0","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN PERFORM public.admin_grant_role('da000000-0000-0000-0000-0000000000b0','super_admin'); EXCEPTION WHEN OTHERS THEN IF SQLERRM ILIKE '%forbidden%' THEN v_blocked := true; END IF; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p0 VALUES ('P0.04_nonadmin_grant_forbidden',
    CASE WHEN v_blocked THEN 'PASS' ELSE 'FAIL' END, 'non-admin admin_grant_role blocked='||v_blocked);
END $$;

-- P0.05 (reject): non-admin cannot read the audit log.
DO $$
DECLARE v_blocked bool := false;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-0000000000b0","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN PERFORM public.admin_list_audit_log(); EXCEPTION WHEN OTHERS THEN IF SQLERRM ILIKE '%forbidden%' THEN v_blocked := true; END IF; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p0 VALUES ('P0.05_nonadmin_read_audit_forbidden',
    CASE WHEN v_blocked THEN 'PASS' ELSE 'FAIL' END, 'non-admin admin_list_audit_log blocked='||v_blocked);
END $$;

-- P0.06 (lock/immutability): even the super-admin, acting as the `authenticated`
-- ROLE, has NO direct table grant — INSERT/UPDATE/DELETE on the audit log and any
-- access to admin_roles are denied. The only path is the SECURITY DEFINER RPCs.
DO $$
DECLARE v_ins_blocked bool := false; v_upd_blocked bool := false; v_del_blocked bool := false; v_roles_blocked bool := false;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-0000000000a0","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN INSERT INTO public.admin_audit_log(actor_id,action) VALUES (auth.uid(),'x'); EXCEPTION WHEN insufficient_privilege THEN v_ins_blocked := true; WHEN OTHERS THEN v_ins_blocked := true; END;
  BEGIN UPDATE public.admin_audit_log SET action='y'; EXCEPTION WHEN insufficient_privilege THEN v_upd_blocked := true; WHEN OTHERS THEN v_upd_blocked := true; END;
  BEGIN DELETE FROM public.admin_audit_log; EXCEPTION WHEN insufficient_privilege THEN v_del_blocked := true; WHEN OTHERS THEN v_del_blocked := true; END;
  BEGIN PERFORM 1 FROM public.admin_roles LIMIT 1; EXCEPTION WHEN insufficient_privilege THEN v_roles_blocked := true; WHEN OTHERS THEN v_roles_blocked := true; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p0 VALUES ('P0.06_tables_locked_immutable',
    CASE WHEN v_ins_blocked AND v_upd_blocked AND v_del_blocked AND v_roles_blocked THEN 'PASS' ELSE 'FAIL' END,
    'audit ins/upd/del blocked='||v_ins_blocked||'/'||v_upd_blocked||'/'||v_del_blocked||' admin_roles read blocked='||v_roles_blocked);
END $$;

-- P0.07 (happy): super-admin appends an audit row via the RPC and reads it back.
DO $$
DECLARE v_id uuid; v_seen int;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-0000000000a0","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  -- target_label is deliberately a NON-PII descriptor (no minor names in the log).
  SELECT public.log_admin_action('test.ping','student','da000000-0000-0000-0000-0000000000b0','student-fixture','because test', jsonb_build_object('k','v')) INTO v_id;
  SELECT count(*) INTO v_seen FROM public.admin_list_audit_log(100,0,NULL,'test.ping') WHERE id = v_id AND actor_email = 'divitfatehpuria7@gmail.com';
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p0 VALUES ('P0.07_log_and_read_audit',
    CASE WHEN v_id IS NOT NULL AND v_seen=1 THEN 'PASS' ELSE 'FAIL' END,
    'logged_id='||coalesce(v_id::text,'NULL')||' readback_rows='||v_seen||' (expect 1 with actor_email=founder)');
END $$;

-- P0.08 (reject): scoped roles are RESERVED but NOT grantable yet — granting one
-- would silently confer full safeguarding access via the coarse is_admin(). Must
-- be refused, and the would-be grantee must remain a non-admin.
DO $$
DECLARE v_blocked bool := false; v_admin bool;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-0000000000a0","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN PERFORM public.admin_grant_role('da000000-0000-0000-0000-0000000000b0','safeguarding_reviewer');
  EXCEPTION WHEN OTHERS THEN IF SQLERRM ILIKE '%role_not_grantable_yet%' THEN v_blocked := true; END IF; END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-0000000000b0","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT public.is_admin() INTO v_admin;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p0 VALUES ('P0.08_scoped_role_not_grantable',
    CASE WHEN v_blocked AND v_admin=false THEN 'PASS' ELSE 'FAIL' END,
    'scoped grant blocked='||v_blocked||' grantee still non-admin='||(v_admin=false)||' (expect true,true)');
END $$;

-- P0.09 (happy): super-admin grants a SECOND super_admin; grantee becomes
-- super_admin; grant is audited.
DO $$
DECLARE v_admin bool; v_super bool; v_audit int;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-0000000000a0","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.admin_grant_role('da000000-0000-0000-0000-0000000000b0','super_admin');
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-0000000000b0","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT public.is_admin(), public.is_super_admin() INTO v_admin, v_super;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  SELECT count(*) INTO v_audit FROM public.admin_audit_log WHERE action='grant_admin_role' AND target_id='da000000-0000-0000-0000-0000000000b0';
  INSERT INTO _p0 VALUES ('P0.09_grant_super_admin',
    CASE WHEN v_admin AND v_super AND v_audit=1 THEN 'PASS' ELSE 'FAIL' END,
    'grantee is_admin='||v_admin||' is_super='||v_super||' grant_audit_rows='||v_audit||' (expect true,true,1)');
END $$;

-- P0.10 (happy): with TWO super_admins, revoking one is allowed + audited.
DO $$
DECLARE v_admin bool; v_audit int;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-0000000000a0","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.admin_revoke_role('da000000-0000-0000-0000-0000000000b0','super_admin');
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-0000000000b0","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT public.is_admin() INTO v_admin;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  SELECT count(*) INTO v_audit FROM public.admin_audit_log WHERE action='revoke_admin_role' AND target_id='da000000-0000-0000-0000-0000000000b0';
  INSERT INTO _p0 VALUES ('P0.10_revoke_one_of_two_super_admins',
    CASE WHEN v_admin=false AND v_audit=1 THEN 'PASS' ELSE 'FAIL' END,
    'grantee is_admin_after_revoke='||v_admin||' revoke_audit_rows='||v_audit||' (expect false,1)');
END $$;

-- P0.11 (guard): the LAST active super_admin (the founder, now sole super_admin
-- again) cannot revoke itself — console-lockout guard.
DO $$
DECLARE v_blocked bool := false; v_admin bool;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-0000000000a0","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN PERFORM public.admin_revoke_role('da000000-0000-0000-0000-0000000000a0','super_admin'); EXCEPTION WHEN OTHERS THEN IF SQLERRM ILIKE '%last_super_admin%' THEN v_blocked := true; END IF; END;
  SELECT public.is_admin() INTO v_admin;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p0 VALUES ('P0.11_cannot_revoke_last_super_admin',
    CASE WHEN v_blocked AND v_admin THEN 'PASS' ELSE 'FAIL' END,
    'revoke blocked='||v_blocked||' founder still admin='||v_admin||' (expect true,true)');
END $$;

-- P0.12 (guard target-specificity): revoking super_admin from a user who does NOT
-- hold it is a harmless SILENT no-op even when only one super_admin exists — it
-- must NOT raise cannot_revoke_last_super_admin and must NOT write an audit row.
DO $$
DECLARE v_err bool := false; v_before int; v_after int;
BEGIN
  SELECT count(*) INTO v_before FROM public.admin_audit_log WHERE action='revoke_admin_role';
  PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-0000000000a0","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN PERFORM public.admin_revoke_role('da000000-0000-0000-0000-0000000000b0','super_admin'); EXCEPTION WHEN OTHERS THEN v_err := true; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  SELECT count(*) INTO v_after FROM public.admin_audit_log WHERE action='revoke_admin_role';
  INSERT INTO _p0 VALUES ('P0.12_noop_revoke_is_silent',
    CASE WHEN v_err=false AND v_after=v_before THEN 'PASS' ELSE 'FAIL' END,
    'noop revoke raised='||v_err||' (expect false); audit rows added='||(v_after-v_before)||' (expect 0)');
END $$;

SELECT test_id, status, detail FROM _p0 ORDER BY test_id;
ROLLBACK;
