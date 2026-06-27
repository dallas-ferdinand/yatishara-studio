# Yatishara Studio Launch Runbook

## Current Deployment Target

- App: `https://studio.yatishara.com`
- Coolify app UUID: `y2po9nswpdem975f1zo47u19`
- Coolify project: `My first project`
- Coolify environment: `production`
- Source repo: pending dedicated Studio repo
- Branch: pending
- Base directory: `/`
- Build pack: Dockerfile
- Port: `3000`

## Required Human Gates

1. Create/approve a dedicated Git repo for `/opt/yatishara-studio`, then push it.
2. In BytePlus Ark Console, activate the configured ModelArk models:
   - enhancement: `BYTEPLUS_ENHANCEMENT_MODEL_ID`
   - image: `BYTEPLUS_IMAGE_LOW_MODEL_ID`, `BYTEPLUS_IMAGE_MEDIUM_MODEL_ID`, `BYTEPLUS_IMAGE_HIGH_MODEL_ID`
   - video: `BYTEPLUS_VIDEO_MODEL_ID`
3. Update Coolify app `y2po9nswpdem975f1zo47u19` to the dedicated Studio repo, then deploy.
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
