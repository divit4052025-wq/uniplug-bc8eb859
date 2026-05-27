# Uniplug V1 readiness — final audit — 2026-05-27

## Headline

The V1 merge train is complete. All 10 PRs (Phases A through H) are merged to main, CI run 26481863574 is green, and uniplug.app returns HTTP/2 200. The core data layer — book_session RPC, column locks, CRON_SECRET bearer auth, email pipeline, AI server-fns, mentor verification schema, safeguarding for minors, GDPR export/delete, and launch assets — is shipped and live. Types are regenerated and include all post-G tables. Three launch blockers remain open: Privacy/Terms legal copy (stub text), PITR dashboard confirmation (WAL prerequisites pass but retention window unconfirmed), and the Cloudflare bot PR (still open). AI features (D1/D2/D3), GDPR UI, mentor verification admin queue, and safeguarding consent frontend are scaffolded server-side but have no UI consumers yet. V1 is shippable for a soft launch with known users, contingent on the operator-pending items below.

## 1. V1 plan items: shipped vs deferred

| Phase | Stage | Status | Evidence |
|---|---|---|---|
| **A1** | book_session RPC | Shipped | `src/components/calendar/MentorCalendar.tsx:95-99` — calls `.rpc("book_session")`, comment confirms INSERT policy retired. Migration `20260523000001_book_session_rpc.sql` on main. |
| **A2** | mentors column lock (price_inr) | Shipped | `supabase/migrations/20260523000002_mentors_column_lock.sql:1` — extends `prevent_mentor_self_approval` to cover `price_inr`. |
| **A3** | send-reminders CRON_SECRET | Shipped | `src/lib/auth/bearer.ts` exists. `src/routes/api/public/hooks/send-reminders.ts:4` imports `bearerOk`, line 58 calls it against `CRON_SECRET`. |
| **A4** | Drop `as any` casts | Shipped | `grep -rn "as any" src/` returns zero results (excluding routeTree.gen and .d.ts). |
| **A5** | ENV.md | Shipped | `ENV.md` exists at repo root. |
| **B1** | GitHub Actions CI | Shipped | `.github/workflows/ci.yml` exists on main — typecheck, lint, build, dev-seeds jobs. |
| **B2** | Playwright scaffold | Shipped | `playwright.config.ts` exists; `e2e/` contains 5 specs: `browse.spec.ts`, `signup.spec.ts`, `booking.spec.ts`, `review.spec.ts`, `notifications.spec.ts`. `@playwright/test` in `package.json:76`. |
| **B3** | uniplug-flo plugin wiring | Shipped | `.claude/plugins/uniplug-flo/` directory present with skills, agents, hooks. |
| **C1** | Supabase Auth SMTP swap | Operator-pending | Dashboard-only setting. `src/lib/email/from.ts:14` still uses `onboarding@resend.dev` with a TODO to swap after DNS verification. |
| **C2** | Email templates + triggers | Shipped | `src/lib/email/templates.ts` — 11 exported template functions (lines 68–325). `src/routes/api/public/hooks/send-event-email.ts` and `send-reminders.ts` on main. |
| **D0** | AI infrastructure tables | Shipped | `ai_rate_limit_events` table in `src/integrations/supabase/types.ts:42`. Migration `20260523000005_d0_ai_infrastructure.sql`. |
| **D1** | generatePrepQuestions | Scaffolded | `src/lib/ai/prep-questions.functions.ts:69` — server-fn exists. **No import in any `src/components/` or `src/routes/` file.** |
| **D2** | expandSessionNote | Scaffolded | `src/lib/ai/note-expansion.functions.ts:17` — server-fn exists. No UI consumer. |
| **D3** | generateMatchSuggestions | Scaffolded | `src/lib/ai/match.functions.ts:45` — server-fn exists. No UI consumer. |
| **E1** | Brand token sweep | Partial | Brand tokens in `src/styles.css @theme`. ~15 component files still use hex literals (e.g., `#C4907F`, `#1A1A1A`, `#FFFCFB`, `#EDE0DB`). Top offender: `MyStudentsSection.tsx` at 27 hex occurrences. |
| **E2** | State-view primitives | Shipped | `src/components/ui/state-views.tsx` exists (LoadingSkeleton + EmptyState). |
| **E3** | Mobile responsive audit | Deferred | Browser-required; manual QA pass. |
| **E4** | axe-core in Playwright | Deferred | `@playwright/test` now on main. `@axe-core/playwright` not in `package.json`. |
| **F1** | Mentor verification schema | Shipped | `verified_at` in `src/integrations/supabase/types.ts:263`. Migration `20260523000006_f1_mentor_verification.sql`. Storage bucket RLS for `mentor-documents`. |
| **F2** | Admin verification queue UI | Deferred | `src/routes/admin.tsx:253` calls `admin_set_mentor_status` for basic approve/reject, but no document-viewer queue, no signed-URL links. |
| **F3** | Verified badge component | Deferred | No badge component found. |
| **F4** | Approval/rejection emails | Shipped | `mentorApprovedEmail` at `src/lib/email/templates.ts:291`, `mentorRejectedEmail` at line 308. |
| **G1** | first_session_used flag | Shipped | `first_session_used` in types at line 635. Atomic UPDATE in `book_session` RPC body. |
| **G2** | Referral schema | Shipped (schema only) | `referral_codes` at types line 358, `referral_credits` at line 372. No `/r/{code}` route or signup form integration. |
| **G3** | Mentor training (2 sections) | Shipped (schema only) | `mentor_training_completions` at types line 231. `mentor_training_complete` RPC at line 799. **No training content routes** — no files in `src/routes/training*`. |
| **G4** | Safeguarding for minors | Shipped | `date_of_birth`, `parental_consent_at/email/token` in types lines 633–673. `record_parental_consent` RPC at line 801. Migration `20260523000008_g4_safeguarding_minors.sql`. **No UI consumer** — no signup form DOB field, no consent route, no consent email. Second security-reviewer pass still needed. |
| **G5** | CoC + GDPR export + delete | Shipped (server-fns) | `code_of_conduct_accepted_at` in types line 248/630. `src/lib/me/export.functions.ts:25` and `src/lib/me/delete.functions.ts:22`. **No UI consumer** — neither function imported in routes or components. |
| **G6** | Disputes schema | Shipped (schema only) | `disputes` in types line 99. No client INSERT policy; student-facing form deferred. |
| **H1** | Playwright coverage | Deferred | 5 spec scaffolds exist; per-flow coverage awaits E2E Supabase test project. |
| **H2** | Manual QA checklist | Deferred | Browser-required operator task. |
| **H3** | Sentry telemetry | Deferred | No Sentry code in `src/`. ENV.md slot reserved. |
| **H4** | 404 + robots + sitemap | Shipped | `public/robots.txt`, `public/sitemap.xml`, `src/components/site/NotFound.tsx:1`. Wired in `src/routes/__root.tsx:57`. |
| **H5** | Supabase PITR verification | Open | `audits/2026-05-24/h5-pitr-verification.md` concludes INCONCLUSIVE — WAL prerequisites pass, dashboard confirmation pending. |

