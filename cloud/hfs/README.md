---
title: Codex-Platform
emoji: 🧭
colorFrom: gray
colorTo: green
sdk: docker
app_port: 7860
suggested_hardware: cpu-basic
pinned: false
---

# Codex-Platform HFS

This Space runs Codex-Platform as a Hugging Face Docker Space.

Codex-Platform is a single-user/private-team web control plane for `codex app-server`. It provides a browser UI, token-gated HTTP API, WebSocket event stream, project-root restrictions, demo mode, and a real Codex bridge when credentials are supplied.

## Modes

- Public demo: leave `DEMO_MODE=auto` and do not set Codex credentials. The app starts with simulated Codex events.
- Real mode: use a Private or Protected Space, enable persistent storage, set `DEMO_MODE=false`, and add `CODEX_PLATFORM_AUTH_TOKEN` plus Codex/OpenAI auth.

## Runtime Paths

```text
/data/workspace        default project root
/data/codex-platform   app state and event log
/data/codex-home       Codex auth/config home
```

## Required Secrets For Real Mode

```env
CODEX_PLATFORM_AUTH_TOKEN=<long-random-token>
OPENAI_API_KEY=<optional-if-api-key-auth-is-used>
```

## Recommended Variables

```env
DEMO_MODE=auto
WORKSPACE_ROOT=/data/workspace
WORKSPACE_ROOTS=/data/workspace
CODEX_PLATFORM_DATA_DIR=/data/codex-platform
CODEX_HOME=/data/codex-home
CODEX_ARGS=app-server
```

The source of truth is the GitHub repository: <https://github.com/BlueSkyXN/Codex-Platform>.
