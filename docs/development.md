# Development Guide

## Prerequisites

- Node.js 22, matching the production Docker image.
- npm, using `package-lock.json`.
- Convex CLI through `npx convex dev`.
- Access to non-production service credentials when testing integrations.

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

`npm run dev` runs both `npm run dev:convex` and `npm run dev:next`. Use `npx convex dev` for development, not `npx convex deploy`.

## Useful Scripts

- `npm run dev`: start Convex dev and Next dev together.
- `npm run dev:next`: start only Next.js.
- `npm run dev:convex`: start only Convex dev.
- `npm run typecheck`: run TypeScript without emitting files.
- `npm run build`: run the Next production build.
- `npm run lint`: run ESLint.
- `npm run check:launch-env`: check required launch env names in `.env.local` and the process env.

## Environment Variables

Use `.env.example` as the local template. Keep real secrets out of git and docs.

Core app and Convex:

- `NEXT_PUBLIC_CONVEX_URL`
- `NEXT_PUBLIC_CONVEX_SITE_URL`
- `CONVEX_SELF_HOSTED_URL`
- `CONVEX_SITE_URL`
- `SITE_URL`

Auth and messaging:

- `AUTH_SECRET`
- `AUTH_RESEND_KEY`
- `AUTH_RESEND_FROM`
- `RESEND_API_KEY`
- `EVOLUTION_API_URL`
- `EVOLUTION_API_KEY`
- `EVOLUTION_INSTANCE`
- `STUDIO_SUPER_ADMIN_EMAIL`
- `STUDIO_SUPER_ADMIN_PHONE`
- `STUDIO_WHATSAPP_NUMBER`

Generation:

- `BYTEPLUS_ARK_API_KEY`
- `BYTEPLUS_ARK_BASE_URL`
- `BYTEPLUS_ENHANCEMENT_MODEL_ID`
- `BYTEPLUS_TEXT_MODEL_ID`
- `BYTEPLUS_IMAGE_LOW_MODEL_ID`
- `BYTEPLUS_IMAGE_MEDIUM_MODEL_ID`
- `BYTEPLUS_IMAGE_HIGH_MODEL_ID`
- `BYTEPLUS_VIDEO_MODEL_ID`

Storage, video, and push:

- `BUNNY_STORAGE_ZONE`
- `BUNNY_STORAGE_REGION`
- `BUNNY_STORAGE_ACCESS_KEY`
- `BUNNY_PULL_ZONE_HOSTNAME`
- `BUNNY_CDN_SIGNING_KEY`
- `BUNNY_STREAM_LIBRARY_ID`
- `BUNNY_STREAM_ACCESS_KEY`
- `WEB_PUSH_VAPID_PUBLIC_KEY`
- `WEB_PUSH_VAPID_PRIVATE_KEY`
- `NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY`
- `WEB_PUSH_SUBJECT`

Billing defaults:

- `STUDIO_BANK_NAME`
- `STUDIO_BANK_ACCOUNT_NAME`
- `STUDIO_BANK_ACCOUNT_NUMBER`
- `STUDIO_BANK_ACCOUNT_TYPE`

Preview only:

- `PREVIEW_STUDIO_PASSWORD`

## Convex Notes

- Public Convex functions should define `args` and `returns` validators.
- User data should go through `authedQuery`/`authedMutation`; admin-only flows should use `adminQuery`/`adminMutation`.
- Prefer indexed queries from `convex/schema.ts` over `.filter()` scans.
- Never use `Date.now()` inside Convex queries; pass time from the client when needed.
- Use `"use node"` only in action files that need Node APIs or SDKs. Do not export queries/mutations from those files.
- Schedule internal functions, not public `api.*` functions.
- Keep generated files in `convex/_generated/` untouched.

## Verification Checklist

Docs-only change:

```bash
git diff --check
```

Code/config change:

```bash
npm run typecheck
npm run build
```

Launch-sensitive change:

```bash
npm run check:launch-env
npm run typecheck
npm run build
```

Browser smoke:

- Open local app and complete OTP sign-in.
- Confirm root Studio folder appears.
- Upload a small file and preview it.
- Create or edit a document.
- Open Settings and verify pricing/billing areas load.
- Run generation only when using test-safe provider credentials.

## Troubleshooting

- Convex API mismatch: restart `npm run dev:convex`, let `_generated` refresh, then restart `npm run dev:next`.
- Missing auth routes or OTP callback issues: confirm `CONVEX_SITE_URL`, `SITE_URL`, `NEXT_PUBLIC_CONVEX_URL`, and `NEXT_PUBLIC_CONVEX_SITE_URL` point to the same environment.
- Empty app after sign-in: confirm `NEXT_PUBLIC_CONVEX_URL` is set and reachable from the browser.
- Provider calls fail: verify service-specific env names are set in Convex when code runs in Convex actions.
- HMR blocked on preview host: confirm `allowedDevOrigins` in `next.config.ts` includes `preview.studio.yatishara.com`.
- Web push fails locally: use HTTPS-capable environment for real subscription testing.
