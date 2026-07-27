#!/usr/bin/env bash
set -euo pipefail
BASE_URL="${1:-http://127.0.0.1:${PORT:-7860}}"
BASE_URL="${BASE_URL%/}"
TOKEN="${CODEX_PLATFORM_AUTH_TOKEN:-${CODEX_WEB_AUTH_TOKEN:-}}"
OPS_TOKEN="${CODEX_PLATFORM_OPS_TOKEN:-${OPS_TOKEN:-}}"
ADMIN_TOKEN="${CODEX_PLATFORM_ADMIN_TOKEN:-${ADMIN_TOKEN:-}}"
SMOKE_ADMIN_ENABLED="${SMOKE_ADMIN_ENABLED:-${CODEX_PLATFORM_ADMIN_ENABLED:-false}}"
SMOKE_ADMIN_ACTIONS="${SMOKE_ADMIN_ACTIONS:-false}"
SMOKE_RETRIES="${SMOKE_RETRIES:-30}"
SMOKE_DELAY="${SMOKE_DELAY:-5}"
EXPECTED_SOURCE_SHA="${EXPECTED_SOURCE_SHA:-}"
export EXPECTED_SOURCE_SHA

if [[ -n "${EXPECTED_SOURCE_SHA}" && ! "${EXPECTED_SOURCE_SHA}" =~ ^[0-9a-f]{40}$ ]]; then
  printf 'FAIL configuration: EXPECTED_SOURCE_SHA must be a full lowercase Git SHA\n' >&2
  exit 2
fi

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

check_status() {
  local label=$1
  local path=$2
  local expected=$3
  local status
  local attempt

  for attempt in $(seq 1 "$SMOKE_RETRIES"); do
    status=$(curl -sS -L -o "$tmp_body" -w '%{http_code}' --connect-timeout 10 --max-time 30 "${BASE_URL}${path}" || true)
    if [ "$status" = "$expected" ]; then
      printf 'PASS %s: HTTP %s\n' "$label" "$status"
      return
    fi
    if [ "$attempt" != "$SMOKE_RETRIES" ]; then
      printf 'WAIT %s: expected HTTP %s, got %s (%s/%s)\n' "$label" "$expected" "$status" "$attempt" "$SMOKE_RETRIES" >&2
      sleep "$SMOKE_DELAY"
    fi
  done

  printf 'FAIL %s: expected HTTP %s, got %s\n' "$label" "$expected" "$status" >&2
  sed -n '1,60p' "$tmp_body" >&2 || true
  exit 1
}

check_json() {
  local label=$1
  local path=$2
  local expression=$3
  local status
  local attempt

  for attempt in $(seq 1 "$SMOKE_RETRIES"); do
    status=$(curl -sS -L -o "$tmp_body" -w '%{http_code}' --connect-timeout 10 --max-time 30 "${BASE_URL}${path}" || true)
    if [ "$status" = "200" ] && json_check "$expression" < "$tmp_body" 2>/dev/null; then
      printf 'PASS %s: JSON HTTP %s\n' "$label" "$status"
      return
    fi
    if [ "$attempt" != "$SMOKE_RETRIES" ]; then
      printf 'WAIT %s: expected JSON HTTP 200, got %s (%s/%s)\n' "$label" "$status" "$attempt" "$SMOKE_RETRIES" >&2
      sleep "$SMOKE_DELAY"
    fi
  done

  printf 'FAIL %s: expected JSON HTTP 200, got %s\n' "$label" "$status" >&2
  sed -n '1,80p' "$tmp_body" >&2 || true
  exit 1
}

check_state() {
  local status
  local attempt

  if [ -n "$TOKEN" ]; then
    for attempt in $(seq 1 "$SMOKE_RETRIES"); do
      status=$(curl -sS -o "$tmp_body" -w '%{http_code}' --connect-timeout 10 --max-time 30 \
        -H "x-codex-platform-token: ${TOKEN}" \
        "${BASE_URL}/api/state" || true)
      if [ "$status" = "200" ] && json_check "value && typeof value === 'object'" < "$tmp_body" 2>/dev/null; then
        printf 'PASS api-state-authenticated: JSON HTTP %s\n' "$status"
        return
      fi
      if [ "$attempt" != "$SMOKE_RETRIES" ]; then
        printf 'WAIT api-state-authenticated: expected JSON HTTP 200, got %s (%s/%s)\n' "$status" "$attempt" "$SMOKE_RETRIES" >&2
        sleep "$SMOKE_DELAY"
      fi
    done

    printf 'FAIL api-state-authenticated: expected JSON HTTP 200, got %s\n' "$status" >&2
    sed -n '1,80p' "$tmp_body" >&2 || true
    exit 1
  fi

  status=$(curl -sS -o "$tmp_body" -w '%{http_code}' --connect-timeout 10 --max-time 30 "${BASE_URL}/api/state" || true)
  if [ "$status" = "200" ] && json_check "value && typeof value === 'object'" < "$tmp_body" 2>/dev/null; then
    printf 'PASS api-state-public: JSON HTTP %s\n' "$status"
    return
  fi
  if [ "$status" = "401" ]; then
    printf 'PASS api-state-auth-required: HTTP %s without token\n' "$status"
    return
  fi

  printf 'FAIL api-state: expected JSON HTTP 200 or auth-required HTTP 401, got %s\n' "$status" >&2
  sed -n '1,80p' "$tmp_body" >&2 || true
  exit 1
}

