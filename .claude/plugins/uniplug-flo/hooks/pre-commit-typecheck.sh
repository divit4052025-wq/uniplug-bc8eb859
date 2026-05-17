#!/usr/bin/env bash
# pre-commit-typecheck.sh
#
# Runs `npx tsc --noEmit` before a commit is created. Blocks the commit if
# typecheck fails. Logs the failure clearly so it's obvious what to fix.
#
# Two ways to wire this:
#
# 1. As a git pre-commit hook (recommended):
#      cp .claude/plugins/uniplug-flo/hooks/pre-commit-typecheck.sh .git/hooks/pre-commit
#      chmod +x .git/hooks/pre-commit
#
#    or symlink:
#      ln -sf ../../.claude/plugins/uniplug-flo/hooks/pre-commit-typecheck.sh .git/hooks/pre-commit
#
# 2. As a Claude Code PreToolUse hook on Bash invocations of `git commit`
#    (see hooks/hooks.json).

set -euo pipefail

log() {
  printf '[uniplug-flo pre-commit-typecheck] %s\n' "$*" >&2
}

# Find the repo root.
repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "${repo_root}" ]]; then
  log "not inside a git repo; nothing to do"
  exit 0
fi

cd "${repo_root}"

if [[ ! -f "package.json" ]]; then
  log "no package.json at repo root; skipping"
  exit 0
fi

if [[ ! -x "node_modules/.bin/tsc" ]]; then
  log "typescript not installed locally; skipping (run npm install first)"
  exit 0
fi

log "running tsc --noEmit"
tsc_output="$(./node_modules/.bin/tsc --noEmit 2>&1 || true)"
tsc_exit=$?

if [[ ${tsc_exit} -ne 0 ]] || [[ -n "${tsc_output}" ]]; then
  # tsc prints errors to stdout, not stderr. If there's any output, treat
  # it as a failure.
  if [[ -n "${tsc_output}" ]]; then
    echo "" >&2
    echo "═══════════════════════════════════════════════════════════════════" >&2
    echo "  uniplug-flo pre-commit-typecheck FAILED — commit blocked" >&2
    echo "═══════════════════════════════════════════════════════════════════" >&2
    echo "${tsc_output}" >&2
    echo "" >&2
    echo "Fix the errors above, then re-run the commit." >&2
    echo "To bypass (NOT recommended — only for emergencies):" >&2
    echo "  git commit --no-verify ..." >&2
    echo "" >&2
    exit 1
  fi
fi

log "tsc --noEmit clean — commit allowed"
exit 0
