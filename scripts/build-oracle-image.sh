#!/usr/bin/env bash
set -euo pipefail
repo_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repo_dir"
if ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
  echo 'Démarre Docker Desktop sur le Mac, puis relance ce script.' >&2
  exit 1
fi
image_tag=localhost/vivre-la-langue:oracle
artifact_dir="$repo_dir/deploy/artifacts"
mkdir -p "$artifact_dir"
docker buildx build --platform linux/amd64 --load --tag "$image_tag" --file dockerfile .
archive_tmp=$(mktemp "$artifact_dir/vivre-oracle.XXXXXX")
trap 'rm -f "$archive_tmp"' EXIT
docker image save "$image_tag" | gzip -c > "$archive_tmp"
mv "$archive_tmp" "$artifact_dir/vivre-oracle-amd64.tar.gz"
shasum -a 256 "$artifact_dir/vivre-oracle-amd64.tar.gz"
echo "Image linux/amd64 prête : $artifact_dir/vivre-oracle-amd64.tar.gz"
