#!/usr/bin/env bash
# .claude/install-git-hooks.sh
#
# One-time per-developer install of uniplug-flo's git-side hooks.
# Idempotent — re-runs safely.
#
#   ./.claude/install-git-hooks.sh
#
# What it installs:
#   - .git/hooks/pre-commit  →  blocks any commit whose code fails
#                              `npx tsc --noEmit`, with a clear error.
#
# Why not via Claude Code's PreToolUse-on-Bash hook?
#   Because that matcher fires on every Bash call (Claude Code's matcher is
#   a tool-name regex, not a tool-input regex). Running tsc on every shell
#   command would make every session unusable. The git-hook path scopes
#   the typecheck to actual commit attempts where it belongs.
#
# Why not commit .git/hooks/ directly?
#   .git/ is intentionally outside version control. Per-dev install is the
#   only portable option.

set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

target=".git/hooks/pre-commit"
source_rel="../../.claude/plugins/uniplug-flo/hooks/pre-commit-typecheck.sh"
source_abs=".claude/plugins/uniplug-flo/hooks/pre-commit-typecheck.sh"

if [[ ! -f "${source_abs}" ]]; then
  echo "ERROR: ${source_abs} not found — run this from the repo root." >&2
  exit 1
fi

if [[ ! -d ".git/hooks" ]]; then
  echo "ERROR: .git/hooks/ does not exist — not a git repo?" >&2
  exit 1
fi

# Backup any existing non-symlink pre-commit so we don't silently clobber.
if [[ -f "${target}" ]] && [[ ! -L "${target}" ]]; then
  backup="${target}.bak.$(date +%s)"
  echo "Existing ${target} is not a symlink; backing up to ${backup}"
  mv "${target}" "${backup}"
fi

ln -sf "${source_rel}" "${target}"
chmod +x "${source_abs}"

echo "Installed: ${target} -> ${source_rel}"
echo "Test it:   commit anything touching .ts/.tsx — tsc must pass."
