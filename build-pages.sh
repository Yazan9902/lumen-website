#!/usr/bin/env bash
set -euo pipefail

# Lumen — GitHub Pages (demo/dev) build.
# Produces docs/ : the same static site as dist/, but with the contact form in
# DEMO MODE (no Lambda/API Gateway — submit simulates success client-side) plus
# a .nojekyll file. Publish via GitHub Pages → Deploy from a branch → /docs.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DOCS="$SCRIPT_DIR/docs"

echo "==> Building dist/ (via deploy.sh)"
bash "$SCRIPT_DIR/deploy.sh" >/dev/null

echo "==> Assembling docs/ for GitHub Pages"
rm -rf "$DOCS"
mkdir -p "$DOCS"
cp -R "$SCRIPT_DIR/dist/." "$DOCS/"

# Enable demo mode: data-demo on <html> makes the contact form simulate success.
tmp="$(mktemp)"
sed 's/<html lang="en" dir="ltr">/<html lang="en" dir="ltr" data-demo="true">/' \
  "$DOCS/index.html" > "$tmp" && mv "$tmp" "$DOCS/index.html"

# Stop GitHub Pages from running Jekyll over the files.
touch "$DOCS/.nojekyll"

# Sanity check
if grep -q 'data-demo="true"' "$DOCS/index.html"; then
  echo "==> Demo mode enabled."
else
  echo "!! WARNING: could not inject data-demo flag — check the <html> tag." >&2
fi

echo ""
echo "==> Done. Publishable site is in: docs/"
echo "    1. Commit this folder to your repo (repo root = lumen-website/)."
echo "    2. GitHub → Settings → Pages → Source: 'Deploy from a branch',"
echo "       Branch: main, Folder: /docs → Save."
echo "    3. Site goes live at https://<user>.github.io/<repo>/"
