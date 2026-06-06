-- ════════════════════════════════════════════════════════════════════════════
-- Dev-seed: India reference-data seed PART 1 (universities + domains + aliases)
-- ════════════════════════════════════════════════════════════════════════════
-- Proves the load in supabase/migrations/20260605010000_p0_ref_data_india_seed.sql
-- (run AFTER that migration). Read-only assertions against the loaded state inside
-- a BEGIN..ROLLBACK; final SELECT is one row per test, status='PASS'. NOT a migration.
--
--   docker exec -i supabase_db_<ref> psql "postgresql://postgres:postgres@localhost:5432/postgres" \
--     -v ON_ERROR_STOP=1 < this-file.sql
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TEMP TABLE _r (test_id text PRIMARY KEY, status text NOT NULL, detail text NOT NULL);

-- D.01 — bulk India universities loaded (> 1000)
DO $$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.ref_universities WHERE country='India';
  INSERT INTO _r VALUES ('D.01_india_universities_gt_1000', CASE WHEN v>1000 THEN 'PASS' ELSE 'FAIL' END, 'India universities = '||v);
END $$;

-- D.02 — bulk rows tagged source='UGC' (distinguishable from curated)
DO $$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.ref_universities WHERE source='UGC';
  INSERT INTO _r VALUES ('D.02_bulk_source_tag', CASE WHEN v>1000 THEN 'PASS' ELSE 'FAIL' END, 'source=UGC rows = '||v);
END $$;

-- D.03 — curated tier PRESERVED + Build-2a supplement: source='seed' = 96 PART-1
-- curated (never clobbered) + 25 Build-2a top-tier supplement = 121. Also assert a
-- marker PART-1 curated row survives, so the count isn't satisfied by drift.
DO $$
DECLARE v int; v_marker boolean;
BEGIN
  SELECT count(*) INTO v FROM public.ref_universities WHERE source='seed';
  SELECT EXISTS(SELECT 1 FROM public.ref_universities WHERE name='Indian Institute of Technology Bombay' AND source='seed') INTO v_marker;
  INSERT INTO _r VALUES ('D.03_curated_preserved', CASE WHEN v=121 AND v_marker THEN 'PASS' ELSE 'FAIL' END,
    'source=seed rows = '||v||' (expect 121 = 96 PART-1 curated + 25 Build-2a supplement); IITB-marker='||v_marker);
END $$;

-- D.04 — academic domains loaded (>= 487 total after the additive Hipo India load)
DO $$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.ref_academic_domains;
  INSERT INTO _r VALUES ('D.04_domains_loaded', CASE WHEN v>=487 THEN 'PASS' ELSE 'FAIL' END, 'ref_academic_domains = '||v);
END $$;

-- D.05 — a known India domain is present (Hipo marker)
DO $$
DECLARE v boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM public.ref_academic_domains WHERE domain='christuniversity.in') INTO v;
  INSERT INTO _r VALUES ('D.05_known_domain_present', CASE WHEN v THEN 'PASS' ELSE 'FAIL' END, 'christuniversity.in present = '||v);
END $$;

-- D.06 — typeahead works: search_reference('university','indian institute') surfaces the IITs
DO $$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.search_reference('university','indian institute',50);
  INSERT INTO _r VALUES ('D.06_search_indian_institute', CASE WHEN v>=10 THEN 'PASS' ELSE 'FAIL' END, 'matches = '||v);
END $$;

-- D.07 — a hand-authored alias resolves via search_reference (alias match path)
DO $$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.search_reference('university','NIT Calicut',20);
  INSERT INTO _r VALUES ('D.07_alias_resolves', CASE WHEN v>=1 THEN 'PASS' ELSE 'FAIL' END, 'NIT Calicut alias matches = '||v);
END $$;

-- D.08 — a marker university resolves (University of Delhi via 'delhi')
DO $$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.search_reference('university','delhi',50);
  INSERT INTO _r VALUES ('D.08_marker_university', CASE WHEN v>=5 THEN 'PASS' ELSE 'FAIL' END, 'delhi matches = '||v);
END $$;

-- D.09 — bulk rows did NOT receive arbitrary aliases (only the curated + the ~35 hand-authored)
DO $$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.ref_universities WHERE source='UGC' AND cardinality(aliases)>0;
  INSERT INTO _r VALUES ('D.09_bulk_aliases_bounded', CASE WHEN v BETWEEN 1 AND 120 THEN 'PASS' ELSE 'FAIL' END, 'UGC rows with aliases = '||v||' (the hand-authored top tier only)');
END $$;

-- D.10 — canonical universities are normalized-UNIQUE (no two rows share a key).
-- The SQL key mirrors the generator's norm_key: drop parentheticals, lowercase,
-- & -> 'and', strip punctuation, collapse whitespace.
DO $$
DECLARE v int;
BEGIN
  WITH k AS (
    SELECT trim(regexp_replace(
             regexp_replace(
               replace(
                 lower(regexp_replace(name, '\([^)]*\)', ' ', 'g')),
                 '&', ' and '),
               '[^a-z0-9 ]', ' ', 'g'),
             '\s+', ' ', 'g')) AS nk
    FROM public.ref_universities)
  SELECT count(*) INTO v FROM (SELECT nk FROM k GROUP BY nk HAVING count(*) > 1) d;
  INSERT INTO _r VALUES ('D.10_normalized_unique', CASE WHEN v=0 THEN 'PASS' ELSE 'FAIL' END, 'duplicate normalized keys = '||v||' (expect 0)');
END $$;

-- ════ Build 2a — colleges (Section A) + curated supplement (Section B) ════

-- D.11 — AISHE colleges loaded (post two-layer dedup): source='AISHE' count.
DO $$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.ref_universities WHERE source='AISHE';
  INSERT INTO _r VALUES ('D.11_colleges_loaded', CASE WHEN v=52274 THEN 'PASS' ELSE 'FAIL' END, 'source=AISHE rows = '||v||' (expect 52274)');
END $$;

-- D.12 — collision marker: same-named colleges survive across districts.
DO $$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.ref_universities WHERE name LIKE 'St. Xavier''s College,%';
  INSERT INTO _r VALUES ('D.12_xavier_collision', CASE WHEN v>=2 THEN 'PASS' ELSE 'FAIL' END, 'distinct "St. Xavier''s College, ..." rows = '||v);
END $$;

-- D.13 — IIT family complete: all 23 IITs present, exactly one row each (no city twice).
-- IIT = name contains "indian institute of technology" OR starts "IIT " ; excludes IIIT.
DO $$
DECLARE v_cnt int; v_cities int;
BEGIN
  WITH iit AS (
    SELECT lower(regexp_replace(name, '^.*[^A-Za-z]([A-Za-z]+)\s*$', '\1')) AS city
    FROM public.ref_universities
    WHERE (name ~* 'indian institute of technology' OR name ~* '^iit[ ,]')
      AND name !~* 'information technology'
  )
  SELECT count(*), count(DISTINCT city) INTO v_cnt, v_cities FROM iit;
  INSERT INTO _r VALUES ('D.13_iit_family', CASE WHEN v_cnt=23 AND v_cities=23 THEN 'PASS' ELSE 'FAIL' END,
    'IIT rows='||v_cnt||', distinct cities='||v_cities||' (expect 23/23)');
END $$;

SELECT test_id, status, detail FROM _r ORDER BY test_id;

ROLLBACK;
