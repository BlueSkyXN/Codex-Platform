# Codex-Platform Repository Instructions

## Scope

This repository is the product source of truth for Codex-Platform. `local/` is reference-only and must not be treated as deploy source, copied to HF, or committed unless the user explicitly changes that boundary.

## Communication

Use Chinese for user-facing summaries. Keep code identifiers, paths, commands, API names, env keys, and tool names in English.

## HFS Boundary

- This repo follows HFS Pattern B.
- Product code stays at repository root under `src/`, `scripts/`, and `docs/`.
- Hugging Face Space adapter files live under `cloud/hfs/`.
- `cloud/hfs/export_space_bundle.sh` exports the only files that should be uploaded directly to the Space repo.
- Do not put secrets, `.env.local`, `local/`, `dist/`, or `node_modules/` into the HFS bundle.

## Validation

Do not install external dependencies or run complex local tests for HFS work unless the user explicitly asks. Use lightweight local checks only:

```bash
bash -n scripts/hf-entrypoint.sh scripts/hf-healthcheck.sh scripts/hf-space-smoke.sh cloud/hfs/export_space_bundle.sh
bash cloud/hfs/export_space_bundle.sh /tmp/codex-platform-hfs-space
```

Full `npm ci`, TypeScript checks, builds, Docker builds, and live HFS smoke belong in GitHub Actions or Hugging Face runtime.

## Env

`.env.local` is a gitignored local ledger. Public env documentation belongs in `docs/env-reference.md`, `.env.example`, and `.env.hf.example`.
