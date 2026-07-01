-- ============================================================================
-- ADMIN CONSOLE — PHASE 0 FOUNDATION: server-side role system + immutable audit
-- log. Additive, reversible, LOCAL-only (hosted Supabase is FROZEN).
-- ============================================================================
-- Replaces the hardcoded-founder-email admin guard with a DATA-DRIVEN role
-- system, WITHOUT touching the ~15 admin RPCs or ~20 RLS policies that already
-- call public.is_admin(): we only CREATE OR REPLACE is_admin() so its truth now
-- comes from a new public.admin_roles table instead of an email string-compare.
-- Every is_admin()-gated surface (admin_list_*, approve_mentor, ref_* RLS, …)
-- keeps working unchanged for any user who holds an active admin role.
--
-- WHAT THIS ADDS
--   • public.admin_roles            — who is an admin and at what scope (RLS-locked).
--   • public.admin_audit_log        — immutable append-only trail of admin actions.
--   • is_admin()  (REPLACED)        — now: caller has ANY active admin_roles row.
--   • is_super_admin()              — caller holds an active 'super_admin' role.
--   • current_admin_role()          — caller's highest active role, or NULL (client guard).
--   • handle_admin_bootstrap()      — AFTER INSERT trigger that seeds the founder
--                                     as super_admin (the ONLY place the founder
--                                     email lives — a bootstrap seed, not the guard).
--   • log_admin_action(...)         — append an audit row (actor = auth.uid()).
--   • admin_grant_role / admin_revoke_role — super-admin-only, self-logging.
--   • admin_list_audit_log(...)     — is_admin()-gated reader for the console.
--
-- WHY a bootstrap trigger: 12 existing dev-seeds (and the real founder on hosted)
-- create the founder auth.users row and rely on is_admin()=true. The AFTER INSERT
-- trigger grants super_admin in the SAME transaction, so those fixtures stay green
-- with zero edits, and is_admin() no longer hardcodes any email.
--
-- DESIGN FOR LATER (no schema rework): admin_roles.role is a CHECK-constrained
-- text that ALREADY reserves the future scoped roles (safeguarding_reviewer/
-- support/finance). They are NOT grantable yet: admin_grant_role() accepts ONLY
-- super_admin for now, because is_admin() is currently a coarse "any active admin
-- role" predicate that gates the existing safeguarding/consent/identity RPCs.
-- Granting a scoped role today would silently confer FULL safeguarding access —
-- the opposite of least privilege. A later phase must re-gate those sensitive
-- RPCs to role-specific predicates (is_safeguarding_reviewer() etc.) BEFORE the
-- scoped roles become grantable. We SEED + grant ONLY super_admin now.
--
-- Mirrors house idioms:
--   • Fully-locked table = RLS ON + REVOKE ALL + NO policies (safety_reports
--     20260627000003 / payment_ledger 20260531120002).
--   • SECURITY DEFINER + SET search_path = public, pg_temp + REVOKE/GRANT with
--     full arg signature + COMMENT (c_admin_actions 20260604000030).
--   • Append-only via no-UPDATE/DELETE-path, NOT a TG_OP trigger (payment_ledger).
--
-- Pairs with dev-seed supabase/dev-seeds/admin-p0-role-system-audit-verification.sql
-- ============================================================================

-- ── 1. admin_roles — the data-driven admin registry ─────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_roles (
  user_id     uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('super_admin', 'safeguarding_reviewer', 'support', 'finance')),
  granted_by  uuid,                                   -- the super-admin who granted (NULL = bootstrap)
  granted_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at  timestamptz,                            -- soft revoke; active = revoked_at IS NULL
  PRIMARY KEY (user_id, role)
);

-- Fast "is this user an active admin?" lookup.
CREATE INDEX IF NOT EXISTS admin_roles_active_user_idx
  ON public.admin_roles (user_id)
  WHERE revoked_at IS NULL;

-- Fully locked: no anon/authenticated access at all. All reads/writes flow through
-- the SECURITY DEFINER helpers/RPCs below (or service_role). A policy here would be
-- dead code once grants are revoked, so we add none on purpose.
ALTER TABLE public.admin_roles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_roles FROM anon, authenticated;

COMMENT ON TABLE public.admin_roles IS
  'Admin Console P0 (2026-07-01): data-driven admin registry that replaces the hardcoded-email guard. (user_id, role) with soft-revoke (revoked_at). role CHECK already admits future scoped roles; only super_admin is seeded now. RLS-locked (REVOKE ALL, no policies) — access via is_admin()/admin_grant_role()/admin_list_audit_log() etc.';

