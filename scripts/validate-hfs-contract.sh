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
require_file scripts/hfs_dev.py
require_file scripts/check_hfs_alignment.py
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
    "standard": "3.0",
    "project": "codex-platform",
    "space": "BlueSkyXN/Codex-Platform-HFS",
    "sovereignty": "sovereign",
    "lane": "source",
    "version_source": "commit",
    "project_class": "preview",
    "target_role": "primary",
    "space_visibility": "protected",
    "bucket_visibility": "private",
    "env_file": ".env",
}
allowed_fields = set(expected) | {"local_only", "secrets", "optional_secrets", "variables"}
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
        "cloud/hfs/hfs-dev.toml must use only HFS v3.0 fields; unexpected: "
        + ", ".join(unexpected)
    )

if secret_literal.search(raw):
    failures.append("cloud/hfs/hfs-dev.toml must register names only, not token literals")

lists: dict[str, list[str]] = {}
for field in ("local_only", "secrets", "optional_secrets", "variables"):
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

for left, right in (
    ("local_only", "secrets"),
    ("local_only", "optional_secrets"),
    ("local_only", "variables"),
    ("secrets", "optional_secrets"),
    ("secrets", "variables"),
    ("optional_secrets", "variables"),
):
    overlap = sorted(set(lists.get(left, [])) & set(lists.get(right, [])))
    if overlap:
        failures.append(f"cloud/hfs/hfs-dev.toml {left} and {right} overlap: {overlap}")

if failures:
    for failure in failures:
        print(f"FAIL hfs-contract: {failure}", file=sys.stderr)
    raise SystemExit(1)
PY

python3 scripts/check_hfs_alignment.py . --manifest cloud/hfs/hfs-dev.toml || fail "canonical HFS v3.0 alignment check failed"
python3 scripts/check_hfs_alignment.py . --manifest cloud/hfs/hfs-dev.candidate.toml || fail "candidate HFS v3.0 alignment check failed"

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
require_grep 'production Space must already exist' .github/workflows/deploy-hf-space.yml \
  "production deployment must not create a Space"
require_grep 'FORMAL_SPACE: BlueSkyXN/Codex-Platform-HFS' .github/workflows/deploy-hf-space.yml \
  "production deployment must pin the canonical Space id"
require_grep 'target Space must be private before wrapper upload' .github/workflows/deploy-hf-space.yml \
  "candidate and production deployment must verify private visibility"
require_grep 'refusing to write a non-thin Space' .github/workflows/deploy-hf-space.yml \
  "Space deployment must preflight the remote wrapper boundary"
require_grep 'Space tree mismatch' .github/workflows/deploy-hf-space.yml \
  "Space deployment must verify the full remote wrapper allowlist"
require_grep 'EXPECTED_SOURCE_SHA:' .github/workflows/deploy-hf-space.yml \
  "Space deployment must pass the reviewed source SHA to smoke"
require_grep 'huggingface_hub==1\.25\.1' .github/workflows/deploy-hf-space.yml \
  "Space deployment must pin the Hugging Face Python client"
require_grep 'click==8\.4\.2' .github/workflows/deploy-hf-space.yml \
  "Space deployment must pin the audited Click runtime"
require_grep 'repos settings --help \| grep -- --protected' .github/workflows/deploy-hf-space.yml \
  "Space deployment must smoke-test Protected visibility support"
require_grep 'from huggingface_hub import HfApi' .github/workflows/deploy-hf-space.yml \
  "Space deployment must use the Hugging Face Python API"
require_grep 'expand=\["subdomain"\]' .github/workflows/deploy-hf-space.yml \
  "Space deployment must read the actual Space subdomain"
require_grep 'getattr\(info, "subdomain", None\)' .github/workflows/deploy-hf-space.yml \
  "Space deployment must derive live smoke URL from Space metadata"
require_absent 'space_id\.lower\(\)\.replace\("/", "-"\)' .github/workflows/deploy-hf-space.yml \
  "Space deployment must not synthesize a legacy Space hostname"
require_grep 'download_fn\(' .github/workflows/deploy-hf-space.yml \
  "Space deployment must read back uploaded files through the Python API"
require_grep 'create_repo_fn\(' .github/workflows/deploy-hf-space.yml \
  "candidate creation must use the modeled create operation"
