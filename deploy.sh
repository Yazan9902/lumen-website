#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DIST="$SCRIPT_DIR/dist"

echo "==> Cleaning dist/"
rm -rf "$DIST"

echo "==> Pre-deploy checks"
if grep -q 'PLACEHOLDER' "$SCRIPT_DIR/index.html"; then
  echo "ERROR: Found PLACEHOLDER in index.html. Replace Formspree endpoint before deploying."
  exit 1
fi

mkdir -p "$DIST/css" "$DIST/js" "$DIST/i18n" "$DIST/assets"

echo "==> Copying assets"
cp -r "$SCRIPT_DIR/assets/"* "$DIST/assets/"

echo "==> Minifying CSS"
if command -v csso &>/dev/null; then
  csso "$SCRIPT_DIR/css/styles.css" -o "$DIST/css/styles.css"
elif command -v esbuild &>/dev/null; then
  esbuild "$SCRIPT_DIR/css/styles.css" --minify --outfile="$DIST/css/styles.css"
else
  # Simple minification: remove comments, collapse whitespace
  sed -e 's|/\*[^*]*\*\+\([^/*][^*]*\*\+\)*/||g' \
      -e 's/^[[:space:]]*//' \
      -e 's/[[:space:]]*$//' \
      -e '/^$/d' \
      "$SCRIPT_DIR/css/styles.css" | tr -s ' \t' ' ' > "$DIST/css/styles.css"
fi

echo "==> Minifying JS (main.js only — i18n-init.js built from en.json)"
if command -v terser &>/dev/null; then
  terser "$SCRIPT_DIR/js/main.js" -o "$DIST/js/main.js" --compress --mangle
elif command -v esbuild &>/dev/null; then
  esbuild "$SCRIPT_DIR/js/main.js" --minify --outfile="$DIST/js/main.js"
else
  cp "$SCRIPT_DIR/js/main.js" "$DIST/js/main.js"
fi

echo "==> Building i18n-init.js from en.json"
if command -v jq &>/dev/null; then
  echo "window.__i18n = $(jq -c . "$SCRIPT_DIR/i18n/en.json");" > "$DIST/js/i18n-init.js"
else
  echo "window.__i18n = $(cat "$SCRIPT_DIR/i18n/en.json");" > "$DIST/js/i18n-init.js"
fi

echo "==> Copying index.html"
cp "$SCRIPT_DIR/index.html" "$DIST/index.html"

echo "==> Copying i18n files (ar, he)"
cp "$SCRIPT_DIR/i18n/ar.json" "$DIST/i18n/ar.json"
cp "$SCRIPT_DIR/i18n/he.json" "$DIST/i18n/he.json"

echo "==> Done! Output in $DIST/"
ls -lhR "$DIST" | head -40
