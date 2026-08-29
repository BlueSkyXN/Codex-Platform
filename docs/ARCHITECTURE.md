# Architecture

```text
Browser
  -> HTTP/WebSocket
Codex-Platform Node backend
  -> auth, rate limits, project policy
  -> /_ops diagnostics and /_admin management boundaries
  -> project registry and persistent event snapshot
  -> normalized UI event stream
  -> JSON-RPC stdio bridge
codex app-server
  -> Codex runtime, repository, shell, skills, MCP, custom agents
```

The browser never talks to `codex app-server` directly. Codex-Platform owns authentication, path boundaries, event normalization, persistence, and WebSocket fanout.

## Control Surfaces

- `/api/health`, `/healthz`, and `/readyz` expose runtime health/readiness for local and HFS probes.
- `/api/admin/status` is the browser Runtime tab data source. It is read-only and uses the same Codex-Platform auth gate as the rest of `/api/*`.
- `/_ops/*` is a separate read-only diagnostics surface. It is disabled until `OPS_TOKEN` is configured and reports health, readiness, runtime status, sanitized config, version/build metadata, recent app errors, system summary, and Prometheus-style metrics.
- `/_admin/*` is a separate default-off management surface with an independent token, signed HttpOnly browser session cookies, CSRF for cookie-backed write actions, `confirm=true`, audit logging, and a small allowlisted action catalog. The current whitelist supports health checks, snapshot flush, and Codex bridge restart. It must not expose shell access, arbitrary file access, config mutation, or secret rotation.

## Runtime Modes

- `DEMO_MODE=true`: in-memory demo bridge emits simulated threads, cards, command approvals, and review cards.
- `DEMO_MODE=false`: backend spawns `CODEX_BIN CODEX_ARGS`, normally `codex app-server`.
- `DEMO_MODE=auto`: on Hugging Face Spaces, boot demo mode unless likely Codex/OpenAI auth is present.

## State Files

`CODEX_PLATFORM_DATA_DIR` stores:

```text
projects.json
snapshot.json
events.jsonl
```

`CODEX_WEB_DATA_DIR` remains accepted as a legacy alias.

## Project Boundary

Projects added in the UI must live under `WORKSPACE_ROOTS`. File browsing and Git status APIs resolve paths relative to a registered project and reject absolute paths or path traversal.

## HFS Boundary

This is a Pattern B project:

- product source stays in the repository root;
- `cloud/hfs/` is a deploy adapter;
- the exported Space bundle does not include `src/`, `local/`, `.env.local`, or other private/source directories;
- the Space Dockerfile fetches the GitHub source by commit SHA during the HF build.
