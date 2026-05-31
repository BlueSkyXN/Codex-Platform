#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repo_root"

errors=0

fail() {
  printf 'FAIL hfs-contract: %s\n' "$1" >&2
  errors=$((errors + 1))
}

require_file() {
  local path=$1
  if [ ! -f "$path" ]; then
    fail "missing required file: $path"
  fi
}

require_grep() {
  local pattern=$1
  local path=$2
  local message=$3
  if ! grep -Eq "$pattern" "$path"; then
    fail "$message"
  fi
}

require_absent() {
  local pattern=$1
  local path=$2
  local message=$3
  if grep -Eq "$pattern" "$path"; then
    fail "$message"
  fi
}

frontmatter_value() {
  local path=$1
  local key=$2
  awk -v key="$key" '
    NR == 1 && $0 == "---" { in_yaml = 1; next }
    in_yaml && $0 == "---" { exit }
    in_yaml {
      split($0, parts, ":")
      if (parts[1] == key) {
        sub("^[^:]+:[[:space:]]*", "", $0)
        print $0
      }
    }
  ' "$path" | tail -n 1
}

require_file README.md
require_file package.json
require_file package-lock.json
require_file scripts/hf-entrypoint.sh
require_file scripts/hf-healthcheck.sh
require_file scripts/hf-space-smoke.sh
require_file scripts/admin-smoke.sh
require_file cloud/hfs/README.md
require_file cloud/hfs/Dockerfile
require_file cloud/hfs/.dockerignore
require_file cloud/hfs/export_space_bundle.sh
require_file cloud/hfs/hfs-dev.toml
require_file cloud/hfs/AGENTS.md
require_file docs/HUGGINGFACE_SPACES.md
require_file docs/hfs-alignment.md

python3 - "$repo_root" <<'PY'
from __future__ import annotations

import sys
import tomllib
from pathlib import Path

root = Path(sys.argv[1])
manifest = tomllib.loads((root / "cloud/hfs/hfs-dev.toml").read_text(encoding="utf-8"))

expected = {
    "schema_version": 2,
    "standard": "hfs-dev",
    "pattern": "B",
    "runtime_mode": "source-fetch",
    "space_root_mode": "flat-remap",
    "hfs_dir": "cloud/hfs",
    "export_command": "bash cloud/hfs/export_space_bundle.sh /tmp/codex-platform-hfs-space",
    "public_port": 7860,
    "canonical_health_endpoint": "/healthz",
    "release_pin_required": True,
}

failures: list[str] = []
for key, value in expected.items():
    if manifest.get(key) != value:
        failures.append(f"cloud/hfs/hfs-dev.toml {key} must be {value!r}, got {manifest.get(key)!r}")

if "release_pin_surfaces" in manifest:
    failures.append("cloud/hfs/hfs-dev.toml v2 must use structured [[release_pins]], not release_pin_surfaces")

required_files = manifest.get("required_files")
if not isinstance(required_files, list) or not required_files:
    failures.append("cloud/hfs/hfs-dev.toml required_files must be a non-empty list")
else:
    for rel_path in required_files:
        if not isinstance(rel_path, str) or not (root / "cloud/hfs" / rel_path).exists():
            failures.append(f"cloud/hfs/hfs-dev.toml required file is missing from Space root: {rel_path!r}")

source_excludes = manifest.get("source_excludes")
for rel_path in ("src", "scripts", "docs", "local", ".env.local", "node_modules", "dist"):
    if not isinstance(source_excludes, list) or rel_path not in source_excludes:
        failures.append(f"cloud/hfs/hfs-dev.toml source_excludes must include {rel_path!r}")

release_pins = manifest.get("release_pins")
if not isinstance(release_pins, list) or not release_pins:
    failures.append("cloud/hfs/hfs-dev.toml release_pins must be a non-empty structured array")
else:
    pins_by_name: dict[str, dict[str, object]] = {}
    for index, pin in enumerate(release_pins, start=1):
        if not isinstance(pin, dict):
            failures.append(f"cloud/hfs/hfs-dev.toml release_pins[{index}] must be a table")
            continue
        name = pin.get("name")
        if not isinstance(name, str) or not name:
            failures.append(f"cloud/hfs/hfs-dev.toml release_pins[{index}] must set name")
            continue
        if name in pins_by_name:
            failures.append(f"cloud/hfs/hfs-dev.toml release_pins duplicate name: {name}")
        pins_by_name[name] = pin

    expected_pin = {
        "name": "CODEX_PLATFORM_COMMIT",
        "type": "git_ref",
        "source": "Dockerfile ARG",
        "required_for_release": True,
        "dev_mutable_default_allowed": True,
        "release_requires_commit_sha": True,
    }
    pin = pins_by_name.get(expected_pin["name"])
    if not pin:
        failures.append("cloud/hfs/hfs-dev.toml release_pins missing CODEX_PLATFORM_COMMIT")
    else:
        for key, value in expected_pin.items():
            if pin.get(key) != value:
                failures.append(
                    f"cloud/hfs/hfs-dev.toml release_pins CODEX_PLATFORM_COMMIT.{key} "
                    f"must be {value!r}, got {pin.get(key)!r}"
                )
    unexpected_pins = sorted(set(pins_by_name) - {"CODEX_PLATFORM_COMMIT"})
    if unexpected_pins:
        failures.append("cloud/hfs/hfs-dev.toml release_pins unexpected: " + ", ".join(unexpected_pins))

if failures:
    for failure in failures:
        print(f"FAIL hfs-contract: {failure}", file=sys.stderr)
    raise SystemExit(1)
PY

