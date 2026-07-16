#!/usr/bin/env bash
# Install a minimal Android SDK (cmdline-tools + platform 35 + build-tools) if missing.
set -euo pipefail

SDK_ROOT="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-$HOME/Android/Sdk}}"
export ANDROID_SDK_ROOT="$SDK_ROOT"
export ANDROID_HOME="$SDK_ROOT"

CMDLINE_DIR="$SDK_ROOT/cmdline-tools/latest"
SDKMANAGER="$CMDLINE_DIR/bin/sdkmanager"

if [[ ! -x "$SDKMANAGER" ]]; then
  echo "Installing Android command-line tools into $SDK_ROOT ..."
  mkdir -p "$SDK_ROOT/cmdline-tools"
  TMP="$(mktemp -d)"
  ZIP="$TMP/cmdline-tools.zip"
  # Pin a known cmdline-tools package; update URL if Google rotates it.
  curl -fsSL -o "$ZIP" \
    "https://dl.google.com/android/repository/commandlinetools-linux-13114758_latest.zip"
  unzip -q "$ZIP" -d "$TMP"
  rm -rf "$CMDLINE_DIR"
  mkdir -p "$SDK_ROOT/cmdline-tools"
  mv "$TMP/cmdline-tools" "$CMDLINE_DIR"
  rm -rf "$TMP"
fi

yes | "$SDKMANAGER" --sdk_root="$SDK_ROOT" --licenses >/tmp/android-sdk-licenses.log 2>&1 || true

yes | "$SDKMANAGER" --sdk_root="$SDK_ROOT" \
  "platforms;android-35" \
  "build-tools;35.0.0" \
  "platform-tools" >/tmp/android-sdk-install.log 2>&1 || {
  echo "sdkmanager failed; last 40 log lines:"
  tail -n 40 /tmp/android-sdk-install.log
  exit 1
}

# Capacitor / Gradle look for local.properties next to the android project.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cat > "$ROOT/android/local.properties" <<EOF
sdk.dir=$SDK_ROOT
EOF

echo "Android SDK ready at $SDK_ROOT"
