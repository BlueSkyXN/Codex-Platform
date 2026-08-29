# Environment Reference

This document is the public environment contract. HFS v3 deployment values belong in the gitignored `.env` ledger; product-local compatibility notes may remain in the gitignored `.env.local` ledger.

## Configuration Priority

Runtime configuration is resolved in this order:

1. Docker, Hugging Face Space, or shell-exported environment variables already present in the process. On HF this includes values exported by `scripts/hf-entrypoint.sh`.
2. Local `.env` and `.env.local` files fill only missing keys when they exist in the current working directory.
3. `CODEX_PLATFORM_*` keys are preferred; compatibility aliases such as `CODEX_WEB_*` are fallbacks.
4. Application defaults in `src/server/config.ts`.

Explicit Space Settings should be treated as the source of truth for cloud runtime behavior. Do not rely on local shell values to describe the deployed Space unless they have been synchronized and verified.

## Local Env Ledgers

HFS v3 uses the root `.env` file as its private value ledger. `cloud/hfs/hfs-dev.toml` registers the permitted local-only, Secret, and Variable names; the values remain only in `.env` and are never committed or exported in the Space bundle.

`.env.local` remains an ignored product-local compatibility ledger and notebook for local operations. It may record Space ID, Space URL, key placement, whether a key is configured, verification timestamps, and private notes. Do not bulk-upload either ledger or copy real values from either file into public docs, commits, PR text, logs, screenshots, or examples.

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
| `CODEX_PLATFORM_ADMIN_ENABLED` | `false` | Enables the separate `/_admin/*` management surface only when intentionally needed. |

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
| `OPS_TOKEN` | Recommended | Access token for `/_ops/*` read-only diagnostics. |
| `ADMIN_PASSWORD` | Admin enabled | Independent access token for `/_admin/*`. |
| `OPENAI_API_KEY` | Optional | API-key based Codex/OpenAI auth when not using `CODEX_HOME/auth.json`. |
| `CODEX_AUTH_TOKEN` | Optional | Alternate Codex auth token if supported by the installed Codex runtime. |

Public demo mode should not set Codex/OpenAI credentials. Real mode should use a Private or Protected Space, persistent storage, `DEMO_MODE=false`, and a strong `CODEX_PLATFORM_AUTH_TOKEN`.

## Ops Control Plane

`/_ops/*` is a read-only diagnostics surface inspired by the DIFY HFS integration pattern. It is disabled until an ops token is configured.

| Key | Default | Purpose |
| --- | --- | --- |
| `OPS_TOKEN` | empty | Enables `/_ops/` dashboard and JSON endpoints. |
| `CODEX_PLATFORM_OPS_HEADER` | `x-codex-platform-ops-token` | Primary CLI/API header. `X-Ops-Token` and `Authorization: Bearer` are also accepted. |
| `CODEX_PLATFORM_OPS_COOKIE` | `codex_platform_ops` | Signed HttpOnly browser session cookie for `/_ops/`. |
| `CODEX_PLATFORM_OPS_SESSION_TTL_SECONDS` | `3600` | Ops browser session TTL. |
| `CODEX_PLATFORM_OPS_COOKIE_SECURE` | `auto` | `auto` sets `Secure` behind HTTPS or `X-Forwarded-Proto=https`. |

Endpoints:

```text
/_ops/               browser dashboard
/_ops/health         app health plus diagnostics checks
/_ops/readyz         readiness detail
/_ops/status         runtime entity counts and bridge state
/_ops/system         process, host, path, and disk summary
/_ops/config         sanitized config summary
/_ops/version        package/build/source summary
/_ops/errors         recent in-memory app errors
/_ops/metrics        Prometheus-style text metrics
```

`/_ops/` supports browser login without storing the token in page JavaScript. The temporary `?token=` path is accepted only to migrate into a signed HttpOnly cookie and redirect back to `/_ops/`.

## Admin Control Plane

`/_admin/*` is a separate management surface. It is default-off and must not reuse the ops token.

| Key | Default | Purpose |
| --- | --- | --- |
| `CODEX_PLATFORM_ADMIN_ENABLED` | `false` | Enables `/_admin/`; disabled mode returns `404`. |
| `ADMIN_PASSWORD` | empty | Independent admin token; required when admin is enabled. |
| `CODEX_PLATFORM_ADMIN_HEADER` | `x-codex-platform-admin-token` | Primary CLI/API header. `X-Admin-Token` and `Authorization: Bearer` are also accepted. |
| `CODEX_PLATFORM_ADMIN_COOKIE` | `codex_platform_admin` | Signed HttpOnly browser session cookie for `/_admin/`. |
| `CODEX_PLATFORM_ADMIN_CSRF_HEADER` | `x-codex-platform-admin-csrf` | Required for cookie-session write actions. |
| `CODEX_PLATFORM_ADMIN_CSRF_KEY` | empty | Optional dedicated CSRF HMAC key; otherwise derives from admin token. |
| `CODEX_PLATFORM_ADMIN_SESSION_TTL_SECONDS` | `3600` | Admin browser session TTL. |
| `CODEX_PLATFORM_ADMIN_COOKIE_SECURE` | `auto` | `auto` sets `Secure` behind HTTPS or `X-Forwarded-Proto=https`. |
| `CODEX_PLATFORM_ADMIN_AUDIT_LOG` | `${CODEX_PLATFORM_DATA_DIR}/admin-audit.jsonl` | JSONL audit log for admin login and whitelisted actions. |

