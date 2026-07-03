# Yatishara Studio Launch Checklist

## Human Inputs Needed

- Keep dedicated GitHub repo `dallas-ferdinand/yatishara-studio` pushed before Coolify deploys.
- Confirm `AI_GATEWAY_API_KEY` and `GATEWAY_*` model IDs are set on the Convex deployment.
- Resend DNS verification complete for `yatishara.com`.
- Add/confirm Studio bank account details from the super-admin Settings panel after first login.

## Repo Findings

- `convex/http.ts` added for Convex Auth HTTP routes.
- `src/proxy.ts` handles preview password gating and then Convex Auth Next.js routing.
- `src/app/preview-gate/route.ts` and `src/lib/preview-gate.ts` implement the preview hot-reload password gate.
- Web Push env names normalized across frontend, Convex actions, `.env.example`, and Coolify env.
- Next.js now uses standalone server/container output for production auth and Coolify.
- Docker deployment artifacts added.
- Coolify app `y2po9nswpdem975f1zo47u19` created for `https://studio.yatishara.com` with env set and source set to dedicated Studio repo.
- Bunny Studio Storage/Pull/Stream resources created and saved to local/Coolify env.
- Current onboarding docs live in `README.md`, `docs/architecture.md`, `docs/development.md`, and `docs/deployment.md`.

## Verification Gates

- `CONVEX_AGENT_MODE=anonymous npx convex dev --once --typecheck disable --tail-logs disable`
- `npm run typecheck`
- `npm run build`
- `docker build -t yatishara-studio:launch-check .`
- Local Docker smoke returns HTTP 200.
- Preview gate unlocks with `PREVIEW_STUDIO_PASSWORD` and HMR works on `preview.studio.yatishara.com`.
- OTP sign-in works on `studio.yatishara.com`.
- Bunny upload and signed read work. Completed locally against live Bunny API.
- AI Gateway image generation works with `GATEWAY_IMAGE_MODEL_ID` (`openai/gpt-image-2`).
- Seedance 2.0 video generation works with `GATEWAY_VIDEO_MODEL_ID`.
- Bank payment approval grants credits and sends notifications.
- Web push subscription and delivery work.
