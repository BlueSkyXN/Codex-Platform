# Codex-Platform agent instructions

## Purpose

Codex-Platform is a deployable web control plane for OpenAI Codex: a React workspace UI, a Node/Express backend, a JSON-RPC bridge to `codex app-server`, and a Hugging Face Docker Space adapter.

The repository root is the product source of truth. `local/` is reference-only material and is not deploy source.

## Codex startup behavior

- Codex is normally started from the repository root, so this file is the repo-local startup router.
- Local `AGENTS.md` files under subdirectories are navigation cards. They are not automatically loaded when Codex starts at the root.
- Before editing a path whose directory has a local `AGENTS.md`, read that local card with `cat <path>/AGENTS.md`.
- If multiple local cards apply, read them from shallow to deep before editing.
- If this file conflicts with a local card, the local card wins for files under its directory.
- If an `AGENTS.override.md` ever appears in a target directory, stop and ask the user how to handle the override strategy before editing AGENTS files there.

## Directory map

| Path | Responsibility | Local AGENTS.md | Read when |
|---|---|---:|---|
| `src/server/` | Node/Express backend, auth, project policy, persistence, Git APIs, Codex bridge, WebSocket fanout | Yes | Before changing backend routes, config, auth, workspace boundaries, Git actions, persistence, or `codex app-server` integration |
| `src/web/` | React/Vite command-center UI, browser API client, state normalization, supervision surfaces | Yes | Before changing UI state, auth/token handling, event stream usage, API calls, release panels, or workspace controls |
| `src/shared/` | Shared TypeScript wire types between server and browser | Yes | Before changing request/response/event shapes or fields consumed on both sides |
| `scripts/` | Runtime entrypoint, healthcheck, HF smoke, static checks, HFS contract validation | Yes | Before changing shell scripts, smoke behavior, static checks, or runtime health behavior |
| `cloud/hfs/` | Hugging Face Docker Space adapter and export manifest for HFS Pattern B | Yes | Before any Space adapter, Dockerfile, README frontmatter, `hfs-dev.toml`, or export bundle change |
| `.github/workflows/` | GitHub Actions CI and Hugging Face deployment workflow | Yes | Before changing CI gates, deploy triggers, HF upload, workflow secrets, or live smoke steps |
| `docs/` | Architecture, development, security, environment, HFS, and release documentation | No | Follow the root rules and any local card for the code or deployment behavior being documented |
| `local/` | Ignored reference-only material from local experiments or upstream snapshots | No | Do not edit, copy, deploy, or commit unless the user explicitly changes this boundary |
| `Dockerfile` | Generic self-hosted container image for the product | No | Keep distinct from `cloud/hfs/Dockerfile`; use root validation plus HFS checks if deployment behavior changes |
| `index.html`, `vite.config.ts`, `tsconfig*.json` | Root frontend/build/compiler configuration | No | Follow root rules; for UI behavior also read `src/web/AGENTS.md` |
| `.env.example`, `.env.hf.example`, `docs/env-reference.md` | Public environment documentation | No | Update together when public env keys change; never copy `.env.local` values |
| `package.json`, `package-lock.json` | npm scripts and dependency lock | No | Use npm only; dependency install/update requires explicit scope and network awareness |

## On-demand cat protocol

Before editing a file:

1. Locate the nearest directory in the map above.
2. If `Local AGENTS.md` is `Yes`, run `cat <that-dir>/AGENTS.md` and follow it.
3. If a deeper `AGENTS.md` exists on the path to the target file, read it after the shallower card.
4. Re-read a local card when switching between backend, web, HFS, scripts, workflow, or shared type work in the same session.
5. If a local card instructs you to read docs first, read only the named docs needed for the change.

## Commands

These commands are confirmed from `package.json`, scripts, docs, or GitHub Actions. Do not invent missing `test` or `lint` commands; none are configured at the time of writing.

