# Codex-Platform

Codex-Platform is a deployable web control plane for OpenAI Codex. It packages a React workspace UI, a Node/Express backend, a JSON-RPC bridge to `codex app-server`, and a Hugging Face Docker Space adapter.

The repository root is the product source of truth. Hugging Face Space files live under `cloud/hfs/` and are exported as a lightweight Space root, following the local HFS Pattern B standard.

## What It Provides

- Browser UI for projects, threads, turns, approvals, files, Git status, skills, agents, and raw events.
- Node/Express backend with token auth, rate limiting, project-root policy, state persistence, and WebSocket fanout.
- Demo mode for public previews without Codex credentials.
- Real Codex mode through `codex app-server` when credentials and a private/protected runtime are configured.
- HFS adapter that fetches the GitHub source by commit during the Space build.

## Repository Shape

```text
src/                 product frontend, backend, shared types
scripts/             entrypoint, healthcheck, smoke helpers
docs/                architecture, security, env, HFS deployment notes
cloud/hfs/           Hugging Face Space adapter and export manifest
.github/workflows/   CI and optional HF deployment
local/               reference-only material; ignored and not deployed
```

## Local Development

This task intentionally avoids local dependency installation and complex local tests. For normal development:

```bash
npm install
npm run check
npm run build
DEMO_MODE=true npm start
```

Open `http://127.0.0.1:8787`.

## Configuration

Public examples are in `.env.example`, `.env.hf.example`, and `docs/env-reference.md`.

Local private notes belong in `.env.local`. That file is gitignored and is used as an env ledger, not as a public source of truth.

New variables use the `CODEX_PLATFORM_*` prefix. The app still accepts legacy `CODEX_WEB_*` aliases where the reference implementation already used them.

## Hugging Face Space

Target Space:

```text
https://huggingface.co/spaces/BlueSkyXN/Codex-Platform-HFS
```

The HFS adapter is:

```text
cloud/hfs/README.md
cloud/hfs/Dockerfile
cloud/hfs/hfs-dev.toml
cloud/hfs/export_space_bundle.sh
```

Export a Space bundle:

```bash
bash cloud/hfs/export_space_bundle.sh /tmp/codex-platform-hfs-space
```

The deploy workflow uploads that bundle to HF. The Space Dockerfile fetches this GitHub repo at a pinned commit SHA, builds the app in HF, and runs on port `7860`.

## Runtime Modes

- `DEMO_MODE=true`: simulated Codex events, suitable for public previews.
- `DEMO_MODE=false`: real `codex app-server`, requires auth and protected deployment.
- `DEMO_MODE=auto`: on HF, use real mode only when likely Codex/OpenAI credentials exist; otherwise boot demo mode.

Real mode on HF requires:

```env
CODEX_PLATFORM_AUTH_TOKEN=<long-random-token>
OPENAI_API_KEY=<optional-if-api-key-auth-is-used>
```

## Validation

Lightweight local checks:

```bash
bash -n scripts/hf-entrypoint.sh scripts/hf-healthcheck.sh scripts/hf-space-smoke.sh cloud/hfs/export_space_bundle.sh
scripts/validate-hfs-contract.sh
scripts/static-check.sh
bash cloud/hfs/export_space_bundle.sh /tmp/codex-platform-hfs-space
```

Full dependency install, TypeScript checks, build, and HF smoke belong in GitHub Actions or the HF build/runtime environment.
