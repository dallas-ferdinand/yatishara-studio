import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { requireConfig } from "./client.js";
import { registerAccountTools } from "./tools/account.js";
import { registerAssistanceTools } from "./tools/assistance.js";
import { registerAssetTools } from "./tools/assets.js";
import { registerDocumentTools } from "./tools/documents.js";
import { registerEditTools } from "./tools/edits.js";
import { registerElementTools } from "./tools/elements.js";
import { registerFolderTools } from "./tools/folders.js";
import { registerGenerationTools } from "./tools/generations.js";
import { registerProductionTools } from "./tools/production.js";
import { registerTrashTools } from "./tools/trash.js";
import { registerVoiceTools } from "./tools/voices.js";
requireConfig();
const server = new McpServer({
  name: "yatishara-studio",
  version: "0.3.0"
});
registerAccountTools(server);
registerFolderTools(server);
registerAssetTools(server);
registerDocumentTools(server);
registerElementTools(server);
registerGenerationTools(server);
registerVoiceTools(server);
registerAssistanceTools(server);
registerEditTools(server);
registerProductionTools(server);
registerTrashTools(server);
const transport = new StdioServerTransport();
await server.connect(transport);