check_admin_status() {
  local status
  local attempt

  if [ -n "$TOKEN" ]; then
    for attempt in $(seq 1 "$SMOKE_RETRIES"); do
      status=$(curl -sS -o "$tmp_body" -w '%{http_code}' --connect-timeout 10 --max-time 30 \
        -H "x-codex-platform-token: ${TOKEN}" \
        "${BASE_URL}/api/admin/status" || true)
      if [ "$status" = "200" ] && json_check "value && value.readOnly === true && value.server && value.auth" < "$tmp_body" 2>/dev/null; then
        printf 'PASS admin-status-authenticated: JSON HTTP %s\n' "$status"
        return
      fi
      if [ "$attempt" != "$SMOKE_RETRIES" ]; then
        printf 'WAIT admin-status-authenticated: expected JSON HTTP 200, got %s (%s/%s)\n' "$status" "$attempt" "$SMOKE_RETRIES" >&2
        sleep "$SMOKE_DELAY"
      fi
    done

    printf 'FAIL admin-status-authenticated: expected JSON HTTP 200, got %s\n' "$status" >&2
    sed -n '1,80p' "$tmp_body" >&2 || true
    exit 1
  fi

  status=$(curl -sS -o "$tmp_body" -w '%{http_code}' --connect-timeout 10 --max-time 30 "${BASE_URL}/api/admin/status" || true)
  if [ "$status" = "200" ] && json_check "value && value.readOnly === true && value.server && value.auth" < "$tmp_body" 2>/dev/null; then
    printf 'PASS admin-status-public: JSON HTTP %s\n' "$status"
    return
  fi
  if [ "$status" = "401" ]; then
    printf 'PASS admin-status-auth-required: HTTP %s without token\n' "$status"
    return
  fi

  printf 'FAIL admin-status: expected JSON HTTP 200 or auth-required HTTP 401, got %s\n' "$status" >&2
  sed -n '1,80p' "$tmp_body" >&2 || true
  exit 1
}

check_ops_status() {
  local label=$1
  local path=$2
  local expected_type=${3:-json}
  local status
  local attempt

  if [ -z "$OPS_TOKEN" ]; then
    status=$(curl -sS -o "$tmp_body" -w '%{http_code}' --connect-timeout 10 --max-time 30 "${BASE_URL}${path}" || true)
    if [ "$status" = "401" ] || [ "$status" = "503" ]; then
      printf 'PASS %s-gated: HTTP %s without OPS token\n' "$label" "$status"
      return
    fi
    printf 'FAIL %s-gated: expected HTTP 401 or 503 without OPS token, got %s\n' "$label" "$status" >&2
    sed -n '1,80p' "$tmp_body" >&2 || true
    exit 1
  fi

  for attempt in $(seq 1 "$SMOKE_RETRIES"); do
    status=$(curl -sS -o "$tmp_body" -w '%{http_code}' --connect-timeout 10 --max-time 30 \
      -H "x-codex-platform-ops-token: ${OPS_TOKEN}" \
      "${BASE_URL}${path}" || true)
    if [ "$status" = "200" ]; then
      if [ "$expected_type" = "json" ] && ! json_check "value && typeof value === 'object'" < "$tmp_body" 2>/dev/null; then
        status="bad-json"
      else
        printf 'PASS %s: HTTP 200\n' "$label"
        return
      fi
    fi
    if [ "$attempt" != "$SMOKE_RETRIES" ]; then
      printf 'WAIT %s: expected HTTP 200, got %s (%s/%s)\n' "$label" "$status" "$attempt" "$SMOKE_RETRIES" >&2
      sleep "$SMOKE_DELAY"
    fi
  done

  printf 'FAIL %s: expected HTTP 200 with OPS token, got %s\n' "$label" "$status" >&2
  sed -n '1,80p' "$tmp_body" >&2 || true
  exit 1
}

