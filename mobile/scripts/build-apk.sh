#!/usr/bin/env bash
# Build a debug APK for sideloading Yatishara Studio.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(cd "$ROOT/.." && pwd)"
OUT_DIR="$ROOT/dist-apk"
mkdir -p "$OUT_DIR"

cd "$ROOT"
node scripts/generate-icons.mjs
npx cap sync android

bash scripts/ensure-android-sdk.sh

cd "$ROOT/android"
chmod +x ./gradlew
./gradlew assembleDebug --no-daemon

APK_SRC="$ROOT/android/app/build/outputs/apk/debug/app-debug.apk"
APK_DST="$OUT_DIR/yatishara-studio-debug.apk"
cp -f "$APK_SRC" "$APK_DST"

echo ""
echo "APK ready: $APK_DST"
echo "Install: adb install -r \"$APK_DST\""
echo "Or copy the file to your phone and open it."
ls -lh "$APK_DST"
