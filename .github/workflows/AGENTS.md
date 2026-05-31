# .github/workflows navigation card

This directory contains GitHub Actions CI and Hugging Face Space deployment workflows.
Read this card before changing workflow triggers, CI gates, HF upload behavior, secrets, concurrency, or live smoke steps.
Key files: `ci.yml`, `deploy-hf-space.yml`.

## Why this is high-risk

- `ci.yml` is the remote gate for static checks, dependency install, TypeScript checks, build, and HFS bundle export.
- `deploy-hf-space.yml` uploads the exported Space bundle to Hugging Face and restarts the Space.
- Workflow changes can expose secrets, skip release verification, or deploy the wrong commit.

## Required before changes

- Keep CI and local lightweight checks aligned: `scripts/static-check.sh` must remain the first cheap gate.
- Keep deploy pinned to the GitHub commit exported by `cloud/hfs/export_space_bundle.sh`.
- Check `cloud/hfs/AGENTS.md` before changing deploy behavior that affects Space contents or runtime verification.
- If package scripts change, update workflows and this root `AGENTS.md` command table together.

## Do not

- Do not print `HF_TOKEN`, `CODEX_PLATFORM_AUTH_TOKEN`, `GITHUB_TOKEN`, `GH_TOKEN`, or any secret value.
- Do not run the HF upload workflow on pull requests unless the user explicitly asks for that release model.
- Do not remove live smoke from the deploy workflow without replacing it with an equivalent release verification step.
- Do not loosen `permissions: contents: read` unless a workflow step demonstrably needs more.

## Validation

- `scripts/static-check.sh` for local static/HFS checks.
- Workflow YAML is ultimately validated by GitHub Actions; if not running Actions, inspect the changed YAML carefully and report that remote validation was not run.
