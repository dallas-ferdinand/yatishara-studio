# Architecture Notes

Yatishara Studio is a browser-based creative workspace backed by Convex. The UI keeps the MercuryOS desktop feel while the backend owns identity, files, generation state, billing, and notifications.

## Request Flow

1. `src/app/page.tsx` renders `StudioClientPage`.
2. `src/components/studio-client-page.tsx` dynamically loads the client app with SSR disabled.
3. `src/components/studio-app-client.tsx` wraps Studio in `ConvexClientProvider` and `StudioAuthGate`.
4. `src/studio/components/StudioShell.tsx` owns the main workspace UI and calls Convex functions.
5. `src/proxy.ts` runs before app routes. Preview traffic is password-gated first, then Convex Auth middleware runs.

## Frontend Areas

- `src/studio/components/`: Studio-specific auth gate and main shell.
- `src/desk/components/`: explorer, editors, tab strip, media viewer, dialogs, and mobile shell pieces reused by Studio.
- `src/desk/lib/`: workspace state helpers, uploads, markdown handling, rich editor support, drag/drop, and file utilities.
- `src/mos-app/`: MercuryOS runtime modules for gateway sessions, voice, settings, workspaces, device state, and rendering.
- `src/mos-shared/`: shared markdown/chat UI model code.
- `src/mos-css/` and `src/app/globals.css`: MercuryOS/Studio styling.

## Convex Backend

- `convex/schema.ts`: app data model and indexes.
- `convex/auth.ts`, `convex/auth.config.ts`, `convex/http.ts`: Convex Auth providers and HTTP routes.
- `convex/lib/customFunctions.ts`: `authedQuery`, `authedMutation`, `adminQuery`, and `adminMutation` wrappers.
- `convex/users.ts`: current user, account details, and first-run Studio defaults.
- `convex/folders.ts`, `convex/assets.ts`, `convex/documents.ts`, `convex/elements.ts`: workspace content APIs.
- `convex/generation.ts`: generation threads, events, jobs, entitlement checks, and state transitions.
- `convex/generationActions.ts`: Node action that calls Vercel AI Gateway and stores generated outputs.
- `convex/guidedVideo.ts`, `convex/guidedVideoActions.ts`, `convex/lib/guidedVideoTypes.ts`, `convex/lib/hypermotionWorkflow.ts`, `convex/lib/assistedAnalysis.ts`: Studio Assistance co-pilot — mode-agnostic brief/question/review flow (image, video, script, element). Video types such as `hypermotion_ad` inject specialized requirements; generation only starts after approval.
- `convex/billing.ts`: credits, pricing, PayWise settlement helpers, legacy bank review, subscriptions, and audit events.
- `convex/paywiseActions.ts`, `convex/paywiseHttp.ts`, `convex/lib/paywise.ts`, `convex/crons.ts`: PayWise hosted checkout, notify/callback settlement, and pending-payment reconciliation.
- `convex/notifications.ts`, `convex/notificationsActions.ts`: in-app notifications and web push.
- `convex/lib/bunny.ts`: Bunny Storage/CDN path, upload, and signed URL helpers.
- `convex/lib/aiGateway.ts`: Vercel AI Gateway prompt, image, and video helpers.
- `convex/apiKeys.ts`, `convex/studioApiInternal.ts`, `convex/studioApiHttp.ts`, `convex/studioApiActions.ts`: REST API v1 (`/api/v1/*`) with Bearer API keys, rate limits, and audit logging. See [docs/api.md](./api.md).
- `packages/studio-mcp`: stdio MCP server exposing Studio tools for Cursor and other agents.

## Data Domains

- Identity: Convex Auth tables plus Studio `users`, admin invites, roles, WhatsApp auth requests.
- Workspace: folders, assets, documents, and elements owned by each user.
- Generation: style presets, threads, prompt/result/assistant/question/review events, jobs, inputs, outputs, and Assisted briefs (`guidedBriefs` / attachments).
- Billing: accounts, transactions, plans, subscriptions, pricing, payments (PayWise + legacy bank), optional legacy receipts.
- Messaging: notifications, push subscriptions, and admin audit events.

## External Services

- Convex: app backend, auth HTTP routes, schema, and reactive client data.
- Bunny: storage, pull zone signed reads, and stream/media backing.
- Vercel AI Gateway: prompt enhancement, image generation, and video generation (Seedream / Seedance via ByteDance).
- Resend: email OTP delivery.
- Evolution API: WhatsApp OTP delivery.
- Web Push: browser push notification delivery.
- PayWise: hosted card checkout for credit top-ups (`/payments/request` + status verify).
- Coolify/VPS: production app build, runtime, proxy, and preview hot reload service.
