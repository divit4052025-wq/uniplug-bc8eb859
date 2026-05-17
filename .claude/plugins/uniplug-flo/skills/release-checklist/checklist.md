# Release checklist

Tick each item before merging to `main`. A FAIL blocks the merge. An N/A
needs a one-line justification. Order matters — earlier items unblock later
ones.

## Pre-merge

- [ ] **1. Branch up to date with `main`.** `git fetch origin main && git merge-base --is-ancestor origin/main HEAD` exits 0.
- [ ] **2. Working tree clean.** `git status` shows nothing uncommitted.
- [ ] **3. `npm run build` passes** locally with exit 0.
- [ ] **4. `npm run lint` passes** with zero errors.
- [ ] **5. `npx tsc --noEmit` passes** with zero errors.
- [ ] **6. Every new migration's dev-seed returned all-PASS** in the last 24h.
- [ ] **7. Commits reviewed.** No `WIP`, `fixup!`, or debug `console.log` lines.

## Database

- [ ] **8. Each new migration applied to the live Supabase project.** `list_migrations` shows it.
- [ ] **9. Live `pg_policies` / triggers match the migration.** Spot-check the objects touched.
- [ ] **10. No new advisor warnings.** `get_advisors` clean for objects touched.

## Merge

- [ ] **11. Merge to `main` actually happened.** Not just a push of the feature branch — a real merge into `main`.
- [ ] **12. `origin/main` contains the new commits.** `git log origin/main..HEAD` on `main` is empty.
- [ ] **13. CI on `main` is green** (or local build from step 3 stands in, with a follow-up to add CI).

## Deploy

- [ ] **14. Cloudflare deploy triggered for `main`** with the latest commit hash.
- [ ] **15. Deploy succeeded.** Status: success in Cloudflare dashboard.
- [ ] **16. `uniplug.app` serves the new code.** Smoke-test one user-visible behavior.

## Post-merge

- [ ] **17. Migration state matches `main`.** No drift between `list_migrations` and `supabase/migrations/`.
- [ ] **18. Release documented** — release note in commit body or `audits/<date>/release.md` for sprint-level releases.
- [ ] **19. Source branch closed.** `git push origin --delete <branch>` if no reason to keep it.

---

**Overall status:** ⬜ PASS / ⬜ FAIL (number)

**FAIL items:** _(none if PASS)_

**N/A items + justification:** _(empty by default)_
