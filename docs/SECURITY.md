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

## Path Boundary

Projects must live under `WORKSPACE_ROOTS`. File read and Git APIs reject path traversal and absolute user-supplied paths.

## Known Limits

This baseline does not include OIDC/RBAC, per-user containers, secret vault integration, background job queues, or full audit reporting. Add those before using it as a multi-user SaaS platform.
