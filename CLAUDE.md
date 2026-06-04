# CLAUDE.md — UniPlug working conventions (read first, every session)

UniPlug: two-sided peer-mentorship marketplace (Indian school students ↔ verified college mentors, paid 1:1 video). Stack: TanStack Start + React 19 + TS + Vite + Tailwind v4 + shadcn/ui on Cloudflare Workers; Supabase (Postgres + Auth + RLS). Repo divit4052025-wq/uniplug-bc8eb859.

## Source of truth
- docs/STATE.md = canonical phase numbering + current status. Read it first.
- docs/plans/phase-4-scheduling-remodel.md, docs/plans/phase-5-6-plan.md = detailed specs.

## Workflow
- A separate Claude (chat) is the architect/reviewer and writes the prompts; this CC session executes, then STOPS for review. NEVER merge to main or open a PR without that review.
- One prompt at a time; finish it (commit + push) before anything else.

## Git
- Branch naming: claude/{purpose}-{YYYY-MM-DD}, always cut from origin/main (git fetch origin && git checkout -b <branch> origin/main).
- NEVER destructive git (force-push, reset --hard, history rewrite) without explicit authorization. On any unexpected repo state, STOP and report.

## Database
- Every migration ships with a paired dev-seed: one BEGIN..ROLLBACK with a rejection test + a happy-path test, ending in a PASS/FAIL SELECT.
- Regenerate src/integrations/supabase/types.ts on any schema change. Re-run existing dev-seeds each change to prove no regression. Run rls-review on RLS changes.
- Dev-seeds run via docker exec into the local Supabase container; the local DB is rebuildable with `supabase db reset`.

## Verification (NO headless browser)
- Gate every change on npx tsc --noEmit, lint, and build. For routes/UI, verify via curl SSR HTML + grep + code reads only — never a headless browser.
- Run /run-release-checks (the 19-item gate) before any merge.

## Safety rails
- ADDITIVE-ONLY: do not drop/rename tables, columns, or RPCs; protect working features. The only intended behaviour changes are the ones listed in the plan docs.
- The HOSTED Supabase project is on HOLD: do NOT apply migrations to hosted until the explicit reconciliation step. Local work only.
- Child-safety + payments are highest-stakes: any change touching consent, minor-gating, or money MUST run the adversarial review (dynamic workflow) before merge — a green dev-seed alone is NOT sufficient.

## Tooling
- The uniplug-flo plugin (.claude/plugins/uniplug-flo) auto-invokes reviewers (db/payments/security/release/ux) + skills + /run-release-checks. Use dynamic-workflow agents for parallel READ/review only — never parallel write to the repo.
- Model routing: Opus for design/architecture/security/DB; Sonnet for UI/execution/refactor.
