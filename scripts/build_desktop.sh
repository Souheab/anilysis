#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESKTOP_DIR="$ROOT_DIR/desktop"
PACKAGE_TARGET="${1:-dist}"

if [[ ! -f "$DESKTOP_DIR/package.json" ]]; then
  echo "Missing desktop/package.json. Create the desktop project before building." >&2
  exit 1
fi

case "$PACKAGE_TARGET" in
  dist | --dist)
    PACKAGE_SCRIPT="dist:linux"
    ;;
  pack | --pack)
    PACKAGE_SCRIPT="pack"
    ;;
  build | --build | --no-package)
    PACKAGE_SCRIPT=""
    ;;
  *)
    echo "Usage: $0 [dist|pack|build]" >&2
    echo "  dist   Build frontend/backend and create the Linux AppImage (default)." >&2
    echo "  pack   Build frontend/backend and create an unpacked Electron app." >&2
    echo "  build  Build frontend/backend desktop assets only." >&2
    exit 1
    ;;
esac

if [[ ! -d "$DESKTOP_DIR/node_modules" ]]; then
  echo "Installing desktop dependencies..."
  npm --prefix "$DESKTOP_DIR" install
fi

echo "Building desktop frontend and backend..."
npm --prefix "$DESKTOP_DIR" run build

if [[ -n "$PACKAGE_SCRIPT" ]]; then
  echo "Packaging desktop app with npm run $PACKAGE_SCRIPT..."
  npm --prefix "$DESKTOP_DIR" run "$PACKAGE_SCRIPT"
fi

echo
echo "Desktop build complete."
if [[ "$PACKAGE_SCRIPT" == "dist:linux" ]]; then
  echo "AppImage: $DESKTOP_DIR/release/Six Degrees of Anime-0.1.0.AppImage"
elif [[ "$PACKAGE_SCRIPT" == "pack" ]]; then
  echo "Unpacked app: $DESKTOP_DIR/release/linux-unpacked"
else
  echo "Built assets: $DESKTOP_DIR/dist"
fi

