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
require_file cloud/hfs/hfs-dev.candidate.toml
require_file scripts/hf_space_sync.py
require_file cloud/hfs/AGENTS.md
require_file docs/HUGGINGFACE_SPACES.md
require_file docs/hfs-alignment.md

python3 - "$repo_root" <<'PY'
from __future__ import annotations

import re
import sys
import tomllib
from pathlib import Path

root = Path(sys.argv[1])
manifest_path = root / "cloud/hfs/hfs-dev.toml"
raw = manifest_path.read_text(encoding="utf-8")

try:
    manifest = tomllib.loads(raw)
except tomllib.TOMLDecodeError as exc:
    print(f"FAIL hfs-contract: {manifest_path} is not valid TOML: {exc}", file=sys.stderr)
    raise SystemExit(1)

expected = {
    "standard": "2.0",
    "project": "codex-platform",
    "space": "BlueSkyXN/Codex-Platform-HFS",
    "sovereignty": "sovereign",
    "lane": "source",
    "version_source": "commit",
}
allowed_fields = set(expected) | {"local_only", "secrets", "variables"}
control_credentials = {"HF_TOKEN", "GH_TOKEN"}
env_name = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
secret_literal = re.compile(
    r"(?:hf_[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|"
    r"github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9]{20,})"
)

failures: list[str] = []
for key, value in expected.items():
    if manifest.get(key) != value:
        failures.append(
            f"cloud/hfs/hfs-dev.toml {key} must be {value!r}, got {manifest.get(key)!r}"
        )

unexpected = sorted(set(manifest) - allowed_fields)
if unexpected:
    failures.append(
        "cloud/hfs/hfs-dev.toml must use only HFS v2 fields; unexpected: "
        + ", ".join(unexpected)
    )

if secret_literal.search(raw):
    failures.append("cloud/hfs/hfs-dev.toml must register names only, not token literals")

lists: dict[str, list[str]] = {}
for field in ("local_only", "secrets", "variables"):
    values = manifest.get(field)
    if not isinstance(values, list) or not values or not all(isinstance(value, str) and value for value in values):
        failures.append(f"cloud/hfs/hfs-dev.toml {field} must be a non-empty string list")
        continue
    invalid = sorted(value for value in values if not env_name.fullmatch(value))
    if invalid:
        failures.append(f"cloud/hfs/hfs-dev.toml {field} has invalid env names: {invalid}")
    duplicate = sorted({value for value in values if values.count(value) > 1})
    if duplicate:
        failures.append(f"cloud/hfs/hfs-dev.toml {field} has duplicate env names: {duplicate}")
    lists[field] = values

missing_controls = sorted(control_credentials - set(lists.get("local_only", [])))
if missing_controls:
    failures.append(
        "cloud/hfs/hfs-dev.toml local_only must register HFS control credentials: "
        + ", ".join(missing_controls)
    )

for left, right in (("local_only", "secrets"), ("local_only", "variables"), ("secrets", "variables")):
    overlap = sorted(set(lists.get(left, [])) & set(lists.get(right, [])))
    if overlap:
        failures.append(f"cloud/hfs/hfs-dev.toml {left} and {right} overlap: {overlap}")

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
require_absent 'git clone .*--branch .*CODEX_PLATFORM_REF' cloud/hfs/Dockerfile \
  "cloud/hfs/Dockerfile must not require CODEX_PLATFORM_REF to be a branch"
require_grep 'git rev-parse HEAD > /opt/source/\.codex-platform-build-sha' cloud/hfs/Dockerfile \
  "cloud/hfs/Dockerfile must write build SHA for runtime verification"
require_grep 'COPY --from=source --chown=node:node /opt/source/\.codex-platform-build-sha ./BUILD_SHA' cloud/hfs/Dockerfile \
  "cloud/hfs/Dockerfile must copy BUILD_SHA into the runtime image"
require_grep 'CMD /home/node/app/scripts/hf-healthcheck\.sh' cloud/hfs/Dockerfile \
  "cloud/hfs/Dockerfile HEALTHCHECK must call scripts/hf-healthcheck.sh"

require_grep 'resolve_commit "\$\{requested_commit\}"' cloud/hfs/export_space_bundle.sh \
  "cloud/hfs/export_space_bundle.sh must resolve CODEX_PLATFORM_COMMIT to a commit SHA"
require_grep 'resolve_commit "\$\{ref\}"' cloud/hfs/export_space_bundle.sh \
  "cloud/hfs/export_space_bundle.sh must resolve CODEX_PLATFORM_REF to a commit SHA"
require_grep '^source_commit=\$\{commit\}$' cloud/hfs/export_space_bundle.sh \
  "cloud/hfs/export_space_bundle.sh must write the resolved source commit to BUILD_SOURCE.txt"

