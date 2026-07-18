# Self-hosted Convex backend (ffmpeg)

Studio video export (`convex/videoEditActions.exportVideo`) shells out to `ffmpeg` /
`ffprobe` inside Convex Node actions. The stock
`ghcr.io/get-convex/convex-backend` image does not include those binaries.

## VPS layout

On the Studio VPS the backend lives at `/opt/convex-studio-self-hosted/`:

- `Dockerfile` — extends the official backend and installs `ffmpeg`
- `docker-compose.yml` — builds `yatishara-convex-backend:ffmpeg`
- `.env` — instance secrets (not committed)

This repo keeps a mirror of the Dockerfile at
[`deploy/convex-backend/Dockerfile`](../deploy/convex-backend/Dockerfile).

## Rebuild / restart

```bash
cd /opt/convex-studio-self-hosted
# Keep the Dockerfile in sync with the repo copy when it changes:
#   cp /opt/yatishara-studio/deploy/convex-backend/Dockerfile .
docker compose build backend
docker compose up -d backend
docker exec convex-studio-backend ffmpeg -version | head -1
curl -fsS https://convex-studio-api.yatishara.com/version
```

Memory for the backend service is set to 2G so short exports can download and
encode without OOM. Long multi-clip projects may still need further limits in
the export action.
