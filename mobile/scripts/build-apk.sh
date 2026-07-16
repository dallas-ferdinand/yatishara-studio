#!/usr/bin/env bash
# Build a release APK that loads the live Studio site (https://studio.yatishara.com).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT/dist-apk"
mkdir -p "$OUT_DIR"

cd "$ROOT"
node scripts/generate-icons.mjs
npx cap sync android

bash scripts/ensure-android-sdk.sh

cd "$ROOT/android"
chmod +x ./gradlew
./gradlew assembleRelease --no-daemon

APK_SRC="$ROOT/android/app/build/outputs/apk/release/app-release.apk"
APK_DST="$OUT_DIR/yatishara-studio.apk"
cp -f "$APK_SRC" "$APK_DST"

echo ""
echo "APK ready: $APK_DST"
echo "Loads: https://studio.yatishara.com"
echo "Install: adb install -r \"$APK_DST\""
ls -lh "$APK_DST"
