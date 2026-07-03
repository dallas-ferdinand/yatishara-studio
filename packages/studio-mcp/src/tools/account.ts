import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { jsonResult, studioFetch } from "../client.js";

export function registerAccountTools(server: McpServer) {
  server.tool(
    "studio_health",
    "Validate API key and return account info plus credit balance. Use to verify STUDIO_API_KEY and STUDIO_API_URL.",
    {},
    async () => jsonResult(await studioFetch("/account")),
  );

  server.tool(
    "studio_credit_balance",
    "Get Studio account info and credit balance (alias of studio_health).",
    {},
    async () => jsonResult(await studioFetch("/account")),
  );
}
