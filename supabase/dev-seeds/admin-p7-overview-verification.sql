-- ════════════════════════════════════════════════════════════════════════════
-- ADMIN P7 dev-seed: overview stats.
-- Pairs with 20260701000008_admin_p7_overview.sql.
-- Proves: is_admin gate; each aggregate count moves by exactly the fixture delta.
-- Baseline is captured with ONLY the admin present, then ALL fixtures are added, so
-- every bucket shows a clean +1 (delta-vs-baseline, robust to persisting data).
-- Distinct students back consent-pending vs fallout so they don't cannibalise.
-- BEGIN..ROLLBACK — does not persist.
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;
DELETE FROM auth.users WHERE email = 'divitfatehpuria7@gmail.com' AND id <> 'da000000-0000-0000-0000-0000000000a0';  -- CI-compose: drop admin-fixture founder-email row (rolled back)
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ONLY the founder admin exists at baseline time.
INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token, email_change, email_change_token_new, created_at, updated_at, instance_id) VALUES
('da000000-0000-0000-0000-0000000000a0','authenticated','authenticated','divitfatehpuria7@gmail.com',crypt('x',gen_salt('bf')),now(),'{"provider":"email"}','{"role":"student","full_name":"Founder","phone":"+91","school":"S","grade":"Grade 12","date_of_birth":"1990-01-01"}','','','','',now(),now(),'00000000-0000-0000-0000-000000000000')
ON CONFLICT (id) DO NOTHING;
DELETE FROM public.admin_roles WHERE user_id <> 'da000000-0000-0000-0000-0000000000a0';

CREATE TEMP TABLE _p7 (test_id text PRIMARY KEY, status text NOT NULL, detail text NOT NULL);

-- baseline (as admin) — jwt-claims only, no role switch (is_admin reads auth.uid()).
SELECT set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-0000000000a0"}', true);
CREATE TEMP TABLE _b7 AS SELECT * FROM public.admin_overview_stats();
SELECT set_config('request.jwt.claims','{"role":"service_role"}', true);

