#!/usr/bin/env bash
# Builds scrawnload.zip for Chrome Web Store upload: the runtime extension
# files only, no git metadata, dev harness, docs, or packaging scripts.
set -euo pipefail

cd "$(dirname "$0")/.."

OUT="scrawnload.zip"
rm -f "$OUT"

zip -rq "$OUT" . \
  -x ".git/*" \
  -x ".gitignore" \
  -x ".DS_Store" \
  -x "test/*" \
  -x "scripts/*" \
  -x "*.md" \
  -x "$OUT"

echo "Built $OUT ($(du -h "$OUT" | cut -f1))"
unzip -l "$OUT" | tail -1
