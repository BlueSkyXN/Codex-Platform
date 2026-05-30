#!/usr/bin/env bash
set -euo pipefail
BASE_URL="${1:-http://127.0.0.1:${PORT:-7860}}"
BASE_URL="${BASE_URL%/}"
TOKEN="${CODEX_PLATFORM_AUTH_TOKEN:-${CODEX_WEB_AUTH_TOKEN:-}}"
SMOKE_RETRIES="${SMOKE_RETRIES:-30}"
SMOKE_DELAY="${SMOKE_DELAY:-5}"

tmp_body=$(mktemp)
trap 'rm -f "$tmp_body"' EXIT

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

check_json "healthz" "/healthz" "value && value.ok === true && typeof value.uptimeSeconds === 'number'"
check_json "api-config" "/api/config" "value && typeof value.authRequired === 'boolean' && typeof value.demoMode === 'boolean'"
check_status "web-root" "/" "200"
check_state

printf 'PASS smoke: %s\n' "$BASE_URL"
