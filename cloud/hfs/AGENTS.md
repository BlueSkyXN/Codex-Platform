# cloud/hfs navigation card

HF Docker Space adapter; not product source.
Read before changing frontmatter, Dockerfile behavior, `hfs-dev.toml`, `.dockerignore`, or exports.
Key files: `README.md`, `Dockerfile`, `hfs-dev.toml`, `.dockerignore`, `export_space_bundle.sh`.

## Why this is high-risk

Pattern B exports upload to Hugging Face; bad pins build the wrong commit and bad excludes can leak files.

## Local invariants

- The only uploadable Space root is produced by `cloud/hfs/export_space_bundle.sh`.
- Exports must contain `README.md`, `Dockerfile`, `hfs-dev.toml`, `.dockerignore`, and `BUILD_SOURCE.txt`.
- Exports must not contain `src/`, `scripts/`, `docs/`, `local/`, `.env`, `.env.local`, `node_modules/`, or `dist/`.
- Release exports must pin `CODEX_PLATFORM_COMMIT` to a Git commit SHA. `HEAD` is only a development default.
- `cloud/hfs/Dockerfile` fetches GitHub source during HF build; do not copy product code into this adapter.
- Keep `app_port`, `EXPOSE`, runtime `PORT`, and `/healthz` aligned at `7860`.
- Keep `DEMO_MODE=auto` as the HF default. Real mode requires protected visibility plus auth secrets.

## Required before changes

- Read `docs/hfs-alignment.md` and `docs/HUGGINGFACE_SPACES.md`.
- For Dockerfile changes, verify `CODEX_PLATFORM_COMMIT` pinning and `BUILD_SHA`.
- Keep HF frontmatter in `cloud/hfs/README.md`, not root `README.md`.
- For env changes, update `docs/env-reference.md`, `.env.example`, and `.env.hf.example`; never copy `.env.local`.
- For export changes, keep `scripts/validate-hfs-contract.sh` aligned.

## Do not

- Do not move product source into `cloud/hfs/`.
- Do not add secrets, local files, source trees, `dist/`, or `node_modules/` to exports.
- Do not change port `7860` without updating every surface.
- Do not make public demo Spaces require Codex credentials.

## Validation

- `scripts/static-check.sh`
- `bash cloud/hfs/export_space_bundle.sh /tmp/codex-platform-hfs-space`

Full installs, builds, Docker, uploads, and live smoke belong in Actions or HF unless asked.
