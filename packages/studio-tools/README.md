# @yatishara/studio-tools

Transport-neutral Studio tool catalog shared by:

- **Pi Agent worker** (`catalog` / `describe` / `invoke`)
- **MCP** (`packages/studio-mcp`) — external agents
- **Convex Agent Mode** — capability auth + approval policy

## Surfaces

| Surface | Meaning |
|---------|---------|
| `agent` | In-app Studio Agent Mode |
| `mcp` | External MCP clients |
| `admin` | Admin/super_admin only |

Retired Assist/Elements/style tools stay on `mcp` only (not `agent`).

## Policy

- `read` / `safe_write` → execute directly
- `paid` / `destructive` / `outbound` / `admin` → approval card

## Tests

```bash
node --test packages/studio-tools/tests/*.test.js
```
