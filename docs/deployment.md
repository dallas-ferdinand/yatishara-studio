# Deployment Guide

Production is deployed from the dedicated GitHub repository through Coolify on the VPS. Preview hot reload is a separate VPS service that runs the checked-out repo directly for rapid UI review.

## Production Target

- Public URL: `https://studio.yatishara.com`
- Coolify app UUID: `y2po9nswpdem975f1zo47u19`
- Source repository: `https://github.com/dallas-ferdinand/yatishara-studio`
- Branch: `main`
- Build pack: dockerimage (GHCR pull)
- Image: `ghcr.io/dallas-ferdinand/yatishara-studio`
- Runtime port: `3000`

## Production Flow

1. Verify repo changes locally.
2. Push `main` (or run **Docker publish** workflow).
3. **Convex first:** the workflow’s `deploy-convex` job pushes additive schema/functions (Assistance turn lifecycle, compatibility shims) before building the Next image. Configure `CONVEX_DEPLOY_KEY` and/or `CONVEX_SELF_HOSTED_*` secrets; if unset, deploy Convex manually before Coolify picks up a new frontend.
4. After Convex deploy, run `migrateLegacyAssistanceData` (internal mutation, resumable) until question events and stale `review_ready` briefs without plan fingerprints are cleared.
5. Image publishes to `ghcr.io/dallas-ferdinand/yatishara-studio` (`:latest` + commit sha).
6. Workflow patches Coolify’s image tag and triggers deploy — Coolify **pulls only** (no `npm`/`next` on the VPS).
7. Smoke `https://studio.yatishara.com` (Assistance: composer-only turns, review → Generate; no question cards).

### Assistance rollout (additive)

- Keep `answerQuestions` / `editBrief` / `question` event kind readable until cached clients and legacy rows are gone.
- New frontend never calls those mutations; composer submits `clientTurnId` turns only.
- Cleanup release (later): remove shims, `pendingQuestionsJson` / `questionsJson` writers, and regenerate Convex API after zero legacy rows and zero compatibility callers.

Manual Coolify pull deploy (after an image exists):

```bash
curl -fsS -X POST -H "Authorization: Bearer $COOLIFY_ACCESS_TOKEN" \
  "https://coolify.yatishara.com/api/v1/deploy?uuid=y2po9nswpdem975f1zo47u19&force=false"
```

Do not run production deploy commands from local development unless intentionally releasing.

## Coolify/VPS Notes

- Coolify UI/API public host: `https://coolify.yatishara.com` — Traefik file route `/data/coolify/proxy/dynamic/coolify-ui.yaml` → `http://coolify:8080`. Coolify compose has **no** Traefik labels; without that file the host hits `default_redirect_503` (“no available server”) and GHA `deploy-coolify` fails with HTTP 503. Local API: `http://127.0.0.1:8000`.
- Build pack: **dockerimage** (prebuilt GHCR image). Not dockerfile-on-VPS.
- Image: `ghcr.io/dallas-ferdinand/yatishara-studio` (public package).
- `Dockerfile` uses Node 22 Alpine, `npm ci`, `npm run build`, and Next standalone output — built in GitHub Actions.
- `NEXT_PUBLIC_*` values are build-args in Actions (repo variables). Runtime secrets stay in Coolify.
- `next.config.ts` sets `output: "standalone"` for the production image.
- App secrets belong in Coolify or the Convex deployment, not in committed files.
- Convex Auth server env must also be set on the Studio Convex deployment when used by Convex functions.
- Keep `yatishara-studio-preview` **stopped** during deploys so the VPS is not CPU-starved.

## Convex backend (ffmpeg for video export)

Self-hosted Convex runs at `/opt/convex-studio-self-hosted` as
`convex-studio-backend`. Export requires `ffmpeg`/`ffprobe` in that container —
see [convex-backend-ffmpeg.md](./convex-backend-ffmpeg.md). Rebuild with
`docker compose build backend && docker compose up -d backend` after changing
[`deploy/convex-backend/Dockerfile`](../deploy/convex-backend/Dockerfile).

## Production Env Groups

Use `docs/coolify-env.example` as the production shape. Values in that file are placeholders or public endpoints; keep real secrets in Coolify/Convex.

Set these on Coolify for the Next app:

- public Convex URLs: `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CONVEX_SITE_URL`
- server URLs: `CONVEX_SELF_HOSTED_URL`, `CONVEX_SITE_URL`, `SITE_URL`
- auth/email/WhatsApp: `AUTH_SECRET`, `AUTH_RESEND_KEY`, `AUTH_RESEND_FROM`, `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE`
- admin bootstrap: `STUDIO_SUPER_ADMIN_EMAIL`, `STUDIO_SUPER_ADMIN_PHONE`, `STUDIO_WHATSAPP_NUMBER`
- generation: `ARK_API_KEY`, `GATEWAY_TEXT_MODEL_ID`, `GATEWAY_ASSISTANT_MODEL_ID`, `GATEWAY_DM_IMPROVE_MODEL_ID`, `GATEWAY_IMAGE_MODEL_ID`, `GATEWAY_VIDEO_MODEL_ID`, optional `GUIDED_VIDEO_ASSISTANCE_ENABLED`
- Bunny: storage, CDN signing, stream library, stream access key vars
- public wallpapers: `NEXT_PUBLIC_STUDIO_BG_CDN=https://yatishara-studio-assets.b-cdn.net/studio/wallpapers/v1` (unsigned; upload via `node scripts/upload-studio-wallpapers.mjs`)
- web push: VAPID public/private vars and `WEB_PUSH_SUBJECT`
Set Convex-side env where Convex functions need it:

- `JWT_PRIVATE_KEY`
- `JWKS`
- `SITE_URL`
- `CONVEX_SITE_URL`
- `AUTH_RESEND_KEY`
- `AUTH_RESEND_FROM`
- `EVOLUTION_API_URL`
- `EVOLUTION_API_KEY`
- `EVOLUTION_INSTANCE`
- `STUDIO_SUPER_ADMIN_EMAIL`
- `ARK_API_KEY`
- Gateway model ID vars (`GATEWAY_*`)
- Bunny vars
- web push vars
- Wam vars: `WAM_BUSINESS_ID`, `WAM_API_KEY`, `WAM_ENVIRONMENT` (`staging`|`production`),
  `WAM_WEBHOOK_SECRET` (from Business Portal webhook endpoint). Register
  `POST https://<CONVEX_SITE_URL>/wam/webhooks` in the matching portal.

## Preview Hot Reload

Preview runs at `https://preview.studio.yatishara.com` and exists for rapid review. It is not the production Coolify app.

Repo files involved:

- `src/proxy.ts`: Convex Auth middleware (no password gate).
- `next.config.ts`: allows HMR from `preview.studio.yatishara.com`.

External VPS pieces, documented here but not committed:

- systemd service: `/etc/systemd/system/yatishara-studio-preview.service`
- recycle oneshot + timer: `/etc/systemd/system/yatishara-studio-preview-restart.{service,timer}`
- recycle script: `/usr/local/sbin/yatishara-studio-preview-recycle.sh` (wipes `.next` + `node_modules/.cache`, prunes stopped containers/dangling images, restarts preview every 6h and 5m after boot)
- Traefik dynamic route: `/data/coolify/proxy/dynamic/yatishara-studio-preview.yaml`

Manual recycle:

```bash
sudo /usr/local/sbin/yatishara-studio-preview-recycle.sh
```

Preview architecture:

1. systemd runs the repo with Next dev on the VPS.
2. Traefik routes `preview.studio.yatishara.com` to that dev server.
3. Browser requests hit `src/proxy.ts` → Convex Auth middleware (open preview; no password gate).
4. Sophie Ops avatar/media proxies (`/api/studio-ops/*`) call host `studio-cs` on `:8795`. Inside the preview container that must be `host.docker.internal` / Coolify gateway (`10.0.1.1`), never `127.0.0.1` — same rule as Convex `STUDIO_CS_OPS_URL`.

## Verification

Before production deploy:

```bash
npm run check:launch-env
npm run check:launch-env:convex
npm run lint
npm run typecheck
npm run build
```

Optional container smoke:

```bash
docker build -t yatishara-studio:launch-check .
docker run --rm --env-file .env.local -p 3007:3000 yatishara-studio:launch-check
```

Then open `http://127.0.0.1:3007/` and expect HTTP 200.

Live smoke after deploy:

- Open `https://studio.yatishara.com`.
- Complete OTP sign-in.
- Confirm root folder and billing account exist.
- Upload a small asset and preview signed media.
- Create/edit a document.
- Complete a Wam top-up and confirm credits grant after status verification.
- Run image/video generation only after BytePlus ModelArk model IDs are configured.
- Confirm notifications and generated assets are saved.

Preview smoke:

- Open `https://preview.studio.yatishara.com`.
- Edit a harmless UI file and confirm HMR refreshes.
- Confirm normal Studio auth still works.

## Troubleshooting

- HMR websocket fails: confirm Traefik forwards websocket upgrades and `allowedDevOrigins` includes the preview host.
- DNS or cert failure: check `preview.studio.yatishara.com`/`studio.yatishara.com` DNS, Traefik route, and certificate issuance logs.
- Convex Auth callback mismatch: align `SITE_URL`, `CONVEX_SITE_URL`, `NEXT_PUBLIC_CONVEX_URL`, and `NEXT_PUBLIC_CONVEX_SITE_URL` between Coolify and Convex.
- Convex generated API mismatch: run `npx convex dev` against the intended deployment and restart the Next process.
- OTP email missing: verify `AUTH_RESEND_KEY`, `AUTH_RESEND_FROM`, Resend domain status, and Convex env.
- WhatsApp OTP missing: verify `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE`, and sender number env.
- BytePlus ModelArk auth or model errors: verify `ARK_API_KEY` and `GATEWAY_*_MODEL_ID` values in Convex env.