check_ops_cookie_migration() {
  local status

  if [ -z "$OPS_TOKEN" ]; then
    printf 'SKIP ops-cookie-migration: OPS token is not set\n'
    return
  fi

  status=$(curl -sS -o "$tmp_body" -w '%{http_code}' --connect-timeout 10 --max-time 30 \
    -c "$tmp_cookie" \
    --get --data-urlencode "token=${OPS_TOKEN}" \
    "${BASE_URL}/_ops/" || true)
  if [ "$status" != "303" ]; then
    printf 'FAIL ops-cookie-query-redirect: expected HTTP 303, got %s\n' "$status" >&2
    sed -n '1,80p' "$tmp_body" >&2 || true
    exit 1
  fi

  status=$(curl -sS -o "$tmp_body" -w '%{http_code}' --connect-timeout 10 --max-time 30 \
    -b "$tmp_cookie" \
    "${BASE_URL}/_ops/" || true)
  if [ "$status" != "200" ]; then
    printf 'FAIL ops-cookie-dashboard: expected HTTP 200, got %s\n' "$status" >&2
    sed -n '1,80p' "$tmp_body" >&2 || true
    exit 1
  fi
  if grep -Fq "$OPS_TOKEN" "$tmp_body"; then
    printf 'FAIL ops-cookie-dashboard: OPS token is present in dashboard HTML\n' >&2
    exit 1
  fi
  printf 'PASS ops-cookie-migration: query token redirects to cookie-backed dashboard\n'
}

check_admin_control() {
  local label=$1
  local path=$2
  local status

  if [ "$SMOKE_ADMIN_ENABLED" != "true" ]; then
    check_status "admin-disabled" "/_admin/" "404"
    return
  fi

  if [ -z "$ADMIN_TOKEN" ]; then
    printf 'FAIL %s: ADMIN token is required when SMOKE_ADMIN_ENABLED=true\n' "$label" >&2
    exit 1
  fi

  status=$(curl -sS -o "$tmp_body" -w '%{http_code}' --connect-timeout 10 --max-time 30 \
    -H "x-codex-platform-admin-token: ${ADMIN_TOKEN}" \
    "${BASE_URL}${path}" || true)
  if [ "$status" = "200" ] && json_check "value && typeof value === 'object'" < "$tmp_body" 2>/dev/null; then
    printf 'PASS %s: HTTP 200\n' "$label"
    return
  fi
  printf 'FAIL %s: expected JSON HTTP 200 with ADMIN token, got %s\n' "$label" "$status" >&2
  sed -n '1,80p' "$tmp_body" >&2 || true
  exit 1
}

check_admin_action() {
  local status

  if [ "$SMOKE_ADMIN_ENABLED" != "true" ]; then
    return
  fi

  status=$(curl -sS -o "$tmp_body" -w '%{http_code}' --connect-timeout 10 --max-time 30 \
    -H "content-type: application/json" \
    -H "x-codex-platform-admin-token: ${ADMIN_TOKEN}" \
    -d '{}' \
    "${BASE_URL}/_admin/api/actions/run-health-checks" || true)
  if [ "$status" != "400" ]; then
    printf 'FAIL admin-action-missing-confirm: expected HTTP 400, got %s\n' "$status" >&2
    sed -n '1,80p' "$tmp_body" >&2 || true
    exit 1
  fi
  printf 'PASS admin-action-missing-confirm: HTTP 400\n'

  if [ "$SMOKE_ADMIN_ACTIONS" != "true" ]; then
    printf 'SKIP admin-run-health-checks: SMOKE_ADMIN_ACTIONS is not true\n'
    return
  fi

  status=$(curl -sS -o "$tmp_body" -w '%{http_code}' --connect-timeout 10 --max-time 30 \
    -H "content-type: application/json" \
    -H "x-codex-platform-admin-token: ${ADMIN_TOKEN}" \
    -d '{"confirm":true}' \
    "${BASE_URL}/_admin/api/actions/run-health-checks" || true)
  if [ "$status" = "200" ] && json_check "value && value.ok === true" < "$tmp_body" 2>/dev/null; then
    printf 'PASS admin-run-health-checks: HTTP 200\n'
    return
  fi
  printf 'FAIL admin-run-health-checks: expected JSON HTTP 200, got %s\n' "$status" >&2
  sed -n '1,80p' "$tmp_body" >&2 || true
  exit 1
}

check_json "healthz" "/healthz" "value && value.ok === true && typeof value.uptimeSeconds === 'number' && (!process.env.EXPECTED_SOURCE_SHA || (value.build && value.build.sha === process.env.EXPECTED_SOURCE_SHA))"
check_json "readyz" "/readyz" "value && typeof value.ready === 'boolean'"
check_json "api-config" "/api/config" "value && typeof value.authRequired === 'boolean' && typeof value.demoMode === 'boolean'"
check_status "web-root" "/" "200"
check_state
check_admin_status
check_ops_status "ops-health" "/_ops/health"
check_ops_status "ops-system" "/_ops/system"
check_ops_status "ops-errors" "/_ops/errors"
check_ops_status "ops-metrics" "/_ops/metrics" "text"
check_ops_cookie_migration
check_admin_control "admin-control-status" "/_admin/api/status"
if [ "$SMOKE_ADMIN_ENABLED" = "true" ]; then
  check_admin_control "admin-actions" "/_admin/api/actions"
  check_admin_control "admin-audit" "/_admin/api/audit?limit=5"
fi
check_admin_action

printf 'PASS smoke: %s\n' "$BASE_URL"
