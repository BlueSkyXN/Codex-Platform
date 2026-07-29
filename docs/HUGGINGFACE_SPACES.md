# Hugging Face Spaces

Codex-Platform deploys to Hugging Face as a Docker Space through `cloud/hfs/`.

## Pattern

The repository follows HFS v2 with a semantic manifest:

```text
standard = "2.0"
sovereignty = "sovereign"
lane = "source"
version_source = "commit"
```

The deployment remains Pattern B with `source-fetch` and a `flat-remap` Space root. Those mechanics are enforced by the Dockerfile, exporter, and validator rather than encoded as legacy manifest schema fields.

The Space root contains only:

```text
README.md
Dockerfile
hfs-dev.toml
.dockerignore
BUILD_SOURCE.txt
```

The Dockerfile clones `https://github.com/BlueSkyXN/Codex-Platform.git`, fetches and checks out the full commit SHA embedded by `cloud/hfs/export_space_bundle.sh`, and does not rely on a branch-only clone selector. The exporter resolves symbolic commit/ref inputs before exporting and fails if either cannot be resolved.

`cloud/hfs/hfs-dev.toml` is an HFS v2 value-name registration: it records the Space identity and the allowed `local_only`, required `secrets`, `optional_secrets`, and `variables` keys without values. Empty optional Secrets are neither pushed nor treated as missing, and registered optional names are preserved by prune. `.env` is the HFS value ledger. `.env.local` remains only for product-local compatibility; it is not an HFS source or upload input.

Use the reference sync tool for an auditable local-first Settings workflow. Candidate operations must select the candidate manifest explicitly; production remains the default manifest:

```bash
python3 scripts/hf_space_sync.py diff --manifest cloud/hfs/hfs-dev.candidate.toml --env-file .env
python3 scripts/hf_space_sync.py push --manifest cloud/hfs/hfs-dev.candidate.toml --env-file .env
python3 scripts/hf_space_sync.py diff --manifest cloud/hfs/hfs-dev.candidate.toml --env-file .env
```

Secret values cannot be read back from Hugging Face, so verification compares Secret names and Variable values. Do not use `--prune --yes` until the separately approved cleanup window.

## Export

```bash
bash cloud/hfs/export_space_bundle.sh /tmp/codex-platform-hfs-space
```

The exported bundle is safe to upload to:

```text
BlueSkyXN/Codex-Platform-HFS
```

The manual workflow may still select the separate candidate profile, but both targets must already be private before upload. A production upload additionally fails closed unless the selected manifest names the canonical Space above and `GITHUB_REF`, the checked-out `HEAD`, `GITHUB_SHA`, `EXPECTED_SOURCE_SHA`, and a freshly fetched `origin/main` all identify the same commit.

The uploader binds each write to the preflighted Space SHA with `parent_commit` when a parent exists. A newly created empty candidate may use no parent. An owner-precreated canonical private production Space with `sha=None` may also perform its first upload without a parent, but only after an authenticated tree read proves it has zero remote paths; any path or indeterminate tree state fails before upload. It captures the returned `CommitInfo.oid` and pins the complete tree and file-byte readback to that uploaded revision. It rechecks that the current repository SHA still equals the uploaded oid and that Space metadata contains a safe non-empty subdomain before allowing a factory restart.

It must not contain `local/`, `.env.local`, `src/`, `docs/`, or `scripts/`; those are fetched from GitHub during build.

## Contract Check

The repository-local static gate validates the Pattern B contract:

```bash
scripts/static-check.sh
```

For just the HFS structure:

```bash
scripts/validate-hfs-contract.sh
```

These checks are intentionally lightweight. TypeScript checks, builds, Docker builds, and live HFS smoke run in GitHub Actions or Hugging Face runtime.

## Runtime Layout

```text
/data/workspace        default project directory
/data/codex-platform   state: projects.json, snapshot.json, events.jsonl
/data/codex-home       Codex auth/config home
```

