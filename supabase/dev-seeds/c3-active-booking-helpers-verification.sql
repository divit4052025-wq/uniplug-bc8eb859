-- ════════════════════════════════════════════════════════════════════════════
-- C-3 dev-seed: canonical active-booking helpers (truth tables)
-- Pairs with 20260604000002_c3_active_booking_helpers.sql.
-- Proves the two DELIBERATELY-different status sets:
--   booking_relationship_is_active → confirmed/completed (identity-unlock set)
--   count_active_mentees           → reserved/pending_payment/confirmed (capacity set)
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token, email_change, email_change_token_new, created_at, updated_at, instance_id) VALUES
('c3000000-0000-0000-0000-00000000000a','authenticated','authenticated','c3-m@example.com',crypt('x',gen_salt('bf')),now(),'{"provider":"email"}','{"role":"mentor","full_name":"C3 M","university":"U","course":"C","year":"3rd Year","date_of_birth":"2000-01-01"}','','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
('c3000000-0000-0000-0000-0000000000f1','authenticated','authenticated','c3-conf@example.com',crypt('x',gen_salt('bf')),now(),'{"provider":"email"}','{"role":"student","full_name":"Conf","phone":"+91","school":"S","grade":"Grade 12","date_of_birth":"2000-01-01"}','','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
('c3000000-0000-0000-0000-0000000000f2','authenticated','authenticated','c3-comp@example.com',crypt('x',gen_salt('bf')),now(),'{"provider":"email"}','{"role":"student","full_name":"Comp","phone":"+91","school":"S","grade":"Grade 12","date_of_birth":"2000-01-01"}','','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
('c3000000-0000-0000-0000-0000000000f3','authenticated','authenticated','c3-pend@example.com',crypt('x',gen_salt('bf')),now(),'{"provider":"email"}','{"role":"student","full_name":"Pend","phone":"+91","school":"S","grade":"Grade 12","date_of_birth":"2000-01-01"}','','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
('c3000000-0000-0000-0000-0000000000f4','authenticated','authenticated','c3-res@example.com',crypt('x',gen_salt('bf')),now(),'{"provider":"email"}','{"role":"student","full_name":"Res","phone":"+91","school":"S","grade":"Grade 12","date_of_birth":"2000-01-01"}','','','','',now(),now(),'00000000-0000-0000-0000-000000000000')
ON CONFLICT (id) DO NOTHING;
UPDATE public.mentors SET status='approved', price_inr=1000 WHERE id='c3000000-0000-0000-0000-00000000000a';

-- bookings: confirmed(f1), completed(f2), pending_payment(f3), reserved(f4)
INSERT INTO public.bookings (mentor_id, student_id, date, time_slot, duration, price, status) VALUES
('c3000000-0000-0000-0000-00000000000a','c3000000-0000-0000-0000-0000000000f1', CURRENT_DATE+40,'10:00',60,1000,'confirmed'),
('c3000000-0000-0000-0000-00000000000a','c3000000-0000-0000-0000-0000000000f2', CURRENT_DATE-9,'10:00',60,1000,'completed'),
('c3000000-0000-0000-0000-00000000000a','c3000000-0000-0000-0000-0000000000f3', CURRENT_DATE+41,'10:00',60,1000,'pending_payment'),
('c3000000-0000-0000-0000-00000000000a','c3000000-0000-0000-0000-0000000000f4', CURRENT_DATE+42,'10:00',60,1000,'reserved');

CREATE TEMP TABLE _c3 (test_id text PRIMARY KEY, status text NOT NULL, detail text NOT NULL);

DO $$
DECLARE m uuid := 'c3000000-0000-0000-0000-00000000000a';
BEGIN
  -- relationship_is_active: confirmed/completed TRUE; pending/reserved/none FALSE
  INSERT INTO _c3 VALUES ('C3.01_rel_confirmed_true',
    CASE WHEN public.booking_relationship_is_active('c3000000-0000-0000-0000-0000000000f1', m) THEN 'PASS' ELSE 'FAIL' END, 'confirmed → expect true');
  INSERT INTO _c3 VALUES ('C3.02_rel_completed_true',
    CASE WHEN public.booking_relationship_is_active('c3000000-0000-0000-0000-0000000000f2', m) THEN 'PASS' ELSE 'FAIL' END, 'completed → expect true');
  INSERT INTO _c3 VALUES ('C3.03_rel_pending_false',
    CASE WHEN NOT public.booking_relationship_is_active('c3000000-0000-0000-0000-0000000000f3', m) THEN 'PASS' ELSE 'FAIL' END, 'pending_payment → expect false');
  INSERT INTO _c3 VALUES ('C3.04_rel_reserved_false',
    CASE WHEN NOT public.booking_relationship_is_active('c3000000-0000-0000-0000-0000000000f4', m) THEN 'PASS' ELSE 'FAIL' END, 'reserved → expect false');
  -- count_active_mentees: counts reserved+pending+confirmed = 3 distinct; completed excluded
  INSERT INTO _c3 VALUES ('C3.05_count_excludes_completed',
    CASE WHEN public.count_active_mentees(m) = 3 THEN 'PASS' ELSE 'FAIL' END,
    'active mentees = '||public.count_active_mentees(m)||' (expect 3: confirmed+pending+reserved; completed NOT counted)');
END $$;

-- distinctness: a 2nd confirmed booking for f1 must NOT increment the count
INSERT INTO public.bookings (mentor_id, student_id, date, time_slot, duration, price, status) VALUES
('c3000000-0000-0000-0000-00000000000a','c3000000-0000-0000-0000-0000000000f1', CURRENT_DATE+43,'10:00',60,1000,'confirmed');
DO $$
DECLARE m uuid := 'c3000000-0000-0000-0000-00000000000a';
BEGIN
  INSERT INTO _c3 VALUES ('C3.06_count_distinct_students',
    CASE WHEN public.count_active_mentees(m) = 3 THEN 'PASS' ELSE 'FAIL' END,
    'after a 2nd confirmed booking for the same student, count = '||public.count_active_mentees(m)||' (still 3 — DISTINCT students, not rows)');
END $$;

SELECT test_id, status, detail FROM _c3 ORDER BY test_id;
ROLLBACK;
