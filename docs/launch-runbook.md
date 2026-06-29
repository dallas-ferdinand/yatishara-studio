# Yatishara Studio Launch Runbook

For broader architecture, local setup, production deployment, and preview hot reload details, see `docs/architecture.md`, `docs/development.md`, and `docs/deployment.md`.

## Current Deployment Target

- App: `https://studio.yatishara.com`
- Coolify app UUID: `y2po9nswpdem975f1zo47u19`
- Coolify project: `My first project`
- Coolify environment: `production`
- Source repo: `https://github.com/dallas-ferdinand/yatishara-studio`
- Branch: `main`
- Base directory: `/`
- Build pack: Dockerfile
- Port: `3000`

## Required Human Gates

1. Keep `/opt/yatishara-studio` pushed to the dedicated GitHub repo before deploys.
2. In BytePlus Ark Console, activate the configured ModelArk models:
   - enhancement: `BYTEPLUS_ENHANCEMENT_MODEL_ID`
   - text/script: `BYTEPLUS_TEXT_MODEL_ID`
   - image: `BYTEPLUS_IMAGE_LOW_MODEL_ID`, `BYTEPLUS_IMAGE_MEDIUM_MODEL_ID`, `BYTEPLUS_IMAGE_HIGH_MODEL_ID`
   - video: `BYTEPLUS_VIDEO_MODEL_ID`
3. Trigger Coolify deploy for app `y2po9nswpdem975f1zo47u19`.
4. Complete first OTP login with `STUDIO_SUPER_ADMIN_EMAIL`, then use Settings to:
   - seed style presets,
   - confirm pricing,
   - add/confirm bank account details.

## Verification Commands

```bash
npm run check:launch-env
npm run typecheck
npm run build
docker build -t yatishara-studio:launch-check .
docker run --rm --env-file .env.local -p 3007:3000 yatishara-studio:launch-check
```

Local Docker smoke should return HTTP 200 from `http://127.0.0.1:3007/`.

## Convex Auth Server Env

Set these on the dedicated Studio Convex deployment (`https://convex-studio-api.yatishara.com`), not only in Coolify:

- `JWT_PRIVATE_KEY`
- `JWKS`
- `SITE_URL=https://studio.yatishara.com`
- `CONVEX_SITE_URL=https://convex-studio.yatishara.com`
- `AUTH_RESEND_KEY`
- `AUTH_RESEND_FROM`
- `EVOLUTION_API_URL`
- `EVOLUTION_API_KEY`
- `EVOLUTION_INSTANCE`

## Preview Hot Reload

- URL: `https://preview.studio.yatishara.com`
- Password env var: `PREVIEW_STUDIO_PASSWORD`
- Repo code: `src/proxy.ts`, `src/app/preview-gate/route.ts`, `src/lib/preview-gate.ts`, `next.config.ts`
- External VPS files: `/etc/systemd/system/yatishara-studio-preview.service` and `/data/coolify/proxy/dynamic/yatishara-studio-preview.yaml`

The preview gate sets a short-lived HTTP-only cookie before normal Convex Auth middleware runs. Do not document or print the actual preview password.

## Provider Smoke Status

- Bunny Storage: live tiny upload returned `201`.
- Bunny signed CDN read: live signed GET returned `200`.
- BytePlus ModelArk: API key and `/api/v3/models` work, but generation/text calls return `ModelNotOpen` until models are activated in Ark Console.
- Web push: VAPID keys are generated and configured; browser permission/subscription must be tested on the live HTTPS domain.
- Resend: API key/env are configured; DNS verification may still depend on provider propagation.

## Live Smoke Checklist

- Visit `https://studio.yatishara.com`.
- Sign in via OTP email.
- Confirm root folder and billing account are created.
- Use Settings as super admin to seed presets, save pricing, and add bank account details.
- Upload a tiny image/file and verify it appears in the asset list.
- Create a script/document and insert it into prompt context.
- Submit a bank top-up receipt and approve it from admin payment review.
- Confirm credits increase after approval.
- Enable browser push notifications.
- Run one image generation after BytePlus models are active.
- Run one video generation after BytePlus video model is active.
- Confirm completion notification and generated asset saved to the linked folder.
