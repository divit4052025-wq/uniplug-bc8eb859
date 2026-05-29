-- Phase F2: couple mentor approval with a recorded verification, and expose
-- verified_at to the public mentor-display RPCs so the "Verified" badge can
-- gate on a real signal instead of an assumption.
--
-- Background: F1 (20260523000006) added verified_at / verified_by /
-- verification_notes to public.mentors but nothing ever set them — so the
-- "Verified" badge on browse + mentor.$id was decorative. This migration
-- makes the admin's approve/reject the verification act:
--
--   admin_set_mentor_status(_id, 'approved')
--       → status='approved', verified_at=now(), verified_by=auth.uid()
--   admin_set_mentor_status(_id, 'rejected' | 'pending')
--       → status=<that>, verified_at=NULL, verified_by=NULL
--
-- Invariant established: verified_at IS NOT NULL  <=>  status='approved'.
-- For a minor-serving platform this coupling is intentional — there are no
-- approved-but-unverified mentors (every live mentor carries who+when), and
-- no verified-but-not-approved mentors. 'pending' clears verification too,
-- so reverting a mentor to review also revokes the badge (the brief named
-- only approved/rejected; clearing on 'pending' keeps the invariant whole).
--
-- Trigger compatibility (VERIFIED, not assumed): prevent_mentor_self_approval
-- (F1) short-circuits only when status/price_inr/verified_at/verified_by/
-- verification_notes are ALL unchanged; otherwise it allows the write when
-- service_role OR is_admin(). admin_set_mentor_status is SECURITY DEFINER,
-- but auth.uid()/is_admin() read request.jwt.claims (a GUC that SECURITY
-- DEFINER does NOT change), so is_admin() stays true for the admin caller
-- and the verified_at/verified_by write passes the trigger. The existing
-- A2.4 dev-seed already proves the admin RPC writes locked columns through
-- this trigger; the F2 dev-seed extends that to verified_at/verified_by.
-- verified_by = auth.uid() satisfies the FK to auth.users(id).
--
-- Grants: list_approved_mentor_profiles must be DROPped (its return type
-- changes), which drops its ACL. Live ACL is {anon, authenticated,
-- service_role} with PUBLIC revoked (the public landing page calls it as
-- anon) — re-granted below to preserve it exactly (the older committed
-- migration only granted `authenticated`, which would have broken anon).
-- get_mentor_public_profile is PUBLIC-execute live; a bare CREATE restores
-- the default PUBLIC EXECUTE, matching it.
--
-- Idempotent: CREATE OR REPLACE for the RPC whose signature is unchanged;
-- DROP ... IF EXISTS + CREATE for the two whose return type changes.
--
-- Verification: supabase/dev-seeds/f2-verified-at-coupling-verification.sql

-- ─── 1. Couple approval with verification ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_set_mentor_status(_mentor_id uuid, _status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _status NOT IN ('approved','rejected','pending') THEN
    RAISE EXCEPTION 'invalid status';
  END IF;

  IF _status = 'approved' THEN
    UPDATE public.mentors
       SET status      = _status::public.mentor_status,
           verified_at = now(),
           verified_by = auth.uid()
     WHERE id = _mentor_id;
  ELSE
    -- rejected / pending: revoke any recorded verification.
    UPDATE public.mentors
       SET status      = _status::public.mentor_status,
           verified_at = NULL,
           verified_by = NULL
     WHERE id = _mentor_id;
  END IF;

  -- Phase C2: dispatch approval / rejection emails. Pending → no email.
  IF _status = 'approved' THEN
    PERFORM public.notify_event_email(jsonb_build_object(
      'type', 'mentor_approved',
      'mentor_id', _mentor_id
    ));
  ELSIF _status = 'rejected' THEN
    PERFORM public.notify_event_email(jsonb_build_object(
      'type', 'mentor_rejected',
      'mentor_id', _mentor_id
    ));
  END IF;
END;
$$;

COMMENT ON FUNCTION public.admin_set_mentor_status(uuid, text) IS
  'Admin-only (is_admin()) mentor status setter. Phase F2 (2026-05-29) couples status with verification: approved sets verified_at=now()/verified_by=auth.uid(); rejected/pending clear both. Invariant: verified_at IS NOT NULL <=> status=approved. Writes pass prevent_mentor_self_approval via the is_admin() bypass.';

-- ─── 2. Expose verified_at to the public display RPCs ──────────────────────
DROP FUNCTION IF EXISTS public.list_approved_mentor_profiles();
CREATE FUNCTION public.list_approved_mentor_profiles()
RETURNS TABLE (
  id uuid,
  full_name text,
  university text,
  countries text[],
  course text,
  year text,
  price_inr integer,
  verified_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id, m.full_name, m.university, m.countries, m.course, m.year,
         m.price_inr, m.verified_at
  FROM public.mentors m
  WHERE m.status = 'approved'::public.mentor_status
  ORDER BY m.created_at DESC;
$$;

-- Preserve the live grant posture exactly: PUBLIC revoked, anon +
-- authenticated + service_role granted (the public landing page calls this
-- as anon).
REVOKE ALL ON FUNCTION public.list_approved_mentor_profiles() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_approved_mentor_profiles()
  TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.get_mentor_public_profile(uuid);
CREATE FUNCTION public.get_mentor_public_profile(_mentor_id uuid)
RETURNS TABLE(
  id         uuid,
  full_name  text,
  university text,
  countries  text[],
  course     text,
  year       text,
  price_inr  int,
  bio        text,
  topics     text[],
  photo_url  text,
  verified_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT m.id, m.full_name, m.university, m.countries, m.course, m.year,
         m.price_inr, m.bio, m.topics, m.photo_url, m.verified_at
  FROM public.mentors m
  WHERE m.id = _mentor_id
    AND m.status = 'approved'::public.mentor_status;
$$;
-- Live ACL is default PUBLIC EXECUTE; a bare CREATE restores that, so no
-- explicit GRANT/REVOKE is needed to match it.