bundle_dir=$(mktemp -d "${TMPDIR:-/tmp}/codex-platform-hfs-contract.XXXXXX")
trap 'rm -rf "${bundle_dir}"' EXIT
bash cloud/hfs/export_space_bundle.sh "${bundle_dir}" >/dev/null

for file in README.md Dockerfile hfs-dev.toml .dockerignore BUILD_SOURCE.txt; do
  require_file "${bundle_dir}/${file}"
done

while IFS= read -r bundle_path; do
  bundle_name=${bundle_path##*/}
  if [ -d "${bundle_path}" ]; then
    fail "exported Space bundle must be flat; found directory: ${bundle_name}"
    continue
  fi
  case "${bundle_name}" in
    README.md|Dockerfile|hfs-dev.toml|.dockerignore|BUILD_SOURCE.txt) ;;
    *) fail "exported Space bundle contains unexpected path: ${bundle_name}" ;;
  esac
done < <(find "${bundle_dir}" -mindepth 1 -maxdepth 1 -print)

require_grep '^ARG CODEX_PLATFORM_COMMIT=[0-9a-f]{40}$' "${bundle_dir}/Dockerfile" \
  "exported Dockerfile must pin CODEX_PLATFORM_COMMIT to a full commit SHA"
require_absent '^ARG CODEX_PLATFORM_COMMIT=HEAD$' "${bundle_dir}/Dockerfile" \
  "exported Dockerfile must not retain CODEX_PLATFORM_COMMIT=HEAD"
require_grep '^source_commit=[0-9a-f]{40}$' "${bundle_dir}/BUILD_SOURCE.txt" \
  "exported BUILD_SOURCE.txt must record a full source commit SHA"
require_grep '^source_ref_commit=[0-9a-f]{40}$' "${bundle_dir}/BUILD_SOURCE.txt" \
  "exported BUILD_SOURCE.txt must record a full source ref commit SHA"

bundle_commit=$(grep -E '^ARG CODEX_PLATFORM_COMMIT=[0-9a-f]{40}$' "${bundle_dir}/Dockerfile")
bundle_commit=${bundle_commit#ARG CODEX_PLATFORM_COMMIT=}
bundle_source_commit=$(grep -E '^source_commit=[0-9a-f]{40}$' "${bundle_dir}/BUILD_SOURCE.txt")
bundle_source_commit=${bundle_source_commit#source_commit=}
if [ "${bundle_commit}" != "${bundle_source_commit}" ]; then
  fail "exported Dockerfile CODEX_PLATFORM_COMMIT must match BUILD_SOURCE.txt source_commit"
fi

require_absent '^[[:space:]]*push:' .github/workflows/deploy-hf-space.yml \
  "Space deployment must not run automatically on push"
require_grep "confirm_upload == 'PUBLISH_WRAPPER'" .github/workflows/deploy-hf-space.yml \
  "Space deployment must require explicit upload confirmation"
require_grep 'HFS_MANIFEST:' .github/workflows/deploy-hf-space.yml \
  "Space deployment must select an explicit target manifest"
require_grep 'manifest.get\("space"' .github/workflows/deploy-hf-space.yml \
  "Space deployment must load the Space id from the selected manifest"
require_grep 'private=is_candidate' .github/workflows/deploy-hf-space.yml \
  "candidate Space creation must request private visibility"
require_grep 'Space tree mismatch' .github/workflows/deploy-hf-space.yml \
  "Space deployment must verify the full remote wrapper allowlist"
require_grep 'EXPECTED_SOURCE_SHA:' .github/workflows/deploy-hf-space.yml \
  "Space deployment must pass the reviewed source SHA to smoke"

python3 - "${repo_root}" <<'PY'
import sys
import tomllib
from pathlib import Path

root = Path(sys.argv[1])
production = tomllib.loads((root / "cloud/hfs/hfs-dev.toml").read_text(encoding="utf-8"))
candidate = tomllib.loads((root / "cloud/hfs/hfs-dev.candidate.toml").read_text(encoding="utf-8"))
expected_candidate = "BlueSkyXN/Codex-Platform-HFS-v2-candidate"
if candidate.get("space") != expected_candidate:
    raise SystemExit(f"FAIL hfs-contract: candidate space must be {expected_candidate!r}")
for key in sorted(set(production) | set(candidate)):
    if key != "space" and production.get(key) != candidate.get(key):
        raise SystemExit(f"FAIL hfs-contract: candidate profile differs from production at {key}")
PY

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
require_grep 'HFS v2' docs/hfs-alignment.md \
  "docs/hfs-alignment.md must document HFS v2 semantics"
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

printf 'PASS hfs-contract: HFS v2 manifest and Pattern B source-fetch contract are structurally valid\n'
