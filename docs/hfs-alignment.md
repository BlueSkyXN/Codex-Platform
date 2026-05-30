# HFS Paradigm Alignment

This document records how Codex-Platform aligns with the local `hfs-dev` Hugging Face Space development standard. It is a contract note, not a second deployment guide.

## Classification

Codex-Platform is:

```text
Pattern B: Product Repository With HFS Adapter
Runtime mode: source-fetch
Space root mode: flat-remap
Product source of truth: repository root
HFS adapter: cloud/hfs/
Alignment manifest: cloud/hfs/hfs-dev.toml
```

The repository maintains the Codex-Platform product itself. Hugging Face is an additional deployment target. That is why the Space card metadata and Docker Space build entry live under `cloud/hfs/`, and the repository root keeps normal product maintenance semantics.

## Source Of Truth

The source-of-truth question is:

```text
Is this repository the product, or only an HFS packaging port for another product?
```

Current evidence:

- `src/` contains the React UI, Express backend, shared types, Codex bridge, persistence, security, and workspace APIs.
- Root `README.md` describes the product repository and does not carry Hugging Face Space frontmatter.
- `cloud/hfs/README.md` carries the Space card metadata: `sdk: docker` and `app_port: 7860`.
- `cloud/hfs/Dockerfile` fetches this GitHub repository and checks out `CODEX_PLATFORM_COMMIT` during the HF build.
- `cloud/hfs/export_space_bundle.sh` remaps the adapter files into a flat Space root.

Therefore Codex-Platform must remain Pattern B. Do not move the Space root to the repository root, and do not move product source into `cloud/hfs/`.

## Directory Contract

Repository root:

```text
repo-root/
  src/                  product source
  scripts/              runtime entrypoint, healthcheck, smoke helpers
  docs/                 product, deployment, env, and release docs
  cloud/hfs/            Hugging Face Space adapter
  .github/workflows/    CI and HF deploy automation
  local/                reference-only local material; ignored
```

Exported Space root:

```text
space-root/
  README.md
  Dockerfile
  hfs-dev.toml
  .dockerignore
  BUILD_SOURCE.txt
```

The exported Space root is intentionally small. During the HF Docker build, `cloud/hfs/Dockerfile` fetches the GitHub source at the pinned commit and builds inside the Hugging Face builder.

## Release Pin Contract

`cloud/hfs/hfs-dev.toml` uses structured `[[release_pins]]` with one release pin:

```text
CODEX_PLATFORM_COMMIT
```

Development defaults may use:

```text
ARG CODEX_PLATFORM_REF=main
ARG CODEX_PLATFORM_COMMIT=HEAD
```

Release exports must replace `CODEX_PLATFORM_COMMIT=HEAD` with the Git commit SHA being deployed. The deploy workflow does this through `cloud/hfs/export_space_bundle.sh`, and the Dockerfile writes the checked-out commit to `BUILD_SHA` for runtime verification.

## Shared Runtime Contract

| Contract | Current evidence |
| --- | --- |
| Space metadata | `cloud/hfs/README.md` frontmatter contains `sdk: docker` and `app_port: 7860` |
| Space build entry | Exported `Dockerfile` comes from `cloud/hfs/Dockerfile` |
| Alignment manifest | `cloud/hfs/hfs-dev.toml` declares Pattern B, `source-fetch`, and `flat-remap` |
| Single public port | `cloud/hfs/README.md app_port`, Dockerfile `EXPOSE`, and runtime `PORT` are `7860` |
| Canonical health | `/healthz` returns JSON server health |
| Release takeover evidence | Runtime image includes `BUILD_SHA`; `/healthz` exposes the build SHA when present |
| Secrets boundary | `.env.local` is ignored and only used as a local ledger |
| Local reference boundary | `local/` is reference-only and not part of the Space bundle |
| Static gate | `.github/workflows/ci.yml` calls `scripts/static-check.sh` |
| Contract gate | `scripts/validate-hfs-contract.sh` validates the Pattern B structure |
| Smoke | `scripts/hf-space-smoke.sh` checks `/healthz`, `/api/config`, `/`, and `/api/state` |

## Migration Rule

Do not copy Pattern A layout from HFS port repositories such as Dify all-in-one. For a product repository like Codex-Platform, keep:

```text
Product root stays product root.
HFS adapter stays in cloud/hfs/.
Exported Space root is generated, not hand-maintained.
Release identity is the Git commit SHA.
```