Current admin actions are deliberately small and whitelisted:

```text
run-health-checks
flush-store
restart-codex
```

All admin actions require `confirm=true`. Browser cookie sessions also require the CSRF header; CLI header-token auth skips CSRF because the header is not automatically attached by browsers.

## Public API (`/v1/*`)

`/v1/*` is the programmable API for third parties, CI, and scripts. It is **off by default**, has its own API-key auth (independent of the browser session and ops/admin tokens), a unified response envelope, scopes, and idempotency. When disabled, every `/v1/*` path returns `404`. It reuses all existing safety boundaries (workspace path policy, rate limits, demo/real gate) and never bypasses approvals or the sandbox. Only enable it on a Private/Protected deployment.

| Key | Default | Purpose |
| --- | --- | --- |
| `CODEX_PLATFORM_PUBLIC_API_ENABLED` | `false` | Enables `/v1/*`; disabled mode returns `404`. |
| `CODEX_PLATFORM_PUBLIC_API_KEYS` | empty | Key spec; `;`-separated entries `token\|scopes[\|projects=ids]`. Tokens are stored only as SHA-256 hashes. |
| `CODEX_PLATFORM_PUBLIC_API_ALLOWED_ORIGINS` | empty | CSV CORS allowlist for `/v1/*`; default denies cross-origin. `*` allows any origin. |

Key spec format (set as a Secret):

```text
CODEX_PLATFORM_PUBLIC_API_KEYS=cpk_live_ci|threads:read,threads:write;cpk_live_ro|read|projects=proj_a proj_b
```

Scope shorthands: `*`/`all` grant every scope, `read`/`*:read` grant every `:read` scope. Scopes: `projects:read|write`, `threads:read|write`, `approvals:write`, `git:read|write`, `review:read`, `capabilities:read`, `webhooks:manage`. Authenticate with `Authorization: Bearer <token>`. Endpoints:

```text
/v1/openapi.json                 OpenAPI 3.1 spec (no key required)
/v1/whoami                       echo key scopes and project allowlist
/v1/projects [GET|POST]          list / add projects
/v1/projects/{id} [GET|DELETE]   get / remove a project
/v1/projects/{id}/files          file tree
/v1/projects/{id}/files/content  read a file
/v1/projects/{id}/git[/diff]     git status / diff
/v1/projects/{id}/git/{stage|unstage|commit}   git writes (commit is idempotent)
/v1/projects/{id}/github/{actions|pulls}        release status
/v1/threads [GET|POST]           list / create threads
/v1/threads/{id}                 thread with turns
/v1/threads/{id}/turns           start a turn (Accept: text/event-stream streams via SSE)
/v1/threads/{id}/interrupt       interrupt the active turn
/v1/threads/{id}/review          start a review
/v1/threads/{id}/events          subscribe to thread events (SSE)
/v1/approvals [GET]              list approvals
/v1/approvals/{requestId} [POST] resolve an approval
/v1/skills, /v1/agents           capability registries
```

Write operations accept an `Idempotency-Key` header (24h replay window). Smoke test the surface with `npm run smoke:public`.

## GitHub Actions

| Key | Kind | Purpose |
| --- | --- | --- |
| `HF_TOKEN` | Secret | Token used by `.github/workflows/deploy-hf-space.yml` to upload the Space bundle. |
| `HF_SPACE_ID` | Variable | Optional override; defaults to `BlueSkyXN/Codex-Platform-HFS`. |
| `HF_PUBLIC_URL` | Workflow-only value | Live smoke URL read from the deployed Space's actual `subdomain`; it is never reconstructed from the repository ID. |
| `CODEX_PLATFORM_AUTH_TOKEN` | Secret | Optional smoke token for real-mode Spaces. |
| `OPS_TOKEN` | Secret | Optional smoke token for `/_ops/*` checks. |
| `ADMIN_PASSWORD` | Secret | Optional smoke token when `SMOKE_ADMIN_ENABLED=true`. |
| `SMOKE_ADMIN_ENABLED` | Variable | Set `true` only when live smoke should expect `/_admin/*` to be enabled. |
| `SMOKE_ADMIN_ACTIONS` | Variable | Set `true` only when live smoke may execute the safe `run-health-checks` admin action. |

GitHub Actions values are deployment and verification inputs. They are separate from HF runtime Variables and Secrets.

## Runtime GitHub Status

| Key | Required | Purpose |
| --- | --- | --- |
| `GITHUB_TOKEN` or `GH_TOKEN` | Optional | Server-side token for reading GitHub Actions status in the Release verification panel. Public repositories can often use unauthenticated reads; private repositories or tighter rate limits should use a token. For the HFS v3 Space registration, use the canonical `GITHUB_TOKEN` Secret; `GH_TOKEN` remains local-only control-plane credential. |
| `CODEX_PLATFORM_GITHUB_ACTIONS_TIMEOUT_MS` | Optional | Timeout for the GitHub Actions status request; defaults to `8000`. |

## In-App Runtime Tab

The browser Runtime tab is backed by `/api/admin/status` and uses the existing Codex-Platform auth settings. It is separate from `/_ops/*` and `/_admin/*`: it does not use the ops/admin tokens, expose restart actions, provide shell access, provide a file manager, or write config.

The endpoint reports read-only runtime posture, auth mode, workspace boundaries, storage paths, HFS metadata, aggregate counts, and health checks. It must not return secret values.

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
