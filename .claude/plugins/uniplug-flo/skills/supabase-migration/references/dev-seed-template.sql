-- ════════════════════════════════════════════════════════════════════════════
-- Dev-seed template — <one line describing what this verifies>
-- ════════════════════════════════════════════════════════════════════════════
--
-- WHAT THIS FILE IS
--   Runnable rejection + happy-path tests for the policies / triggers added in
--   supabase/migrations/<paired_migration_filename>.sql. This is NOT a
--   migration — it never persists.
--
-- HOW IT WORKS
--   The single outer transaction sets up test users, then each test DO block
--   switches SET LOCAL ROLE authenticated and SELECT set_config(
--   'request.jwt.claims', ...) so auth.uid() returns the test caller. RLS
--   therefore evaluates exactly as for a real signed-in user. After the test,
--   the role is reset and the result is recorded in a TEMP results table.
--
-- HOW TO RUN
--   Paste into Supabase SQL Editor, or pipe via MCP execute_sql. All changes
--   ROLLBACK at the end — DB state unchanged.
--
-- PASS CRITERIA
--   The final SELECT returns one row per test with status = 'PASS' and a
--   human-readable detail. Any 'FAIL' row means the policy/trigger contract
--   is broken — investigate before merging.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- Use service_role during setup so any inserts/updates bypass the new policies
-- under test.
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- Stable UUIDs make tests predictable + greppable.
-- m_a / m_b: mentors; s_a / s_b: students.
DO $$
DECLARE
  m_a constant uuid := '11111111-1111-1111-1111-1111111100a1';
  m_b constant uuid := '11111111-1111-1111-1111-1111111100b1';
  s_a constant uuid := '22222222-2222-2222-2222-2222222200a1';
  s_b constant uuid := '22222222-2222-2222-2222-2222222200b1';
BEGIN
  -- TODO: insert into auth.users so the handle_new_user trigger fans out into
  -- public.mentors / public.students. See an existing dev-seed for the shape.
  RAISE NOTICE 'Setup complete';
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- Results table — one row per test.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TEMP TABLE _results (
  test_name text PRIMARY KEY,
  status text NOT NULL CHECK (status IN ('PASS', 'FAIL')),
  detail text
);

-- ─────────────────────────────────────────────────────────────────────────
-- Test 1: REJECTION case — describe the attack being blocked.
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  m_a constant uuid := '11111111-1111-1111-1111-1111111100a1';
  blocked boolean := false;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', m_a, 'role', 'authenticated')::text,
    true
  );

  BEGIN
    -- TODO: the operation that should be blocked
    -- INSERT INTO public.<table> (...) VALUES (...);
    RAISE EXCEPTION 'TODO: implement rejection test';
  EXCEPTION WHEN insufficient_privilege OR check_violation OR raise_exception THEN
    blocked := true;
  END;

  RESET ROLE;
  INSERT INTO _results VALUES (
    'rejection_<name>',
    CASE WHEN blocked THEN 'PASS' ELSE 'FAIL' END,
    'Expected the operation to be rejected by RLS'
  );
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- Test 2: HAPPY PATH — the legitimate operation still works.
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  m_a constant uuid := '11111111-1111-1111-1111-1111111100a1';
  succeeded boolean := false;
BEGIN
  SET LOCAL ROLE authenticated;
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', m_a, 'role', 'authenticated')::text,
    true
  );

  BEGIN
    -- TODO: the operation that should succeed
    succeeded := true;
  EXCEPTION WHEN OTHERS THEN
    succeeded := false;
  END;

  RESET ROLE;
  INSERT INTO _results VALUES (
    'happy_<name>',
    CASE WHEN succeeded THEN 'PASS' ELSE 'FAIL' END,
    'Expected the legitimate operation to succeed under the new policy'
  );
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- Final report — must be all PASS before merge.
-- ─────────────────────────────────────────────────────────────────────────
SELECT * FROM _results ORDER BY test_name;

ROLLBACK;