require_grep 'upload_folder_fn\(' .github/workflows/deploy-hf-space.yml \
  "Space deployment must use the modeled upload operation"
require_grep 'create_repo_fn=create_repo,' .github/workflows/deploy-hf-space.yml \
  "workflow main must bind candidate creation to huggingface_hub.create_repo"
require_grep 'upload_folder_fn=upload_folder,' .github/workflows/deploy-hf-space.yml \
  "workflow main must bind upload to huggingface_hub.upload_folder"
require_grep 'download_fn=hf_hub_download,' .github/workflows/deploy-hf-space.yml \
  "workflow main must bind readback to huggingface_hub.hf_hub_download"
require_grep 'HFS_BUNDLE_DIR: /tmp/codex-platform-hfs-space' .github/workflows/deploy-hf-space.yml \
  "workflow must expose the controlled bundle path to its testable main entrypoint"
require_grep 'parent_commit=parent_commit,' .github/workflows/deploy-hf-space.yml \
  "upload must use the preflighted Space revision as parent_commit"
require_grep 'upload_oid = upload_result\.oid' .github/workflows/deploy-hf-space.yml \
  "deployment must capture the uploaded CommitInfo oid"
require_grep 'revision=upload_oid,' .github/workflows/deploy-hf-space.yml \
  "post-upload tree and byte readback must pin the uploaded revision"
require_grep 'current\.sha != upload_oid' .github/workflows/deploy-hf-space.yml \
  "deployment must recheck the current Space revision before restart"
require_grep '# HFS_MAIN_DEPLOY_BEGIN' .github/workflows/deploy-hf-space.yml \
  "workflow main must expose its deploy_space wiring to mutation tests"
require_grep '# HFS_MAIN_DEPLOY_END' .github/workflows/deploy-hf-space.yml \
  "workflow main must expose its deploy_space wiring to mutation tests"
require_grep 'api\.restart_space\(repo_id=repo_id, factory_reboot=True\)' .github/workflows/deploy-hf-space.yml \
  "Space deployment must use HfApi for the factory reboot"

python3 - "${repo_root}" <<'PY'
import sys
import tomllib
from pathlib import Path

root = Path(sys.argv[1])
production = tomllib.loads((root / "cloud/hfs/hfs-dev.toml").read_text(encoding="utf-8"))
candidate = tomllib.loads((root / "cloud/hfs/hfs-dev.candidate.toml").read_text(encoding="utf-8"))
expected_production = "BlueSkyXN/Codex-Platform-HFS"
expected_candidate = "BlueSkyXN/Codex-Platform-HFS-v3-candidate"
if production.get("space") != expected_production:
    raise SystemExit(f"FAIL hfs-contract: production space must be {expected_production!r}")
if candidate.get("space") != expected_candidate:
    raise SystemExit(f"FAIL hfs-contract: candidate space must be {expected_candidate!r}")
if candidate.get("target_role") != "candidate":
    raise SystemExit("FAIL hfs-contract: candidate target_role must be 'candidate'")
if candidate.get("env_file") != "local/hfs-targets/candidate.env":
    raise SystemExit("FAIL hfs-contract: candidate env_file must be isolated")
for key in sorted(set(production) | set(candidate)):
    if key not in {"space", "target_role", "env_file"} and production.get(key) != candidate.get(key):
        raise SystemExit(f"FAIL hfs-contract: candidate profile differs from production at {key}")

workflow = (root / ".github/workflows/deploy-hf-space.yml").read_text(encoding="utf-8")
upload_offset = workflow.index("upload_folder_fn(")
required_before_upload = (
    'if os.environ["HFS_TARGET"] == "production" and space_id != os.environ["FORMAL_SPACE"]:',
    'if info.private is not True:',
    '[[ "$GITHUB_REF" == "refs/heads/main" ]]',
    'git fetch --no-tags origin +refs/heads/main:refs/remotes/origin/main',
    '[[ "$(git rev-parse HEAD)" == "$GITHUB_SHA" ]]',
    '[[ "$EXPECTED_SOURCE_SHA" == "$GITHUB_SHA" ]]',
    '[[ "$(git rev-parse origin/main)" == "$GITHUB_SHA" ]]',
)
for fragment in required_before_upload:
    offset = workflow.find(fragment)
    if offset < 0 or offset > upload_offset:
        raise SystemExit(f"FAIL hfs-contract: production pre-upload gate missing or late: {fragment}")
