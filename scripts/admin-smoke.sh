#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-${ADMIN_SMOKE_BASE_URL:-http://127.0.0.1:${PORT:-7860}}}"
BASE_URL="${BASE_URL%/}"
ADMIN_EXPECTED_ENABLED="${ADMIN_EXPECTED_ENABLED:-${CODEX_PLATFORM_ADMIN_ENABLED:-false}}"
ADMIN_SMOKE_ACTIONS="${ADMIN_SMOKE_ACTIONS:-false}"
ADMIN_TOKEN="${CODEX_PLATFORM_ADMIN_TOKEN:-${ADMIN_TOKEN:-}}"

tmp_body=$(mktemp)
tmp_cookie=$(mktemp)
trap 'rm -f "$tmp_body" "$tmp_cookie"' EXIT

json_check() {
  local expression="${1:-true}"
  node -e "
    let d = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', c => d += c);
    process.stdin.on('end', () => {
      const value = JSON.parse(d);
      if (!($expression)) process.exit(2);
    });
  "
}

expect_status() {
  local label=$1
  local expected=$2
  shift 2
  local status
  status=$(curl -sS -o "$tmp_body" -w '%{http_code}' --connect-timeout 10 --max-time 30 "$@" || true)
  if [ "$status" = "$expected" ]; then
    printf 'PASS %s: HTTP %s\n' "$label" "$status"
    return
  fi
  printf 'FAIL %s: expected HTTP %s, got %s\n' "$label" "$expected" "$status" >&2
  sed -n '1,80p' "$tmp_body" >&2 || true
  exit 1
}

expect_json() {
  local label=$1
  local expression=$2
  shift 2
  local status
  status=$(curl -sS -o "$tmp_body" -w '%{http_code}' --connect-timeout 10 --max-time 30 "$@" || true)
  if [ "$status" = "200" ] && json_check "$expression" < "$tmp_body" 2>/dev/null; then
    printf 'PASS %s: JSON HTTP 200\n' "$label"
    return
  fi
  printf 'FAIL %s: expected JSON HTTP 200, got %s\n' "$label" "$status" >&2
  sed -n '1,80p' "$tmp_body" >&2 || true
  exit 1
}

admin_login_payload() {
  ADMIN_TOKEN="$ADMIN_TOKEN" node -e 'process.stdout.write(JSON.stringify({token: process.env.ADMIN_TOKEN || ""}))'
}

if [ "$ADMIN_EXPECTED_ENABLED" != "true" ]; then
  expect_status "admin-disabled-root" "404" "$BASE_URL/_admin/"
  expect_status "admin-disabled-status" "404" "$BASE_URL/_admin/api/status"
  printf 'PASS admin smoke: disabled\n'
  exit 0
fi

if [ -z "$ADMIN_TOKEN" ]; then
  printf 'FAIL admin-enabled: ADMIN_TOKEN or CODEX_PLATFORM_ADMIN_TOKEN is required\n' >&2
  exit 1
fi

expect_status "admin-root" "200" "$BASE_URL/_admin/"
expect_status "admin-status-unauthorized" "401" "$BASE_URL/_admin/api/status"
expect_status "admin-status-bad-token" "401" -H "x-codex-platform-admin-token: invalid-admin-token" "$BASE_URL/_admin/api/status"
expect_json "admin-status" "value && value.ok === true && value.actions" -H "x-codex-platform-admin-token: $ADMIN_TOKEN" "$BASE_URL/_admin/api/status"
expect_json "admin-actions" "value && value.ok === true && Array.isArray(value.actions)" -H "x-codex-platform-admin-token: $ADMIN_TOKEN" "$BASE_URL/_admin/api/actions"
expect_json "admin-audit" "value && value.ok === true && Array.isArray(value.events)" -H "x-codex-platform-admin-token: $ADMIN_TOKEN" "$BASE_URL/_admin/api/audit?limit=5"
expect_status "admin-token-action-missing-confirm" "400" \
  -H "content-type: application/json" \
  -H "x-codex-platform-admin-token: $ADMIN_TOKEN" \
  -d '{}' \
  "$BASE_URL/_admin/api/actions/run-health-checks"

expect_json "admin-login-cookie" "value && value.ok === true && value.csrfToken" \
  -c "$tmp_cookie" \
  -H "content-type: application/json" \
  -d "$(admin_login_payload)" \
  "$BASE_URL/_admin/api/login"

csrf_token=$(node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>process.stdout.write(JSON.parse(d).csrfToken||''));" < "$tmp_body")

expect_status "admin-cookie-action-missing-csrf" "403" \
  -b "$tmp_cookie" \
  -H "content-type: application/json" \
  -d '{"confirm":true}' \
  "$BASE_URL/_admin/api/actions/run-health-checks"

expect_status "admin-cookie-action-missing-confirm" "400" \
  -b "$tmp_cookie" \
  -H "content-type: application/json" \
  -H "x-codex-platform-admin-csrf: $csrf_token" \
  -d '{}' \
  "$BASE_URL/_admin/api/actions/run-health-checks"

if [ "$ADMIN_SMOKE_ACTIONS" = "true" ]; then
  expect_json "admin-run-health-checks" "value && value.ok === true && value.result" \
    -b "$tmp_cookie" \
    -H "content-type: application/json" \
    -H "x-codex-platform-admin-csrf: $csrf_token" \
    -d '{"confirm":true}' \
    "$BASE_URL/_admin/api/actions/run-health-checks"
else
  printf 'SKIP admin-run-health-checks: ADMIN_SMOKE_ACTIONS is not true\n'
fi

printf 'PASS admin smoke: %s\n' "$BASE_URL"
