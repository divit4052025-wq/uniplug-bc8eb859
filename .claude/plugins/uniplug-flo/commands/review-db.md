---
name: review-db
description: Review pending database changes — migrations, dev-seeds, RLS policies, triggers, RPCs. Invoke before merging any PR that touches supabase/.
argument-hint: "[scope: diff | branch | last-N-commits]"
---

Invoke the **db-reviewer** subagent (`agents/db-reviewer.md`).

Default scope: the current branch's diff against `origin/main`. If
$ARGUMENTS specifies otherwise (e.g. `last-3-commits`), pass the scope
through.

The subagent will:

1. Read every migration and dev-seed in scope.
2. Walk the `supabase-migration` skill checklist (header, pairing,
   rejection + happy path tests, idempotent DROP-then-CREATE).
3. Walk the `rls-review` skill rules (strict default, EXISTS over
   related tables, BEFORE UPDATE triggers, SECURITY DEFINER helpers).
4. Compare live `pg_policies` against the migration files (Supabase MCP
   `list_migrations` + ad-hoc SELECTs).
5. Produce a HIGH/MED/LOW findings report with file:line references.

Stop before merge if any HIGH is unresolved.
