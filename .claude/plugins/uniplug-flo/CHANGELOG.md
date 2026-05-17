# Changelog

## 0.1.0 — 2026-05-17

Initial release.

- 10 skills: `supabase-migration`, `rls-review`, `security-audit`, `playwright-qa`, `brand-ui`, `payments-ledger`, `ai-feature-builder`, `react-query-mutation`, `observability`, `release-checklist`.
- 6 subagents: `db-reviewer`, `payments-reviewer`, `ux-reviewer`, `security-reviewer`, `release-reviewer`, `investigation-agent`.
- 3 hooks: `post-edit-format.sh`, `pre-commit-typecheck.sh`, `post-migration-dev-seed-check.sh`.
- 7 slash commands: `/audit-security`, `/review-db`, `/review-ux`, `/review-payments`, `/scaffold-test`, `/run-release-checks`, `/investigate`.
- Model routing across opus / sonnet / haiku per the principles in `model-routing.json`.

Notable references:

- `release-checklist` exists specifically to prevent the May 16, 2026 incident where a sprint branch was pushed but never merged into `main`, leaving production on pre-sprint code for ~16 hours.
- `rls-review` documents the WITH CHECK self-reference tautology caught in April 30 demo prep and the SECURITY DEFINER helper pattern from the May 14 audit's Risk 4 fix.
- `react-query-mutation` references `src/routes/notifications.tsx markAsRead` as the canonical implementation and notes the in-flight `useOptimisticMutation` hook on a parallel branch.

## Planned

- When `useOptimisticMutation` lands on `main`, update `react-query-mutation` skill to point at the hook and demote the inline pattern to "legacy."
- Add a Sentry / Cloudflare-telemetry section to the `observability` skill once that lands.
- Tax handling (GST, TDS) for `payments-ledger` skill — currently noted as deferred to V1 build phase.
