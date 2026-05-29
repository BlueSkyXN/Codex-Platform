#!/usr/bin/env bash
set -euo pipefail

export CODEX_PLATFORM_HF_SPACE="${CODEX_PLATFORM_HF_SPACE:-${CODEX_WEB_HF_SPACE:-true}}"
export CODEX_WEB_HF_SPACE="${CODEX_WEB_HF_SPACE:-${CODEX_PLATFORM_HF_SPACE}}"
export PORT="${PORT:-7860}"
export HOST="${HOST:-0.0.0.0}"
export HOME="${HOME:-/home/user}"
export CODEX_PLATFORM_HF_STORAGE_ROOT="${CODEX_PLATFORM_HF_STORAGE_ROOT:-${CODEX_WEB_HF_STORAGE_ROOT:-/data}}"
export CODEX_WEB_HF_STORAGE_ROOT="${CODEX_WEB_HF_STORAGE_ROOT:-${CODEX_PLATFORM_HF_STORAGE_ROOT}}"
export WORKSPACE_ROOT="${WORKSPACE_ROOT:-${CODEX_PLATFORM_HF_STORAGE_ROOT}/workspace}"
export WORKSPACE_ROOTS="${WORKSPACE_ROOTS:-${WORKSPACE_ROOT}}"
export CODEX_PLATFORM_DATA_DIR="${CODEX_PLATFORM_DATA_DIR:-${CODEX_WEB_DATA_DIR:-${CODEX_PLATFORM_HF_STORAGE_ROOT}/codex-platform}}"
export CODEX_WEB_DATA_DIR="${CODEX_WEB_DATA_DIR:-${CODEX_PLATFORM_DATA_DIR}}"
export CODEX_HOME="${CODEX_HOME:-${CODEX_PLATFORM_HF_STORAGE_ROOT}/codex-home}"
export CODEX_BIN="${CODEX_BIN:-codex}"
export CODEX_ARGS="${CODEX_ARGS:-app-server}"
export CODEX_PLATFORM_AUTO_CREATE_WORKSPACE="${CODEX_PLATFORM_AUTO_CREATE_WORKSPACE:-${CODEX_WEB_AUTO_CREATE_WORKSPACE:-true}}"
export CODEX_WEB_AUTO_CREATE_WORKSPACE="${CODEX_WEB_AUTO_CREATE_WORKSPACE:-${CODEX_PLATFORM_AUTO_CREATE_WORKSPACE}}"

mkdir -p "${WORKSPACE_ROOT}" "${CODEX_PLATFORM_DATA_DIR}" "${CODEX_HOME}" "${HOME}/.agents/skills"

if [ ! -f "${WORKSPACE_ROOT}/README.md" ]; then
  cat > "${WORKSPACE_ROOT}/README.md" <<'EOW'
# Hugging Face Space Workspace

This directory is the default workspace for Codex-Platform inside Hugging Face Spaces.

- Mount persistent storage if you want this workspace and Codex-Platform state to survive restarts.
- Add repositories or files under this directory, then add them from the Codex-Platform UI.
EOW
fi

# `DEMO_MODE=auto` keeps a newly-created public/private Space bootable without Codex auth.
# Real mode is selected only when a likely Codex/API credential is present, or when CODEX_FORCE_REAL=true.
if [ -z "${DEMO_MODE:-}" ] || [ "${DEMO_MODE}" = "auto" ]; then
  if [ "${CODEX_FORCE_REAL:-false}" = "true" ]; then
    export DEMO_MODE=false
  elif command -v "${CODEX_BIN}" >/dev/null 2>&1 && { [ -n "${OPENAI_API_KEY:-}" ] || [ -n "${CODEX_AUTH_TOKEN:-}" ] || [ -f "${CODEX_HOME}/auth.json" ]; }; then
    export DEMO_MODE=false
  else
    export DEMO_MODE=true
  fi
fi

# Public demo mode is safe enough to boot without a token. Real Codex mode remains token-gated by server config.
if [ -z "${CODEX_PLATFORM_AUTH_TOKEN:-${CODEX_WEB_AUTH_TOKEN:-}}" ] && [ "${DEMO_MODE}" = "true" ]; then
  export CODEX_PLATFORM_ALLOW_UNAUTHENTICATED="${CODEX_PLATFORM_ALLOW_UNAUTHENTICATED:-${CODEX_WEB_ALLOW_UNAUTHENTICATED:-true}}"
  export CODEX_WEB_ALLOW_UNAUTHENTICATED="${CODEX_WEB_ALLOW_UNAUTHENTICATED:-${CODEX_PLATFORM_ALLOW_UNAUTHENTICATED}}"
fi

cat <<EOM
[Codex-Platform] starting
  host=${HOST}
  port=${PORT}
  demo_mode=${DEMO_MODE}
  workspace_root=${WORKSPACE_ROOT}
  workspace_roots=${WORKSPACE_ROOTS}
  data_dir=${CODEX_PLATFORM_DATA_DIR}
  codex_home=${CODEX_HOME}
  space_host=${SPACE_HOST:-}
EOM

exec node dist/server/server/index.js
