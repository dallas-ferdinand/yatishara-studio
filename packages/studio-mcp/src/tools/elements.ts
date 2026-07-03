import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { jsonResult, studioFetch } from "../client.js";

export function registerElementTools(server: McpServer) {
  server.tool(
    "studio_list_elements",
    "List creative elements (characters, props, locations, docs).",
    {
      type: z.enum(["character", "prop", "location", "doc"]).optional(),
    },
    async ({ type }) => {
      const query = type ? `?type=${encodeURIComponent(type)}` : "";
      return jsonResult(await studioFetch(`/elements${query}`));
    },
  );

  server.tool(
    "studio_get_element",
    "Get an element by ID.",
    { elementId: z.string() },
    async ({ elementId }) =>
      jsonResult(await studioFetch(`/elements/${encodeURIComponent(elementId)}`)),
  );

  server.tool(
    "studio_create_element",
    "Create a creative element (character, prop, location, or doc). Requires write scope.",
    {
      type: z.enum(["character", "prop", "location", "doc"]),
      name: z.string(),
      description: z.string().optional(),
      folderId: z.string().optional(),
      sourceAssetIds: z.array(z.string()).optional(),
      sourceDocumentId: z.string().optional(),
    },
    async ({ type, name, description, folderId, sourceAssetIds, sourceDocumentId }) =>
      jsonResult(
        await studioFetch("/elements", {
          method: "POST",
          body: JSON.stringify({
            type,
            name,
            description,
            folderId,
            sourceAssetIds,
            sourceDocumentId,
          }),
        }),
      ),
  );
}
