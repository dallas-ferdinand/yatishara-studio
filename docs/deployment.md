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
2. Push `main` (or run **Docker publish** workflow). GitHub Actions builds the image on GitHub runners.
3. Image publishes to `ghcr.io/dallas-ferdinand/yatishara-studio` (`:latest` + commit sha).
4. Workflow patches Coolify’s image tag and triggers deploy — Coolify **pulls only** (no `npm`/`next` on the VPS).
5. Smoke `https://studio.yatishara.com`.

Manual Coolify pull deploy (after an image exists):

```bash
curl -fsS -X POST -H "Authorization: Bearer $COOLIFY_ACCESS_TOKEN" \
  "https://coolify.yatishara.com/api/v1/deploy?uuid=y2po9nswpdem975f1zo47u19&force=false"
```

Do not run production deploy commands from local development unless intentionally releasing.

## Coolify/VPS Notes

- Build pack: **dockerimage** (prebuilt GHCR image). Not dockerfile-on-VPS.
- Image: `ghcr.io/dallas-ferdinand/yatishara-studio` (public package).
- `Dockerfile` uses Node 22 Alpine, `npm ci`, `npm run build`, and Next standalone output — built in GitHub Actions.
- `NEXT_PUBLIC_*` values are build-args in Actions (repo variables). Runtime secrets stay in Coolify.
- `next.config.ts` sets `output: "standalone"` for the production image.
- App secrets belong in Coolify or the Convex deployment, not in committed files.
- Convex Auth server env must also be set on the Studio Convex deployment when used by Convex functions.
- Keep `yatishara-studio-preview` **stopped** during deploys so the VPS is not CPU-starved.

## Production Env Groups

Use `docs/coolify-env.example` as the production shape. Values in that file are placeholders or public endpoints; keep real secrets in Coolify/Convex.

Set these on Coolify for the Next app:

- public Convex URLs: `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CONVEX_SITE_URL`
- server URLs: `CONVEX_SELF_HOSTED_URL`, `CONVEX_SITE_URL`, `SITE_URL`
- auth/email/WhatsApp: `AUTH_SECRET`, `AUTH_RESEND_KEY`, `AUTH_RESEND_FROM`, `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE`
- admin bootstrap: `STUDIO_SUPER_ADMIN_EMAIL`, `STUDIO_SUPER_ADMIN_PHONE`, `STUDIO_WHATSAPP_NUMBER`
- generation: `AI_GATEWAY_API_KEY`, `GATEWAY_TEXT_MODEL_ID`, `GATEWAY_IMAGE_MODEL_ID`, `GATEWAY_VIDEO_MODEL_ID`
- Bunny: storage, CDN signing, stream library, stream access key vars
- public wallpapers: `NEXT_PUBLIC_STUDIO_BG_CDN=https://yatishara-studio-assets.b-cdn.net/studio/wallpapers/v1` (unsigned; upload via `node scripts/upload-studio-wallpapers.mjs`)
- web push: VAPID public/private vars and `WEB_PUSH_SUBJECT`
- preview service only: `PREVIEW_STUDIO_PASSWORD`

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
- `AI_GATEWAY_API_KEY`
- Gateway model ID vars (`GATEWAY_*`)
- Bunny vars
- web push vars
- billing default vars

## Preview Hot Reload

Preview runs at `https://preview.studio.yatishara.com` and exists for rapid review. It is not the production Coolify app.

Repo files involved:

- `src/proxy.ts`: detects preview host or configured preview password, then requires the gate cookie before normal Convex Auth middleware.
- `src/app/preview-gate/route.ts`: renders the password page and sets the gate cookie after a correct password.
- `src/lib/preview-gate.ts`: owns `PREVIEW_STUDIO_PASSWORD`, preview host, cookie name, and token hashing.
- `next.config.ts`: allows HMR from `preview.studio.yatishara.com`.

External VPS pieces, documented here but not committed:

- systemd service: `/etc/systemd/system/yatishara-studio-preview.service`
- Traefik dynamic route: `/data/coolify/proxy/dynamic/yatishara-studio-preview.yaml`

Preview architecture:

1. systemd runs the repo with Next dev on the VPS.
2. Traefik routes `preview.studio.yatishara.com` to that dev server.
3. Browser requests hit `src/proxy.ts`.
4. If the gate cookie is missing, the user is redirected to `/preview-gate`.
5. Correct `PREVIEW_STUDIO_PASSWORD` stores a 12-hour HTTP-only cookie.
6. Convex Auth middleware then handles the normal app session.

Never write the preview password into docs, git history, or terminal output. Refer to `PREVIEW_STUDIO_PASSWORD`.

## Verification

Before production deploy:

```bash
npm run check:launch-env
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
- Submit a bank top-up receipt and review from admin account.
- Run image/video generation only after AI Gateway model IDs are configured.
- Confirm notifications and generated assets are saved.

Preview smoke:

- Open `https://preview.studio.yatishara.com`.
- Enter `PREVIEW_STUDIO_PASSWORD`.
- Confirm redirect back to requested path.
- Edit a harmless UI file and confirm HMR refreshes.
- Confirm normal Studio auth still works after the gate.

## Troubleshooting

- Preview shows `Preview password is not configured.`: set `PREVIEW_STUDIO_PASSWORD` in the preview service environment and restart systemd.
- Preview loops to the gate: confirm the request host is `preview.studio.yatishara.com`, cookie path is `/`, and browser accepts secure cookies.
- HMR websocket fails: confirm Traefik forwards websocket upgrades and `allowedDevOrigins` includes the preview host.
- DNS or cert failure: check `preview.studio.yatishara.com`/`studio.yatishara.com` DNS, Traefik route, and certificate issuance logs.
- Convex Auth callback mismatch: align `SITE_URL`, `CONVEX_SITE_URL`, `NEXT_PUBLIC_CONVEX_URL`, and `NEXT_PUBLIC_CONVEX_SITE_URL` between Coolify and Convex.
- Convex generated API mismatch: run `npx convex dev` against the intended deployment and restart the Next process.
- OTP email missing: verify `AUTH_RESEND_KEY`, `AUTH_RESEND_FROM`, Resend domain status, and Convex env.
- WhatsApp OTP missing: verify `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE`, and sender number env.
- AI Gateway auth or model errors: verify `AI_GATEWAY_API_KEY` and `GATEWAY_*_MODEL_ID` values in Convex env.
