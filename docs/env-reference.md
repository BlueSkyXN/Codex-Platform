# Environment Reference

This document is the public environment contract. Real values and cloud parity notes belong in the gitignored `.env.local` ledger.

## HF Variables

| Key | Recommended | Purpose |
| --- | --- | --- |
| `DEMO_MODE` | `auto` | Public preview falls back to demo mode; real mode can set `false`. |
| `HOST` | `0.0.0.0` | Listen on the HF container interface. |
| `PORT` | `7860` | Matches Space `app_port`. |
| `CODEX_PLATFORM_HF_SPACE` | `true` | Forces HF defaults. |
| `CODEX_PLATFORM_HF_STORAGE_ROOT` | `/data` | HF runtime storage root. |
| `WORKSPACE_ROOT` | `/data/workspace` | Default project directory. |
| `WORKSPACE_ROOTS` | `/data/workspace` | Allowed project roots. |
| `CODEX_PLATFORM_DATA_DIR` | `/data/codex-platform` | App state and event log. |
| `CODEX_HOME` | `/data/codex-home` | Codex auth/config home. |
| `CODEX_BIN` | `codex` | Codex CLI binary. |
| `CODEX_ARGS` | `app-server` | Codex app-server arguments. |

## HF Secrets

| Key | Required | Purpose |
| --- | --- | --- |
| `CODEX_PLATFORM_AUTH_TOKEN` | Real mode | Access token for browser/API/WebSocket use. |
| `OPENAI_API_KEY` | Optional | API-key based Codex/OpenAI auth when not using `CODEX_HOME/auth.json`. |
| `CODEX_AUTH_TOKEN` | Optional | Alternate Codex auth token if supported by the installed Codex runtime. |

## GitHub Actions

| Key | Kind | Purpose |
| --- | --- | --- |
| `HF_TOKEN` | Secret | Token used by `.github/workflows/deploy-hf-space.yml` to upload the Space bundle. |
| `HF_SPACE_ID` | Variable | Optional override; defaults to `BlueSkyXN/Codex-Platform-HFS`. |

## Compatibility Aliases

The app still accepts these legacy aliases:

```text
CODEX_WEB_AUTH_TOKEN
CODEX_WEB_ALLOW_UNAUTHENTICATED
CODEX_WEB_DATA_DIR
CODEX_WEB_HF_SPACE
CODEX_WEB_HF_STORAGE_ROOT
CODEX_WEB_AUTO_CREATE_WORKSPACE
```

New deployments should prefer `CODEX_PLATFORM_*`.
