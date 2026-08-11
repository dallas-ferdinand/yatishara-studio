# Studio Agent Pi worker

Optional Node service for Agent Mode. Convex `agentActions.sendTurn` calls
`POST /v1/turn` when `STUDIO_AGENT_URL` is set; otherwise the in-process Convex
tool loop runs.

```bash
cd services/studio-agent
npm install
export STUDIO_AGENT_WORKER_TOKEN=dev
export STUDIO_MCP_HTTP_URL=https://…   # Studio MCP HTTP
export STUDIO_MCP_AGENT_SURFACE=1      # hide Assist/Elements tools in MCP child
npm start
```

Convex env (optional):

- `STUDIO_AGENT_URL` — e.g. `http://127.0.0.1:8796`
- `STUDIO_AGENT_WORKER_TOKEN` — shared bearer
- `STUDIO_AGENT_KEY_SECRET` — AES key material for BYOK at rest
- `ANTHROPIC_COMPAT_BASE_URL` — OpenAI-compat proxy if using Anthropic BYOK

Blocked tools (Assist / Elements / style / script generate) match
`AGENT_BLOCKED_TOOL_NAMES` in `server.mjs`, `packages/studio-mcp`, and `convex/agentActions.ts`.
