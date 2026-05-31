# Security

Codex-Platform is a privileged control plane. A user with access can ask Codex to inspect files, propose edits, and request shell commands through `codex app-server`.

## Required For Real Deployments

```env
CODEX_PLATFORM_AUTH_TOKEN=<long-random-value>
CODEX_PLATFORM_ALLOW_UNAUTHENTICATED=false
WORKSPACE_ROOTS=/data/workspace
CODEX_PLATFORM_DATA_DIR=/data/codex-platform
CODEX_HOME=/data/codex-home
```

Use HTTPS or a trusted reverse proxy in front of self-hosted deployments. On HF, use a Private or Protected Space for real mode.

## Do Not Expose

```text
Public internet -> unauthenticated Codex-Platform -> real codex app-server
```

Public Spaces should run demo mode unless access is token-gated and the Space visibility is controlled.

## Control Planes

The in-app Runtime tab uses `/api/admin/status` and the existing `CODEX_PLATFORM_AUTH_TOKEN` gate. It is a read-only diagnostic surface for runtime posture, auth mode, workspace roots, storage paths, HFS metadata, and aggregate counts.

`/_ops/*` is an independent read-only diagnostics surface and is disabled until `CODEX_PLATFORM_OPS_TOKEN` is set. It accepts `x-codex-platform-ops-token`, `X-Ops-Token`, `Authorization: Bearer`, a signed HttpOnly browser session cookie, or a temporary `?token=` cookie-migration entry. Keep ops endpoints non-mutating and sanitized.

`/_admin/*` is a separate default-off management surface. If enabled, it requires `CODEX_PLATFORM_ADMIN_TOKEN`, must run only in a controlled Private or Protected deployment, and must keep write actions allowlisted, confirmed, CSRF-protected for browser cookie sessions, and audit-logged. The current action catalog is intentionally small: run health checks, flush the persistent snapshot, and restart the Codex bridge. Do not add shell execution, arbitrary file read/write, config mutation, token rotation, broad process control, or secret-returning diagnostics to ops or admin routes without a separate design and risk review.

## Path Boundary

Projects must live under `WORKSPACE_ROOTS`. File read and Git APIs reject path traversal and absolute user-supplied paths.

## Known Limits

This baseline does not include OIDC/RBAC, per-user containers, secret vault integration, background job queues, or full audit reporting. Add those before using it as a multi-user SaaS platform.