if "if is_candidate and not info.private" in workflow:
    raise SystemExit("FAIL hfs-contract: production Space privacy must not be skipped")
PY

python3 - "${repo_root}" <<'PY'
from __future__ import annotations

import os
import sys
import tempfile
import textwrap
import types
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch


class RepositoryNotFoundError(Exception):
    pass


PARENT_OID = "1" * 40
UPLOAD_OID = "2" * 40
MOVED_OID = "3" * 40
MISSING = object()


fake_hub = types.ModuleType("huggingface_hub")
fake_hub.HfApi = object
fake_hub.create_repo = lambda **kwargs: None
fake_hub.hf_hub_download = lambda **kwargs: ""
fake_hub.upload_folder = lambda **kwargs: None
fake_utils = types.ModuleType("huggingface_hub.utils")
fake_utils.RepositoryNotFoundError = RepositoryNotFoundError
sys.modules["huggingface_hub"] = fake_hub
sys.modules["huggingface_hub.utils"] = fake_utils

root = Path(sys.argv[1])
workflow = (root / ".github/workflows/deploy-hf-space.yml").read_text(encoding="utf-8")
begin = "# HFS_DEPLOY_PYTHON_BEGIN"
end = "# HFS_DEPLOY_PYTHON_END"
if workflow.count(begin) != 1 or workflow.count(end) != 1:
    raise SystemExit("FAIL hfs-contract: deploy workflow must expose one testable Python state machine")
source = textwrap.dedent(workflow.split(begin, 1)[1].split(end, 1)[0])
main_begin = "# HFS_MAIN_DEPLOY_BEGIN"
main_end = "# HFS_MAIN_DEPLOY_END"
if source.count(main_begin) != 1 or source.count(main_end) != 1:
    raise SystemExit("FAIL hfs-contract: workflow main must expose one mutation-tested deploy_space call")
namespace = {"__name__": "hfs_deploy_contract"}
exec(compile(source, "deploy-hf-space.inline.py", "exec"), namespace)
deploy_space = namespace.get("deploy_space")
if not callable(deploy_space):
    raise SystemExit("FAIL hfs-contract: deploy workflow must define deploy_space")


class FakeApi:
    def __init__(
        self,
        events: list[tuple[str, object]],
        *,
        missing: bool = False,
        private_after_create: bool = True,
        post_upload_files: set[str] | None = None,
        subdomain: object = "codex-platform-private",
        current_after_upload: str | None = None,
        initial_sha: str | None = PARENT_OID,
        pre_upload_files: set[str] | None = None,
        preflight_error: bool = False,
    ) -> None:
        self.events = events
        self.missing = missing
        self.private_after_create = private_after_create
        self.post_upload_files = post_upload_files
        self.subdomain = subdomain
        self.current_after_upload = current_after_upload or UPLOAD_OID
        self.sha = initial_sha
        self.pre_upload_files = set() if pre_upload_files is None else pre_upload_files
        self.preflight_error = preflight_error
        self.repo_info_calls = 0
        self.list_calls = 0

    def repo_info(self, *, repo_id: str, repo_type: str, token: str | None = None):
        self.repo_info_calls += 1
        self.events.append(("repo_info", (self.repo_info_calls, self.sha)))
        if self.missing and self.repo_info_calls == 1:
            raise RepositoryNotFoundError(repo_id)
        private = self.private_after_create if self.missing else True
        return SimpleNamespace(private=private, sha=self.sha)

    def list_repo_files(
        self,
        *,
        repo_id: str,
        repo_type: str,
        revision: str | None = None,
        token: str | None = None,
    ):
        self.list_calls += 1
        self.events.append(("list_repo_files", revision))
        if self.list_calls == 1:
            if self.preflight_error:
                raise RuntimeError("controlled preflight tree failure")
            return sorted(self.pre_upload_files)
        if self.post_upload_files is not None:
            return sorted(self.post_upload_files)
        return sorted(expected_files)

    def space_info(
        self,
        *,
        repo_id: str,
        revision: str,
        expand: list[str],
        token: str,
    ):
        self.events.append(("space_info", revision))
        if self.subdomain is MISSING:
            return SimpleNamespace(sha=revision)
        return SimpleNamespace(subdomain=self.subdomain, sha=revision)

    def restart_space(self, *, repo_id: str, factory_reboot: bool):
        self.events.append(("restart_space", factory_reboot))