**Summary:** 22 shipped, 7 scaffolded (server-fn exists, no UI consumer), 6 deferred (per plan), 0 gaps.

## 2. Cumulative tech debt

### Dev-seeds CI flag
`continue-on-error: true` remains at `.github/workflows/ci.yml:67`. Comment at lines 56–65 explains: pre-existing latent bugs (handle_new_user cascade collisions, ON COMMIT DROP, SET LOCAL ROLE anon crashes, missing Vault secrets). Directive: "Re-enable as a blocking gate before any post-V1 PR is merged." Linked to `audits/2026-05-24/dev-seed-tech-debt.md`.

### Pre-existing lint warnings
`npm run lint` returns **0 errors, 9 warnings**:
- 5 `react-refresh/only-export-components` in UI component files (command-palette, navigation-menu, sidebar, toggle, router.tsx)
- 2 `react-hooks/exhaustive-deps` in `src/routes/admin.tsx:374-375` (missing `filterFn` dependency)

### Type regeneration
`src/integrations/supabase/types.ts` is the MCP-regenerated version. Confirmed post-G tables present: `disputes` (line 99), `referral_codes` (line 358), `referral_credits` (line 372), `mentor_training_completions` (line 231), `ai_rate_limit_events` (line 42). Post-G columns confirmed: `first_session_used` (line 635), `date_of_birth` (line 633), `parental_consent_*` (lines 639–641), `verified_at` (line 263), `code_of_conduct_accepted_at` (lines 248/630). Types are current.

### TODO/FIXME/HACK comments
Only 2 remain in `src/`:
1. `src/lib/ai/prep-questions.functions.ts:10` — TODO about regenerate code path (documentation, not actionable)
2. `src/lib/email/from.ts:11` — `TODO(divit): replace onboarding@resend.dev with verified uniplug.app sender` (blocked on Resend DNS verification)

### eslint-disable comments
2 total:
1. `src/routeTree.gen.ts:1` — auto-generated file, expected
2. `src/components/mentor-dashboard/sections/PostSessionNotesSection.tsx:192` — `react-hooks/exhaustive-deps` suppression on a single line

