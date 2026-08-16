#!/usr/bin/env bash
# Studio VPS fast-deploy — warm Next build + thin image swap (~30–90s warm).
# Day-to-day prod ships. Formal releases still use push → GHA → GHCR → Coolify.
#
# Usage:
#   bash scripts/studio-fast-deploy.sh
#   bash scripts/studio-fast-deploy.sh --with-convex
#   bash scripts/studio-fast-deploy.sh --skip-build   # reuse existing .next/standalone
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

COOLIFY_UUID="${COOLIFY_APP_UUID:-y2po9nswpdem975f1zo47u19}"
IMAGE_REPO="${STUDIO_FAST_IMAGE_REPO:-ghcr.io/dallas-ferdinand/yatishara-studio}"
SMOKE_URL="${STUDIO_SMOKE_URL:-https://studio.yatishara.com}"
WITH_CONVEX=0
SKIP_BUILD=0

for arg in "$@"; do
  case "$arg" in
    --with-convex) WITH_CONVEX=1 ;;
    --skip-build) SKIP_BUILD=1 ;;
    -h|--help)
      sed -n '2,12p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown arg: $arg" >&2
      exit 2
      ;;
  esac
done

log() { printf '[studio-fast] %s\n' "$*"; }
die() { printf '[studio-fast] ERROR: %s\n' "$*" >&2; exit 1; }

[[ -d node_modules ]] || die "node_modules missing — run npm ci in $ROOT first"
command -v docker >/dev/null || die "docker required"
command -v npm >/dev/null || die "npm required"

SHA="$(git rev-parse --short=12 HEAD 2>/dev/null || echo nogit)"
FAST_TAG="fast-${SHA}"
LOCAL_IMAGE="yatishara-studio:${FAST_TAG}"
PUBLISH_IMAGE="${IMAGE_REPO}:${FAST_TAG}"

# Live Coolify-managed container (label coolify.name = app uuid).
LIVE_ID="$(docker ps -qf "label=coolify.name=${COOLIFY_UUID}" | head -n1 || true)"
[[ -n "$LIVE_ID" ]] || die "No running Coolify container with label coolify.name=${COOLIFY_UUID}"

LIVE_NAME="$(docker inspect -f '{{.Name}}' "$LIVE_ID" | sed 's#^/##')"
log "live container: ${LIVE_NAME} (${LIVE_ID:0:12})"

# Refuse Convex-only dirty trees without --with-convex (frontend-only ok).
if [[ "$WITH_CONVEX" -eq 0 ]]; then
  CONVEX_DIRTY="$(git status --porcelain -- convex 2>/dev/null || true)"
  OTHER_DIRTY="$(git status --porcelain -- . ':!convex' 2>/dev/null || true)"
  if [[ -n "$CONVEX_DIRTY" && -z "$OTHER_DIRTY" ]]; then
    die "Working tree only has convex/ changes — re-run with --with-convex"
  fi
  if [[ -n "$CONVEX_DIRTY" ]]; then
    log "WARN: convex/ is dirty but --with-convex not set; deploying frontend only"
  fi
fi

if [[ "$WITH_CONVEX" -eq 1 ]]; then
  log "deploying Convex functions…"
  npx convex deploy --yes
fi

# Bake the same NEXT_PUBLIC_* prod uses (from live container, then .env.local).
read_env_from_container() {
  local key="$1"
  docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$LIVE_ID" \
    | awk -F= -v k="$key" '$1==k {print substr($0, index($0,"=")+1); exit}'
}

read_env_file() {
  local key="$1" file="$2"
  [[ -f "$file" ]] || return 0
  awk -F= -v k="$key" '
    $1==k {
      v=substr($0, index($0,"=")+1)
      gsub(/\r$/, "", v)
      print v
      exit
    }
  ' "$file"
}