def run_case(
    *,
    target: str,
    missing: bool = False,
    private_after_create: bool = True,
    post_upload_files: set[str] | None = None,
    corrupt_download: str | None = None,
    upload_oid: object = UPLOAD_OID,
    subdomain: object = "codex-platform-private",
    current_after_upload: str | None = None,
    initial_sha: str | None = PARENT_OID,
    events: list[tuple[str, object]] | None = None,
):
    events = [] if events is None else events
    create_calls: list[dict[str, object]] = []

    def create_repo(**kwargs):
        create_calls.append(kwargs)
        events.append(("create_repo", kwargs))

    def upload_folder(**kwargs):
        events.append(("upload_folder", kwargs))
        api.sha = api.current_after_upload
        return SimpleNamespace(oid=upload_oid)

    def download(**kwargs):
        name = kwargs["filename"]
        events.append(("download", (name, kwargs.get("revision"))))
        if name == corrupt_download:
            corrupt = bundle.parent / f"corrupt-{name}"
            corrupt.write_bytes(b"corrupt")
            return str(corrupt)
        return str(bundle / name)

    api = FakeApi(
        events,
        missing=missing,
        private_after_create=private_after_create,
        post_upload_files=post_upload_files,
        subdomain=subdomain,
        current_after_upload=current_after_upload,
        initial_sha=initial_sha,
    )
    result = deploy_space(
        api=api,
        create_repo_fn=create_repo,
        upload_folder_fn=upload_folder,
        download_fn=download,
        repo_id="BlueSkyXN/Codex-Platform-HFS-v3-candidate" if target == "candidate" else "BlueSkyXN/Codex-Platform-HFS",
        target=target,
        folder=bundle,
        commit="0123456789abcdef0123456789abcdef01234567",
        token="test-token-not-a-real-credential",
    )
    return result, events, create_calls


def run_main(
    candidate_source: str,
    bundle: Path,
    *,
    initial_sha: str | None = PARENT_OID,
    pre_upload_files: set[str] | None = None,
    preflight_error: bool = False,
    events: list[tuple[str, object]] | None = None,
):
    events = [] if events is None else events
    create_calls: list[dict[str, object]] = []
    api = FakeApi(
        events,
        initial_sha=initial_sha,
        pre_upload_files=pre_upload_files,
        preflight_error=preflight_error,
    )

    def create_repo(**kwargs):
        create_calls.append(kwargs)
        events.append(("create_repo", kwargs))

    def upload_folder(**kwargs):
        events.append(("upload_folder", kwargs))
        api.sha = UPLOAD_OID
        return SimpleNamespace(oid=UPLOAD_OID)

    def download(**kwargs):
        events.append(("download", (kwargs["filename"], kwargs.get("revision"))))
        return str(bundle / kwargs["filename"])

    fake_hub.HfApi = lambda token: api
    fake_hub.create_repo = create_repo
    fake_hub.upload_folder = upload_folder
    fake_hub.hf_hub_download = download
    run_main.counter = getattr(run_main, "counter", 0) + 1
    github_env = bundle.parent / f"github-env-{run_main.counter}"
    controlled_env = {
        "GITHUB_ENV": str(github_env),
        "GITHUB_SHA": "0123456789abcdef0123456789abcdef01234567",
        "HF_SPACE_ID": "BlueSkyXN/Codex-Platform-HFS",
        "HF_TOKEN": "test-token-not-a-real-credential",
        "HFS_BUNDLE_DIR": str(bundle),
        "HFS_TARGET": "production",
    }
    with patch.dict(os.environ, controlled_env, clear=True):
        exec(compile(candidate_source, "deploy-hf-space.__main__.py", "exec"), {"__name__": "__main__"})
    github_env_text = github_env.read_text(encoding="utf-8") if github_env.is_file() else ""
    return events, create_calls, github_env_text