-- ── all fixtures created AFTER baseline (each bumps exactly one bucket) ──────
INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token, email_change, email_change_token_new, created_at, updated_at, instance_id) VALUES
('da000000-0000-0000-0000-000000000701','authenticated','authenticated','p7-pending@example.com',crypt('x',gen_salt('bf')),now(),'{"provider":"email"}','{"role":"student","full_name":"Tara Pending","phone":"+91 90000 70001","school":"DPS","grade":"Grade 8","date_of_birth":"2012-01-01","parent_email":"tara.parent@example.com","parent_phone":"+91 90000 70002"}','','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
('da000000-0000-0000-0000-000000000703','authenticated','authenticated','p7-fallout@example.com',crypt('x',gen_salt('bf')),now(),'{"provider":"email"}','{"role":"student","full_name":"Dev Fallout","phone":"+91 90000 70003","school":"DPS","grade":"Grade 8","date_of_birth":"2011-01-01","parent_email":"dev.parent@example.com","parent_phone":"+91 90000 70004"}','','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
('da000000-0000-0000-0000-000000000702','authenticated','authenticated','p7-mentor@example.com',crypt('x',gen_salt('bf')),now(),'{"provider":"email"}','{"role":"mentor","full_name":"Sameer Overview","university":"IIT","course":"CS","year":"3rd Year","date_of_birth":"1999-01-01"}','','','','',now(),now(),'00000000-0000-0000-0000-000000000000')
ON CONFLICT (id) DO NOTHING;
-- +1 pending_verifications (new mentor; force pending explicitly)
UPDATE public.mentors SET status='pending' WHERE id='da000000-0000-0000-0000-000000000702';
-- p701 = consent-pending minor: no consent, NO revocation, NOT moderated => +1 consent_pending
-- +1 open safeguarding (a message_report, no triage row => 'new')
INSERT INTO public.message_reports (id, conversation_id, reporter_id, reported_user_id, reason)
VALUES ('da000000-0000-0000-0000-000000000711','da000000-0000-0000-0000-000000000712','da000000-0000-0000-0000-000000000702','da000000-0000-0000-0000-000000000703','overview test');
-- +1 consent fallout (unresolved booking-level revocation event) for p703 (=> p703 is 'revoked', not 'pending')
INSERT INTO public.consent_revocation_events (student_id, booking_id, action)
VALUES ('da000000-0000-0000-0000-000000000703','da000000-0000-0000-0000-000000000713','frozen_paid');
-- +1 refund owed (₹500) + +1 payout accrued (₹700). refund_intents.booking_id is NOT NULL
-- (terminal cancelled booking backs it); insert BEFORE suspending p703 (P1 trigger blocks blocked-party bookings).
INSERT INTO public.bookings (id, student_id, mentor_id, date, time_slot, duration, price, status)
VALUES ('da000000-0000-0000-0000-000000000714','da000000-0000-0000-0000-000000000703','da000000-0000-0000-0000-000000000702',(current_date+30),'08:00',60,500,'cancelled')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.refund_intents (booking_id, amount_inr, tier, source, status) VALUES ('da000000-0000-0000-0000-000000000714',500,'full','admin','pending');
INSERT INTO public.mentor_payouts (mentor_id, amount_inr, payout_date, status) VALUES ('da000000-0000-0000-0000-000000000702',700,current_date,'scheduled');
-- +1 moderated account (suspend p703, LAST)
INSERT INTO public.account_moderation (user_id, state, reason, actor_id)
VALUES ('da000000-0000-0000-0000-000000000703','suspended','overview test','da000000-0000-0000-0000-0000000000a0');

-- after (as admin)
SELECT set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-0000000000a0"}', true);
CREATE TEMP TABLE _a7 AS SELECT * FROM public.admin_overview_stats();
SELECT set_config('request.jwt.claims','{"role":"service_role"}', true);

-- P7.01 (reject): a non-admin (the student) is refused.
DO $$
DECLARE v_blocked bool := false;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-000000000701","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN PERFORM public.admin_overview_stats(); EXCEPTION WHEN OTHERS THEN IF SQLERRM ILIKE '%forbidden%' THEN v_blocked:=true; END IF; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _p7 VALUES ('P7.01_nonadmin_forbidden', CASE WHEN v_blocked THEN 'PASS' ELSE 'FAIL' END, 'forbidden='||v_blocked);
END $$;

-- P7.02 (happy): every bucket moved by exactly its fixture delta.
INSERT INTO _p7
SELECT 'P7.02_stat_deltas',
  CASE WHEN (a.open_safeguarding - b.open_safeguarding)=1
        AND (a.pending_verifications - b.pending_verifications)=1
        AND (a.consent_pending - b.consent_pending)=1
        AND (a.consent_fallout_open - b.consent_fallout_open)=1
        AND (a.accounts_moderated - b.accounts_moderated)=1
        AND (a.refunds_owed_count - b.refunds_owed_count)=1
        AND (a.refunds_owed_inr - b.refunds_owed_inr)=500
        AND (a.payouts_accrued_count - b.payouts_accrued_count)=1
        AND (a.payouts_accrued_inr - b.payouts_accrued_inr)=700 THEN 'PASS' ELSE 'FAIL' END,
  'dSafeg='||(a.open_safeguarding-b.open_safeguarding)||' dVerif='||(a.pending_verifications-b.pending_verifications)
  ||' dConsent='||(a.consent_pending-b.consent_pending)||' dFallout='||(a.consent_fallout_open-b.consent_fallout_open)
  ||' dMod='||(a.accounts_moderated-b.accounts_moderated)||' dRefund='||(a.refunds_owed_count-b.refunds_owed_count)||'/₹'||(a.refunds_owed_inr-b.refunds_owed_inr)
  ||' dPayout='||(a.payouts_accrued_count-b.payouts_accrued_count)||'/₹'||(a.payouts_accrued_inr-b.payouts_accrued_inr)
FROM _b7 b, _a7 a;

SELECT test_id, status, detail FROM _p7 ORDER BY test_id;
ROLLBACK;