Enable HF Persistent Storage when real projects or Codex auth files should survive restarts.

## Public Demo

No secrets are required:

```env
DEMO_MODE=auto
```

When no Codex/OpenAI credential is detected, the app runs in demo mode and permits unauthenticated access.

## Real Codex Mode

Use a Private or Protected Space:

```env
DEMO_MODE=false
CODEX_PLATFORM_AUTH_TOKEN=<long-random-token>
WORKSPACE_ROOT=/data/workspace
WORKSPACE_ROOTS=/data/workspace
CODEX_PLATFORM_DATA_DIR=/data/codex-platform
CODEX_HOME=/data/codex-home
CODEX_ARGS=app-server
```

Then provide Codex auth through `CODEX_HOME/auth.json`, `CODEX_AUTH_TOKEN`, or `OPENAI_API_KEY`.

Real mode on HF refuses to start without `CODEX_PLATFORM_AUTH_TOKEN`.

## Ops And Admin

Codex-Platform follows the DIFY HFS split between read-only diagnostics and controlled management:

```text
/_ops/       read-only diagnostics dashboard
/_admin/     default-off management dashboard
```

Recommended real-mode HF secrets:

```env
CODEX_PLATFORM_OPS_TOKEN=<long-random-ops-token>
CODEX_PLATFORM_ADMIN_ENABLED=false
```

`/_ops/*` stays disabled until `CODEX_PLATFORM_OPS_TOKEN` is set. CLI and automation should use:

```bash
curl -H "x-codex-platform-ops-token: $CODEX_PLATFORM_OPS_TOKEN" \
  https://blueskyxn-codex-platform-hfs.hf.space/_ops/health
```

Only enable `/_admin/` in a Private or Protected Space:

```env
CODEX_PLATFORM_ADMIN_ENABLED=true
CODEX_PLATFORM_ADMIN_TOKEN=<long-random-admin-token>
```

The admin surface uses an independent token, signed HttpOnly browser session cookies, CSRF for browser write actions, `confirm=true`, a JSONL audit log, and a small action catalog. It does not expose a shell or arbitrary command execution.

## Smoke

After HF reports the Space as running:

```bash
scripts/hf-space-smoke.sh https://blueskyxn-codex-platform-hfs.hf.space
```

The smoke checks `/healthz`, `/readyz`, `/api/config`, `/`, `/api/state`, `/api/admin/status`, `/_ops/*`, and the default-disabled `/_admin/` posture. It retries during cold starts and accepts either public demo state access or an auth-required `401` when no token is supplied. Without `CODEX_PLATFORM_OPS_TOKEN`, `/_ops/*` must return `401` or `503`.

For a private Space, set `HF_GATEWAY_TOKEN` for the Hugging Face gateway. The smoke keeps the application token in `x-codex-platform-token`, so both authentication layers are checked independently.

For real-mode Spaces, pass the configured token:

```bash
CODEX_PLATFORM_AUTH_TOKEN=<token> scripts/hf-space-smoke.sh https://blueskyxn-codex-platform-hfs.hf.space
```

For ops and explicitly enabled admin checks:

```bash
CODEX_PLATFORM_OPS_TOKEN=<ops-token> \
  scripts/hf-space-smoke.sh https://blueskyxn-codex-platform-hfs.hf.space

SMOKE_ADMIN_ENABLED=true \
  CODEX_PLATFORM_ADMIN_TOKEN=<admin-token> \
  scripts/admin-smoke.sh https://blueskyxn-codex-platform-hfs.hf.space
```

`/healthz` includes the image build SHA when `BUILD_SHA` is present in the runtime image. Use that value with `BUILD_SOURCE.txt` and Hugging Face runtime metadata to confirm takeover.

## In-App Runtime Panel

The browser management drawer includes a Runtime tab backed by `/api/admin/status`. It uses the same Codex-Platform token as the rest of the app and stays read-only: no restart, shell, file manager, secret rotation, or config write actions are exposed.
