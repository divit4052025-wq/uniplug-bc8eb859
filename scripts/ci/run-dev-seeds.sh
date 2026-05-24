#!/usr/bin/env bash
#
# scripts/ci/run-dev-seeds.sh
#
# Run every supabase/dev-seeds/*.sql against the local Supabase Postgres
# and fail the job if any test row returns status='FAIL'.
#
# Reads DB_URL from the env (set by the CI workflow's supabase-status step).
#
# Skip list: dev-seeds that are historical-only (they test a migration that
# has since been superseded). Keeping them in the repo as documentation is
# fine; running them in CI would produce expected FAILs from out-of-date
# assumptions. New historical dev-seeds get added here.

set -euo pipefail

if [[ -z "${DB_URL:-}" ]]; then
  echo "ERROR: DB_URL is not set. Run via the CI workflow or export DB_URL." >&2
  exit 1
fi

# Historical / superseded dev-seeds. Each line is a filename relative to
# supabase/dev-seeds/. Be conservative — only skip when a dev-seed asserts
# behavior that a subsequent migration intentionally removed.
declare -a SKIP_DEV_SEEDS=(
  # Superseded by Phase A1 (20260523000001_book_session_rpc.sql): the R4
  # minimal-fix INSERT policy this dev-seed exercised was DROPped when the
  # SECURITY DEFINER RPC became the only INSERT path. The forward-looking
  # equivalent tests live in book-session-rpc-verification.sql.
  "bug-audit-rls-risk4-verification.sql"
)

is_skipped() {
  local f="$1"
  for skip in "${SKIP_DEV_SEEDS[@]}"; do
    if [[ "${f}" == "${skip}" ]]; then
      return 0
    fi
  done
  return 1
}

repo_root="$(git rev-parse --show-toplevel)"
seeds_dir="${repo_root}/supabase/dev-seeds"

if [[ ! -d "${seeds_dir}" ]]; then
  echo "ERROR: ${seeds_dir} not found." >&2
  exit 1
fi

declare -i ran=0 skipped=0 failed=0
declare -a failed_files=()

for path in "${seeds_dir}"/*.sql; do
  fname="$(basename "${path}")"

  if is_skipped "${fname}"; then
    echo "::group::SKIP  ${fname} (historical)"
    echo "Skipped per scripts/ci/run-dev-seeds.sh skip list."
    echo "::endgroup::"
    skipped=$((skipped + 1))
    continue
  fi

  echo "::group::RUN   ${fname}"
  # Capture combined stdout+stderr so the GitHub Actions log shows
  # the dev-seed's final SELECT (the PASS/FAIL table) inline.
  output=$(psql "${DB_URL}" -v ON_ERROR_STOP=1 -f "${path}" 2>&1) || {
    echo "${output}"
    echo "::error file=supabase/dev-seeds/${fname}::psql failed"
    failed=$((failed + 1))
    failed_files+=("${fname}")
    echo "::endgroup::"
    continue
  }
  echo "${output}"
  # psql right-pads the status column (e.g. "| FAIL   |"), so match
  # with flexible whitespace on both sides of FAIL.
  if echo "${output}" | grep -qE '\|\s*FAIL\s*\|'; then
    echo "::error file=supabase/dev-seeds/${fname}::dev-seed contains FAIL rows"
    failed=$((failed + 1))
    failed_files+=("${fname}")
  fi
  ran=$((ran + 1))
  echo "::endgroup::"
done

echo ""
echo "════════════════════════════════════════"
echo "  ran:     ${ran}"
echo "  skipped: ${skipped}"
echo "  failed:  ${failed}"
echo "════════════════════════════════════════"

if [[ ${failed} -gt 0 ]]; then
  echo "Failed dev-seeds:"
  for f in "${failed_files[@]}"; do
    echo "  - ${f}"
  done
  exit 1
fi

exit 0
