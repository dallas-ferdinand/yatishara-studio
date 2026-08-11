# Studio Agent Pi worker

Canonical Agent Mode runtime. Convex `agentActions.sendTurn` posts
`POST /v1/turn` when `STUDIO_AGENT_URL` is set. There is **no** silent
AI-SDK fallback — misconfig fails closed.

## Production / preview (this VPS)

```bash
sudo systemctl status yatishara-studio-agent
curl -sS http://127.0.0.1:8796/health
```

Env file: `/etc/yatishara-studio/studio-agent.env`  
Convex must reach the worker via Coolify gateway (same pattern as CS Ops):

- `STUDIO_AGENT_URL=http://10.0.1.1:8796`
- `STUDIO_AGENT_WORKER_TOKEN` (shared with worker env)
- `STUDIO_AGENT_KEY_SECRET` (BYOK at rest)
- `STUDIO_API_URL=https://convex-studio.yatishara.com`

Worker listens on `0.0.0.0:8796` so Docker Convex can call it.

UFW must allow Coolify/docker bridges (same pattern as studio-cs `:8795`):

```bash
sudo ufw allow from 10.0.0.0/8 to any port 8796 proto tcp
sudo ufw allow from 172.16.0.0/12 to any port 8796 proto tcp
sudo ufw deny 8796/tcp
```

Without those rules, Convex actions fail with `fetch failed`.

## Platform model (required)

Worker harness: `services/studio-agent/.pi-harness/` (BytePlus Ark Seed 2.0 Pro).

Env (same secrets file):

- `ARK_API_KEY` — ModelArk key (same as Convex generation)
- `ARK_BASE_URL` — optional; defaults in models.json
- `STUDIO_AGENT_MODEL_ID` — default `seed-2-0-pro-260328`

Do **not** use `~/.pi/agent` for the worker (that can pick a personal ZAI key and return empty “Done.”). Empty/error model replies fail closed — never fake success.

## Local one-shot

```bash
cd services/studio-agent
npm install
export STUDIO_AGENT_WORKER_TOKEN=dev
npm start
```

Tools: `catalog` / `describe` / `invoke` / `inspect` / `remember` / `skills` / `plan`
from `piTools.mjs`. Studio HTTP via `@yatishara/studio-tools`.
Harness extras: lean catalog, intent lanes, compact observations, hot-tool
schemas, verify-after-act, markdown skill packs in `skills/` (Studio branding
only — prompt craft + ops), plan todos, trajectory logs.

Agent loads packs via `skills {id}` (progressive disclosure). Prompt packs:
`prompt-image`, `prompt-cinematic`, `prompt-hypermotion`, `prompt-video-models`,
`project-plan`. No third-party cinema brand names in skill text.

```bash
npm test   # golden harness evals (no LLM)
```

MCP is not on the in-app path.

Do **not** register raw JSON-Schema tools with `execute(args)` — Pi expects
`execute(toolCallId, params, signal, onUpdate, ctx)` and TypeBox schemas.

## Script edits + billing

- Prefer **`studio_patch_document`** for small Script edits.
- Ledger = **BytePlus list COGS ×2**, then **round up to next TT$0.50**
  (same clean step as image/video — whole credits).
  - input @ $0.50/M (Seed Pro ≤128k)
  - cache hit @ $0.10/M
  - cache write → storage $0.008333/M/hour × 1h (never full input rate)
  - output @ $3.00/M
- Floor TT$0.50 (1 credit). `usageJson` on the charge stores the token breakdown.
