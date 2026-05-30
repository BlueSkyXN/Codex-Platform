# cloud/hfs navigation card

This directory is the Hugging Face Space adapter for Codex-Platform. It is not the product source tree and must stay aligned with HFS Pattern B.

## Invariants

- Pattern B only: product source remains at repository root; Space adapter files stay in `cloud/hfs/`.
- The only uploadable Space root is produced by `cloud/hfs/export_space_bundle.sh`.
- The exported bundle must contain `README.md`, `Dockerfile`, `hfs-dev.toml`, `.dockerignore`, and `BUILD_SOURCE.txt`.
- The exported bundle must not contain `src/`, `scripts/`, `docs/`, `local/`, `.env`, `.env.local`, `node_modules/`, or `dist/`.
- Release exports must pin `CODEX_PLATFORM_COMMIT` to a Git commit SHA. `HEAD` is only a development default.
- `cloud/hfs/Dockerfile` fetches the GitHub source during the HF build; do not copy product code into this adapter.
- Keep `app_port`, `EXPOSE`, `PORT`, and `/healthz` aligned at `7860`.
- Keep `DEMO_MODE=auto` as the HF default so public previews can boot without Codex credentials.
- Real Codex mode requires a Private or Protected Space plus `CODEX_PLATFORM_AUTH_TOKEN` and Codex/OpenAI auth.

## Before Editing

- Read `docs/hfs-alignment.md` and `docs/HUGGINGFACE_SPACES.md`.
- For Dockerfile changes, verify the `CODEX_PLATFORM_COMMIT` pin path and `BUILD_SHA` propagation.
- For README metadata changes, keep Hugging Face frontmatter in `cloud/hfs/README.md`, not root `README.md`.
- For env changes, update `docs/env-reference.md`, `.env.example`, and `.env.hf.example` as needed. Do not copy `.env.local` values.

## Validation

Use lightweight checks unless the user explicitly asks for local dependency installation or complex tests:

```bash
scripts/static-check.sh
bash cloud/hfs/export_space_bundle.sh /tmp/codex-platform-hfs-space
```

Full dependency install, TypeScript checks, builds, Docker builds, and live HF smoke belong in GitHub Actions or the Hugging Face runtime.
