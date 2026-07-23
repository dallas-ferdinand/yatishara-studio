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

- `AI_GATEWAY_API_KEY`
- `GATEWAY_TEXT_MODEL_ID` — prompt enhancement and scripts (default: `google/gemini-3.5-flash`)
- `GATEWAY_ASSISTANT_MODEL_ID` — Studio Assistance multimodal co-pilot (default: `google/gemini-3.5-flash`)
- `GATEWAY_IMAGE_MODEL_ID` — image generation (default: `openai/gpt-image-2`)
- `GATEWAY_VIDEO_MODEL_ID` — video generation (default: `bytedance/seedance-2.0`)
- `ELEVENLABS_API_KEY` — audio generation (voiceover `eleven_v3` + sound effects); Convex secrets only
- `GUIDED_VIDEO_ASSISTANCE_ENABLED` — set `0`/`false` to hide Assistance UI (default on)

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

PayWise Checkout (set on Convex deployment):

- `PAYWISE_API_BASE`
- `PAYWISE_ENVIRONMENT` (`sandbox` or `production`; must match the API host)
- `PAYWISE_SUBSCRIPTION_KEY`
- `PAYWISE_API_KEY`
- `PAYWISE_PAYEE_MOBILE`
- `PAYWISE_ORIGIN_COUNTRY`
- `PAYWISE_IP_ADDRESS` (`127.0.0.1` is permitted by PayWise sandbox; production requires the deployed backend's public egress IP)
- `PAYWISE_PAID_STATUSES` (comma-separated values captured and verified in the target PayWise environment)
- optional contract overrides: `PAYWISE_PENDING_STATUSES`, `PAYWISE_REJECTED_STATUSES`, `PAYWISE_CANCELLED_STATUSES`

Browser return URLs use `SITE_URL`; PayWise notify/callback URLs use `CONVEX_SITE_URL`.
Run `npm run check:launch-env:convex` before release to verify these names exist on the selected Convex deployment.

Preview only:

- `PREVIEW_STUDIO_PASSWORD`

## Convex Notes

- Generation runs in Convex actions. Set `AI_GATEWAY_API_KEY` and all `GATEWAY_*` model IDs on the Convex deployment with `npx convex env set`, not only in `.env.local`.
- For the self-hosted Convex instance (`CONVEX_SELF_HOSTED_URL`), `npx convex dev` and `npx convex env` target that deployment when `.env.local` points at it.
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
