#!/usr/bin/env bash
# post-edit-format.sh
#
# PostToolUse hook for uniplug-flo. Runs prettier --write + eslint --fix on
# edited TS / TSX / JS / JSX files. Logs what it did to stderr.
#
# Wiring (in settings.json — see .claude/plugins/uniplug-flo/hooks/hooks.json):
#   {
#     "hooks": {
#       "PostToolUse": [
#         {
#           "matcher": { "tool_name": "Edit|Write" },
#           "command": ".claude/plugins/uniplug-flo/hooks/post-edit-format.sh"
#         }
#       ]
#     }
#   }
#
# Claude Code passes the affected file path via $CLAUDE_FILE_PATH (or the
# JSON event on stdin, depending on harness version). This script reads
# both and operates on whatever it finds.

set -euo pipefail

log() {
  printf '[uniplug-flo post-edit-format] %s\n' "$*" >&2
}

# Resolve the target file from env or stdin.
target="${CLAUDE_FILE_PATH:-}"
if [[ -z "${target}" ]] && ! [[ -t 0 ]]; then
  # Read the event JSON from stdin. Best-effort field extraction without jq —
  # if jq isn't available we still don't want to block the user's session.
  payload="$(cat || true)"
  if command -v jq >/dev/null 2>&1; then
    target="$(printf '%s' "${payload}" | jq -r '.tool_input.file_path // .file_path // empty' 2>/dev/null || true)"
  else
    target="$(printf '%s' "${payload}" | grep -oE '"file_path"[[:space:]]*:[[:space:]]*"[^"]+"' | head -1 | sed -E 's/.*"file_path"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/' || true)"
  fi
fi

if [[ -z "${target}" ]]; then
  log "no file path found in CLAUDE_FILE_PATH or stdin; nothing to do"
  exit 0
fi

if [[ ! -f "${target}" ]]; then
  log "target does not exist: ${target}; nothing to do"
  exit 0
fi

case "${target}" in
  *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs)
    ;;
  *)
    log "skipping (not a JS/TS file): ${target}"
    exit 0
    ;;
esac

cd_root() {
  # cd to the repo root so prettier/eslint pick up the right config.
  local dir
  dir="$(dirname "${target}")"
  cd "${dir}"
  while [[ "$(pwd)" != "/" ]] && [[ ! -f "package.json" ]]; do
    cd ..
  done
  if [[ ! -f "package.json" ]]; then
    log "no package.json found in any parent; skipping"
    exit 0
  fi
}

cd_root

# Re-resolve target relative to the new cwd.
relative_target="$(realpath --relative-to=. "${target}" 2>/dev/null || python3 -c "import os,sys; print(os.path.relpath(sys.argv[1], '.'))" "${target}" 2>/dev/null || echo "${target}")"

# Prettier first (formatting) — then ESLint (semantic fixes) so ESLint sees
# the formatted file.
if [[ -x "node_modules/.bin/prettier" ]]; then
  log "prettier --write ${relative_target}"
  ./node_modules/.bin/prettier --write "${relative_target}" >/dev/null 2>&1 || log "prettier exited non-zero on ${relative_target}"
else
  log "prettier not installed locally; skipping"
fi

if [[ -x "node_modules/.bin/eslint" ]]; then
  log "eslint --fix ${relative_target}"
  ./node_modules/.bin/eslint --fix "${relative_target}" >/dev/null 2>&1 || log "eslint exited non-zero on ${relative_target}"
else
  log "eslint not installed locally; skipping"
fi

log "done: ${relative_target}"
exit 0
