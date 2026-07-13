#!/usr/bin/env bash
# Generate favicon, OG, extension icons, and Chrome Web Store assets from the brand logo.
#
# Usage:
#   ./scripts/generate-brand-assets.sh [path-to-logo.png]
#
# Defaults to public/brand/logo-full.png if no path given.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOGO="${1:-$ROOT/public/brand/logo-full.png}"
EXT_SIGNED_OUT="${EXT_SIGNED_OUT:-$ROOT/docs/store-assets/source-extension-signed-out.png}"
EXT_SIGNED_IN="${EXT_SIGNED_IN:-$ROOT/docs/store-assets/source-extension-signed-in.png}"
BRAND="$ROOT/public/brand"
STORE="$ROOT/docs/store-assets"
DESKTOP="$HOME/Desktop/simply-cws-upload"
ICONS="$ROOT/apps/extension/public/icons"

if [[ ! -f "$LOGO" ]]; then
  echo "ERROR: logo not found at $LOGO"
  exit 1
fi

mkdir -p "$BRAND" "$STORE" "$DESKTOP" "$ICONS"

cp "$LOGO" "$BRAND/logo-full.png"

magick "$LOGO" -crop 46%x100%+0+0 +repage -background white -gravity center -extent 1024x1024 "$BRAND/icon-mark-1024.png"

for size in 16 32 48 128; do
  magick "$BRAND/icon-mark-1024.png" -resize "${size}x${size}" "$ICONS/icon${size}.png"
  cp "$ICONS/icon${size}.png" "$BRAND/favicon-${size}.png"
done

magick "$BRAND/favicon-16.png" "$BRAND/favicon-32.png" "$BRAND/favicon-48.png" "$BRAND/favicon.ico"
magick "$BRAND/icon-mark-1024.png" -resize 180x180 "$BRAND/apple-touch-icon.png"

magick -size 1200x630 xc:white \
  \( "$LOGO" -resize 900x \) -gravity center -composite \
  "$ROOT/public/og-image.png"

magick "$BRAND/icon-mark-1024.png" -resize 128x128 -alpha off -background white "$STORE/store-icon-128.png"

magick -size 1280x800 xc:'#f3ebe3' \
  \( "$LOGO" -resize 760x \) -gravity center -composite \
  "$STORE/screenshot-01-brand-1280x800.png"

if [[ -f "$EXT_SIGNED_OUT" ]]; then
  magick -size 1280x800 xc:'#f3ebe3' \
    \( "$EXT_SIGNED_OUT" -resize 520x \) -gravity center -composite \
    "$STORE/screenshot-02-extension-signed-out-1280x800.png"
fi

if [[ -f "$EXT_SIGNED_IN" ]]; then
  magick -size 1280x800 xc:'#f3ebe3' \
    \( "$EXT_SIGNED_IN" -resize 520x \) -gravity center -composite \
    "$STORE/screenshot-03-extension-signed-in-1280x800.png"
fi

magick "$STORE/screenshot-01-brand-1280x800.png" -resize 440x280^ -gravity center -extent 440x280 "$STORE/promo-small-440x280.png"
magick "$STORE/screenshot-01-brand-1280x800.png" -resize 1400x560^ -gravity center -extent 1400x560 "$STORE/promo-marquee-1400x560.png"

cp "$STORE"/store-icon-128.png "$STORE"/screenshot-*-1280x800.png "$STORE"/promo-*.png "$DESKTOP"/ 2>/dev/null || true

echo "Brand assets generated."
echo "  Web:      $ROOT/public/og-image.png, $BRAND/"
echo "  Extension icons: $ICONS/"
echo "  CWS upload:    $DESKTOP/"