-- ── 2. admin_audit_log — immutable, append-only trail ───────────────────────
-- No foreign keys on actor/target (safeguarding idiom): a record must outlive the
-- deletion of any user/booking it references. Immutability = RLS ON + REVOKE ALL +
-- NO policies + no UPDATE/DELETE path (the payment_ledger pattern), NOT a trigger.
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id      uuid NOT NULL,                         -- the admin who acted (auth.uid())
  action        text NOT NULL CHECK (char_length(action) BETWEEN 1 AND 120),
  target_type   text CHECK (target_type IS NULL OR char_length(target_type) BETWEEN 1 AND 60),
  target_id     uuid,
  target_label  text CHECK (target_label IS NULL OR char_length(target_label) <= 200),
  justification text CHECK (justification IS NULL OR char_length(justification) <= 2000),
  detail        jsonb,                                 -- structured extra context
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_audit_log_created_idx
  ON public.admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_log_actor_idx
  ON public.admin_audit_log (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_log_target_idx
  ON public.admin_audit_log (target_type, target_id, created_at DESC)
  WHERE target_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS admin_audit_log_action_idx
  ON public.admin_audit_log (action, created_at DESC);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_audit_log FROM anon, authenticated;

COMMENT ON TABLE public.admin_audit_log IS
  'Admin Console P0 (2026-07-01): immutable append-only audit trail of admin actions (actor=auth.uid(), action, target, justification, detail). RLS-on + REVOKE ALL + no policies + no UPDATE/DELETE path = immutable (payment_ledger idiom). No FK so a record outlives the rows it references. Appended only via log_admin_action()/the admin RPCs; read via admin_list_audit_log().';

-- ── 3. is_admin() — REPLACED: now data-driven (no email literal) ────────────
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_roles ar
    WHERE ar.user_id = auth.uid()
      AND ar.revoked_at IS NULL
  );
$$;

COMMENT ON FUNCTION public.is_admin() IS
  'Admin Console P0 (2026-07-01): TRUE iff the caller holds ANY active (revoked_at IS NULL) public.admin_roles row. Replaces the prior hardcoded-email check; every existing is_admin()-gated RPC/RLS policy now consults admin_roles unchanged. SECURITY DEFINER STABLE — evaluates against the original caller''s auth.uid().';
-- NOTE: is_admin()''s grants are deliberately left UNCHANGED (default PUBLIC
-- EXECUTE, as on main) — ~20 existing RLS policies call it from anon/authenticated
-- contexts, so revoking EXECUTE could turn clean policy denials into "permission
-- denied for function" errors. It only ever returns the caller''s own boolean.

-- ── 4. is_super_admin() + current_admin_role() ──────────────────────────────
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_roles ar
    WHERE ar.user_id = auth.uid()
      AND ar.role = 'super_admin'
      AND ar.revoked_at IS NULL
  );
$$;

REVOKE ALL     ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_super_admin() TO authenticated, service_role;

COMMENT ON FUNCTION public.is_super_admin() IS
  'Admin Console P0 (2026-07-01): TRUE iff the caller holds an active super_admin role. Use for the narrow super-admin-only surfaces (identity-document views, role grants). Locked to authenticated/service_role (it is new — no RLS policy references it).';

-- Caller's highest-precedence active admin role, or NULL. Granted to authenticated
-- so the client route guard can resolve admin-ness without an email literal. Only
-- ever reveals the CALLER's own role.
CREATE OR REPLACE FUNCTION public.current_admin_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT ar.role
  FROM public.admin_roles ar
  WHERE ar.user_id = auth.uid()
    AND ar.revoked_at IS NULL
  ORDER BY CASE ar.role
             WHEN 'super_admin'           THEN 0
             WHEN 'safeguarding_reviewer'  THEN 1
             WHEN 'support'                THEN 2
             WHEN 'finance'                THEN 3
             ELSE 9
           END
  LIMIT 1;
$$;

REVOKE ALL     ON FUNCTION public.current_admin_role() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.current_admin_role() TO authenticated, service_role;

COMMENT ON FUNCTION public.current_admin_role() IS
  'Admin Console P0 (2026-07-01): returns the CALLER''s highest-precedence active admin role (super_admin>safeguarding_reviewer>support>finance), or NULL if not an admin. Granted to authenticated for the client route guard; reveals only the caller''s own role.';

