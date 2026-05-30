#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repo_root"

check_changed_file_trailing_whitespace() {
  local -a files=()
  local file
  while IFS= read -r -d '' file; do
    [ -f "$file" ] || continue
    files+=("$file")
  done < <(
    git diff --name-only -z --diff-filter=ACMR
    git diff --cached --name-only -z --diff-filter=ACMR
    git ls-files --others --exclude-standard -z
  )

  [ "${#files[@]}" -gt 0 ] || return 0

  local output status
  set +e
  if command -v rg >/dev/null 2>&1; then
    output=$(rg -n '[[:blank:]]$' -- "${files[@]}" 2>&1)
    status=$?
  else
    output=$(grep -n -E '[[:blank:]]$' -- "${files[@]}" 2>&1)
    status=$?
  fi
  set -e

  if [ "$status" -eq 0 ]; then
    printf 'Trailing whitespace found in changed or untracked files:\n%s\n' "$output" >&2
    return 1
  fi
  if [ "$status" -gt 1 ]; then
    printf 'Unable to check trailing whitespace:\n%s\n' "$output" >&2
    return "$status"
  fi
}

bash -n \
  scripts/hf-entrypoint.sh \
  scripts/hf-healthcheck.sh \
  scripts/hf-space-smoke.sh \
  scripts/validate-hfs-contract.sh \
  scripts/static-check.sh \
  cloud/hfs/export_space_bundle.sh

scripts/validate-hfs-contract.sh
git diff --check
check_changed_file_trailing_whitespace

printf 'PASS static-check\n'
