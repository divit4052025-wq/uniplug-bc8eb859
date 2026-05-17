---
name: supabase-migration
description: Author a Supabase migration with a paired dev-seed that proves the change with both rejection and happy-path tests inside a single BEGIN...ROLLBACK transaction.
model_class:
  design: opus
  execution: sonnet
triggers:
  - "Creating a file under supabase/migrations/"
  - "Modifying RLS policies, triggers, RPCs, or schema"
  - "User says: write a migration, add an RLS policy, change a trigger, add a column"
  - "Any schema change that will run against the live Supabase project"
allowed-tools: Read, Write, Edit, Grep, Glob, Bash
---

# Skill: supabase-migration

Every migration ships with a paired **dev-seed** that proves it works. No exceptions. The dev-seed is the contract — the migration is the implementation.

## Why this skill exists

The Uniplug DB lives in production from day one. A bad migration is permanent damage: corrupted rows, RLS holes, broken triggers, lost audit history. The dev-seed is how we make a schema change without trusting our own reasoning — the test runs the policy *exactly as a real signed-in user would hit it* and prints PASS/FAIL.

The May 14 audit (`audits/2026-05-14/rls-audit.md`) shipped 5 RLS fixes in a single migration. Every fix had a rejection test. The reason we caught the self-approval tautology in demo prep — and didn't catch it in code review — is that the rejection test would have caught it but didn't exist. We don't repeat that.

## The pattern

For every migration `supabase/migrations/YYYYMMDDHHMMSS_<name>.sql`, write a paired `supabase/dev-seeds/<short-description>-verification.sql`.

The migration file:

1. Header comment explaining **what** changed and **why** (link to audit or issue).
2. Out-of-scope note if relevant.
3. `-- Verification: supabase/dev-seeds/<paired-file>.sql` line at the top.
4. `DROP POLICY IF EXISTS` before any `CREATE POLICY` (idempotent).
5. The schema change itself.

The dev-seed file:

1. Header block (see `references/dev-seed-template.sql`) explaining what it tests and how to run.
2. Single outer `BEGIN; ... ROLLBACK;` — never persisted, safe to re-run.
3. Setup that creates test users via `auth.users` insert (the `handle_new_user` trigger from Bug 6.2 cascades into `mentors`/`students`).
4. Test blocks that switch `SET LOCAL ROLE authenticated` and `SELECT set_config('request.jwt.claims', '{"sub":"<uuid>","role":"authenticated"}', true)` so `auth.uid()` returns the test caller and RLS evaluates as for a real user.
5. **At least one rejection test** per write policy — the attack the policy is supposed to block.
6. **At least one happy-path test** — the legitimate path still works.
7. A `TEMP` results table that records PASS/FAIL per test and a final `SELECT` that surfaces them. Any FAIL aborts the merge.

## Canonical examples (live in the repo)

- `supabase/migrations/20260514100001_rls_write_gating_hardening.sql` — adds `EXISTS(...)` to four WITH CHECK clauses (session_notes, session_action_points, reviews, mentor self-approval). Paired with `supabase/dev-seeds/bug-audit-rls-write-gating-verification.sql`.
- `supabase/migrations/20260514100002_rls_risk4_bookings_require_approved_mentor.sql` — gates bookings INSERT on approved-mentor status. Paired with `supabase/dev-seeds/bug-audit-rls-risk4-verification.sql`.
- `supabase/migrations/20260517000001_session_completed_notification.sql` — completed-booking trigger fires a notification. Paired with `supabase/dev-seeds/feature-batch-session-completed-verification.sql`.

Read those three pairs before authoring a new one — they cover write-gating, business-relationship gating, and trigger verification respectively.

## Workflow

1. **Design.** State the invariant in one sentence (e.g. "A mentor can only insert a session note for a student they share a confirmed or completed booking with"). Identify the **rejection case** (the attack you're blocking) and the **happy path**. If you can't state the invariant cleanly, stop — the design isn't ready.
2. **Author the migration.** Start with the header. Drop-then-create policies for idempotence. Reference the paired dev-seed file in the header.
3. **Author the dev-seed.** Setup → rejection test → happy-path test → results table → final SELECT. Use stable UUIDs (`11111111-1111-1111-1111-1111111100a1` etc.) so test rows are predictable.
4. **Run the dev-seed.** Paste into Supabase SQL Editor or pipe via the Supabase MCP `execute_sql`. Confirm every row is PASS. If anything FAILs, fix the migration — never weaken the test.
5. **Apply the migration.** `supabase migration up` or via Supabase MCP `apply_migration`. Verify the migration appears in `supabase migration list` and the live policy / trigger matches what you wrote (`pg_policies`, `information_schema.triggers`).
6. **Commit both files together** in the same commit. Migration and its proof move as a unit.

## Anti-patterns

- **`WITH CHECK` that self-references the target row's user column without a relationship check.** Identity alone (`auth.uid() = mentor_id`) is rarely enough — it lets an authenticated user act on *any* row they claim ownership of. Use `EXISTS(...)` against the related table.
- **`WITH CHECK` on a self-reference for column-level locks.** This was the demo bug: `WITH CHECK (status = OLD.status)` is tautological because `WITH CHECK` evaluates against the *new* row only. Use a `BEFORE UPDATE` trigger that compares `OLD.status` and `NEW.status` instead.
- **Mocking `auth.uid()`.** The dev-seed sets the JWT claims and role so `auth.uid()` evaluates for real — never stub it. A test that doesn't go through RLS is not a test of RLS.
- **Skipping the rejection case.** A test that only proves the happy path passes is a test that doesn't catch the policy being too permissive. Both directions, every time.
- **Editing an already-applied migration.** Once a migration has been applied to the live project, edit a *new* migration instead. The dev-seed for the original stays — it documents what the original was supposed to do.

## See also

- `rls-review` skill — for posture rules across the whole schema.
- `release-checklist` skill — the "dev-seed passed" line item that gates merge.
