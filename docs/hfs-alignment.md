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

## HFS v2 Registration And Release Pin Contract

`cloud/hfs/hfs-dev.toml` is an HFS v2 semantic registration, not a second deployment configuration. It declares the product and Space identity, `sovereignty = "sovereign"`, `lane = "source"`, `version_source = "commit"`, plus the names of local-only credentials, Space Secrets, and Space Variables. It contains names only—never deployment values, release pins, seed files, or buckets.

`.env` is the HFS value ledger: it holds the local values corresponding to those registered names. `.env.local` remains a product-local compatibility file and is not an HFS value source, deployment input, or export input.

The Docker/export/validator contract owns the release pin and Pattern B mechanics. Development adapter source may use:

```text
ARG CODEX_PLATFORM_REF=main
ARG CODEX_PLATFORM_COMMIT=HEAD
```

`cloud/hfs/export_space_bundle.sh` resolves both requested refs locally and writes a full Git commit SHA into the exported `CODEX_PLATFORM_COMMIT` and `BUILD_SOURCE.txt`. It fails when a symbolic ref cannot resolve. The Dockerfile clones the repository, fetches and checks out the pinned commit without relying on a branch-only clone selector, then writes the checked-out commit to `BUILD_SHA` for runtime verification.

## Shared Runtime Contract

| Contract | Current evidence |
| --- | --- |
| Space metadata | `cloud/hfs/README.md` frontmatter contains `sdk: docker` and `app_port: 7860` |
| Space build entry | Exported `Dockerfile` comes from `cloud/hfs/Dockerfile` |
| HFS v2 manifest | `cloud/hfs/hfs-dev.toml` registers identity, source/commit semantics, and value names only |
| Single public port | `cloud/hfs/README.md app_port`, Dockerfile `EXPOSE`, and runtime `PORT` are `7860` |
| Canonical health | `/healthz` returns JSON server health |
| Ops diagnostics | `/_ops/*` is read-only and gated by `CODEX_PLATFORM_OPS_TOKEN` |
| Admin control | `/_admin/*` is default-off, uses a separate admin token, CSRF, confirm, and audit log |
| Docker/export/validator contract | Enforces Pattern B, `source-fetch`, `flat-remap`, flat bundle exclusions, commit pinning, and `BUILD_SHA` |
| Release takeover evidence | Runtime image includes `BUILD_SHA`; `/healthz` exposes the build SHA when present |
| Values boundary | `.env` is the HFS value ledger; `.env.local` remains product-local compatibility only |
| Local reference boundary | `local/` is reference-only and not part of the Space bundle |
| Static gate | `.github/workflows/ci.yml` calls `scripts/static-check.sh` |
| Contract gate | `scripts/validate-hfs-contract.sh` validates the Pattern B structure |
| Smoke | `scripts/hf-space-smoke.sh` checks `/healthz`, `/readyz`, `/api/config`, `/`, `/api/state`, `/api/admin/status`, `/_ops/*`, and default-disabled `/_admin/`; `scripts/admin-smoke.sh` covers enabled admin |

## Migration Rule

Do not copy Pattern A layout from HFS port repositories such as Dify all-in-one. For a product repository like Codex-Platform, keep:

```text
Product root stays product root.
HFS adapter stays in cloud/hfs/.
Exported Space root is generated, not hand-maintained.
Release identity is the Git commit SHA.
```
