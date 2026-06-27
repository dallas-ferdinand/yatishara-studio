# Yatishara Studio Launch Checklist

## Human Inputs Needed

- Create/approve a dedicated Git repo for `/opt/yatishara-studio` before Coolify deploy.
- Activate the configured BytePlus ModelArk models in Ark Console; the API key works, but calls return `ModelNotOpen`.
- Resend DNS verification complete for `yatishara.com`.
- Add/confirm Studio bank account details from the super-admin Settings panel after first login.

## Repo Findings

- `convex/http.ts` added for Convex Auth HTTP routes.
- `middleware.ts` added for Convex Auth Next.js routing.
- Web Push env names normalized across frontend, Convex actions, `.env.example`, and Coolify env.
- Next.js now uses standalone server/container output for production auth and Coolify.
- Docker deployment artifacts added.
- Coolify app `y2po9nswpdem975f1zo47u19` created for `https://studio.yatishara.com` with env set; source repo must be updated after dedicated Studio repo exists.
- Bunny Studio Storage/Pull/Stream resources created and saved to local/Coolify env.

## Verification Gates

- `CONVEX_AGENT_MODE=anonymous npx convex dev --once --typecheck disable --tail-logs disable`
- `npm run typecheck`
- `npm run build`
- `docker build -t yatishara-studio:launch-check .`
- Local Docker smoke returns HTTP 200.
- OTP sign-in works on `studio.yatishara.com`.
- Bunny upload and signed read work. Completed locally against live Bunny API.
- BytePlus image generation works after Ark model activation.
- Seedance v2 task creation/poll/import works after Ark model activation.
- Bank payment approval grants credits and sends notifications.
- Web push subscription and delivery work.
