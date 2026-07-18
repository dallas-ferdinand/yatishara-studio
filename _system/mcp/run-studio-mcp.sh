#!/usr/bin/env bash
# Yatishara Studio MCP — local install on VPS (like MercuryOS MCP launchers).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV="${STUDIO_ENV_FILE:-$ROOT/.env.local}"
MCP_ENV="$ROOT/_system/env/studio-mcp.env"
NODE="${STUDIO_NODE:-$(command -v node)}"
MCP_PKG="$ROOT/packages/studio-mcp"
ENTRY="$MCP_PKG/dist/index.js"

load_var() {
  local key="$1" file="$2"
  local line=""
  [[ -f "$file" ]] || return 0
  line="$(grep -E "^${key}=" "$file" 2>/dev/null | tail -1 || true)"
  [[ -n "$line" ]] || return 0
  export "${key}=${line#${key}=}"
}

for file in "$MCP_ENV" "$ENV"; do
  load_var STUDIO_API_KEY "$file"
  load_var STUDIO_API_URL "$file"
  load_var NEXT_PUBLIC_CONVEX_SITE_URL "$file"
  load_var CONVEX_SITE_URL "$file"
done

export STUDIO_API_URL="${STUDIO_API_URL:-${NEXT_PUBLIC_CONVEX_SITE_URL:-${CONVEX_SITE_URL:-}}}"
export STUDIO_API_URL="${STUDIO_API_URL%/}"

if [[ -z "${STUDIO_API_KEY:-}" ]]; then
  echo "studio-mcp: set STUDIO_API_KEY in $MCP_ENV or $ENV (Studio → Settings → API keys)" >&2
  exit 1
fi

if [[ -z "$STUDIO_API_URL" ]]; then
  echo "studio-mcp: set STUDIO_API_URL or CONVEX_SITE_URL in $ENV" >&2
  exit 1
fi

needs_build=0
if [[ ! -f "$ENTRY" ]]; then
  needs_build=1
else
  # Rebuild when any src file is newer than the entry bundle.
  while IFS= read -r -d '' src; do
    if [[ "$src" -nt "$ENTRY" ]]; then
      needs_build=1
      break
    fi
  done < <(find "$MCP_PKG/src" -type f -name '*.ts' -print0 2>/dev/null)
fi

if [[ "$needs_build" -eq 1 ]]; then
  echo "studio-mcp: rebuilding dist (src newer or missing)" >&2
  if [[ -f "$MCP_PKG/package.json" ]]; then
    (cd "$MCP_PKG" && npm run build) >&2
  else
    echo "studio-mcp: missing $MCP_PKG — cannot build" >&2
    exit 1
  fi
fi

if [[ ! -f "$ENTRY" ]]; then
  echo "studio-mcp: missing build — run: cd $MCP_PKG && npm run build" >&2
  exit 1
fi

exec "$NODE" "$ENTRY"
