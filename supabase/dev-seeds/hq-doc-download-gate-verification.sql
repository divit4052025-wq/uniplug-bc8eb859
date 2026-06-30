-- ════════════════════════════════════════════════════════════════════════════
-- A2 dev-seed: mentor document DOWNLOAD gate — can_mentor_access_document
-- Pairs with 20260627000001_a2_document_download_gate.sql.
-- Proves: the JWT-derived gate returns FALSE for an unbooked mentor and for a
-- restricted-unshared doc (REJECT paths), and TRUE for a booked mentor on an
-- all_booked doc, the owner student on their own restricted doc, and a booked
-- mentor once the doc is explicitly shared (HAPPY paths). Reuses the A seed's
-- user/booking/doc shape (a-document-sharing-verification.sql).
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token, email_change, email_change_token_new, created_at, updated_at, instance_id) VALUES
('da000000-0000-0000-0000-00000000000a','authenticated','authenticated','a2-m@example.com',crypt('x',gen_salt('bf')),now(),'{"provider":"email"}','{"role":"mentor","full_name":"A2 Mentor","university":"U","course":"C","year":"3rd Year","date_of_birth":"2000-01-01"}','','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
('da000000-0000-0000-0000-00000000000b','authenticated','authenticated','a2-m2@example.com',crypt('x',gen_salt('bf')),now(),'{"provider":"email"}','{"role":"mentor","full_name":"A2 Mentor2","university":"U","course":"C","year":"2nd Year","date_of_birth":"2000-01-01"}','','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
('da000000-0000-0000-0000-0000000000c1','authenticated','authenticated','a2-s1@example.com',crypt('x',gen_salt('bf')),now(),'{"provider":"email"}','{"role":"student","full_name":"A2 Student1","phone":"+91","school":"S","grade":"Grade 12","date_of_birth":"2000-01-01"}','','','','',now(),now(),'00000000-0000-0000-0000-000000000000')
ON CONFLICT (id) DO NOTHING;
UPDATE public.mentors SET status='approved', price_inr=1000 WHERE id IN ('da000000-0000-0000-0000-00000000000a','da000000-0000-0000-0000-00000000000b');

-- M is booked (completed) with S1; M2 is NOT booked with S1.
INSERT INTO public.bookings (mentor_id, student_id, date, time_slot, duration, price, status) VALUES
('da000000-0000-0000-0000-00000000000a','da000000-0000-0000-0000-0000000000c1', CURRENT_DATE-9,'10:00',60,1000,'completed');

-- S1's docs: one all_booked, one restricted.
INSERT INTO public.student_documents (id, student_id, file_name, storage_path, size_bytes, visibility) VALUES
('da000000-0000-0000-0000-0000000d0c01','da000000-0000-0000-0000-0000000000c1','essay.pdf','da000000-0000-0000-0000-0000000000c1/essay.pdf',1000,'all_booked'),
('da000000-0000-0000-0000-0000000d0c02','da000000-0000-0000-0000-0000000000c1','private.pdf','da000000-0000-0000-0000-0000000000c1/private.pdf',2000,'restricted');

CREATE TEMP TABLE _dl (test_id text PRIMARY KEY, status text NOT NULL CHECK (status IN ('PASS','FAIL')), detail text NOT NULL);

-- DL.01 REJECT: unbooked mentor M2 → gate(all_booked doc) = false.
DO $$
DECLARE v bool;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v := public.can_mentor_access_document('da000000-0000-0000-0000-0000000d0c01');
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _dl VALUES ('DL.01_unbooked_mentor_denied',
    CASE WHEN v IS FALSE THEN 'PASS' ELSE 'FAIL' END, 'unbooked M2 gate on all_booked doc='||coalesce(v::text,'null')||' (expect false)');
END $$;

-- DL.02 REJECT: booked mentor M → gate(restricted UNSHARED doc) = false.
DO $$
DECLARE v bool;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v := public.can_mentor_access_document('da000000-0000-0000-0000-0000000d0c02');
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _dl VALUES ('DL.02_booked_mentor_restricted_unshared_denied',
    CASE WHEN v IS FALSE THEN 'PASS' ELSE 'FAIL' END, 'booked M gate on restricted-unshared doc='||coalesce(v::text,'null')||' (expect false)');
END $$;

-- DL.03 HAPPY: booked mentor M → gate(all_booked doc) = true.
DO $$
DECLARE v bool;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v := public.can_mentor_access_document('da000000-0000-0000-0000-0000000d0c01');
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _dl VALUES ('DL.03_booked_mentor_allbooked_allowed',
    CASE WHEN v IS TRUE THEN 'PASS' ELSE 'FAIL' END, 'booked M gate on all_booked doc='||coalesce(v::text,'null')||' (expect true)');
END $$;

-- DL.04 HAPPY: owner student S1 → gate(own restricted doc) = true.
DO $$
DECLARE v bool;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v := public.can_mentor_access_document('da000000-0000-0000-0000-0000000d0c02');
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _dl VALUES ('DL.04_owner_student_allowed',
    CASE WHEN v IS TRUE THEN 'PASS' ELSE 'FAIL' END, 'owner S1 gate on own restricted doc='||coalesce(v::text,'null')||' (expect true)');
END $$;

-- DL.05 HAPPY: after S1 shares the restricted doc to M, M → gate = true.
DO $$
DECLARE v bool;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.share_student_document('da000000-0000-0000-0000-0000000d0c02','da000000-0000-0000-0000-00000000000a');
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v := public.can_mentor_access_document('da000000-0000-0000-0000-0000000d0c02');
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _dl VALUES ('DL.05_share_unlocks_gate',
    CASE WHEN v IS TRUE THEN 'PASS' ELSE 'FAIL' END, 'booked M gate on restricted doc after share='||coalesce(v::text,'null')||' (expect true)');
END $$;

SELECT test_id, status, detail FROM _dl ORDER BY test_id;
ROLLBACK;
