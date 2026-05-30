# Environment Reference

This document is the public environment contract. Real values and cloud parity notes belong in the gitignored `.env.local` ledger.

## Configuration Priority

Runtime configuration is resolved in this order:

1. Docker, Hugging Face Space, or shell-exported environment variables already present in the process. On HF this includes values exported by `scripts/hf-entrypoint.sh`.
2. Local `.env` and `.env.local` files fill only missing keys when they exist in the current working directory.
3. `CODEX_PLATFORM_*` keys are preferred; compatibility aliases such as `CODEX_WEB_*` are fallbacks.
4. Application defaults in `src/server/config.ts`.

Explicit Space Settings should be treated as the source of truth for cloud runtime behavior. Do not rely on local shell values to describe the deployed Space unless they have been synchronized and verified.

## Local Env Ledger

The only local private ledger is:

```text
.env.local
```

`.env.local` is ignored by Git. It is a notebook for local operations, not an env-file to upload wholesale. It may record Space ID, Space URL, key placement, whether a key is configured, verification timestamps, and private notes. Do not copy real values from `.env.local` into public docs, commits, PR text, logs, screenshots, or examples.

Use these fields when recording env decisions locally:

| Field | Meaning |
| --- | --- |
| Platform | `HF Space`, `GitHub Actions`, or `Local Only`. |
| Kind | `Variable`, `Secret`, or `Variable if public / Secret if private`. |
| Level | `Recommended`, `Optional`, `Derived`, or `Local Only`. |
| Default | Public default from code or docs. |
| Recommended | Suggested value shape or placeholder. |
| Known state | Whether the key exists or has been verified. Do not store public evidence of secret values. |
| Notes | Operational context, risk, or sync status. |

When uploading to Hugging Face, copy only the keys that should actually take effect. Do not bulk-import `.env.local`, and do not upload placeholder secrets.

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

Do not upload these values unless you intentionally need to override the HF defaults already set by the Docker image:

```env
HOST=0.0.0.0
PORT=7860
CODEX_PLATFORM_HF_SPACE=true
CODEX_PLATFORM_HF_STORAGE_ROOT=/data
CODEX_BIN=codex
CODEX_ARGS=app-server
```

## HF Secrets

| Key | Required | Purpose |
| --- | --- | --- |
| `CODEX_PLATFORM_AUTH_TOKEN` | Real mode | Access token for browser/API/WebSocket use. |
| `OPENAI_API_KEY` | Optional | API-key based Codex/OpenAI auth when not using `CODEX_HOME/auth.json`. |
| `CODEX_AUTH_TOKEN` | Optional | Alternate Codex auth token if supported by the installed Codex runtime. |

Public demo mode should not set Codex/OpenAI credentials. Real mode should use a Private or Protected Space, persistent storage, `DEMO_MODE=false`, and a strong `CODEX_PLATFORM_AUTH_TOKEN`.

## GitHub Actions

| Key | Kind | Purpose |
| --- | --- | --- |
| `HF_TOKEN` | Secret | Token used by `.github/workflows/deploy-hf-space.yml` to upload the Space bundle. |
| `HF_SPACE_ID` | Variable | Optional override; defaults to `BlueSkyXN/Codex-Platform-HFS`. |
| `HF_PUBLIC_URL` | Variable | Optional live smoke URL override; defaults to the public Space URL. |
| `CODEX_PLATFORM_AUTH_TOKEN` | Secret | Optional smoke token for real-mode Spaces. |

GitHub Actions values are deployment and verification inputs. They are separate from HF runtime Variables and Secrets.

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

## Derived Or Local-Only Values

Do not upload these as normal HF Settings unless there is a deliberate override:

```env
CODEX_PLATFORM_BUILD_SHA
BUILD_SOURCE.txt contents
local operation notes
verification timestamps
private Space URLs
```

`CODEX_PLATFORM_BUILD_SHA` is primarily a runtime override for diagnostics. Normal HF images read `BUILD_SHA` from the image, which is generated during the Docker build from `CODEX_PLATFORM_COMMIT`.
