import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { requireConfig } from "./client.js";
import { registerGuideResources } from "./resources/guides.js";
import { registerAccountTools } from "./tools/account.js";
import { registerAccountExtraTools } from "./tools/accountExtra.js";
import { registerAssistanceTools } from "./tools/assistance.js";
import { AGENT_BLOCKED_TOOL_NAMES } from "./lib/agentBlockedTools.js";
import { registerAssetTools } from "./tools/assets.js";
import { registerContextTools } from "./tools/context.js";
import { registerDocumentTools } from "./tools/documents.js";
import { registerEditTools } from "./tools/edits.js";
import { registerElementTools } from "./tools/elements.js";
import { registerFolderTools } from "./tools/folders.js";
import { registerGenerationTools } from "./tools/generations.js";
import { registerProductionTools } from "./tools/production.js";
import { registerMessageTools } from "./tools/messages.js";
import { registerSocialTools } from "./tools/social.js";
import { registerNetworkTools } from "./tools/network.js";
import { registerTrashTools } from "./tools/trash.js";
import { registerVoiceTools } from "./tools/voices.js";

requireConfig();

const server = new McpServer({
  name: "yatishara-studio",
  version: "0.8.3",
});

/** When set, Assist/Elements/style write tools are not registered (Agent Mode surface). */
const agentSurface = process.env.STUDIO_MCP_AGENT_SURFACE === "1";

registerGuideResources(server);
registerAccountTools(server);
registerAccountExtraTools(server);
registerContextTools(server);
registerFolderTools(server);
registerAssetTools(server);
registerDocumentTools(server);
if (!agentSurface) {
  registerElementTools(server);
}
registerGenerationTools(server);
registerVoiceTools(server);
if (!agentSurface) {
  // Assist brief/approve tools retired from Agent allowlist; ops MCP keeps them.
  registerAssistanceTools(server);
} else {
  // eslint-disable-next-line no-console
  console.error(
    `[studio-mcp] Agent surface: blocked ${AGENT_BLOCKED_TOOL_NAMES.length} Assist/Elements/style tools`,
  );
}
registerEditTools(server);
registerProductionTools(server);
registerMessageTools(server);
registerSocialTools(server);
registerTrashTools(server);
registerNetworkTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