| Command | Purpose | Scope | Sandbox notes |
|---|---|---|---|
| `npm install` | Install local dependencies for development | repo | Requires network; do not run for HFS-only work unless the user asks |
| `npm ci --no-audit --no-fund` | Reproducible dependency install used by CI and Docker builds | repo | Requires network and writes `node_modules/`; normally run in CI/HF/Docker |
| `npm run dev:web` | Start Vite dev server on `0.0.0.0:5173` | web | Requires installed dependencies and a backend for proxied APIs |
| `npm run dev:server` | Start the backend with `tsx src/server/index.ts` | server | Requires installed dependencies and local runtime env |
| `npm run dev:demo` | Start backend in demo mode | server | Requires installed dependencies; avoids real Codex auth |
| `npm run typecheck` | TypeScript check with `tsconfig.json` | repo | Requires installed dependencies |
| `npm run check` | Alias for `npm run typecheck` | repo | Requires installed dependencies |
| `npm run build:server` | Compile backend/shared code to `dist/server` | server | Requires installed dependencies |
| `npm run build:web` | Build React/Vite output to `dist/web` | web | Requires installed dependencies; Vite config is kept low-memory for HF |
| `npm run build` | Run server and web builds | repo | Requires installed dependencies; CI gate |
| `npm run start` | Start built server from `dist/server/server/index.js` | runtime | Requires prior build |
| `npm run smoke:demo` | Build, boot demo server on port `18787`, and smoke it | repo | Requires installed dependencies and local port availability |
| `npm run start:hf` | Run `scripts/hf-entrypoint.sh` | runtime/HFS | Requires runtime env; do not use for ordinary static validation |
| `npm run smoke:hf` | Run `scripts/hf-space-smoke.sh` | HFS | Needs a running target URL or default HF URL assumptions |
| `bash -n scripts/hf-entrypoint.sh scripts/hf-healthcheck.sh scripts/hf-space-smoke.sh scripts/validate-hfs-contract.sh scripts/static-check.sh cloud/hfs/export_space_bundle.sh` | Shell syntax check | scripts/HFS | Lightweight local check |
| `scripts/validate-hfs-contract.sh` | Verify HFS Pattern B contract | HFS | Uses local files and `python3`; no network expected |
| `scripts/static-check.sh` | Shell syntax, HFS contract, `git diff --check`, trailing whitespace checks | repo | Lightweight local check; inspects changed/untracked files |
| `bash cloud/hfs/export_space_bundle.sh /tmp/codex-platform-hfs-space` | Export the flat HF Space bundle | HFS | Writes to `/tmp`; no network expected |

## Validation policy

Use the lightest validation that matches the risk and environment.

For AGENTS.md, docs, HFS metadata, shell-script, and workflow edits that do not require installed Node dependencies, prefer:

```bash
bash -n scripts/hf-entrypoint.sh scripts/hf-healthcheck.sh scripts/hf-space-smoke.sh scripts/validate-hfs-contract.sh scripts/static-check.sh cloud/hfs/export_space_bundle.sh
scripts/static-check.sh
bash cloud/hfs/export_space_bundle.sh /tmp/codex-platform-hfs-space
```

For TypeScript product code, run `npm run check` when dependencies are already installed or the user has approved dependency installation. Run `npm run build` when the change affects build output, Vite config, server compile output, or release readiness.

For HFS work, do not install dependencies, run Docker builds, or perform live HF smoke locally unless the user explicitly asks. Full `npm ci`, TypeScript checks, builds, Docker builds, HF uploads, and live Space smoke are expected in GitHub Actions or Hugging Face runtime.

Always report which checks were actually run and which were skipped because dependencies, Docker, network, credentials, or a live service were unavailable or out of scope.

## Global rules

- Communicate with the user in Chinese. Keep code identifiers, paths, commands, env keys, API names, package names, skill names, and agent names in English.
- Use npm for this repository. Do not switch to pnpm, yarn, bun, or another package manager unless the user explicitly requests that migration.
- Keep `package-lock.json` aligned with `package.json` when dependencies change. Do not hand-edit lockfile entries.
- Keep TypeScript strictness intact; do not use `any` or broad casts to bypass shared contract issues unless the surrounding code already requires a narrow compatibility adapter.
- Prefer small, reversible changes that preserve the current product shape: React/Vite SPA, Express backend, JSON-RPC `codex app-server` bridge, and HFS Pattern B adapter.
- Preserve the browser/server boundary: the browser talks to Codex-Platform HTTP/WebSocket endpoints, never directly to `codex app-server`.
- Preserve workspace-root restrictions. User-supplied project paths and file paths must stay inside configured `WORKSPACE_ROOTS`.
- Preserve token-gated real mode. Public/demo mode may run unauthenticated only under the existing safe conditions; real Codex mode on HF requires `CODEX_PLATFORM_AUTH_TOKEN`.
- Keep env documentation public and sanitized. `.env.local` is a gitignored local ledger, not a source for public examples.
- When adding or renaming env keys, update `.env.example`, `.env.hf.example`, and `docs/env-reference.md` together.
- Keep `CODEX_PLATFORM_*` as the public prefix for product-specific app env keys. HFS v3.0 control credentials are the deliberate exceptions: `OPS_TOKEN` and `ADMIN_PASSWORD`. Existing `CODEX_WEB_*` aliases are compatibility only and must not be introduced for these v3 keys.
- Keep generated/build/runtime output out of commits: `dist/`, `node_modules/`, `coverage/`, `.codex-platform/`, `.codex-web/`, `output/`, `.playwright-cli/`, and `cloud/hfs/.bundle/`.

