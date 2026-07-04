import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { requireConfig } from "./client.js";
import { registerAccountTools } from "./tools/account.js";
import { registerAssetTools } from "./tools/assets.js";
import { registerDocumentTools } from "./tools/documents.js";
import { registerElementTools } from "./tools/elements.js";
import { registerFolderTools } from "./tools/folders.js";
import { registerGenerationTools } from "./tools/generations.js";
import { registerTrashTools } from "./tools/trash.js";
requireConfig();
const server = new McpServer({
    name: "yatishara-studio",
    version: "0.2.2",
});
registerAccountTools(server);
registerFolderTools(server);
registerAssetTools(server);
registerDocumentTools(server);
registerElementTools(server);
registerGenerationTools(server);
registerTrashTools(server);
const transport = new StdioServerTransport();
await server.connect(transport);
