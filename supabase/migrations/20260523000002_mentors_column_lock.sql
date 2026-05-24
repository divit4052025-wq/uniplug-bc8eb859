-- Phase A2: extend mentors UPDATE trigger to cover price_inr.
--
-- Background: 20260514100001 added prevent_mentor_self_approval to block
-- non-admin/non-service_role UPDATEs that change `status`. Status was
-- the only admin-controlled column at that time. Today `price_inr` is
-- the second such column: it ships with NOT NULL DEFAULT 1800 and is
-- read by `book_session` (Phase A1) as the canonical session price.
-- Without a column-level lock, a logged-in mentor can
--   `.from("mentors").update({ price_inr: 1 })`
-- via the anon-key client — the UPDATE policy "Mentors can update own
-- row" allows it and no WITH CHECK would catch it (WITH CHECK can't
-- see OLD, see the audit's tautology note for the original trigger).
--
-- This migration extends the existing trigger function so the no-op
-- short-circuit only fires when BOTH `status` AND `price_inr` are
-- unchanged. The bypass clauses (service_role JWT claim, then
-- is_admin()) are preserved exactly, so:
--   - `admin_set_mentor_status` (SECURITY DEFINER, calls is_admin()) → pass
--   - service-role server scripts and dev-seeds → pass
--   - mentor Settings UI writing only {bio, topics, photo_url} → pass
--     (short-circuit fires because both locked columns are unchanged)
--   - mentor self-write of `price_inr` or `status` → P0001 RAISE
--
-- Phase F1 will add `id_document_path`, `enrollment_letter_path`,
-- `verified_at`, `verified_by`, `verification_notes` to the same
-- short-circuit. The function name is preserved (vs renaming to
-- `prevent_mentor_admin_field_writes`) to keep the diff focused; the
-- COMMENT documents the broader scope so future contributors know.
--
-- Idempotent: CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS +
-- CREATE TRIGGER replays cleanly.
--
-- Out of scope: `email`. The Settings UI does not write `email` today
-- (auth.users.email is the source of truth via Supabase Auth) and the
-- precursor's open question — whether to also lock it against
-- mentor-side rewrites for PII-drift protection — is deferred until
-- there's a concrete write path to defend against.
--
-- Verification: supabase/dev-seeds/mentors-column-lock-verification.sql

CREATE OR REPLACE FUNCTION public.prevent_mentor_self_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Allow no-op (BOTH status and price_inr unchanged) — mentors can
  -- still update display fields (bio, topics, photo_url, etc.) on
  -- their own row.
  IF OLD.status    IS NOT DISTINCT FROM NEW.status
     AND OLD.price_inr IS NOT DISTINCT FROM NEW.price_inr
  THEN
    RETURN NEW;
  END IF;

  -- Service-role calls (server-side scripts, dev-seeds) bypass.
  IF coalesce(auth.jwt() ->> 'role', '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Admin callers (including admin_set_mentor_status, which runs as
  -- SECURITY DEFINER but preserves the original auth.uid()) are
  -- allowed.
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Mentor status and pricing can only be changed by an administrator.'
    USING ERRCODE = 'P0001';
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_mentor_self_approval() FROM public;
REVOKE EXECUTE ON FUNCTION public.prevent_mentor_self_approval() FROM anon;
GRANT  EXECUTE ON FUNCTION public.prevent_mentor_self_approval() TO authenticated, service_role;

DROP TRIGGER IF EXISTS mentors_prevent_self_approval ON public.mentors;
CREATE TRIGGER mentors_prevent_self_approval
  BEFORE UPDATE ON public.mentors
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_mentor_self_approval();

COMMENT ON FUNCTION public.prevent_mentor_self_approval() IS
  'BEFORE UPDATE trigger on public.mentors. Blocks any change to admin-controlled columns (status, price_inr) unless the caller is is_admin() or service_role. Function name is preserved from the May 14 status-only version; Phase A2 (2026-05-23) extended the locked set to price_inr, and Phase F1 will extend further to cover the verification document path columns. Admin updates via admin_set_mentor_status pass because the trigger evaluates is_admin() against auth.uid() of the original caller (SECURITY DEFINER changes the DB role but not the PostgREST JWT claim).';
