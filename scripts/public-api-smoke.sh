#!/usr/bin/env bash
# Smoke test for the public /v1 API. Self-contained: builds (unless SKIP_BUILD=1),
# boots the server in demo mode twice (disabled, then enabled with known keys),
# and asserts the gate, key auth, scope enforcement and response envelope.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PORT="${PUBLIC_API_SMOKE_PORT:-18799}"
BASE="http://127.0.0.1:${PORT}"
DATA_DIR="$(mktemp -d)"
READ_KEY="cpk_live_smoke_read"
FULL_KEY="cpk_live_smoke_full"

tmp_body="$(mktemp)"
SERVER_PID=""
cleanup() {
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true
  rm -f "$tmp_body"
  rm -rf "$DATA_DIR"
}
trap cleanup EXIT

json_check() {
  node -e "
    let d='';process.stdin.setEncoding('utf8');
    process.stdin.on('data',c=>d+=c);
    process.stdin.on('end',()=>{const value=JSON.parse(d);if(!(${1}))process.exit(2);});
  "
}

req_status() { curl -sS -o "$tmp_body" -w '%{http_code}' --connect-timeout 5 --max-time 20 "$@" || true; }

expect_status() {
  local label=$1 expected=$2; shift 2
  local status; status=$(req_status "$@")
  if [ "$status" = "$expected" ]; then printf 'PASS %s: HTTP %s\n' "$label" "$status"; return; fi
  printf 'FAIL %s: expected %s got %s\n' "$label" "$expected" "$status" >&2; sed -n '1,40p' "$tmp_body" >&2; exit 1
}

expect_json() {
  local label=$1 expected_status=$2 expr=$3; shift 3
  local status; status=$(req_status "$@")
  if [ "$status" = "$expected_status" ] && json_check "$expr" < "$tmp_body" 2>/dev/null; then
    printf 'PASS %s: HTTP %s + envelope\n' "$label" "$status"; return
  fi
  printf 'FAIL %s: expected %s + envelope, got %s\n' "$label" "$expected_status" "$status" >&2; sed -n '1,40p' "$tmp_body" >&2; exit 1
}

expect_not_status() {
  local label=$1 forbidden=$2; shift 2
  local status; status=$(req_status "$@")
  if [ "$status" != "$forbidden" ]; then printf 'PASS %s: HTTP %s (not %s)\n' "$label" "$status" "$forbidden"; return; fi
  printf 'FAIL %s: unexpected HTTP %s\n' "$label" "$status" >&2; sed -n '1,40p' "$tmp_body" >&2; exit 1
}

start_server() { # args: enabled(true|false)
  local enabled=$1
  mkdir -p "$DATA_DIR/workspace"
  # Force non-HF + isolated workspace so the smoke runs regardless of .env.local.
  DEMO_MODE=true PORT="$PORT" HOST=127.0.0.1 \
    CODEX_PLATFORM_HF_SPACE=false \
    CODEX_PLATFORM_ALLOW_UNAUTHENTICATED=true \
    WORKSPACE_ROOT="$DATA_DIR/workspace" \
    WORKSPACE_ROOTS="$DATA_DIR/workspace" \
    CODEX_HOME="$DATA_DIR/codex-home" \
    CODEX_PLATFORM_DATA_DIR="$DATA_DIR/data" \
    CODEX_PLATFORM_PUBLIC_API_ENABLED="$enabled" \
    CODEX_PLATFORM_PUBLIC_API_KEYS="${READ_KEY}|read;${FULL_KEY}|*" \
    node dist/server/server/index.js >/dev/null 2>&1 &
  SERVER_PID=$!
  for _ in $(seq 1 40); do
    if curl -sS -o /dev/null --max-time 2 "$BASE/healthz" 2>/dev/null; then return 0; fi
    sleep 0.25
  done
  printf 'FAIL: server did not become ready\n' >&2; exit 1
}

stop_server() { [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true; wait "$SERVER_PID" 2>/dev/null || true; SERVER_PID=""; }

if [ "${SKIP_BUILD:-0}" != "1" ]; then
  echo "building…"; npm run build >/dev/null 2>&1
fi

echo "== phase 1: public API disabled =="
start_server false
expect_status "disabled-projects" "404" "$BASE/v1/projects"
expect_status "disabled-openapi"  "404" "$BASE/v1/openapi.json"
stop_server

echo "== phase 2: public API enabled =="
start_server true
expect_json   "openapi-no-key"     "200" "value.openapi === '3.1.0'" "$BASE/v1/openapi.json"
expect_json   "no-key"             "401" "value.ok === false && value.error.code === 'unauthorized'" "$BASE/v1/projects"
expect_json   "bad-key"            "401" "value.ok === false && value.error.code === 'invalid_api_key'" -H "authorization: Bearer nope" "$BASE/v1/projects"
expect_json   "whoami"             "200" "value.ok === true && Array.isArray(value.data.scopes)" -H "authorization: Bearer ${READ_KEY}" "$BASE/v1/whoami"
expect_json   "projects-read"      "200" "value.ok === true && Array.isArray(value.data)" -H "authorization: Bearer ${READ_KEY}" "$BASE/v1/projects"
expect_json   "scope-insufficient" "403" "value.ok === false && value.error.code === 'scope_insufficient'" -X POST -H "authorization: Bearer ${READ_KEY}" -H "content-type: application/json" -d '{"cwd":"."}' "$BASE/v1/projects"
expect_not_status "write-scope-passes" "403" -X POST -H "authorization: Bearer ${FULL_KEY}" -H "content-type: application/json" -d '{"cwd":"."}' "$BASE/v1/projects"
expect_json   "unknown-path"        "404" "value.ok === false && value.error.code === 'not_found'" -H "authorization: Bearer ${READ_KEY}" "$BASE/v1/does-not-exist"
stop_server

printf '\nPASS public-api smoke\n'
