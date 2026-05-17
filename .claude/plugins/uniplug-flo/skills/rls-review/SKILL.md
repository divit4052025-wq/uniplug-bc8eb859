---
name: rls-review
description: Review Row Level Security posture against Uniplug's strict-by-default rules — EXISTS-over-related-tables for write gating, BEFORE UPDATE triggers for column-level locks, SECURITY DEFINER helpers for RLS-restricted subqueries, no tautological WITH CHECK clauses.
model_class: opus
triggers:
  - "Any PR or migration touching CREATE POLICY / DROP POLICY / FOR (INSERT|UPDATE|DELETE)"
  - "New table being added to the public schema"
  - "User says: review RLS, audit policies, is this RLS safe"
  - "When evaluating whether an existing policy is too permissive"
allowed-tools: Read, Grep, Glob, Bash
---

# Skill: rls-review

Uniplug treats RLS as the security boundary. The frontend, RPCs, and app code are all defense in depth on top of policies — never instead of. A wrong RLS policy is a permanent leak the moment it ships, because Supabase's public anon key is on every device.

## The four rules

### 1. Strict by default

RLS is **enabled** on every public table (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`). No table is ever exposed without a policy, and the default policy posture is *deny* — every action (SELECT, INSERT, UPDATE, DELETE) needs an explicit `CREATE POLICY` to permit it. If you can't articulate *which user* should be allowed to do *which operation* on *which row*, the table isn't ready for production.

Uniplug currently has 13 public tables with RLS enabled (per `audits/2026-05-14/rls-audit.md`). Adding a 14th means adding RLS in the same migration that creates it.

### 2. EXISTS-over-related-tables for write gating

Identity alone (`auth.uid() = mentor_id`) is rarely sufficient on a WITH CHECK. It proves the caller owns the row they're writing, but not that the *business relationship* the row depends on actually exists.

The May 14 audit caught four policies that had this exact gap:

- `session_notes` INSERT/UPDATE — mentor proves they're the author, but not that they share a booking with the target student. A malicious mentor could write a note against any student UUID.
- `session_action_points` INSERT — same shape, same risk.
- `reviews` INSERT — student proves they're the author, but not that they've completed a session with the mentor they're reviewing.
- `mentor_payouts` (writes through service_role only) — separate problem, gated above the policy layer.

The fix is `EXISTS (SELECT 1 FROM public.bookings b WHERE b.mentor_id = auth.uid() AND b.student_id = session_notes.student_id AND b.status IN ('confirmed', 'completed'))` inside the WITH CHECK. The SELECT only sees rows the caller can already see under bookings RLS, which closes the loop.

When you review a write policy, ask: *what business relationship makes this write legitimate, and is it expressed in the WITH CHECK?*

### 3. BEFORE UPDATE triggers for column-level locks

`WITH CHECK` evaluates against the new row only. There is no `OLD` in `WITH CHECK`. The naive pattern `WITH CHECK (status = OLD.status)` was tried during demo prep on `bookings` UPDATE — it's a **tautology** because `status` *is* `OLD.status` in WITH CHECK's frame. The policy let any mentor mutate any booking field including status.

Column-level locks belong in a `BEFORE UPDATE` trigger:

```sql
CREATE OR REPLACE FUNCTION public.block_mentor_self_approval()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.approval_status IS DISTINCT FROM OLD.approval_status
     AND auth.uid() = NEW.id THEN
    RAISE EXCEPTION 'mentors cannot self-approve';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER block_mentor_self_approval
  BEFORE UPDATE ON public.mentors
  FOR EACH ROW
  EXECUTE FUNCTION public.block_mentor_self_approval();
```

This pattern lives in `supabase/migrations/20260514100001_rls_write_gating_hardening.sql`. Treat it as the canonical column-lock template.

### 4. SECURITY DEFINER helpers for RLS-restricted subqueries

When a policy's `EXISTS` needs to read a table the caller doesn't have RLS access to (e.g. checking `is_approved` on `mentors` from a `bookings` INSERT policy where the caller is the student and can only see *themselves* in `mentors`), an inline subquery returns zero rows and the policy silently fails closed — looking the same as a real auth failure.

The fix is a `SECURITY DEFINER` helper function owned by `postgres`:

```sql
CREATE OR REPLACE FUNCTION public.is_approved_mentor(mid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.mentors
    WHERE id = mid AND approval_status = 'approved'
  );
$$;

REVOKE ALL ON FUNCTION public.is_approved_mentor(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.is_approved_mentor(uuid) TO authenticated;
```

The May 14 audit's Risk 4 fix uses this pattern. The rules:

- `STABLE` so the planner can inline / cache it.
- `SET search_path = public` so it can't be hijacked.
- Always `REVOKE ALL` from `public` and only `GRANT EXECUTE` to the role that needs it.
- Helper functions live in `public` schema with descriptive names — never `_check_thing` or other internal-y names.

## Review checklist

For each new or modified policy, walk through:

1. **Table has RLS enabled?** `pg_class.relrowsecurity = true`.
2. **The four CRUD verbs are individually accounted for?** Missing `FOR UPDATE` = nobody can update. Missing means deny, not "default allow."
3. **USING and WITH CHECK both present where required?** UPDATE policies need both — USING for "which rows can I see to update", WITH CHECK for "what the row may become."
4. **WITH CHECK expresses the business relationship, not just identity?** See Rule 2.
5. **No tautological self-references?** No `WITH CHECK (col = col)` or `WITH CHECK (status = OLD.status)` (the latter doesn't even parse correctly — verify).
6. **Subqueries inside the policy don't hit RLS-restricted tables the caller can't read?** If they do, refactor to a SECURITY DEFINER helper.
7. **Column-level locks live in a BEFORE UPDATE trigger, not WITH CHECK?** See Rule 3.
8. **Paired dev-seed with rejection test for the threat the policy blocks?** See the `supabase-migration` skill.
9. **`DROP POLICY IF EXISTS` before `CREATE POLICY` for idempotence?**
10. **`pg_policies` matches the migration file?** If they disagree, the migration didn't apply or was edited post-hoc — both are blockers.

## Outputs

A review should produce a short report with sections:

- **Summary** (one paragraph — overall posture, any HIGH findings).
- **Findings** (one bullet per policy reviewed, with status: OK / WEAK / HIGH).
- **Recommended actions** (concrete migrations to write, in priority order).
- **Out of scope** (anything you noticed but didn't review).

Use `audits/2026-05-14/rls-audit.md` as the format template.

## See also

- `supabase-migration` skill — for how to author the fix.
- `security-audit` skill — for the broader review that contains RLS as one section.
- `audits/2026-05-14/rls-audit.md` — the most recent full audit.