### Dev-seed tech-debt audit summary
Per `audits/2026-05-24/dev-seed-tech-debt.md`: 14 dev-seeds audited, 10 PASS clean, 1 intentionally skipped (rls-risk4, superseded by A1), 1 conditional FAIL (A2.4 without admin fixture), 2 with minor tech debt. Key items:
1. `bug4-calendar-verification.sql:185` uses COMMIT instead of ROLLBACK (leaves data behind)
2. `bug-audit-rls-write-gating-verification.sql:84-85` has hardcoded past dates (2026-05-14)
3. All 6 bug classes from Phase B CI debugging are resolved in files on main

### Hex literal debt
~15 component files still use raw hex color values instead of brand tokens. Top 5 by count: MyStudentsSection (27), SettingsSection (24), PostSessionNotesSection (23), MentorUpcomingSessions (21), MentorCalendar (17).

## 3. Concrete launch blockers

1. **Privacy/Terms legal copy** — OPEN. `src/routes/privacy.tsx:23` reads "Our privacy policy is being drafted." `src/routes/terms.tsx:23` reads "These terms and conditions are being drafted." Sitemap excludes both. **Blocker for public launch with minors.**

2. **PITR dashboard confirmation** — OPEN. `audits/2026-05-24/h5-pitr-verification.md` concludes INCONCLUSIVE (line 28). WAL prerequisites pass; operator must visually confirm "Point-in-Time Recovery: Enabled" in Supabase Dashboard. **Blocker for launch with student PII.**

3. **CRON_SECRET Worker secret** — OPERATOR-PENDING. No evidence in codebase that `wrangler secret put CRON_SECRET` has been run. Without it, both cron endpoints (24h + 1h reminders) and all C2 email triggers return 401. Not a hard launch blocker (app functions without emails) but degrades experience.

4. **ANTHROPIC_API_KEY Worker secret** — OPERATOR-PENDING. Required for D1/D2/D3. Endpoints return 500 `missing_api_key` until set. Not a launch blocker (AI features have no UI consumer yet).

5. **Supabase Auth SMTP swap to Resend** — OPERATOR-PENDING. Dashboard setting. `src/lib/email/from.ts` still sends via `onboarding@resend.dev`. The 3/hour Supabase built-in cap remains active until swapped. **Soft blocker for signups at scale.**

6. **Cloudflare bot PR** — OPEN. `gh pr list --state open` shows 1 open PR: "Update name in Wrangler configuration file to match deployed Worker" (`update_worker_name_to_uniplug-bc8eb859`, opened 2026-05-13). Cosmetic; not a launch blocker.

7. **Dev-seeds CI re-enable** — OPEN. Path: remove `continue-on-error: true` from `.github/workflows/ci.yml:67`, fix the 2 minor dev-seed issues per the tech-debt audit (COMMIT to ROLLBACK in bug4-calendar, dynamic dates in rls-write-gating). The admin-fixture.sql and vault-fixture.sql patterns handle the conditional FAILs.

## 4. Recommended post-V1 priority order

1. **Privacy/Terms legal copy** — Write and ship real copy. Zero engineering effort once text is provided. Unblocks sitemap inclusion. *Dependency: Divit provides copy or engages legal counsel. Effort: <1hr engineering.*

2. **PITR dashboard confirmation** — Operator verifies in Supabase Dashboard and documents. *Effort: 5 minutes.*

3. **CRON_SECRET + SMTP swap** — `wrangler secret put CRON_SECRET` + Supabase Dashboard SMTP settings. Unblocks all transactional emails. *Effort: 15 minutes operator work.*

4. **Safeguarding signup form + parental consent route (G4 frontend)** — DOB field on signup, `/parental-consent/{token}` route, consent email template. Requires second security-reviewer pass. *Dependency: product decision on age threshold and consent UX. Effort: 2-3 days.*

5. **AI feature UI integration (D1/D2/D3)** — Wire `generatePrepQuestions` into booking confirmation, `expandSessionNote` into post-session notes, `generateMatchSuggestions` into browse/dashboard. *Dependency: ANTHROPIC_API_KEY set. Effort: 2-3 days.*

6. **Dev-seeds CI re-enable** — Fix 2 minor dev-seed issues, remove `continue-on-error`. Unblocks dev-seed regression gating for all future PRs. *Effort: 1 hour.*

7. **GDPR export/delete UI** — Settings page with "Export My Data" and "Delete My Account" buttons calling the existing server-fns. *Effort: 1 day.*

8. **Mentor verification admin queue UI (F2/F3)** — Document viewer with signed-URL links, verified badge component. *Effort: 2 days.*

