#!/usr/bin/env bash
# Build static Next.js desk export → out/
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export NEXT_TELEMETRY_DISABLED=1
bun install --frozen-lockfile 2>/dev/null || bun install
bun run build
node scripts/write-desk2-version.mjs
node scripts/write-sw-precache.mjs
echo "✓ Desk PWA built → $ROOT/out (serve at /)"
