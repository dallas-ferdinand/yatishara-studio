# Self-hosted Convex + VPS ffmpeg worker

All Studio ffmpeg (export, edit-proxy, clip download, speed, frame pull,
help-answer preview) runs on **`studio-ffmpeg-worker`**, not inside the Convex
Node isolate. Convex enqueues `POST /v1/jobs` and returns or polls a job row.
There is no in-process ffmpeg fallback.

## Layout

| Piece | Where |
|---|---|
| Worker | `/opt/yatishara-studio/services/studio-ffmpeg-worker` |
| Compose | same folder (`container_name: studio-ffmpeg-worker`) |
| Env | `/opt/studio-ffmpeg-worker.env` (`chmod 600`) |
| Live Convex | `STUDIO_FFMPEG_WORKER_URL=http://studio-ffmpeg-worker:8797` |
| Preview Convex | same URL (coolify network) |

Job kinds: `export`, `proxy`, `clip-download`, `speed`, `natural-speed`,
`pull-frame`, `sample-frames`, `help-preview`.

The worker downloads from Bunny, runs ffmpeg, uploads, then callbacks
`https://convex-studio.yatishara.com/api/ffmpeg-worker/*` (or preview site origin).

Editor export is ffmpeg `filter_complex` (overlay, xfade, drawtext) on this
worker. Live preview still paints with Canvas2D in the browser; that path is
not used for export.

## Rebuild / restart worker

```bash
cd /opt/yatishara-studio/services/studio-ffmpeg-worker
npm run build   # esbuild → dist/server.mjs (tsx cannot load convex/lib on Node 22)
docker compose up -d --build
docker exec studio-ffmpeg-worker ffmpeg -version | head -1
# Health is docker-network only; from a Convex backend:
docker exec convex-studio-backend node -e "fetch('http://studio-ffmpeg-worker:8797/health').then(r=>r.text()).then(console.log)"
```

## Convex backend

Do **not** shell ffmpeg from Convex actions. `convex/lib/studioFfmpeg.ts` and
`studioExportPipeline.ts` exist so the worker can bundle them; they are not
called from live actions. The custom `yatishara-convex-backend:ffmpeg` image
may still contain binaries; they are unused.

Editor export returns after enqueue (`exportJobs` poll). MCP/API clip-download,
speed, and frame-pull still wait on `ffmpegWorkJobs` inside the action, so keep
the long HTTP/action timeouts until those APIs are job+poll too.

Required backend env (docker `.env` on each Convex stack **and** `npx convex env set`
so HTTP actions see the token):

- `STUDIO_FFMPEG_WORKER_URL=http://studio-ffmpeg-worker:8797`
- `STUDIO_FFMPEG_WORKER_TOKEN` (same as worker env)
- `CONVEX_SITE_ORIGIN` (already set; worker callbacks use this)

After changing docker `.env`, recreate only the backend container. Then
`npx convex deploy --yes --typecheck=disable` to each API
(`https://convex-studio-api.yatishara.com` and
`https://convex-preview-api.yatishara.com`).
