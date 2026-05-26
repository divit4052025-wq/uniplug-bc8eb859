# CLAUDE.md — Uniplug

Project guide for Claude Code working in this repo. Read this first.

## What this repo is

Uniplug is a peer-mentorship marketplace for Indian school students applying to global universities. Live at **uniplug.app**. Stack: TanStack Start + Cloudflare Workers + Supabase + React Query + Tailwind + shadcn/ui + Razorpay. Many of our users are minors — that constraint is load-bearing, not a footnote.

## uniplug-flo

`.claude/plugins/uniplug-flo/` is a self-contained Claude Code plugin that codifies the patterns this codebase has earned the hard way: migration + dev-seed pairing, RLS posture, payment-ledger immutability, brand and accessibility rules, the 19-item release checklist. It contains **10 skills**, **6 subagents**, **3 hooks**, **7 slash commands**, and a **model-routing config** that tier each one between opus / sonnet / haiku.

### Why we built it (instead of installing Ruflo)

We considered installing Ruflo (ruvnet's claude-flow upstream) directly. Three reasons we didn't:

1. **Uniplug-shaped, not framework-shaped.** Our patterns reference specific files (`audits/2026-05-14/rls-audit.md`, `src/routes/notifications.tsx markAsRead`, `supabase/dev-seeds/bug-audit-rls-write-gating-verification.sql`). A generic plugin can't carry that specificity.
2. **No npm dependency.** Ruflo's CLI (`@claude-flow/cli`) is its own dependency tree. uniplug-flo is plain markdown + bash — nothing to npm install, nothing to keep up to date.
3. **Stable surface for review.** The plugin is small enough that a person can read every file. That's the bar for code that gates merges.

We did study Ruflo's structural patterns (`/Users/divitfatehpuria/ruflo-reference/`) and the skill / agent / command shapes are inspired by it. None of Ruflo's files are copied in.

## Quick reference

### Slash commands

| Command | What it does | Invokes |
| --- | --- | --- |
| `/audit-security` | Eight-surface security audit | `security-reviewer` |
| `/review-db` | RLS + migrations + dev-seed review | `db-reviewer` |
| `/review-ux` | A11y + brand + state coverage | `ux-reviewer` |
| `/review-payments` | Razorpay + ledger + idempotency | `payments-reviewer` |
| `/scaffold-test` | Playwright E2E scaffold for a journey | `playwright-qa` skill |
| `/run-release-checks` | 19-item pre-merge gate | `release-reviewer` |
| `/investigate <topic>` | Read-only RCA / stocktake | `investigation-agent` |

### Subagents

| Agent | Tier | Use when |
| --- | --- | --- |
| `db-reviewer` | opus | Any `supabase/` change — uses `supabase-migration` + `rls-review` skills |
| `payments-reviewer` | opus | Any Razorpay / ledger code — uses `payments-ledger` + `observability` |
| `ux-reviewer` | sonnet | Any UI PR — uses `brand-ui` + `playwright-qa` |
| `security-reviewer` | opus | Periodic + pre-launch audits — uses `security-audit` + `rls-review` |
| `release-reviewer` | sonnet | Before every merge to `main` — uses `release-checklist` |
| `investigation-agent` | opus | Open-ended questions, RCA, stocktakes — read-only |

### Skills

| Skill | Tier | One-line purpose |
| --- | --- | --- |
| `supabase-migration` | opus design / sonnet exec | Migration + paired dev-seed pattern (BEGIN..ROLLBACK, rejection + happy-path) |
| `rls-review` | opus | The four RLS rules: strict default, EXISTS, BEFORE UPDATE triggers, SECURITY DEFINER helpers |
| `security-audit` | opus | Eight-surface audit checklist + output format |
| `playwright-qa` | sonnet | E2E + axe scaffolding for the five critical journeys |
| `brand-ui` | sonnet | Design tokens, type, components, WCAG AA, mobile |
| `payments-ledger` | opus | Immutable Razorpay ledger, state machine, webhook idempotency |
| `ai-feature-builder` | opus prompt / sonnet wire | Server-side Anthropic API only — never browser |
| `react-query-mutation` | sonnet | Optimistic-update pattern + scaffold |
| `observability` | sonnet | Structured JSON logging, migration path to real telemetry |
| `release-checklist` | sonnet | 19-item pre-merge gate — prevents the May 16 failure mode |

### Hooks (wire in `.claude/settings.json`)

| Hook | Trigger | Effect |
| --- | --- | --- |
| `post-edit-format.sh` | PostToolUse on Edit/Write | Prettier + eslint --fix on TS/TSX/JS/JSX |
| `pre-commit-typecheck.sh` | PreToolUse on `git commit` (or wire as `.git/hooks/pre-commit`) | Blocks commit if `tsc --noEmit` fails |
| `post-migration-dev-seed-check.sh` | PostToolUse on `supabase/migrations/*.sql` | Soft-warn if no matching dev-seed found |

Reference config in `.claude/plugins/uniplug-flo/hooks/hooks.json`.

## Model routing principles

The split is in `.claude/plugins/uniplug-flo/model-routing.json` — the principle is short: **opus when a wrong answer creates permanent damage** (RLS, payments, security, architecture), **sonnet when execution is bounded** (UI, refactors, tests, docs, release checks), and **haiku for cheap status work** (file listings, diff summaries — used sparingly because sonnet handles most execution well). The per-skill / per-agent mapping makes this concrete; override only when there's a specific reason.

## Philosophy

- **Skills > tools.** Encoded knowledge beats clever automation. A migration template you can read in 30 seconds outlasts a script you can't.
- **Simple > clever.** Plain markdown for skills, plain bash for hooks. No SDK dependencies. Anyone reading this repo six months from now can understand it.
- **Dev-seeds > hopes.** Every DB change is proved with a rejection test and a happy-path test. "I'm sure it's right" is not a security model.

## Deeper docs

- Plugin overview + install: `.claude/plugins/uniplug-flo/README.md`
- Version history: `.claude/plugins/uniplug-flo/CHANGELOG.md`
- Agent index: `.claude/plugins/uniplug-flo/AGENTS.md`
- Each skill carries its own README inside `skills/<name>/SKILL.md`.

## Pointers

- Live Supabase project ref: `ncfhmbugjeuerchleegq` (Postgres 17.6, region ap-northeast-1).
- Most recent security audit: `audits/2026-05-14/rls-audit.md`.
- Canonical mutation pattern: `src/routes/notifications.tsx markAsRead`.
- The shared `useOptimisticMutation` hook (WIP on a parallel branch) will replace inline optimistic patterns once it lands on `main`.
- Env vars + Supabase Vault secrets: `ENV.md` (single source of truth for what's set, where, and what breaks if missing).
