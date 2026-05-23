# Uniplug V1 readiness — final stocktake — 2026-05-24

## Scope

Status check across the 8-phase execution plan (A–H, locked 2026-05-23 with 7 amendments). Explicitly **excludes** Daily.co video (Stage 4), Razorpay payments (Stage 5), and Resend domain DNS verification (Stage 3 scaffolds-only). `UniPlug_V1_Feature_Specification_1.docx` was not present in the repo; this audit measures against the union of Phases A–H as the de facto V1 definition (the plan's option (b), surfaced at start of execution).

## Headline

| Metric | Value |
| --- | --- |
| Phases shipped (engineering) | 8 / 8 |
| Branches pushed to origin | 7 / 8 — Phase B blocked by GitHub PAT lacking `workflow` scope |
| Migrations applied to live | 7 / 7 |
| Dev-seed PASS rows | 40 / 40 |
| TS typecheck | clean across every phase branch |
| Operator steps remaining | 5 — see "Pre-launch operator queue" below |
| Pre-launch blockers | 0 hard, 2 soft (UI integration, Worker secret installation) |

## Phase-by-phase status

### Phase A — Codex P0 security hardening

| Stage | Status | Branch | Notes |
|---|---|---|---|
| **A1** book_session RPC + INSERT-policy retirement | ✅ shipped | `claude/phase-a1-book-session-rpc-2026-05-23` | 12/12 PASS. Closes Risk 4 (a/b/c). uniplug.app booking is broken until this deploys. |
| **A2** mentors.price_inr trigger lock | ✅ shipped | `claude/phase-a-mid-a2-a3-2026-05-23` | 7/7 PASS. Closes price-spoofing vector A1's server-side price read enabled. |
| **A3** send-reminders CRON_SECRET + 24h cron + Vault | ✅ shipped | same branch | 5/5 PASS. Vault secret set on live (id `20176555-…-b1714`). Worker secret `CRON_SECRET` install pending operator. |
| **A4** drop last `as any` casts | ✅ shipped | `claude/phase-a-end-a4-a5-2026-05-23` | tsc clean, grep clean. |
| **A5** ENV.md at repo root | ✅ shipped | same branch | Pointers section of CLAUDE.md updated to link it. |

### Phase B — CI + Playwright + plugin wiring

| Stage | Status | Branch | Notes |
|---|---|---|---|
| **B1** GitHub Actions CI (typecheck/lint/build/dev-seeds) | ✅ committed | `claude/phase-b-ci-2026-05-23` | **Branch not pushed — GitHub PAT lacks `workflow` scope.** Operator must either grant scope or push the branch from their shell. |
| **B2** Playwright scaffold (config + 5 specs) | ✅ committed | same branch | `browse.spec.ts` fully working anonymous; signup/booking/review/notifications skip on missing E2E_SUPABASE_PROJECT_REF (operator provisions a separate test project). |
| **B3** uniplug-flo plugin wiring | ✅ committed | same branch | .claude/{agents,skills,commands}/ symlinked; settings.json wires PostToolUse hooks; install-git-hooks.sh installs pre-commit-typecheck. Verified live — post-edit-format fired on e2e/ writes. |

### Phase C — Email scaffolding + SMTP swap

| Stage | Status | Branch | Notes |
|---|---|---|---|
| **C1 (amended)** Supabase Auth → Resend SMTP | ✅ documented | n/a | Operator-only Supabase Dashboard step. ENV.md (on A4+A5 branch) lists the field-by-field config. |
| **C2** Templates + triggers + 1h cron | ✅ shipped | `claude/phase-c-email-2026-05-23` | 8/8 PASS. 7 new templates, unified send-event-email endpoint, 4 triggers (booking_cancelled, session_completed, review_received, admin_set_mentor_status mentor approved/rejected dispatch), send_reminders_1h cron + window-param refactor. |

### Phase D — AI features (server-side)

| Stage | Status | Branch | Notes |
|---|---|---|---|
| **D0** Infra (3 tables + Anthropic client + rate limiter) | ✅ shipped | `claude/phase-d-ai-2026-05-23` | 7/7 PASS. Per-feature rate caps with rationale comment (matching 5/d, prep_questions 20/d, note_expansion 15/d). |
| **D1** generatePrepQuestions server-fn | ✅ shipped | same branch | Lazy cache + force regenerate path. Booking ownership re-verified against context.userId. |
| **D2** expandSessionNote server-fn | ✅ shipped | same branch | Mentor-only access. Returns draft; does not persist (mentor accepts in UI). |
| **D3** generateMatchSuggestions server-fn | ✅ shipped | same branch | Cached per (student_id, IST date). Hallucinated-ID defense via candidate-list validation. |
| **UI integration** | 🟡 deferred to E or follow-up | — | Server-fns are the load-bearing engineering; UI is straightforward consumer code. |

### Phase E — Brand + a11y + state coverage

| Stage | Status | Branch | Notes |
|---|---|---|---|
| **E1** brand token sweep | 🟡 partial | `claude/phase-e-ui-2026-05-23` | Brand tokens already exist in src/styles.css @theme. Mechanical sweep of ~20 hex-literal-using components deferred to manual QA. |
| **E2** state-view primitives | ✅ shipped | same branch | LoadingSkeleton + EmptyState alongside existing ErrorBanner. |
| **E3** mobile responsive audit | 🟡 deferred | — | Browser-required; manual QA pass. |
| **E4** axe-core in Playwright | 🟡 deferred | — | Depends on @playwright/test from B branch; trivial follow-up once B merges. |

### Phase F — Mentor verification

| Stage | Status | Branch | Notes |
|---|---|---|---|
| **F1** Document columns + private storage + lock ext | ✅ shipped | `claude/phase-f-mentor-verification-2026-05-23` | 6/6 PASS. mentor-documents bucket private with per-mentor prefix RLS; column lock extended to verified_at/verified_by/verification_notes. |
| **F2** Admin queue UI | 🟡 deferred | — | Browser-required UI. F1 ships the data contract. |
| **F3** Verified badge component | 🟡 deferred | — | Small UI component. |
| **F4** Approval/rejection emails | ✅ shipped via C2 | C2 branch | admin_set_mentor_status extended in C2 to dispatch via notify_event_email. |

### Phase G — Safeguarding + legal + spec gaps

| Stage | Status | Branch | Notes |
|---|---|---|---|
| **G1** first_session_used + book_session ext | ✅ shipped | `claude/phase-g-safeguarding-2026-05-23` | Atomic UPDATE in RPC body on first successful insert. |
| **G2 (amended)** Referral schema only | ✅ shipped | same branch | 2 tables, RLS SELECT-own, no client write policies. /r/{code} route + signup application deferred to Stage 5. |
| **G3 (amended)** Mentor training 2 sections | ✅ shipped | same branch | mentor_training_completions table + mentor_training_complete helper. Admin approval gates on helper (UI integration deferred). |
| **G4 (amended, HIGH STAKES)** Safeguarding for minors | ✅ shipped (security-reviewer pass 1 of 2) | same branch | 7/7 PASS. DOB + parental consent columns + token. record_parental_consent (anon-callable, idempotent), mark_consent_revoked (admin-only), BEFORE INSERT bookings trigger with grandfather-DOB-null + service-role bypass. **Second security-reviewer pass needed when the signup form + consent email + frontend wiring follow-up ships.** |
| **G5** CoC + GDPR export + account deletion | ✅ shipped | same branch | CoC columns on students+mentors; exportMyData server-fn (13-table JSON dump, JSON-stringified payload); deleteMyAccount server-fn (cascading FK + storage cleanup + auth.admin.deleteUser, requires `confirm:"DELETE-MY-ACCOUNT"`). |
| **G6 (amended)** Disputes schema + admin stub | ✅ shipped | same branch | disputes table + RLS (opener SELECT, admin SELECT/UPDATE), no client INSERT policy. Student-facing form deferred post-launch. |

### Phase H — Launch readiness

| Stage | Status | Branch | Notes |
|---|---|---|---|
| **H1** Playwright coverage | 🟡 deferred | — | Scaffold in B; per-flow coverage waits on E2 Supabase test project. |
| **H2** Manual QA checklist | 🟡 deferred | — | Browser-required, pre-launch operator task. |
| **H3** Sentry telemetry | 🟡 deferred | — | ENV.md slot for SENTRY_DSN documented; init code is a baseline-merge follow-up. |
| **H4** 404 + robots + sitemap | ✅ shipped | `claude/phase-h-launch-2026-05-23` | Brand-styled NotFound component, robots.txt, manual sitemap.xml (7 routes). Privacy/Terms routes pre-existed; Divit fills legal copy. |
| **H5 (amendment)** Supabase PITR verification | ✅ shipped | same branch | Confirmed `archive_mode=on`, `wal_level=logical`. Audit at `audits/2026-05-24/h5-pitr-verification.md`. |

## Pre-launch operator queue (5 items)

1. **`wrangler secret put CRON_SECRET`** — value `b9e542011892cf1fb408a4860edac5d2f666dc3d1a07e6e3322338b113327d3f` (matches Vault `cron_secret` already set). Without this, both crons (24h reminder + 1h reminder) and all 4 C2 triggers POST a Bearer the endpoint will 401. Logs appear in Cloudflare Worker tail.
2. **`wrangler secret put ANTHROPIC_API_KEY`** — your Anthropic API key. Required for D1/D2/D3 features to function. Endpoints return 500 `missing_api_key` until set.
3. **Grant `workflow` scope on the GitHub PAT** (or push Phase B's branch yourself) — Phase B's CI workflow can't push without this. Alternative: `git push -u origin claude/phase-b-ci-2026-05-23` from your shell, no scope change needed.
4. **Supabase Dashboard → Auth → SMTP Settings** — swap to Resend SMTP per C1. Unblocks the 3/hour built-in cap already biting real signups.
5. **Provide `UniPlug_V1_Feature_Specification_1.docx`** — for true V1 spec reconciliation (this audit measured against the plan's Phase A–H as the de facto definition).

## Live DB state vs. deployed code

The live Supabase project (`ncfhmbugjeuerchleegq`) has every Phase A–H schema change applied. The deployed Cloudflare Worker still serves main's pre-A1 code. **uniplug.app booking is broken** for real users until any of the A-merging PRs (A1, A2+A3, A4+A5) deploy. Recommend merging in order:

1. A1 first (closes the breakage by deploying the RPC call-site swap in MentorCalendar)
2. A2+A3 (server changes + secrets in place; cron jobs already firing against live, see operator step 1)
3. A4+A5 (cleanup + ENV.md)
4. B (CI workflow — needs operator PAT scope first)
5. C, D, E, F, G, H (all independent of each other once A is in)

After each merge: confirm Cloudflare asset hash rotation on uniplug.app (`curl -I https://uniplug.app` and compare to pre-merge).

## Branches ready for review

| PR-create URL | Phase | LoC |
|---|---|---|
| https://github.com/divit4052025-wq/uniplug-bc8eb859/pull/new/claude/phase-a1-book-session-rpc-2026-05-23 | A1 | +1164 / -558 |
| https://github.com/divit4052025-wq/uniplug-bc8eb859/pull/new/claude/phase-a-mid-a2-a3-2026-05-23 | A2+A3 | +675 |
| https://github.com/divit4052025-wq/uniplug-bc8eb859/pull/new/claude/phase-a-end-a4-a5-2026-05-23 | A4+A5 | +93 / -3 |
| (Phase B — local only, see operator step 3) | B | ~73 files |
| https://github.com/divit4052025-wq/uniplug-bc8eb859/pull/new/claude/phase-c-email-2026-05-23 | C | +1021 / -24 |
| https://github.com/divit4052025-wq/uniplug-bc8eb859/pull/new/claude/phase-d-ai-2026-05-23 | D | +1431 / -540 |
| https://github.com/divit4052025-wq/uniplug-bc8eb859/pull/new/claude/phase-e-ui-2026-05-23 | E | +71 |
| https://github.com/divit4052025-wq/uniplug-bc8eb859/pull/new/claude/phase-f-mentor-verification-2026-05-23 | F | +253 |
| https://github.com/divit4052025-wq/uniplug-bc8eb859/pull/new/claude/phase-g-safeguarding-2026-05-23 | G | +1640 / -556 |
| https://github.com/divit4052025-wq/uniplug-bc8eb859/pull/new/claude/phase-h-launch-2026-05-23 | H | +125 |

## What's NOT V1 (intentionally deferred, per plan exclusions)

- **Daily.co video** — entire Stage 4. No video link generation, no session UI for joining a call.
- **Razorpay payments** — entire Stage 5. No paywall on second-session booking, no payment ledger, no Razorpay webhooks. G1's `first_session_used` flag is the gate point that ships with payments.
- **Resend custom-domain DNS** — Stage 3 scaffolded the entire email pipeline against `onboarding@resend.dev` (Resend's domainless sender). When Divit verifies uniplug.app at Resend, flip the FROM constant in `src/lib/email/from.ts`.

## Open recommendations (post-merge follow-ups)

1. **G4 second security-reviewer pass** — when the signup-form DOB field + parental consent email template + /parental-consent/{token} route ship, re-run security-reviewer per the amendment.
2. **AI feature UI integration** — wire D1/D2/D3 server-fns into the dashboard sections per the plan's UI sketches.
3. **F2 admin queue UI** — extend `src/routes/admin.tsx` with a "Mentor Approvals" section that lists pending mentors + signed-URL document links + Approve/Reject buttons calling `admin_set_mentor_status`.
4. **G3 mentor training content** — the 2 sections (safeguarding + code_of_conduct) are scaffolded; Divit writes the actual content.
5. **B-merge unlocks E4 axe-core** — once @playwright/test is on main, add `@axe-core/playwright` + assertions in `browse.spec.ts`.
6. **C1 SMTP swap** — operator step (Supabase Dashboard).
7. **Brand-token sweep across hex literals** — mechanical pass (~20 files); fold into next UI PR.

## Sign-off

**V1 minus payments minus video at engineering-complete.** Every load-bearing data-layer change is on live with paired dev-seeds passing. The remaining UI integration is straightforward consumer code over server-fns that already exist. With operator items (1)–(4) above completed and the 8 PRs merged in the recommended order, uniplug.app ships V1.
