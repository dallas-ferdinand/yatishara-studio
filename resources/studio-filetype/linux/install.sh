#!/usr/bin/env bash
# Install .studio MIME + clapperboard icon for Linux (xdg / freedesktop).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MIME_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/mime/packages"
ICON_BASE="${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor"
ICON_NAME="application-vnd.yatishara.studio"

mkdir -p "$MIME_DIR"
install -m 644 "$ROOT/linux/yatishara-studio.xml" "$MIME_DIR/yatishara-studio.xml"

for size in 16 32 48 64 128 256 512; do
  dir="$ICON_BASE/${size}x${size}/mimetypes"
  mkdir -p "$dir"
  install -m 644 "$ROOT/icons/studio-project-${size}.png" "$dir/${ICON_NAME}.png"
done

update-mime-database "${XDG_DATA_HOME:-$HOME/.local/share}/mime" >/dev/null 2>&1 || true
gtk-update-icon-cache -f -t "$ICON_BASE" >/dev/null 2>&1 || true
xdg-mime default "" application/vnd.yatishara.studio >/dev/null 2>&1 || true

echo "Installed Yatishara Studio filetype (application/vnd.yatishara.studio)."
echo "Reopen the file manager (or log out/in) if icons do not refresh."
