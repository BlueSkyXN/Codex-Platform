#!/usr/bin/env bash
set -euo pipefail
PORT="${PORT:-7860}"
curl -fsS --connect-timeout 2 --max-time 5 "http://127.0.0.1:${PORT}/healthz" >/dev/null
