# Yatishara Studio

Yatishara Studio is the production creative workspace for Yatishara. It is a Next.js 16, React 19, and Convex app with a MercuryOS-style interface for managing folders, media assets, documents, prompt context, billing, and image/video generation.

Production runs at `https://studio.yatishara.com`. Preview hot reload runs at `https://preview.studio.yatishara.com` behind the `PREVIEW_STUDIO_PASSWORD` gate.

## Main Domains

- Studio workspace: folder tree, tabs, editors, media preview, uploads, prompt composer, and settings.
- Auth and users: Convex Auth with email OTP and WhatsApp OTP, plus admin/super-admin roles.
- Assets and documents: Bunny-backed uploads, signed reads, documents, character/prop/location/doc elements.
- Generation: prompt enhancement plus Vercel AI Gateway image/video generation (Seedream / Seedance), saved outputs, generation threads, events, and notifications.
- Billing: credit accounts, pricing, bank transfer receipts, admin review, subscriptions, and audit events.
- Notifications: in-app notifications and web push subscriptions.

## Repo Map

- `src/app/`: Next.js App Router entry points, Convex client provider, preview gate route.
- `src/proxy.ts`: Next.js proxy that applies preview password gating, then Convex Auth middleware.
- `src/studio/components/StudioShell.tsx`: main Studio application shell.
- `src/desk/`, `src/mos-app/`, `src/mos-shared/`, `src/mos-css/`: MercuryOS UI/runtime pieces reused by Studio.
- `convex/`: Convex schema, auth, public functions, internal functions, actions, and provider integrations.
- `convex/lib/`: shared Convex helpers for auth wrappers, Bunny storage, and AI Gateway calls.
- `docs/`: operational docs and launch/deployment notes.
- `Dockerfile`: Coolify production image using Next.js standalone output.
- `scripts/check-launch-env.mjs`: local launch env completeness check.

## Local Development

```bash
npm install
cp .env.example .env.local
npm run dev
```

`npm run dev` starts `npx convex dev` and `next dev` together. Keep secrets in `.env.local`; do not commit real values. See `docs/development.md` for env groups, Convex rules, verification, and common local issues.

## Verification

For docs-only changes:

```bash
git diff --check
```

For code or config changes:

```bash
npm run typecheck
npm run build
```

Before launch/deploy checks:

```bash
npm run check:launch-env
```

## Docs

- `docs/architecture.md`: app shape, frontend/backend domains, and key files.
- `docs/development.md`: setup, env vars, Convex notes, verification, troubleshooting.
- `docs/deployment.md`: Coolify/VPS production deploy plus preview hot reload architecture.
- `docs/launch-runbook.md`: launch target and smoke checklist.
- `docs/launch-checklist.md`: human gates and final launch verification.
