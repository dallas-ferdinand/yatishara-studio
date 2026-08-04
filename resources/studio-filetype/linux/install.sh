#!/usr/bin/env bash
# Install .studio MIME + clapperboard icon + open handler (Linux / freedesktop).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA="${XDG_DATA_HOME:-$HOME/.local/share}"
BIN="${XDG_BIN_HOME:-$HOME/.local/bin}"
MIME_DIR="$DATA/mime/packages"
ICON_BASE="$DATA/icons/hicolor"
APP_DIR="$DATA/applications"
ICON_NAME="application-vnd.yatishara.studio"

mkdir -p "$MIME_DIR" "$APP_DIR" "$BIN"
install -m 644 "$ROOT/linux/yatishara-studio.xml" "$MIME_DIR/yatishara-studio.xml"
install -m 644 "$ROOT/linux/yatishara-studio.desktop" "$APP_DIR/yatishara-studio.desktop"
install -m 755 "$ROOT/linux/yatishara-studio-open" "$BIN/yatishara-studio-open"

# Ensure ~/.local/bin is on PATH for desktop Exec=
if [[ ":$PATH:" != *":$BIN:"* ]]; then
  echo "Note: add $BIN to your PATH so double-click open works (e.g. in ~/.profile)."
fi

for size in 16 32 48 64 128 256 512; do
  dir="$ICON_BASE/${size}x${size}/mimetypes"
  mkdir -p "$dir"
  install -m 644 "$ROOT/icons/studio-project-${size}.png" "$dir/${ICON_NAME}.png"
  # Also under apps/ so the .desktop Icon= resolves
  apps="$ICON_BASE/${size}x${size}/apps"
  mkdir -p "$apps"
  install -m 644 "$ROOT/icons/studio-project-${size}.png" "$apps/${ICON_NAME}.png"
done

update-mime-database "$DATA/mime" >/dev/null 2>&1 || true
update-desktop-database "$APP_DIR" >/dev/null 2>&1 || true
gtk-update-icon-cache -f -t "$ICON_BASE" >/dev/null 2>&1 || true
xdg-icon-resource forceupdate >/dev/null 2>&1 || true

xdg-mime default yatishara-studio.desktop application/vnd.yatishara.studio >/dev/null 2>&1 || true

echo "Installed Yatishara Studio filetype:"
echo "  MIME  application/vnd.yatishara.studio"
echo "  Icon  $ICON_NAME"
echo "  Open  yatishara-studio.desktop → Studio web + import hint"
echo
echo "Reopen the file manager (killall nautilus 2>/dev/null || true)."
echo "Test:  xdg-mime query filetype /path/to/file.studio"