if [ "$(head -n 1 README.md)" = "---" ]; then
  fail "root README.md must not contain Hugging Face Space frontmatter in Pattern B"
fi

sdk=$(frontmatter_value cloud/hfs/README.md sdk)
app_port=$(frontmatter_value cloud/hfs/README.md app_port)
if [ "$sdk" != "docker" ]; then
  fail "cloud/hfs/README.md frontmatter must set sdk: docker"
fi
if [ "$app_port" != "7860" ]; then
  fail "cloud/hfs/README.md frontmatter must set app_port: 7860"
fi

docker_expose=$(awk 'toupper($1) == "EXPOSE" { print $2; exit }' cloud/hfs/Dockerfile)
if [ "$docker_expose" != "$app_port" ]; then
  fail "cloud/hfs/Dockerfile EXPOSE ($docker_expose) must match cloud/hfs/README.md app_port ($app_port)"
fi

require_grep '^ARG CODEX_PLATFORM_COMMIT=HEAD$' cloud/hfs/Dockerfile \
  "cloud/hfs/Dockerfile must expose mutable dev default ARG CODEX_PLATFORM_COMMIT=HEAD"
require_grep 'git checkout --detach "\$\{CODEX_PLATFORM_COMMIT\}"' cloud/hfs/Dockerfile \
  "cloud/hfs/Dockerfile must checkout CODEX_PLATFORM_COMMIT when pinned"
require_grep 'git rev-parse HEAD > /opt/source/\.codex-platform-build-sha' cloud/hfs/Dockerfile \
  "cloud/hfs/Dockerfile must write build SHA for runtime verification"
require_grep 'COPY --from=source --chown=node:node /opt/source/\.codex-platform-build-sha ./BUILD_SHA' cloud/hfs/Dockerfile \
  "cloud/hfs/Dockerfile must copy BUILD_SHA into the runtime image"
require_grep 'CMD /home/node/app/scripts/hf-healthcheck\.sh' cloud/hfs/Dockerfile \
  "cloud/hfs/Dockerfile HEALTHCHECK must call scripts/hf-healthcheck.sh"

require_grep 's\|\^ARG CODEX_PLATFORM_COMMIT=\.\*\|ARG CODEX_PLATFORM_COMMIT=\$\{escaped_commit\}\|' cloud/hfs/export_space_bundle.sh \
  "cloud/hfs/export_space_bundle.sh must pin CODEX_PLATFORM_COMMIT in exported Dockerfile"
require_grep '^source_commit=\$\{commit\}$' cloud/hfs/export_space_bundle.sh \
  "cloud/hfs/export_space_bundle.sh must write source_commit to BUILD_SOURCE.txt"

require_grep '^local$' cloud/hfs/.dockerignore \
  "cloud/hfs/.dockerignore must exclude local"
require_grep '^\.env\.\*$' cloud/hfs/.dockerignore \
  "cloud/hfs/.dockerignore must exclude .env.*"
require_grep '^node_modules$' cloud/hfs/.dockerignore \
  "cloud/hfs/.dockerignore must exclude node_modules"
require_grep '^dist$' cloud/hfs/.dockerignore \
  "cloud/hfs/.dockerignore must exclude dist"

for path in cloud/hfs/src cloud/hfs/scripts cloud/hfs/docs cloud/hfs/local cloud/hfs/.env.local; do
  if [ -e "$path" ]; then
    fail "Pattern B Space adapter must not contain product/private path: $path"
  fi
done

require_grep 'Pattern B' docs/hfs-alignment.md \
  "docs/hfs-alignment.md must declare Pattern B"
require_grep 'source-fetch' docs/hfs-alignment.md \
  "docs/hfs-alignment.md must declare source-fetch runtime mode"
require_grep 'flat-remap' docs/hfs-alignment.md \
  "docs/hfs-alignment.md must declare flat-remap Space root mode"
require_grep 'cloud/hfs/' docs/hfs-alignment.md \
  "docs/hfs-alignment.md must document cloud/hfs adapter ownership"
require_grep 'Pattern B' cloud/hfs/AGENTS.md \
  "cloud/hfs/AGENTS.md must document Pattern B invariants"
require_grep 'CODEX_PLATFORM_COMMIT' cloud/hfs/AGENTS.md \
  "cloud/hfs/AGENTS.md must document release pin invariant"

require_grep 'SMOKE_RETRIES' scripts/hf-space-smoke.sh \
  "scripts/hf-space-smoke.sh must support retry configuration"
require_grep '/api/state' scripts/hf-space-smoke.sh \
  "scripts/hf-space-smoke.sh must check /api/state"
require_grep '/api/admin/status' scripts/hf-space-smoke.sh \
  "scripts/hf-space-smoke.sh must check /api/admin/status"
require_grep '/_ops/health' scripts/hf-space-smoke.sh \
  "scripts/hf-space-smoke.sh must check /_ops/health"
require_grep '/_admin/api/status' scripts/hf-space-smoke.sh \
  "scripts/hf-space-smoke.sh must check optional /_admin status"
require_grep 'ADMIN_EXPECTED_ENABLED' scripts/admin-smoke.sh \
  "scripts/admin-smoke.sh must support disabled/admin-enabled modes"
require_grep 'x-codex-platform-token' scripts/hf-space-smoke.sh \
  "scripts/hf-space-smoke.sh must support authenticated smoke"

require_absent '\.env\.local' cloud/hfs/README.md \
  "cloud/hfs/README.md must not mention real local env values"

if [ "$errors" -gt 0 ]; then
  exit 1
fi

printf 'PASS hfs-contract: Pattern B source-fetch contract is structurally valid\n'
