import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { jsonResult, studioFetch } from "../client.js";

export function registerAccountTools(server: McpServer) {
  server.tool(
    "studio_health",
    "Validate API key and return account info plus credit balance. Prefer studio_bootstrap at session start (includes this + tree + hints).",
    {},
    async () => jsonResult(await studioFetch("/account")),
  );

  server.tool(
    "studio_credit_balance",
    "Alias of studio_health — account info + credit balance.",
    {},
    async () => jsonResult(await studioFetch("/account")),
  );
}
