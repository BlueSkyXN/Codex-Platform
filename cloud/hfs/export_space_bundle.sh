#!/usr/bin/env bash
set -euo pipefail

out_dir="${1:?usage: bash cloud/hfs/export_space_bundle.sh /path/to/out_dir}"
repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
hfs_dir="${repo_root}/cloud/hfs"
commit="${CODEX_PLATFORM_COMMIT:-$(git -C "${repo_root}" rev-parse HEAD)}"
ref="${CODEX_PLATFORM_REF:-main}"

rm -rf "${out_dir}"
mkdir -p "${out_dir}"

cp "${hfs_dir}/README.md" "${out_dir}/README.md"
cp "${hfs_dir}/hfs-dev.toml" "${out_dir}/hfs-dev.toml"
cp "${hfs_dir}/.dockerignore" "${out_dir}/.dockerignore"
sed \
  -e "s/^ARG CODEX_PLATFORM_REF=.*/ARG CODEX_PLATFORM_REF=${ref}/" \
  -e "s/^ARG CODEX_PLATFORM_COMMIT=.*/ARG CODEX_PLATFORM_COMMIT=${commit}/" \
  "${hfs_dir}/Dockerfile" > "${out_dir}/Dockerfile"

cat > "${out_dir}/BUILD_SOURCE.txt" <<EOT
source_repo=https://github.com/BlueSkyXN/Codex-Platform.git
source_ref=${ref}
source_commit=${commit}
bundle_generated_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
EOT

echo "Exported Codex-Platform HFS bundle to ${out_dir}"
