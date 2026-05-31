# scripts navigation card

This directory contains shell entrypoint, healthcheck, smoke, static-check, and HFS contract helpers.
Read this card before changing runtime startup, health behavior, smoke behavior, static checks, or HFS validation.
Key files: `hf-entrypoint.sh`, `hf-healthcheck.sh`, `hf-space-smoke.sh`, `static-check.sh`, `validate-hfs-contract.sh`.

## Why this is high-risk

- These scripts run in local validation, GitHub Actions, Docker runtime, and Hugging Face runtime paths.
- `hf-entrypoint.sh` controls demo/real-mode startup, workspace creation, and Codex auth/home defaults.
- `hf-space-smoke.sh` may run against public or token-gated deployments.
- `static-check.sh` is the lightweight local gate expected for HFS work.

## Required before changes

- Check the matching docs in `docs/DEVELOPMENT.md`, `docs/HUGGINGFACE_SPACES.md`, and `docs/hfs-alignment.md` when behavior changes.
- Check `cloud/hfs/AGENTS.md` for adapter invariants when a script affects the Space bundle or HF runtime.
- Preserve `set -euo pipefail` style unless a script has a specific compatibility reason.

## Do not

- Do not echo secret values or write `.env.local` content to logs.
- Do not add dependency installation, Docker builds, uploads, or network calls to `static-check.sh`.
- Do not make smoke require auth when public demo-mode state should still be accepted.
- Do not make healthcheck depend on services that are not required for the server to answer `/healthz`.

## Validation

- `bash -n scripts/hf-entrypoint.sh scripts/hf-healthcheck.sh scripts/hf-space-smoke.sh scripts/validate-hfs-contract.sh scripts/static-check.sh cloud/hfs/export_space_bundle.sh`
- `scripts/static-check.sh`
- `bash cloud/hfs/export_space_bundle.sh /tmp/codex-platform-hfs-space`