def main_result_passes(events, create_calls, github_env_text: str) -> bool:
    names = [name for name, _ in events]
    required = ("repo_info", "list_repo_files", "upload_folder", "download", "space_info", "restart_space")
    if create_calls or any(name not in names for name in required):
        return False
    if not names.index("upload_folder") < names.index("space_info") < names.index("restart_space"):
        return False
    return github_env_text == "HF_PUBLIC_URL=https://codex-platform-private.hf.space\n"


def main_contract_passes(candidate_source: str, bundle: Path) -> bool:
    try:
        return main_result_passes(*run_main(candidate_source, bundle))
    except BaseException:
        return False


with tempfile.TemporaryDirectory(prefix="codex-platform-deploy-contract.") as temporary_dir:
    bundle = Path(temporary_dir) / "bundle"
    bundle.mkdir()
    expected_files = {".dockerignore", "BUILD_SOURCE.txt", "Dockerfile", "README.md", "hfs-dev.toml"}
    for name in expected_files:
        (bundle / name).write_bytes(f"fixture:{name}\n".encode())

    if not main_contract_passes(source, bundle):
        raise SystemExit("FAIL hfs-contract: extracted __main__ does not execute the verified deploy_space wiring")

    fresh_events: list[tuple[str, object]] = []
    fresh_result = run_main(source, bundle, initial_sha=None, pre_upload_files=set(), events=fresh_events)
    fresh_names = [name for name, _ in fresh_events]
    if "create_repo" in fresh_names or "upload_folder" not in fresh_names or "restart_space" not in fresh_names:
        raise SystemExit("FAIL hfs-contract: existing empty production did not complete first upload via __main__")
    fresh_upload = next(payload for name, payload in fresh_events if name == "upload_folder")
    if fresh_upload.get("parent_commit") is not None:
        raise SystemExit("FAIL hfs-contract: existing empty production invented a parent commit")
    if fresh_result[2] != "HF_PUBLIC_URL=https://codex-platform-private.hf.space\n":
        raise SystemExit("FAIL hfs-contract: existing empty production did not publish its smoke URL")

    existing_events: list[tuple[str, object]] = []
    run_main(
        source,
        bundle,
        initial_sha=PARENT_OID,
        pre_upload_files=expected_files,
        events=existing_events,
    )
    existing_upload = next(payload for name, payload in existing_events if name == "upload_folder")
    if existing_upload.get("parent_commit") != PARENT_OID:
        raise SystemExit("FAIL hfs-contract: existing production upload lost its exact parent commit")

    nonempty_events: list[tuple[str, object]] = []
    try:
        run_main(
            source,
            bundle,
            initial_sha=None,
            pre_upload_files={".gitattributes"},
            events=nonempty_events,
        )
    except SystemExit as exc:
        if "fresh production Space must have an empty tree" not in str(exc):
            raise
    else:
        raise SystemExit("FAIL hfs-contract: nonempty sha-less production reached upload")
    if any(name in {"upload_folder", "restart_space"} for name, _ in nonempty_events):
        raise SystemExit("FAIL hfs-contract: nonempty sha-less production mutated HF state")

    unknown_events: list[tuple[str, object]] = []
    try:
        run_main(source, bundle, initial_sha=None, preflight_error=True, events=unknown_events)
    except SystemExit as exc:
        if "cannot confirm fresh production Space has an empty tree" not in str(exc):
            raise
    else:
        raise SystemExit("FAIL hfs-contract: unknown sha-less production tree reached upload")
    if any(name in {"upload_folder", "restart_space"} for name, _ in unknown_events):
        raise SystemExit("FAIL hfs-contract: unknown sha-less production tree mutated HF state")

    invalid_sha_events: list[tuple[str, object]] = []
    try:
        run_main(source, bundle, initial_sha="not-a-full-sha", events=invalid_sha_events)
    except SystemExit as exc:
        if "pre-upload revision is not a full commit SHA" not in str(exc):
            raise
    else:
        raise SystemExit("FAIL hfs-contract: invalid nonempty production SHA reached upload")
    if any(name in {"upload_folder", "restart_space"} for name, _ in invalid_sha_events):
        raise SystemExit("FAIL hfs-contract: invalid nonempty production SHA mutated HF state")

    entrypoint = 'if __name__ == "__main__":\n    main()'
    dead_entrypoint = source.replace(entrypoint, 'if __name__ == "__main__":\n    pass')
    if dead_entrypoint == source:
        raise SystemExit("FAIL hfs-contract: dead __main__ mutation could not be constructed")
    dead_events, dead_create_calls, dead_env = run_main(dead_entrypoint, bundle)
    if dead_events or dead_create_calls or dead_env or main_result_passes(dead_events, dead_create_calls, dead_env):
        raise SystemExit("FAIL hfs-contract: dead __main__ mutation survived")

    prefix, main_tail = source.split(f"    {main_begin}", 1)
    _, suffix = main_tail.split(f"    {main_end}", 1)
    direct_upload = textwrap.indent(textwrap.dedent(
        '''
        # HFS_MAIN_DEPLOY_BEGIN
        upload_folder(
            repo_id=repo_id,
            repo_type="space",
            folder_path=os.environ["HFS_BUNDLE_DIR"],
            path_in_repo=".",
            token=token,
            parent_commit="1111111111111111111111111111111111111111",
        )
        subdomain = "direct-upload-mutant"
        # HFS_MAIN_DEPLOY_END
        '''
    ), "    ")
    direct_upload_mutant = prefix + direct_upload + suffix
    direct_events, direct_create_calls, direct_env = run_main(direct_upload_mutant, bundle)
    direct_names = [name for name, _ in direct_events]
    if "upload_folder" not in direct_names or "restart_space" in direct_names:
        raise SystemExit("FAIL hfs-contract: direct-upload mutation harness is not exercising the bypass")
    if main_result_passes(direct_events, direct_create_calls, direct_env):
        raise SystemExit("FAIL hfs-contract: direct-upload __main__ mutation survived")

    try:
        run_case(target="production", missing=True)
    except SystemExit as exc:
        if "production Space must already exist" not in str(exc):
            raise
    else:
        raise SystemExit("FAIL hfs-contract: missing production Space did not fail closed")

    production_events: list[tuple[str, object]] = []
    production_api = FakeApi(production_events, missing=True)
    try:
        deploy_space(
            api=production_api,
            create_repo_fn=lambda **kwargs: production_events.append(("create_repo", kwargs)),
            upload_folder_fn=lambda **kwargs: production_events.append(("upload_folder", kwargs)),
            download_fn=lambda **kwargs: "",
            repo_id="BlueSkyXN/Codex-Platform-HFS",
            target="production",
            folder=bundle,
            commit="0123456789abcdef0123456789abcdef01234567",
            token="test-token-not-a-real-credential",
        )
    except SystemExit:
        pass
    if any(name in {"create_repo", "upload_folder", "restart_space"} for name, _ in production_events):
        raise SystemExit("FAIL hfs-contract: missing production Space mutated HF state")

    public_candidate_events: list[tuple[str, object]] = []
    try:
        run_case(
            target="candidate",
            missing=True,
            private_after_create=False,
            events=public_candidate_events,
        )
    except SystemExit as exc:
        if "target Space must be private" not in str(exc):
            raise
    else:
        raise SystemExit("FAIL hfs-contract: public candidate readback did not fail closed")
    if any(name in {"upload_folder", "restart_space"} for name, _ in public_candidate_events):
        raise SystemExit("FAIL hfs-contract: public candidate was uploaded or restarted")

    _, candidate_events, create_calls = run_case(target="candidate", missing=True, initial_sha=None)
    expected_create = {
        "repo_id": "BlueSkyXN/Codex-Platform-HFS-v3-candidate",
        "repo_type": "space",
        "space_sdk": "docker",
        "private": True,
        "exist_ok": False,
        "token": "test-token-not-a-real-credential",
    }
    if create_calls != [expected_create]:
        raise SystemExit(f"FAIL hfs-contract: candidate create_repo contract drifted: {create_calls!r}")
    event_names = [name for name, _ in candidate_events]
    if not (
        event_names.index("create_repo")
        < event_names.index("repo_info", 1)
        < event_names.index("upload_folder")
        < event_names.index("space_info")
        < event_names.index("restart_space")
    ):
        raise SystemExit("FAIL hfs-contract: create/private-readback/upload/readback/restart order is invalid")
    if event_names.index("restart_space") <= max(index for index, name in enumerate(event_names) if name == "download"):
        raise SystemExit("FAIL hfs-contract: restart happened before complete file readback")
    upload_call = next(payload for name, payload in candidate_events if name == "upload_folder")
    if upload_call.get("parent_commit") is not None:
        raise SystemExit("FAIL hfs-contract: first upload to a newly created candidate used a false parent revision")
    list_revisions = [payload for name, payload in candidate_events if name == "list_repo_files"]
    if list_revisions != [None, UPLOAD_OID]:
        raise SystemExit(f"FAIL hfs-contract: tree readback revisions drifted: {list_revisions!r}")
    download_revisions = [payload[1] for name, payload in candidate_events if name == "download"]
    if set(download_revisions) != {UPLOAD_OID}:
        raise SystemExit(f"FAIL hfs-contract: byte readback was not upload-revision pinned: {download_revisions!r}")
    current_readback = max(index for index, name in enumerate(event_names) if name == "repo_info")
    if not event_names.index("space_info") < current_readback < event_names.index("restart_space"):
        raise SystemExit("FAIL hfs-contract: current Space SHA was not confirmed immediately before restart")

    _, existing_events, existing_create_calls = run_case(target="production")
    if existing_create_calls:
        raise SystemExit("FAIL hfs-contract: existing production unexpectedly called create_repo")
    existing_names = [name for name, _ in existing_events]
    if existing_names.index("upload_folder") >= existing_names.index("restart_space"):
        raise SystemExit("FAIL hfs-contract: production restart must follow upload and readback")

    incomplete_events: list[tuple[str, object]] = []
    try:
        run_case(
            target="production",
            post_upload_files=expected_files - {"README.md"},
            events=incomplete_events,
        )
    except SystemExit as exc:
        if "Space tree mismatch" not in str(exc):
            raise
    else:
        raise SystemExit("FAIL hfs-contract: incomplete post-upload tree did not fail closed")
    if any(name == "restart_space" for name, _ in incomplete_events):
        raise SystemExit("FAIL hfs-contract: incomplete post-upload tree was restarted")

    corrupt_events: list[tuple[str, object]] = []
    try:
        run_case(target="production", corrupt_download="README.md", events=corrupt_events)
    except SystemExit as exc:
        if "Space readback mismatch" not in str(exc):
            raise
    else:
        raise SystemExit("FAIL hfs-contract: byte-mismatched readback did not fail closed")
    if any(name == "restart_space" for name, _ in corrupt_events):
        raise SystemExit("FAIL hfs-contract: byte-mismatched readback was restarted")

    invalid_oid_events: list[tuple[str, object]] = []
    try:
        run_case(target="production", upload_oid="", events=invalid_oid_events)
    except SystemExit as exc:
        if "upload did not return a full commit oid" not in str(exc):
            raise
    else:
        raise SystemExit("FAIL hfs-contract: missing upload commit oid did not fail closed")
    if any(name in {"download", "restart_space"} for name, _ in invalid_oid_events):
        raise SystemExit("FAIL hfs-contract: invalid upload oid reached readback or restart")

    moved_events: list[tuple[str, object]] = []
    try:
        run_case(target="production", current_after_upload=MOVED_OID, events=moved_events)
    except SystemExit as exc:
        if "current revision changed after upload" not in str(exc):
            raise
    else:
        raise SystemExit("FAIL hfs-contract: concurrent Space revision change did not fail closed")
    if any(name == "restart_space" for name, _ in moved_events):
        raise SystemExit("FAIL hfs-contract: concurrently changed Space was restarted")

    for invalid_subdomain in (MISSING, None, "", "Invalid_Subdomain"):
        subdomain_events: list[tuple[str, object]] = []
        try:
            run_case(target="production", subdomain=invalid_subdomain, events=subdomain_events)
        except SystemExit as exc:
            if "safe hashed subdomain" not in str(exc):
                raise
        else:
            raise SystemExit(f"FAIL hfs-contract: invalid subdomain was accepted: {invalid_subdomain!r}")
        if any(name == "restart_space" for name, _ in subdomain_events):
            raise SystemExit(f"FAIL hfs-contract: invalid subdomain was restarted: {invalid_subdomain!r}")
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
require_grep 'HFS v3' docs/hfs-alignment.md \
  "docs/hfs-alignment.md must document HFS v3 semantics"
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

printf 'PASS hfs-contract: HFS v3 manifest and Pattern B source-fetch contract are structurally valid\n'
