#!/usr/bin/env bash
# Build the Claude Desktop one-click bundle (.mcpb).
#
# Stages dist/ + data snapshot + production node_modules + mcpb/manifest.json into a
# temp dir, then packs it with the official mcpb CLI. Requires: npm run build first,
# and an icon at mcpb/icon.png (512x512).
#
# Usage: scripts/build_mcpb.sh [output.mcpb]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(node -p "require('$ROOT/package.json').version")"
OUT="${1:-$ROOT/tariff-resolver-$VERSION.mcpb}"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

test -d "$ROOT/dist" || { echo "dist/ missing — run: npm run build" >&2; exit 1; }
test -f "$ROOT/mcpb/icon.png" || { echo "mcpb/icon.png missing (512x512 PNG)" >&2; exit 1; }

cp -R "$ROOT/dist" "$STAGE/"
mkdir -p "$STAGE/data"
cp "$ROOT/data/hts_full.json" "$ROOT/data/hts_meta.json" "$STAGE/data/"
cp "$ROOT/package.json" "$ROOT/package-lock.json" "$ROOT/LICENSE" "$STAGE/"
cp "$ROOT/mcpb/manifest.json" "$STAGE/manifest.json"
cp "$ROOT/mcpb/icon.png" "$STAGE/icon.png"

# manifest version must match package.json
MANIFEST_V="$(node -p "require('$STAGE/manifest.json').version")"
if [ "$MANIFEST_V" != "$VERSION" ]; then
  echo "mcpb/manifest.json version ($MANIFEST_V) != package.json version ($VERSION)" >&2
  exit 1
fi

(cd "$STAGE" && npm ci --omit=dev --ignore-scripts >/dev/null 2>&1)
npx -y @anthropic-ai/mcpb pack "$STAGE" "$OUT"
echo "Built: $OUT"
