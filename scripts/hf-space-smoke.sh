#!/usr/bin/env bash
set -euo pipefail
BASE_URL="${1:-http://127.0.0.1:${PORT:-7860}}"
TOKEN="${CODEX_PLATFORM_AUTH_TOKEN:-${CODEX_WEB_AUTH_TOKEN:-}}"

json_check() {
  node -e "let d=''; process.stdin.setEncoding('utf8'); process.stdin.on('data', c => d += c); process.stdin.on('end', () => { JSON.parse(d); });"
}

echo "[smoke] ${BASE_URL}/healthz"
curl -fsS "${BASE_URL}/healthz" | json_check

echo "[smoke] ${BASE_URL}/"
curl -fsSI "${BASE_URL}/" >/dev/null

if [ -n "${TOKEN}" ]; then
  echo "[smoke] authenticated /api/state"
  curl -fsS -H "x-codex-platform-token: ${TOKEN}" "${BASE_URL}/api/state" | json_check
else
  echo "[smoke] unauthenticated /api/state"
  curl -fsS "${BASE_URL}/api/state" | json_check
fi

echo "[smoke] ok"