resolve_public() {
  local key="$1" fallback="${2:-}"
  local v
  v="$(read_env_from_container "$key")"
  if [[ -z "$v" ]]; then
    v="$(read_env_file "$key" "$ROOT/.env.local")"
  fi
  if [[ -z "$v" ]]; then
    v="$(read_env_file "$key" "$ROOT/docs/coolify-env.example")"
  fi
  printf '%s' "${v:-$fallback}"
}

export NEXT_PUBLIC_CONVEX_URL
export NEXT_PUBLIC_CONVEX_SITE_URL
export NEXT_PUBLIC_STUDIO_BG_CDN
export NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY
export NEXT_PUBLIC_DESK_BUILD

NEXT_PUBLIC_CONVEX_URL="$(resolve_public NEXT_PUBLIC_CONVEX_URL)"
NEXT_PUBLIC_CONVEX_SITE_URL="$(resolve_public NEXT_PUBLIC_CONVEX_SITE_URL)"
NEXT_PUBLIC_STUDIO_BG_CDN="$(resolve_public NEXT_PUBLIC_STUDIO_BG_CDN)"
NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY="$(resolve_public NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY)"
NEXT_PUBLIC_DESK_BUILD="fast-${SHA}-$(date -u +%Y%m%d%H%M%S)"

[[ -n "$NEXT_PUBLIC_CONVEX_URL" ]] || die "NEXT_PUBLIC_CONVEX_URL unresolved"
[[ -n "$NEXT_PUBLIC_CONVEX_SITE_URL" ]] || die "NEXT_PUBLIC_CONVEX_SITE_URL unresolved"

log "NEXT_PUBLIC_DESK_BUILD=${NEXT_PUBLIC_DESK_BUILD}"

STARTED_AT="$(date +%s)"

if [[ "$SKIP_BUILD" -eq 0 ]]; then
  log "next build (warm cache if present)…"
  npm run build
else
  log "skipping next build (--skip-build)"
fi

[[ -f .next/standalone/server.js ]] || die "missing .next/standalone/server.js — build failed or output:standalone off"
[[ -d .next/static ]] || die "missing .next/static"

STAGE="$(mktemp -d /tmp/studio-fast-XXXXXX)"
ENV_FILE=""
LABEL_FILE=""
cleanup() {
  rm -rf "$STAGE"
  [[ -n "$ENV_FILE" ]] && rm -f "$ENV_FILE" "${ENV_FILE}.tmp" 2>/dev/null || true
  [[ -n "$LABEL_FILE" ]] && rm -f "$LABEL_FILE" "${LABEL_FILE}.keys" 2>/dev/null || true
}
trap cleanup EXIT

log "staging thin image context in ${STAGE}"
cp -a .next/standalone/. "$STAGE/"
mkdir -p "$STAGE/.next/static"
cp -a .next/static/. "$STAGE/.next/static/"
if [[ -d public ]]; then
  mkdir -p "$STAGE/public"
  cp -a public/. "$STAGE/public/"
fi
cp "$ROOT/Dockerfile.fast" "$STAGE/Dockerfile"

log "docker build ${LOCAL_IMAGE}"
docker build -t "$LOCAL_IMAGE" -t "$PUBLISH_IMAGE" "$STAGE"

ENV_FILE="$(mktemp /tmp/studio-fast-env-XXXXXX)"
LABEL_FILE="$(mktemp /tmp/studio-fast-labels-XXXXXX)"
docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$LIVE_ID" >"$ENV_FILE"
grep -vE '^(SOURCE_COMMIT|COOLIFY_CONTAINER_NAME)=' "$ENV_FILE" >"${ENV_FILE}.tmp" || true
mv "${ENV_FILE}.tmp" "$ENV_FILE"
grep -vE '^NEXT_PUBLIC_DESK_BUILD=' "$ENV_FILE" >"${ENV_FILE}.tmp" || true
mv "${ENV_FILE}.tmp" "$ENV_FILE"
printf 'NEXT_PUBLIC_DESK_BUILD=%s\n' "$NEXT_PUBLIC_DESK_BUILD" >>"$ENV_FILE"
printf 'SOURCE_COMMIT=%s\n' "fast-${SHA}" >>"$ENV_FILE"
printf 'COOLIFY_CONTAINER_NAME=%s\n' "$LIVE_NAME" >>"$ENV_FILE"