-- ── 5. founder bootstrap (the ONLY place the founder email lives) ───────────
CREATE OR REPLACE FUNCTION public.handle_admin_bootstrap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  -- The trigger WHEN clause already restricts this to the email-CONFIRMED founder
  -- row, so just record the grant. This is a BOOTSTRAP (how the first super-admin
  -- enters admin_roles), not the guard — is_admin() reads admin_roles, never an
  -- email. All OTHER grants go through admin_grant_role() (super-admin-only).
  INSERT INTO public.admin_roles (user_id, role, granted_by, granted_at)
  VALUES (NEW.id, 'super_admin', NULL, now())
  ON CONFLICT (user_id, role) DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  -- Audit the keys-to-the-kingdom grant so the founder's own elevation has a trail.
  IF v_count > 0 THEN
    INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id, detail)
    VALUES (NEW.id, 'bootstrap_super_admin', 'admin_role', NEW.id,
            jsonb_build_object('source', 'founder_bootstrap'));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS admin_bootstrap_founder ON auth.users;
CREATE TRIGGER admin_bootstrap_founder
  AFTER INSERT ON auth.users
  FOR EACH ROW
  WHEN (lower(NEW.email) = lower('divitfatehpuria7@gmail.com')
        AND NEW.email_confirmed_at IS NOT NULL)
  EXECUTE FUNCTION public.handle_admin_bootstrap();

COMMENT ON FUNCTION public.handle_admin_bootstrap() IS
  'Admin Console P0 (2026-07-01): AFTER INSERT on auth.users (WHEN founder email AND email-confirmed) — seeds the founder as super_admin (bootstrap of the first admin, the only founder-email reference in the role system) and writes a bootstrap_super_admin audit row. Idempotent (ON CONFLICT DO NOTHING). The email_confirmed_at guard stops an unconfirmed/squatted signup of the founder address from elevating.';

-- One-time backfill for the founder row that already exists + is confirmed
-- (hosted) before this trigger existed. No-op locally where the founder has not
-- been created. Audited identically.
WITH seeded AS (
  INSERT INTO public.admin_roles (user_id, role, granted_by, granted_at)
  SELECT u.id, 'super_admin', NULL, now()
  FROM auth.users u
  WHERE lower(u.email) = lower('divitfatehpuria7@gmail.com')
    AND u.email_confirmed_at IS NOT NULL
  ON CONFLICT (user_id, role) DO NOTHING
  RETURNING user_id
)
INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id, detail)
SELECT user_id, 'bootstrap_super_admin', 'admin_role', user_id,
       jsonb_build_object('source', 'founder_backfill')
FROM seeded;

