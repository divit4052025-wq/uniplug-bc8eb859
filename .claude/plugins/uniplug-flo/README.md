# uniplug-flo

A self-contained Claude Code plugin that encodes Uniplug's engineering patterns: migration + dev-seed pairing, RLS posture, payment-ledger immutability, brand and accessibility rules, server-side AI-only, the 19-item release checklist. Plus model routing across opus / sonnet / haiku.

## What's in here

```
.claude/plugins/uniplug-flo/
├── plugin.json                      # manifest
├── model-routing.json               # per-skill / per-agent model class
├── README.md                        # this file
├── CHANGELOG.md
├── AGENTS.md                        # subagent index
├── skills/                          # 10 skills
│   ├── supabase-migration/SKILL.md  (+ references/dev-seed-template.sql)
│   ├── rls-review/SKILL.md
│   ├── security-audit/SKILL.md
│   ├── playwright-qa/SKILL.md       (+ scaffolds/journey-template.spec.ts)
│   ├── brand-ui/SKILL.md
│   ├── payments-ledger/SKILL.md
│   ├── ai-feature-builder/SKILL.md
│   ├── react-query-mutation/SKILL.md (+ template.tsx)
│   ├── observability/SKILL.md
│   └── release-checklist/SKILL.md   (+ checklist.md)
├── agents/                          # 6 subagents
│   ├── db-reviewer.md               opus
│   ├── payments-reviewer.md         opus
│   ├── ux-reviewer.md               sonnet
│   ├── security-reviewer.md         opus
│   ├── release-reviewer.md          sonnet
│   └── investigation-agent.md       opus (read-only)
├── hooks/                           # 3 hooks
│   ├── hooks.json                   wiring reference for settings.json
│   ├── post-edit-format.sh          prettier + eslint --fix
│   ├── pre-commit-typecheck.sh      blocks commits with TS errors
│   └── post-migration-dev-seed-check.sh   soft-warn missing dev-seed
└── commands/                        # 7 slash commands
    ├── audit-security.md
    ├── review-db.md
    ├── review-ux.md
    ├── review-payments.md
    ├── scaffold-test.md
    ├── run-release-checks.md
    └── investigate.md
```

## Install / activate

The plugin is in-tree — no install step. Claude Code discovers skills, agents, and slash commands inside `.claude/plugins/` automatically. To activate the hooks:

1. Copy the blocks from `hooks/hooks.json` into `.claude/settings.json` (or your project-level Claude Code settings).
2. Optionally, also install `pre-commit-typecheck.sh` as a git hook directly:

   ```bash
   ln -sf ../../.claude/plugins/uniplug-flo/hooks/pre-commit-typecheck.sh .git/hooks/pre-commit
   ```

## Usage

Slash commands (typed in a Claude Code session):

```
/audit-security             # full eight-surface audit
/review-db                  # for any supabase/ change
/review-ux                  # for any UI PR
/review-payments            # for any Razorpay / ledger code
/scaffold-test <journey>    # scaffold a Playwright E2E spec
/run-release-checks         # 19-item pre-merge gate
/investigate <question>     # read-only RCA / stocktake
```

Or invoke a subagent directly via the Agent tool with `subagent_type` set to the agent's name. Or trigger a skill by editing a file the skill's `triggers:` covers (Claude will surface it).

## Design rules

- **No npm dependencies.** Everything is markdown + bash. Plays nicely with anyone reading the repo who isn't running Claude Code.
- **No Ruflo dependency.** We studied Ruflo as a structural reference (`/Users/divitfatehpuria/ruflo-reference/`) but did not copy files in. uniplug-flo carries Uniplug-specific content.
- **Self-contained.** Every skill and agent has enough context inline to be useful without reading the rest of the plugin. Cross-references are explicit (`See also`).
- **Model routing is principled.** Opus when wrong = permanent damage. Sonnet for bounded execution. Haiku used sparingly.

## Updating

When patterns change (e.g. the `useOptimisticMutation` hook lands on `main`), update the relevant SKILL.md to point at the new shape and bump the version in `plugin.json` + `CHANGELOG.md`.

## Related

- `/Users/divitfatehpuria/uniplug/CLAUDE.md` — top-level project guide.
- `audits/2026-05-14/` — most recent formal audit; used as a format reference by `security-reviewer` and `db-reviewer`.
