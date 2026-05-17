---
name: release-checklist
description: Pre-merge verification — build green, lint clean, typecheck clean, dev-seeds passing, migrations actually applied to live Supabase, Cloudflare deploy triggered, uniplug.app reflects the change. Specifically built to prevent the May 16 "branch pushed but never merged to main" failure mode.
model_class: sonnet
triggers:
  - "About to merge a feature branch into main"
  - "User says: ready to ship, run release checks, pre-merge check"
  - "Any time the question is can this go to production"
allowed-tools: Read, Bash, Grep, Glob
---

# Skill: release-checklist

The May 16 incident: a sprint branch was pushed to GitHub but the merge into `main` never happened. Cloudflare deploys from `main`, so production ran pre-sprint code for ~16 hours. The work *looked* shipped — every commit was pushed, the PR was open, the dev seeds passed — but production was unchanged.

This skill is the safety net. Every item is verified end-to-end, not assumed.

## The checklist

Run through `checklist.md` step by step. Every item is either PASS, FAIL, or N/A. A FAIL blocks the merge. An N/A requires an explicit one-line justification.

The structured list is in `checklist.md` and reproduced here. The order matters — earlier items are prerequisites for later ones.

### Pre-merge

1. **Branch is up to date with `main`.** `git fetch origin main && git merge-base --is-ancestor origin/main HEAD` exits 0. If not, rebase or merge `main` first.
2. **Working tree is clean.** `git status` shows nothing uncommitted, no untracked files that should be tracked.
3. **`npm run build` passes** locally. Capture the exit code and a snippet of the output.
4. **`npm run lint` passes** with zero errors. Warnings acceptable, errors not.
5. **`npx tsc --noEmit` passes** with zero errors.
6. **All dev-seeds for migrations in this change have been run** and return all-PASS. Map each `supabase/migrations/*.sql` in the diff to its paired `supabase/dev-seeds/*-verification.sql` and confirm a recent PASS.
7. **The branch's commits are reviewed.** No `WIP`, no `fixup!`, no debug `console.log` left in. Squashes / rebases as needed.

### Database

8. **For every new migration, it has been applied to the live Supabase project.** `supabase migration list` (or the Supabase MCP `list_migrations`) shows it. The migration file in the repo matches what's deployed (no post-merge edits).
9. **Live `pg_policies` / `information_schema.triggers` reflect the migration.** Spot-check the specific objects the migration touched.
10. **No advisor warnings** that the migration introduced. Run `get_advisors` via Supabase MCP after applying.

### Merge

11. **Merge happens to `main`.** Not just a push of the feature branch — an actual merge (squash, rebase, or merge commit) into `main`. **This is the step that May 16 missed.**
12. **`main` on origin contains the new commits.** `git fetch origin main && git log origin/main..HEAD` is empty when run on `main`.
13. **CI on `main` is green** (if CI is wired). If not wired, the local build from step 3 stands in for now — but raise as a follow-up to add CI.

### Deploy

14. **Cloudflare deploy was triggered for `main`.** The Workers dashboard shows a deployment with a hash that matches the latest `main` commit.
15. **Deploy succeeded.** Status: success in Cloudflare dashboard.
16. **`uniplug.app` serves the new code.** Open the site, do one user-visible smoke test for the feature shipped. If the change is invisible to users (a backend-only fix), hit a known endpoint and verify the response.

### Post-merge

17. **Migration state matches code state on `main`.** Run `list_migrations` against the live project, compare against `supabase/migrations/` on `main`. Drift here is the symptom of a missed apply.
18. **Document the release** in `audits/<date>/release.md` or commit message body if minor. For sprint-level releases, write a short release note.
19. **Close the source branch.** Delete the remote branch (`git push origin --delete <branch>`) unless there's a reason to keep it.

## Failure modes this prevents

- **"Pushed but not merged."** Step 11 + 12 catch this directly.
- **"Migrated locally but not in production."** Step 8 + 9 + 17 catch this.
- **"Build worked yesterday."** Step 3 runs *now*.
- **"The dev-seed passed three weeks ago."** Step 6 demands a recent PASS for the migrations in *this* diff.
- **"CD pipeline was supposed to deploy."** Step 14 verifies the deploy actually happened.

## Outputs

When the skill runs, it produces a markdown report:

```
# Release check — <branch> → main — <date>

| # | Check | Status | Detail |
| - | - | - | - |
| 1 | Branch up to date | PASS | origin/main = abc123, HEAD has 5 commits ahead |
| 2 | Working tree clean | PASS | |
| 3 | npm run build | PASS | exit 0, 2.1s |
...

Overall: PASS (or FAIL — n items)
```

The `release-reviewer` subagent invokes this skill and surfaces any FAIL before allowing the merge.

## Anti-patterns

- **Trust without verify.** "I'm sure I merged that" — verify with `git log`. "I'm sure that migration applied" — verify with `list_migrations`. "I'm sure deploy went out" — verify with the Cloudflare dashboard.
- **Skipping a step because "it's a small change."** A small change can still ship to the wrong branch.
- **Running the checklist after the merge.** It's a pre-merge gate. Post-merge is too late.

## See also

- `checklist.md` (this directory) — the machine-readable list.
- `release-reviewer` subagent — the wrapping role that runs this skill.
- `supabase-migration` skill — dev-seed verification this checklist relies on.
