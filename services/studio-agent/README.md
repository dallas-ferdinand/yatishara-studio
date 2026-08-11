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

## Local one-shot

```bash
cd services/studio-agent
npm install
export STUDIO_AGENT_WORKER_TOKEN=dev
npm start
```

Tools: dynamic `catalog` / `describe` / `invoke` from `@yatishara/studio-tools`
→ Studio `/api/v1` with a short-lived per-user `ysa_cap_*` capability.
MCP is not on the in-app path.
