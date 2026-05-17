#!/usr/bin/env bash
# post-migration-dev-seed-check.sh
#
# Soft guard: when any file in supabase/migrations/ is created or modified,
# check that a corresponding dev-seed exists in supabase/dev-seeds/. Warns if
# the dev-seed is missing — does NOT block, because Claude Code should always
# author the dev-seed deliberately, and this is the safety net for "did we
# forget."
#
# The matching rule:
#   For migration  supabase/migrations/YYYYMMDDHHMMSS_<slug>.sql
#   look for any   supabase/dev-seeds/*<slug-fragment>*verification.sql
#
# This is intentionally fuzzy — the slug pattern in our repo varies (e.g.
# "rls_write_gating_hardening" → "bug-audit-rls-write-gating-verification.sql"
# is not a clean rename, but the human-readable substring "rls-write-gating"
# is recognizable). The script extracts the strongest 1–2 words from the
# migration slug and greps for them in dev-seeds.
#
# Wiring: PostToolUse hook matching Edit|Write on supabase/migrations/*.sql,
# or as a manual sanity check before committing.

set -euo pipefail

log() {
  printf '[uniplug-flo post-migration-dev-seed-check] %s\n' "$*" >&2
}

target="${CLAUDE_FILE_PATH:-}"
if [[ -z "${target}" ]] && ! [[ -t 0 ]]; then
  payload="$(cat || true)"
  if command -v jq >/dev/null 2>&1; then
    target="$(printf '%s' "${payload}" | jq -r '.tool_input.file_path // .file_path // empty' 2>/dev/null || true)"
  else
    target="$(printf '%s' "${payload}" | grep -oE '"file_path"[[:space:]]*:[[:space:]]*"[^"]+"' | head -1 | sed -E 's/.*"file_path"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/' || true)"
  fi
fi

if [[ -z "${target}" ]]; then
  exit 0
fi

case "${target}" in
  */supabase/migrations/*.sql)
    ;;
  *)
    exit 0
    ;;
esac

# Repo root.
repo_root="$(git -C "$(dirname "${target}")" rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "${repo_root}" ]]; then
  exit 0
fi

dev_seeds_dir="${repo_root}/supabase/dev-seeds"
if [[ ! -d "${dev_seeds_dir}" ]]; then
  log "no supabase/dev-seeds dir found; expected one — investigate"
  exit 0
fi

basename="$(basename "${target}" .sql)"
# Strip the timestamp prefix (YYYYMMDDHHMMSS_) if present.
slug="$(echo "${basename}" | sed -E 's/^[0-9]{14,17}_//')"
# Reduce slug to its top 2 underscore-separated tokens longer than 3 chars —
# noise like "fix", "add", "v2" doesn't help match.
tokens=()
IFS='_' read -r -a parts <<< "${slug}"
for p in "${parts[@]}"; do
  if [[ ${#p} -gt 3 ]]; then
    tokens+=("${p}")
  fi
  if [[ ${#tokens[@]} -ge 2 ]]; then
    break
  fi
done

if [[ ${#tokens[@]} -eq 0 ]]; then
  log "migration slug '${slug}' has no strong tokens; can't match a dev-seed by name"
  echo "" >&2
  echo "═══════════════════════════════════════════════════════════════════" >&2
  echo "  uniplug-flo: migration without a matching dev-seed?" >&2
  echo "  ${target}" >&2
  echo "" >&2
  echo "  Confirm one of these exists in supabase/dev-seeds/ and proves" >&2
  echo "  both the rejection case and the happy path for this change." >&2
  echo "  (See the supabase-migration skill.)" >&2
  echo "═══════════════════════════════════════════════════════════════════" >&2
  exit 0
fi

# grep dev-seeds for any token match.
found=""
for t in "${tokens[@]}"; do
  if ls "${dev_seeds_dir}"/*"${t}"*.sql >/dev/null 2>&1; then
    found="$(ls "${dev_seeds_dir}"/*"${t}"*.sql | head -1)"
    break
  fi
done

if [[ -n "${found}" ]]; then
  log "migration ${basename}.sql has a candidate dev-seed: $(basename "${found}")"
  exit 0
fi

echo "" >&2
echo "═══════════════════════════════════════════════════════════════════" >&2
echo "  uniplug-flo: WARNING — no dev-seed found for migration" >&2
echo "  ${target}" >&2
echo "" >&2
echo "  Tokens searched: ${tokens[*]}" >&2
echo "  Expected pattern: supabase/dev-seeds/*<token>*verification.sql" >&2
echo "" >&2
echo "  Every RLS / schema change should be paired with a dev-seed that" >&2
echo "  proves both the rejection case and the happy path inside a single" >&2
echo "  BEGIN...ROLLBACK transaction. See the supabase-migration skill." >&2
echo "" >&2
echo "  This is a soft guard — the hook does not block. But it is rare" >&2
echo "  that a missing dev-seed here is the right answer." >&2
echo "═══════════════════════════════════════════════════════════════════" >&2

# Soft warn — exit 0 so we don't block.
exit 0
