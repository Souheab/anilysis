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
    OUTPUT_MESSAGE="AppImage: $DESKTOP_DIR/release/Anilysis-0.1.0.AppImage"
    ;;
  linux | --linux)
    PACKAGE_SCRIPT="dist:linux"
    OUTPUT_MESSAGE="AppImage: $DESKTOP_DIR/release/Anilysis-0.1.0.AppImage"
    ;;
  win | windows | --win | --windows)
    PACKAGE_SCRIPT="dist:win"
    OUTPUT_MESSAGE="Windows installer and portable app: $DESKTOP_DIR/release/"
    ;;
  pack | --pack)
    PACKAGE_SCRIPT="pack"
    OUTPUT_MESSAGE="Unpacked app: $DESKTOP_DIR/release/$(uname -s | tr '[:upper:]' '[:lower:]')-unpacked"
    ;;
  pack:win | --pack-win)
    PACKAGE_SCRIPT="pack:win"
    OUTPUT_MESSAGE="Unpacked Windows app: $DESKTOP_DIR/release/win-unpacked"
    ;;
  build | --build | --no-package)
    PACKAGE_SCRIPT=""
    OUTPUT_MESSAGE="Built assets: $DESKTOP_DIR/dist"
    ;;
  *)
    echo "Usage: $0 [dist|linux|win|pack|pack:win|build]" >&2
    echo "  dist     Build frontend/backend and create the Linux AppImage (default)." >&2
    echo "  linux    Build frontend/backend and create the Linux AppImage." >&2
    echo "  win      Build frontend/backend and create the Windows installer and portable app." >&2
    echo "  pack     Build frontend/backend and create an unpacked Electron app for this OS." >&2
    echo "  pack:win Build frontend/backend and create an unpacked Windows app." >&2
    echo "  build    Build frontend/backend desktop assets only." >&2
    exit 1
    ;;
esac

if [[ "$PACKAGE_SCRIPT" == *":win" && "$(uname -s)" != MINGW* && "$(uname -s)" != MSYS* && "$(uname -s)" != CYGWIN* ]]; then
  echo "Windows desktop packaging must be run on Windows so PyInstaller can create anilysis-backend.exe." >&2
  exit 1
fi

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
echo "$OUTPUT_MESSAGE"