-- ── 6. log_admin_action — append an audit row (actor = auth.uid()) ──────────
CREATE OR REPLACE FUNCTION public.log_admin_action(
  _action        text,
  _target_type   text DEFAULT NULL,
  _target_id     uuid DEFAULT NULL,
  _target_label  text DEFAULT NULL,
  _justification text DEFAULT NULL,
  _detail        jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_id    uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _action IS NULL OR char_length(btrim(_action)) = 0 THEN
    RAISE EXCEPTION 'action_required' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.admin_audit_log
    (actor_id, action, target_type, target_id, target_label, justification, detail)
  VALUES
    (v_actor, btrim(_action), _target_type, _target_id, _target_label, _justification, _detail)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

REVOKE ALL     ON FUNCTION public.log_admin_action(text, text, uuid, text, text, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.log_admin_action(text, text, uuid, text, text, jsonb) TO authenticated, service_role;

COMMENT ON FUNCTION public.log_admin_action(text, text, uuid, text, text, jsonb) IS
  'Admin Console P0 (2026-07-01): append-only audit write. Gates on is_admin(); actor is always auth.uid() (never client-supplied). Used for logging sensitive READS from server functions; mutating admin RPCs insert their own audit rows inline.';

-- ── 7. admin_grant_role / admin_revoke_role (super-admin only, self-logging) ─
CREATE OR REPLACE FUNCTION public.admin_grant_role(_user_id uuid, _role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'user_required' USING ERRCODE = 'P0001';
  END IF;
  IF _role NOT IN ('super_admin', 'safeguarding_reviewer', 'support', 'finance') THEN
    RAISE EXCEPTION 'invalid_role' USING ERRCODE = 'P0001';
  END IF;
  -- Only super_admin is grantable right now. The scoped roles are reserved in the
  -- table CHECK but NOT enforced — is_admin() treats every role as full admin, so
  -- granting a scoped role would silently confer full safeguarding access. A later
  -- phase must re-gate the sensitive RPCs to role-specific predicates before
  -- opening this up. Until then, refuse to mint a half-privileged operator.
  IF _role <> 'super_admin' THEN
    RAISE EXCEPTION 'role_not_grantable_yet' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = _user_id) THEN
    RAISE EXCEPTION 'user_not_found' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.admin_roles (user_id, role, granted_by, granted_at, revoked_at)
  VALUES (_user_id, _role, v_actor, now(), NULL)
  ON CONFLICT (user_id, role)
    DO UPDATE SET revoked_at = NULL, granted_by = v_actor, granted_at = now();
  INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id, detail)
  VALUES (v_actor, 'grant_admin_role', 'admin_role', _user_id, jsonb_build_object('role', _role));
END $$;

REVOKE ALL     ON FUNCTION public.admin_grant_role(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_grant_role(uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_grant_role(uuid, text) IS
  'Admin Console P0 (2026-07-01): super-admin-only grant of an admin role (re-activates a revoked grant). Writes a grant_admin_role audit row. The non-bootstrap path for adding scoped admins later.';

CREATE OR REPLACE FUNCTION public.admin_revoke_role(_user_id uuid, _role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_count integer;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  -- Lockout guard: never revoke the LAST active super_admin. Target-specific —
  -- only bites when _user_id actually holds an active super_admin AND it is the
  -- only one left; revoking a role the target does not hold is a harmless no-op.
  IF _role = 'super_admin'
     AND EXISTS (SELECT 1 FROM public.admin_roles
                 WHERE user_id = _user_id AND role = 'super_admin' AND revoked_at IS NULL)
     AND (SELECT count(*) FROM public.admin_roles
          WHERE role = 'super_admin' AND revoked_at IS NULL) <= 1 THEN
    RAISE EXCEPTION 'cannot_revoke_last_super_admin' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.admin_roles
  SET revoked_at = now()
  WHERE user_id = _user_id AND role = _role AND revoked_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  -- Only audit a revoke that actually changed a row (no no-op noise in the trail).
  IF v_count > 0 THEN
    INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id, detail)
    VALUES (v_actor, 'revoke_admin_role', 'admin_role', _user_id, jsonb_build_object('role', _role));
  END IF;
END $$;

REVOKE ALL     ON FUNCTION public.admin_revoke_role(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_revoke_role(uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_revoke_role(uuid, text) IS
  'Admin Console P0 (2026-07-01): super-admin-only soft-revoke of an admin role. Refuses to revoke the last active super_admin. Writes a revoke_admin_role audit row.';

-- ── 8. admin_list_audit_log — is_admin()-gated reader for the console ────────
CREATE OR REPLACE FUNCTION public.admin_list_audit_log(
  _limit   integer DEFAULT 100,
  _offset  integer DEFAULT 0,
  _actor   uuid DEFAULT NULL,
  _action  text DEFAULT NULL
)
RETURNS TABLE (
  id            uuid,
  actor_id      uuid,
  actor_email   text,
  action        text,
  target_type   text,
  target_id     uuid,
  target_label  text,
  justification text,
  created_at    timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  -- NB: the immutable admin_audit_log.detail jsonb is deliberately NOT returned —
  -- it can carry target context and must not be transported to the browser. Read
  -- it via a service-role forensic query if ever needed.
  RETURN QUERY
    SELECT a.id, a.actor_id, u.email::text AS actor_email, a.action, a.target_type,
           a.target_id, a.target_label, a.justification, a.created_at
    FROM public.admin_audit_log a
    LEFT JOIN auth.users u ON u.id = a.actor_id
    WHERE (_actor IS NULL OR a.actor_id = _actor)
      AND (_action IS NULL OR a.action = _action)
    ORDER BY a.created_at DESC
    LIMIT GREATEST(0, LEAST(_limit, 500))
    OFFSET GREATEST(0, _offset);
END $$;

REVOKE ALL     ON FUNCTION public.admin_list_audit_log(integer, integer, uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_list_audit_log(integer, integer, uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_list_audit_log(integer, integer, uuid, text) IS
  'Admin Console P0 (2026-07-01): is_admin()-gated reader of the immutable audit log (newest first, capped at 500/page), optionally filtered by actor/action. Joins actor_email for display.';
