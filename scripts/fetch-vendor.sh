#!/usr/bin/env bash
# Downloads the vendored third-party libraries into vendor/.
# Files are committed to the repo so the extension loads unpacked with no
# build step; re-run this script only to upgrade versions.
set -euo pipefail

cd "$(dirname "$0")/.."

FFMPEG_VERSION="0.12.15"
UTIL_VERSION="0.12.2"
CORE_VERSION="0.12.10"
HLSJS_VERSION="1.6.16"

mkdir -p vendor/ffmpeg

fetch() {
  local url="$1" dest="$2"
  echo "→ $dest"
  curl -fsSL "$url" -o "$dest"
}

fetch "https://unpkg.com/@ffmpeg/ffmpeg@${FFMPEG_VERSION}/dist/umd/ffmpeg.js" vendor/ffmpeg/ffmpeg.js
fetch "https://unpkg.com/@ffmpeg/ffmpeg@${FFMPEG_VERSION}/dist/umd/814.ffmpeg.js" vendor/ffmpeg/814.ffmpeg.js
fetch "https://unpkg.com/@ffmpeg/util@${UTIL_VERSION}/dist/umd/index.js" vendor/ffmpeg/util.js
fetch "https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/umd/ffmpeg-core.js" vendor/ffmpeg/ffmpeg-core.js
fetch "https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/umd/ffmpeg-core.wasm" vendor/ffmpeg/ffmpeg-core.wasm
fetch "https://unpkg.com/hls.js@${HLSJS_VERSION}/dist/hls.min.js" vendor/hls.min.js

echo
ls -lh vendor/ vendor/ffmpeg/
