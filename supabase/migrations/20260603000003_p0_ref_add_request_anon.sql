-- Phase 0 (follow-up): make create_ref_add_request callable pre-login (anon).
--
-- WHY: the signup wizard collects universities / courses / etc. BEFORE the
-- account exists, so a student whose entry isn't in the catalog is ANONYMOUS
-- when they hit "can't find it? request to add". The original P0 RPC
-- (20260603000001) was authenticated-only — it would reject that request
-- mid-signup, violating the rule that request-to-add must NEVER block signup.
--
-- WHAT CHANGES (function + grant only — no schema change):
--   - create_ref_add_request becomes callable by anon AS WELL AS authenticated.
--     requested_by is stamped with auth.uid() when present, NULL for anon
--     (the column is already nullable: REFERENCES auth.users ON DELETE SET NULL).
--   - Light anti-spam: cap proposed_name length (rate-limiting left as a TODO —
--     see note). Nothing else about the request-to-add or admin-promote flow
--     changes; admin_promote / admin_reject stay admin-only and untouched.
--
-- search_reference / search_schools were already anon-granted in 20260603000001,
-- so pre-auth typeahead already works; this closes the remaining pre-auth gap.
--
-- Idempotent (CREATE OR REPLACE FUNCTION; REVOKE/GRANT restated).
--
-- Verification: supabase/dev-seeds/p0-ref-taxonomy-verification.sql
--   (P0.9 anon-create-then-promote, P0.10 anon search_reference).

CREATE OR REPLACE FUNCTION public.create_ref_add_request(_kind text, _proposed_name text)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id   uuid;
  v_uid  uuid := auth.uid();                       -- NULL for an anonymous (pre-login) caller
  v_name text := btrim(coalesce(_proposed_name, ''));
BEGIN
  IF _kind NOT IN ('university','course','subject','sport','cocurricular','project_category','school') THEN
    RAISE EXCEPTION 'unknown reference kind: %', _kind USING ERRCODE = 'P0001';
  END IF;
  IF v_name = '' THEN
    RAISE EXCEPTION 'proposed_name is required' USING ERRCODE = 'P0001';
  END IF;
  -- Anti-spam: length cap so an anonymous caller can't stuff the queue with
  -- oversized payloads. A real catalog name is well under this.
  -- TODO(post-V1): add per-caller rate limiting for the anon path, following
  -- the existing event-log pattern (public.ai_rate_limit_events in
  -- 20260523000005_d0_ai_infrastructure.sql). Deliberately not built now.
  IF length(v_name) > 120 THEN
    RAISE EXCEPTION 'proposed_name too long (max 120 chars)' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.ref_add_requests (kind, proposed_name, requested_by)
  VALUES (_kind, v_name, v_uid)                    -- v_uid may be NULL (anon) — column is nullable
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Grants: now anon-callable (in addition to authenticated + service_role).
-- CREATE OR REPLACE preserves prior grants, so restate the full posture and
-- explicitly add anon (the original migration had REVOKE EXECUTE ... FROM anon).
REVOKE ALL    ON FUNCTION public.create_ref_add_request(text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_ref_add_request(text, text) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.create_ref_add_request(text, text) IS
  'Phase 0 (2026-06-03, anon follow-up): files a request to add _proposed_name to the _kind taxonomy. Callable pre-login — anon OR authenticated. Stamps requested_by = auth.uid() when present, NULL for anon. proposed_name capped at 120 chars (anti-spam; rate-limiting TODO). status starts pending. Returns the new request id. Specialties are a closed set and not an accepted kind.';
