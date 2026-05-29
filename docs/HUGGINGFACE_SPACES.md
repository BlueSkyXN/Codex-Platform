# Hugging Face Spaces

Codex-Platform deploys to Hugging Face as a Docker Space through `cloud/hfs/`.

## Pattern

The repository follows the local HFS standard:

```text
pattern = "B"
runtime_mode = "source-fetch"
space_root_mode = "flat-remap"
```

The Space root contains only:

```text
README.md
Dockerfile
hfs-dev.toml
.dockerignore
BUILD_SOURCE.txt
```

The Dockerfile fetches `https://github.com/BlueSkyXN/Codex-Platform.git` and checks out the commit embedded by `cloud/hfs/export_space_bundle.sh`.

## Export

```bash
bash cloud/hfs/export_space_bundle.sh /tmp/codex-platform-hfs-space
```

The exported bundle is safe to upload to:

```text
BlueSkyXN/Codex-Platform-HFS
```

It must not contain `local/`, `.env.local`, `src/`, `docs/`, or `scripts/`; those are fetched from GitHub during build.

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

## Smoke

After HF reports the Space as running:

```bash
scripts/hf-space-smoke.sh https://blueskyxn-codex-platform-hfs.hf.space
```

The smoke checks `/healthz`, `/`, and `/api/state`.
