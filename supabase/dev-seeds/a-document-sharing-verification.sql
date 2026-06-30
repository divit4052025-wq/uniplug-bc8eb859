-- ════════════════════════════════════════════════════════════════════════════
-- A dev-seed: document sharing — visibility/share gating, access, cap, RLS
-- Pairs with 20260604000010_a_document_sharing.sql.
-- Proves: a booked mentor sees all_booked docs but NOT restricted docs unless
-- explicitly shared; an unbooked mentor sees nothing; can_access_document;
-- note/version writes are access-gated; the per-doc version cap; share is
-- owner-only + relationship-gated; third parties can't read the share tables.
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

INSERT INTO auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token, email_change, email_change_token_new, created_at, updated_at, instance_id) VALUES
('da000000-0000-0000-0000-00000000000a','authenticated','authenticated','a-m@example.com',crypt('x',gen_salt('bf')),now(),'{"provider":"email"}','{"role":"mentor","full_name":"A Mentor","university":"U","course":"C","year":"3rd Year","date_of_birth":"2000-01-01"}','','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
('da000000-0000-0000-0000-00000000000b','authenticated','authenticated','a-m2@example.com',crypt('x',gen_salt('bf')),now(),'{"provider":"email"}','{"role":"mentor","full_name":"A Mentor2","university":"U","course":"C","year":"2nd Year","date_of_birth":"2000-01-01"}','','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
('da000000-0000-0000-0000-0000000000c1','authenticated','authenticated','a-s1@example.com',crypt('x',gen_salt('bf')),now(),'{"provider":"email"}','{"role":"student","full_name":"A Student1","phone":"+91","school":"S","grade":"Grade 12","date_of_birth":"2000-01-01"}','','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
('da000000-0000-0000-0000-0000000000c2','authenticated','authenticated','a-s2@example.com',crypt('x',gen_salt('bf')),now(),'{"provider":"email"}','{"role":"student","full_name":"A Student2","phone":"+91","school":"S","grade":"Grade 12","date_of_birth":"2000-01-01"}','','','','',now(),now(),'00000000-0000-0000-0000-000000000000'),
-- MB: a SECOND mentor also booked with S1 (for the cross-mentor isolation test A.09)
('da000000-0000-0000-0000-00000000000d','authenticated','authenticated','a-mb@example.com',crypt('x',gen_salt('bf')),now(),'{"provider":"email"}','{"role":"mentor","full_name":"A MentorB","university":"U","course":"C","year":"4th Year","date_of_birth":"2000-01-01"}','','','','',now(),now(),'00000000-0000-0000-0000-000000000000')
ON CONFLICT (id) DO NOTHING;
UPDATE public.mentors SET status='approved', price_inr=1000 WHERE id IN ('da000000-0000-0000-0000-00000000000a','da000000-0000-0000-0000-00000000000b','da000000-0000-0000-0000-00000000000d');

-- M and MB are BOTH booked with S1 (confirmed); M2 is NOT booked with S1.
INSERT INTO public.bookings (mentor_id, student_id, date, time_slot, duration, price, status) VALUES
('da000000-0000-0000-0000-00000000000a','da000000-0000-0000-0000-0000000000c1', CURRENT_DATE-9,'10:00',60,1000,'completed'),
('da000000-0000-0000-0000-00000000000d','da000000-0000-0000-0000-0000000000c1', CURRENT_DATE-8,'10:00',60,1000,'completed');

-- S1's documents: one all_booked, one restricted.
INSERT INTO public.student_documents (id, student_id, file_name, storage_path, size_bytes, visibility) VALUES
('da000000-0000-0000-0000-0000000d0c01','da000000-0000-0000-0000-0000000000c1','essay.pdf','da000000-0000-0000-0000-0000000000c1/essay.pdf',1000,'all_booked'),
('da000000-0000-0000-0000-0000000d0c02','da000000-0000-0000-0000-0000000000c1','private.pdf','da000000-0000-0000-0000-0000000000c1/private.pdf',2000,'restricted');

CREATE TEMP TABLE _a (test_id text PRIMARY KEY, status text NOT NULL, detail text NOT NULL);

-- helper: act as a user
-- A.01: booked mentor M sees all_booked doc but NOT restricted doc
DO $$
DECLARE v_docs jsonb; v_has_all bool; v_has_restricted bool;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT documents INTO v_docs FROM public.get_student_overview_for_mentor('da000000-0000-0000-0000-0000000000c1');
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  v_has_all       := v_docs @> '[{"id":"da000000-0000-0000-0000-0000000d0c01"}]';
  v_has_restricted:= v_docs @> '[{"id":"da000000-0000-0000-0000-0000000d0c02"}]';
  INSERT INTO _a VALUES ('A.01_booked_sees_allbooked_not_restricted',
    CASE WHEN v_has_all AND NOT v_has_restricted THEN 'PASS' ELSE 'FAIL' END,
    'all_booked visible='||v_has_all||' restricted visible='||v_has_restricted||' (expect true,false)');
END $$;

-- A.02: after S1 shares the restricted doc to M, M sees it
DO $$
DECLARE v_docs jsonb; v_has_restricted bool;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.share_student_document('da000000-0000-0000-0000-0000000d0c02','da000000-0000-0000-0000-00000000000a');
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT documents INTO v_docs FROM public.get_student_overview_for_mentor('da000000-0000-0000-0000-0000000000c1');
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  v_has_restricted := v_docs @> '[{"id":"da000000-0000-0000-0000-0000000d0c02"}]';
  INSERT INTO _a VALUES ('A.02_share_unlocks_restricted',
    CASE WHEN v_has_restricted THEN 'PASS' ELSE 'FAIL' END, 'restricted doc visible after share='||v_has_restricted);
END $$;

-- A.03: unbooked mentor M2 → overview returns NOTHING (booking gate)
DO $$
DECLARE v_cnt int;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO v_cnt FROM public.get_student_overview_for_mentor('da000000-0000-0000-0000-0000000000c1');
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _a VALUES ('A.03_unbooked_mentor_sees_nothing',
    CASE WHEN v_cnt=0 THEN 'PASS' ELSE 'FAIL' END, 'overview rows for unbooked mentor = '||v_cnt||' (expect 0)');
END $$;

-- A.04: can_access_document — allbooked/M true, restricted/M2 false
DO $$
DECLARE v1 bool; v2 bool;
BEGIN
  v1 := public.can_access_document('da000000-0000-0000-0000-0000000d0c01','da000000-0000-0000-0000-00000000000a');
  v2 := public.can_access_document('da000000-0000-0000-0000-0000000d0c02','da000000-0000-0000-0000-00000000000b');
  INSERT INTO _a VALUES ('A.04_can_access_predicate',
    CASE WHEN v1 AND NOT v2 THEN 'PASS' ELSE 'FAIL' END, 'allbooked/M='||v1||' restricted/unbookedM2='||v2||' (expect true,false)');
END $$;

-- A.05: add_document_note — M with access ok; M2 without access rejected
DO $$
DECLARE v_ok bool := false; v_rej bool := false;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN PERFORM public.add_document_note('da000000-0000-0000-0000-0000000d0c01','good draft'); v_ok := true; EXCEPTION WHEN OTHERS THEN v_ok := false; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN PERFORM public.add_document_note('da000000-0000-0000-0000-0000000d0c01','sneaky'); v_rej := false; EXCEPTION WHEN OTHERS THEN v_rej := true; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _a VALUES ('A.05_note_access_gated',
    CASE WHEN v_ok AND v_rej THEN 'PASS' ELSE 'FAIL' END, 'M(with access) wrote='||v_ok||'; M2(no access) blocked='||v_rej);
END $$;

-- A.06: per-doc version cap = 10 (owner adds 10 then 11th rejected)
DO $$
DECLARE i int; v_capped bool := false;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  FOR i IN 1..10 LOOP
    PERFORM public.add_document_version('da000000-0000-0000-0000-0000000d0c01','v'||i||'.pdf','path/'||i,100);
  END LOOP;
  BEGIN
    PERFORM public.add_document_version('da000000-0000-0000-0000-0000000d0c01','v11.pdf','path/11',100);
  EXCEPTION WHEN OTHERS THEN IF SQLERRM ILIKE '%version limit%' THEN v_capped := true; END IF; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _a VALUES ('A.06_per_doc_version_cap',
    CASE WHEN v_capped THEN 'PASS' ELSE 'FAIL' END, '11th version rejected by cap='||v_capped);
END $$;

-- A.07: share is owner-only + relationship-gated
DO $$
DECLARE v_nonowner_blocked bool := false; v_norel_blocked bool := false;
BEGIN
  -- mentor M tries to share S1's doc (not the owner) → blocked
  PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN PERFORM public.share_student_document('da000000-0000-0000-0000-0000000d0c01','da000000-0000-0000-0000-00000000000b'); EXCEPTION WHEN OTHERS THEN v_nonowner_blocked := true; END;
  -- S1 tries to share with M2 (no booking relationship) → blocked
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN PERFORM public.share_student_document('da000000-0000-0000-0000-0000000d0c02','da000000-0000-0000-0000-00000000000b'); EXCEPTION WHEN OTHERS THEN v_norel_blocked := true; END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _a VALUES ('A.07_share_owner_and_relationship_gated',
    CASE WHEN v_nonowner_blocked AND v_norel_blocked THEN 'PASS' ELSE 'FAIL' END,
    'non-owner blocked='||v_nonowner_blocked||'; no-relationship blocked='||v_norel_blocked);
END $$;

-- A.08: third-party student S2 cannot read the share tables directly (RLS)
DO $$
DECLARE v_shares int; v_notes int; v_versions int;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-0000000000c2","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO v_shares   FROM public.document_shares;
  SELECT count(*) INTO v_notes    FROM public.document_notes;
  SELECT count(*) INTO v_versions FROM public.document_versions;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  INSERT INTO _a VALUES ('A.08_third_party_rls_blind',
    CASE WHEN v_shares=0 AND v_notes=0 AND v_versions=0 THEN 'PASS' ELSE 'FAIL' END,
    'S2 sees shares='||v_shares||' notes='||v_notes||' versions='||v_versions||' (expect 0,0,0)');
END $$;

-- A.09 (folded A-1): a SECOND booked mentor MB must NOT see M's private note on
-- a shared all_booked doc (notes/versions are scoped to the caller + owner).
DO $$
DECLARE v_docs jsonb; v_doc jsonb; v_sees_m_note bool;
BEGIN
  PERFORM set_config('request.jwt.claims','{"sub":"da000000-0000-0000-0000-00000000000d","role":"authenticated"}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT documents INTO v_docs FROM public.get_student_overview_for_mentor('da000000-0000-0000-0000-0000000000c1');
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','{"role":"service_role"}', true);
  SELECT d INTO v_doc FROM jsonb_array_elements(v_docs) d WHERE d->>'id'='da000000-0000-0000-0000-0000000d0c01';
  v_sees_m_note := EXISTS (
    SELECT 1 FROM jsonb_array_elements(coalesce(v_doc->'notes','[]'::jsonb)) x
    WHERE x->>'author_id' = 'da000000-0000-0000-0000-00000000000a');
  INSERT INTO _a VALUES ('A.09_cross_mentor_note_isolation',
    CASE WHEN v_doc IS NOT NULL AND NOT v_sees_m_note THEN 'PASS' ELSE 'FAIL' END,
    'MB sees the doc='||(v_doc IS NOT NULL)::text||'; MB sees mentor M''s note='||v_sees_m_note||' (expect true,false)');
END $$;

SELECT test_id, status, detail FROM _a ORDER BY test_id;
ROLLBACK;
