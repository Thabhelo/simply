#!/usr/bin/env bash
# Build and zip the Chrome extension for Web Store upload.
#
# Usage:
#   ./scripts/package-extension.sh
#   ./scripts/package-extension.sh 0.1.0
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="${1:-$(node -p "require('$ROOT/apps/extension/package.json').version")}"
API_BASE="${VITE_API_BASE:-https://simply-api-k7ux27sa4q-uc.a.run.app}"
WEB_BASE="${VITE_WEB_BASE:-https://usesimply.us}"
OUT_DIR="$ROOT/apps/extension/dist"
ZIP_PATH="$ROOT/public/simply-chrome-extension-${VERSION}.zip"

echo "==> Building Simply extension v${VERSION}"
echo "    API: $API_BASE"
echo "    Web: $WEB_BASE"

cd "$ROOT"
VITE_API_BASE="$API_BASE" \
  VITE_WEB_BASE="$WEB_BASE" \
  npm run build --workspace apps/extension

echo "==> Verifying dist contents..."
for file in manifest.json popup.html popup.js background.js content.js siteAuth.js icons/icon128.png; do
  if [[ ! -f "$OUT_DIR/$file" ]]; then
    echo "ERROR: missing $OUT_DIR/$file"
    exit 1
  fi
done

if grep -q 'localhost' "$OUT_DIR/manifest.json"; then
  echo "ERROR: store manifest must not include localhost host_permissions"
  exit 1
fi

if grep -q '"key"' "$OUT_DIR/manifest.json"; then
  echo "ERROR: store manifest must not include a key field (Chrome Web Store rejects it)"
  exit 1
fi

echo "==> Creating zip..."
rm -f "$ZIP_PATH"
(cd "$OUT_DIR" && zip -qr "$ZIP_PATH" .)

echo ""
echo "Ready for Chrome Web Store upload:"
echo "  $ZIP_PATH"