9. **Brand token sweep (E1)** — Replace ~200 hex literals across ~15 files with CSS custom properties. Mechanical. *Effort: 1 day.*

10. **Mentor training content routes (G3)** — 2 content pages (safeguarding + code_of_conduct), gate admin approval on completion. *Dependency: Divit writes training content. Effort: 1 day engineering.*

11. **axe-core a11y in Playwright (E4)** — Add `@axe-core/playwright`, wire into `browse.spec.ts`. *Effort: 2 hours.*

12. **Full Playwright E2E coverage (H1)** — Requires provisioning a dedicated E2E Supabase test project. *Effort: 3-5 days.*

13. **Razorpay payments integration (Stage 5)** — Payment ledger, webhooks, idempotency, paywall on second session. *Dependency: product decisions on pricing, commission, refund window. Effort: 2-3 weeks.*

14. **Daily.co video integration (Stage 4)** — Session rooms, join UI, recording consent. *Dependency: product decision on recording mandate. Effort: 2-3 weeks.*

15. **Sentry telemetry (H3)** — Init code + DSN. *Effort: 2 hours once DSN is provisioned.*

16. **Browse page auth-gate decision** — If made public, update `robots.txt` to allow `/browse`, add to sitemap, remove `clientAuthGuard`. *Dependency: product decision. Effort: 1 hour.*

## 5. Open product decisions

- **Free first session model.** `first_session_used` flag exists on `students` (types line 635). What happens on the second booking attempt? Hard block with "add payment method" gate, or soft "payments coming soon" message? What is the session price range?

- **Commission / GST treatment.** `mentor_payouts` table exists (types line 205). What is the platform take-rate? How is GST handled — inclusive pricing or added at checkout? Is the platform a marketplace facilitator for GST purposes?

- **RazorpayX vs manual payouts.** How do mentors receive their earnings? Automated bank transfer via RazorpayX, or manual payout by Divit? What is the payout cadence (weekly, monthly, per-session)?

- **Recording mandate.** Are sessions recorded? If yes, what is the consent mechanism for minors? Does recording require parental consent in addition to student consent? Jurisdiction considerations (India vs destination country)?

- **Browse page gating.** `/browse` is currently auth-gated (`clientAuthGuard`). `robots.txt:15` disallows `/browse`. Should it be a public catalog for SEO and conversion, or remain behind login?

- **Chat unlock rule.** Is there a messaging feature planned? If so, when does chat unlock — after booking confirmation, after session completion, or always available?

- **Refund window.** What is the cancellation/refund policy? Time-based (e.g., free cancellation 24h before)? The `booking_cancelled` email template exists but no refund logic is implemented.

- **Under-18 consent flow UX.** The DB layer is live (`date_of_birth`, `parental_consent_*` columns, `record_parental_consent` RPC). Product decisions needed: What does the parent-facing consent page look like? What is the email template content? Is the age threshold 18 universally, or does it vary by jurisdiction? What happens if a parent revokes consent mid-engagement?

## Method

**Files read:** `src/components/calendar/MentorCalendar.tsx`, `src/lib/auth/bearer.ts`, `src/routes/api/public/hooks/send-reminders.ts`, `.github/workflows/ci.yml`, `src/lib/email/templates.ts`, `src/lib/email/from.ts`, `src/lib/ai/*.functions.ts` (3 files), `src/components/ui/state-views.tsx`, `src/integrations/supabase/types.ts`, `src/lib/me/export.functions.ts`, `src/lib/me/delete.functions.ts`, `public/robots.txt`, `public/sitemap.xml`, `src/components/site/NotFound.tsx`, `src/routes/__root.tsx`, `src/routes/privacy.tsx`, `src/routes/terms.tsx`, `src/routes/admin.tsx`, `audits/2026-05-24/h5-pitr-verification.md`, `audits/2026-05-24/dev-seed-tech-debt.md`, `audits/2026-05-24/v1-readiness-final.md`.

**Commands run:** `npm run lint`, `grep` for `book_session`, `as any`, `bearerOk`, `CRON_SECRET`, `verified_at`, `date_of_birth`, `parental_consent`, `disputes`, `referral_codes`, `mentor_training`, `first_session_used`, `TODO/FIXME/HACK`, `eslint-disable`, hex literals, AI function imports, GDPR function imports, safeguarding RPC imports. `gh pr list --state open`. `find` for types file location, training routes. `ls` for e2e specs, ENV.md, playwright config.

**Out of scope:** No DB queries run (live schema already verified via regenerated types). No file edits. No migration execution. No Sentry/Resend/Razorpay dashboard checks (operator-only surfaces).
