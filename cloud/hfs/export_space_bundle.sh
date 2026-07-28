#!/usr/bin/env bash
set -euo pipefail

out_dir="${1:?usage: bash cloud/hfs/export_space_bundle.sh /path/to/out_dir}"
repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
hfs_dir="${repo_root}/cloud/hfs"
manifest_file="${HFS_MANIFEST:-${hfs_dir}/hfs-dev.toml}"
requested_commit="${CODEX_PLATFORM_COMMIT:-HEAD}"
ref="${CODEX_PLATFORM_REF:-${requested_commit}}"

case "${manifest_file}" in
  /*) ;;
  *) manifest_file="${repo_root}/${manifest_file}" ;;
esac

if [[ ! -f "${manifest_file}" ]]; then
  printf 'HFS manifest not found: %s\n' "${manifest_file}" >&2
  exit 1
fi

resolve_commit() {
  local revision=$1
  local resolved

  if ! resolved=$(git -C "${repo_root}" rev-parse --verify "${revision}^{commit}" 2>/dev/null); then
    printf 'Unable to resolve %s to a Git commit SHA.\n' "${revision}" >&2
    exit 1
  fi
  printf '%s\n' "${resolved}"
}

commit=$(resolve_commit "${requested_commit}")
ref_commit=$(resolve_commit "${ref}")

sed_replacement() {
  printf '%s' "$1" | sed -e 's/[&|\\]/\\&/g'
}

escaped_commit=$(sed_replacement "${commit}")
escaped_ref=$(sed_replacement "${ref}")

rm -rf "${out_dir}"
mkdir -p "${out_dir}"

cp "${hfs_dir}/README.md" "${out_dir}/README.md"
cp "${manifest_file}" "${out_dir}/hfs-dev.toml"
cp "${hfs_dir}/.dockerignore" "${out_dir}/.dockerignore"
sed \
  -e "s|^ARG CODEX_PLATFORM_REF=.*|ARG CODEX_PLATFORM_REF=${escaped_ref}|" \
  -e "s|^ARG CODEX_PLATFORM_COMMIT=.*|ARG CODEX_PLATFORM_COMMIT=${escaped_commit}|" \
  "${hfs_dir}/Dockerfile" > "${out_dir}/Dockerfile"

cat > "${out_dir}/BUILD_SOURCE.txt" <<EOT
source_repo=https://github.com/BlueSkyXN/Codex-Platform.git
source_ref=${ref}
source_ref_commit=${ref_commit}
source_commit=${commit}
bundle_generated_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
EOT

printf 'Exported Codex-Platform HFS bundle to %s\n' "${out_dir}"
