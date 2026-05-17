---
name: run-release-checks
description: Run the 19-item pre-merge release checklist before merging a branch to main. Specifically built to prevent the May 16 "pushed but never merged" failure.
argument-hint: "[branch: <branch-name>]"
---

Invoke the **release-reviewer** subagent (`agents/release-reviewer.md`).

Default branch: the current `HEAD` branch. $ARGUMENTS can specify a
different branch to check.

The subagent will:

1. Walk the 19-item checklist in `skills/release-checklist/checklist.md`
   in order.
2. Run the actual verification commands (`git status`, `npm run build`,
   `npx tsc --noEmit`, `git fetch origin main`, etc.).
3. For new migrations in the diff, confirm the paired dev-seed has been
   run and returned all-PASS recently (via the `supabase-migration`
   skill).
4. Produce the structured release-check report (markdown table).
5. Verdict: PASS (merge cleared) or FAIL (with the blocker list).

**The subagent does NOT perform the merge itself** — only verifies. The
human authorizes the merge once verdict is PASS.

If verdict is FAIL, stop and surface the blockers. Do not propose
workarounds; fix the underlying failures.
