# Agents index

Quick reference for which subagent does what. Each agent file lives at `agents/<name>.md`.

| Agent | Tier | One-line | Skills used | When |
| --- | --- | --- | --- | --- |
| **db-reviewer** | opus | Reviews every schema / RLS / migration change against the four RLS rules and the migration + dev-seed pattern. | `supabase-migration`, `rls-review` | Any PR touching `supabase/migrations/` or `supabase/dev-seeds/` |
| **payments-reviewer** | opus | Reviews Razorpay integration changes against the three invariants (insert-only ledger, idempotent webhooks, revenue from ledger). | `payments-ledger`, `observability` | Any PR touching payment code, webhooks, refunds, payouts |
| **ux-reviewer** | sonnet | Reviews UI for WCAG 2.1 AA, brand consistency, and state coverage (empty / loading / error / success). | `brand-ui`, `playwright-qa` | Any UI PR |
| **security-reviewer** | opus | Periodic eight-surface audit. Delegates surfaces 1 and 5 to db-reviewer and payments-reviewer. | `security-audit`, `rls-review` | Pre-launch, quarterly, post-incident |
| **release-reviewer** | sonnet | Runs the 19-item pre-merge checklist. Prevents the May 16 "pushed but not merged" failure mode. | `release-checklist`, `supabase-migration` | Before every merge to `main` |
| **investigation-agent** | opus | Read-only. Open questions, root-cause analysis, stocktakes. Outputs a markdown report; never edits. | (any, as needed) | Open-ended questions, post-incident, periodic system review |

## Calling an agent

From Claude Code:

- **Via a slash command** — most agents have a matching `/command` in `commands/`. That's the recommended entry point.
- **Via the Agent tool directly** — set `subagent_type` to the agent name. Useful when you want to run multiple agents in parallel or compose a custom workflow.

## Delegation graph

```
security-reviewer  ──► db-reviewer       (surface 1: RLS)
                  └─► payments-reviewer  (surface 5: payments)

release-reviewer   ──► (uses supabase-migration skill for dev-seed verification)

ux-reviewer        ──► (uses playwright-qa skill for E2E coverage check)
```

`investigation-agent` is intentionally not in the delegation graph — it stands alone, read-only.

## Tone discipline

All agents:

- Specific over vague. File paths, line numbers, severity grades.
- Direct on blockers. Don't soften a HIGH into "consider reviewing."
- Cite which skill underwrote which finding.
- Honest about uncertainty. "I don't know — here's what I checked" beats false confidence.

## See also

- `README.md` — plugin overview.
- `model-routing.json` — the canonical model-class table.
- `/Users/divitfatehpuria/uniplug/CLAUDE.md` — top-level project guide.