docker inspect -f '{{range $k,$v := .Config.Labels}}{{println $k}}{{end}}' "$LIVE_ID" >"${LABEL_FILE}.keys"
: >"$LABEL_FILE"
while IFS= read -r key; do
  [[ -n "$key" ]] || continue
  [[ "$key" == "com.docker.compose.image" ]] && continue
  val="$(docker inspect -f "{{index .Config.Labels \"$key\"}}" "$LIVE_ID")"
  printf '%s=%s\n' "$key" "$val" >>"$LABEL_FILE"
done <"${LABEL_FILE}.keys"
printf 'yatishara.studio.fast_deploy=%s\n' "$FAST_TAG" >>"$LABEL_FILE"

BACKUP_NAME="${LIVE_NAME}-pre-fast-${STARTED_AT}"
log "swapping container (backup=${BACKUP_NAME})"
docker stop "$LIVE_NAME" >/dev/null
docker rename "$LIVE_NAME" "$BACKUP_NAME"

RUN_ARGS=(
  -d
  --name "$LIVE_NAME"
  --network coolify
  --restart unless-stopped
  --env-file "$ENV_FILE"
)
while IFS= read -r line; do
  [[ -n "$line" ]] || continue
  RUN_ARGS+=(--label "$line")
done <"$LABEL_FILE"

RUN_ARGS+=(
  --health-cmd "curl -sf http://127.0.0.1:3000/api/health >/dev/null || exit 1"
  --health-interval 15s
  --health-timeout 5s
  --health-start-period 60s
  --health-retries 8
)

if ! docker run "${RUN_ARGS[@]}" "$LOCAL_IMAGE"; then
  log "run failed — restoring backup"
  docker rename "$BACKUP_NAME" "$LIVE_NAME" 2>/dev/null || true
  docker start "$LIVE_NAME" >/dev/null || true
  die "docker run failed; attempted restore of ${BACKUP_NAME}"
fi

log "waiting for health…"
NEW_ID="$(docker ps -qf "name=^/${LIVE_NAME}$" | head -n1 || true)"
[[ -n "$NEW_ID" ]] || die "new container not running"

healthy=0
for _ in $(seq 1 40); do
  status="$(docker inspect -f '{{.State.Health.Status}}' "$NEW_ID" 2>/dev/null || echo starting)"
  if [[ "$status" == "healthy" ]]; then
    healthy=1
    break
  fi
  if [[ "$status" == "unhealthy" ]]; then
    break
  fi
  sleep 2
done

if [[ "$healthy" -ne 1 ]]; then
  log "health failed — rolling back to ${BACKUP_NAME}"
  docker stop "$LIVE_NAME" >/dev/null 2>&1 || true
  docker rm "$LIVE_NAME" >/dev/null 2>&1 || true
  docker rename "$BACKUP_NAME" "$LIVE_NAME"
  docker start "$LIVE_NAME" >/dev/null
  die "new container unhealthy; rolled back"
fi

docker rm "$BACKUP_NAME" >/dev/null 2>&1 || true

log "smoke ${SMOKE_URL}"
code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "$SMOKE_URL" || echo 000)"
[[ "$code" == "200" || "$code" == "307" || "$code" == "302" ]] \
  || die "smoke HTTP ${code} from ${SMOKE_URL}"

ELAPSED=$(( $(date +%s) - STARTED_AT ))
log "OK — ${PUBLISH_IMAGE} live on ${SMOKE_URL} in ${ELAPSED}s"
log "note: Coolify UI may show prior GHCR tag until the next GHA release"