## HFS Pattern B boundary

- Product code stays at repository root under `src/`, `scripts/`, `docs/`, root config, and root container files.
- Hugging Face Space adapter files live under `cloud/hfs/`.
- `cloud/hfs/export_space_bundle.sh` exports the only files that should be uploaded directly to the Space repository.
- The exported Space root must be flat and small: Space README, Dockerfile, `hfs-dev.toml`, `.dockerignore`, and `BUILD_SOURCE.txt`.
- Do not put `src/`, `scripts/`, `docs/`, `local/`, `.env`, `.env.local`, `node_modules/`, or `dist/` into the HFS bundle.
- `cloud/hfs/Dockerfile` fetches this GitHub repository at `CODEX_PLATFORM_COMMIT` during the HF build. Do not copy product source into `cloud/hfs/`.
- Release exports must pin `CODEX_PLATFORM_COMMIT` to an immutable Git commit SHA. `HEAD` is acceptable only as a development default in the adapter source.
- Keep HF port surfaces aligned at `7860`: README frontmatter `app_port`, Docker `EXPOSE`, runtime `PORT`, and healthcheck expectations.
- Keep `DEMO_MODE=auto` as the HF default so public previews can boot without Codex credentials. Real mode needs Private or Protected Space visibility plus authentication secrets.

## Security and secrets

- Never commit real tokens, auth files, private URLs, customer data, `.env.local` contents, or local-only credential notes.
- Do not paste real `CODEX_PLATFORM_AUTH_TOKEN`, `OPS_TOKEN`, `ADMIN_PASSWORD`, `OPENAI_API_KEY`, `CODEX_AUTH_TOKEN`, `GITHUB_TOKEN`, `GH_TOKEN`, or `HF_TOKEN` values into docs, examples, logs, screenshots, PR text, test snapshots, or public Space files.
- Do not add token values to WebSocket URLs or browser-visible query strings. The current browser event stream uses same-origin cookies to avoid leaking tokens through URLs.
- Do not weaken redaction in persistence or logs. Keys matching token, secret, password, authorization, API key, or cookie must remain redacted in persisted snapshots.
- Do not broaden allowed workspace roots, path traversal behavior, or Git path handling without treating it as a security-sensitive backend change.
- Do not expose `Public internet -> unauthenticated Codex-Platform -> real codex app-server`.

## Do not

- Do not treat `local/` as source, deploy input, or commit material unless the user explicitly changes that boundary.
- Do not create or modify `AGENTS.override.md` without asking the user first.
- Do not modify generated/build output by hand.
- Do not add a new test/lint command to AGENTS unless it exists in repo config.
- Do not run `git add`, `git commit`, `git reset`, `git checkout`, `git clean`, or `git stash` as part of AGENTS.md maintenance unless the user explicitly asks for Git write operations.
- Do not upload to Hugging Face, push to GitHub, publish packages, change repository visibility, or deploy externally without explicit user confirmation.
- Do not expand local validation into dependency install, Docker build, live Space smoke, or network-dependent checks for HFS work unless asked.

## Notes for future agents

- `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/HUGGINGFACE_SPACES.md`, and `docs/hfs-alignment.md` are the best short references for product boundaries.
- `scripts/validate-hfs-contract.sh` encodes many HFS invariants. Prefer updating the contract and docs together when the HFS shape intentionally changes.
- `docs/agent-command-center-v1.md` records product direction for the command-center UI; use it as context for UI work, not as permission to widen scope.
- If a change affects release readiness, compare local source, GitHub Actions, exported HFS bundle, and HF runtime build SHA before calling it complete.
