-- ════════════════════════════════════════════════════════════════════════════
-- Dev-seed: Build 2b — schools (ref_schools chains + CISCE + curated + alias search)
-- ════════════════════════════════════════════════════════════════════════════
-- Proves 20260606000002_p0_ref_schools_india_seed.sql (run AFTER it). Read-only
-- assertions in a BEGIN..ROLLBACK; one row per test, status='PASS'.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;
CREATE TEMP TABLE _s (test_id text PRIMARY KEY, status text NOT NULL, detail text NOT NULL);

-- S.01 — schema: aliases[] + source columns exist
DO $$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM information_schema.columns
   WHERE table_name='ref_schools' AND column_name IN ('aliases','source');
  INSERT INTO _s VALUES ('S.01_schema_columns', CASE WHEN v=2 THEN 'PASS' ELSE 'FAIL' END, 'aliases+source columns present = '||v||'/2');
END $$;

-- S.02 — loaded count
DO $$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.ref_schools;
  INSERT INTO _s VALUES ('S.02_loaded_count', CASE WHEN v=3611 THEN 'PASS' ELSE 'FAIL' END, 'ref_schools rows = '||v||' (expect 3611)');
END $$;

-- S.03 — normalized-UNIQUE (no two rows share a norm_key; same derivation as ref_universities D.10)
DO $$
DECLARE v int;
BEGIN
  WITH k AS (
    SELECT trim(regexp_replace(regexp_replace(replace(lower(regexp_replace(name,'\([^)]*\)',' ','g')),'&',' and '),'[^a-z0-9 ]',' ','g'),'\s+',' ','g')) AS nk
    FROM public.ref_schools)
  SELECT count(*) INTO v FROM (SELECT nk FROM k GROUP BY nk HAVING count(*)>1) d;
  INSERT INTO _s VALUES ('S.03_normalized_unique', CASE WHEN v=0 THEN 'PASS' ELSE 'FAIL' END, 'duplicate normalized keys = '||v||' (expect 0)');
END $$;

-- S.04 — chain alias-search works (DPS/KV/JNV/DAV each return >=2 via the new alias clause)
DO $$
DECLARE d int; k int; j int; a int;
BEGIN
  SELECT count(*) INTO d FROM public.search_schools('DPS',50);
  SELECT count(*) INTO k FROM public.search_schools('KV',50);
  SELECT count(*) INTO j FROM public.search_schools('JNV',50);
  SELECT count(*) INTO a FROM public.search_schools('DAV',50);
  INSERT INTO _s VALUES ('S.04_chain_alias_search',
    CASE WHEN d>=2 AND k>=2 AND j>=2 AND a>=2 THEN 'PASS' ELSE 'FAIL' END,
    'DPS='||d||' KV='||k||' JNV='||j||' DAV='||a||' (each expect >=2)');
END $$;

-- S.05 — disambiguation: same-named schools survive across districts
DO $$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.ref_schools WHERE name LIKE 'Delhi Public School,%';
  INSERT INTO _s VALUES ('S.05_disambiguation', CASE WHEN v>=2 THEN 'PASS' ELSE 'FAIL' END, 'distinct "Delhi Public School, ..." rows = '||v);
END $$;

-- S.06 — alias clause is additive only: a plain name search still works (no regression)
DO $$
DECLARE v int;
BEGIN
  SELECT count(*) INTO v FROM public.search_schools('vidyalaya',50);
  INSERT INTO _s VALUES ('S.06_name_search_intact', CASE WHEN v>=2 THEN 'PASS' ELSE 'FAIL' END, 'name search "vidyalaya" = '||v);
END $$;

SELECT test_id, status, detail FROM _s ORDER BY test_id;
ROLLBACK;
