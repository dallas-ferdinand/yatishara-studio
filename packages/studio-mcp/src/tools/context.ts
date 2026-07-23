import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AGENT_START_HERE, jsonResult, studioFetch } from "../client.js";

export function registerContextTools(server: McpServer) {
  server.tool(
    "studio_bootstrap",
    "[preferred] Start here. One-shot: account/credits + workspace tree + agent start-here hints. Optionally pass folderId or path for project_context. Replaces separate health + tree + BFS list_folders.",
    {
      folderId: z.string().optional().describe("Include project_context for this folder"),
      path: z
        .string()
        .optional()
        .describe("Resolve path (and optionally ensure) for project context"),
      ensurePath: z
        .boolean()
        .optional()
        .describe("If path set and missing, create folders via ensure-path (needs write)"),
      maxDepth: z.number().optional().describe("Tree depth, default 4"),
      maxNodes: z.number().optional().describe("Tree node cap, default 120"),
      recentGenerationLimit: z.number().optional(),
      compact: z.boolean().optional().describe("Trim bulky fields (or set STUDIO_MCP_COMPACT=1)"),
    },
    async (args) => {
      const treeParams = new URLSearchParams();
      treeParams.set("maxDepth", String(args.maxDepth ?? 4));
      treeParams.set("maxNodes", String(args.maxNodes ?? 120));

      const [account, tree] = await Promise.all([
        studioFetch("/account"),
        studioFetch(`/workspace/tree?${treeParams}`),
      ]);

      let folderId = args.folderId;
      let resolved: unknown = null;
      let ensured: unknown = null;

      if (args.path?.trim()) {
        const path = args.path.trim();
        try {
          const params = new URLSearchParams({ path });
          resolved = await studioFetch(`/workspace/resolve-path?${params}`);
          folderId = (resolved as { folderId?: string }).folderId ?? folderId;
        } catch (error) {
          if (!args.ensurePath) throw error;
          ensured = await studioFetch("/workspace/ensure-path", {
            method: "POST",
            body: JSON.stringify({ path }),
          });
          folderId = (ensured as { folderId?: string }).folderId ?? folderId;
          resolved = ensured;
        }
      }

      let project: unknown = null;
      if (folderId) {
        const params = new URLSearchParams({ folderId });
        if (args.recentGenerationLimit != null) {
          params.set("recentGenerationLimit", String(args.recentGenerationLimit));
        }
        project = await studioFetch(`/workspace/project-context?${params}`);
      }

      return jsonResult(
        {
          account,
          workspace: tree,
          resolvedPath: resolved,
          ensuredPath: ensured,
          project,
          startHere: AGENT_START_HERE,
        },
        args.compact,
      );
    },
  );

  server.tool(
    "studio_ensure_path",
    "[preferred] Create nested folders for a path in one call (e.g. Clients/JAV/refs). Case-insensitive reuse of existing segments. Prefer over repeated studio_create_folder. Requires write scope.",
    {
      path: z.string().describe("Path segments separated by /"),
      rootFolderId: z
        .string()
        .optional()
        .describe("Start folder; omit = sandbox root"),
      compact: z.boolean().optional(),
    },
    async ({ path, rootFolderId, compact }) =>
      jsonResult(
        await studioFetch("/workspace/ensure-path", {
          method: "POST",
          body: JSON.stringify({ path, rootFolderId }),
        }),
        compact,
      ),
  );

  server.tool(
    "studio_workspace_tree",
    "[preferred] Nested folder tree (paths + ids). Prefer over BFS studio_list_folders.",
    {
      folderId: z.string().optional(),
      maxDepth: z.number().optional().describe("Default 6, max 12"),
      maxNodes: z.number().optional().describe("Default 200, max 500"),
      compact: z.boolean().optional(),
    },
    async ({ folderId, maxDepth, maxNodes, compact }) => {
      const params = new URLSearchParams();
      if (folderId) params.set("folderId", folderId);
      if (maxDepth != null) params.set("maxDepth", String(maxDepth));
      if (maxNodes != null) params.set("maxNodes", String(maxNodes));
      const query = params.toString() ? `?${params}` : "";
      return jsonResult(await studioFetch(`/workspace/tree${query}`), compact);
    },
  );

  server.tool(
    "studio_resolve_path",
    "[preferred] Resolve a Studio-relative folder path (e.g. Ads/JAV/scene-1) to folderId + breadcrumb. Does not create — use studio_ensure_path for that.",
    {
      path: z.string().describe("Path segments separated by /"),
      rootFolderId: z
        .string()
        .optional()
        .describe("Start folder; omit = sandbox root"),
      compact: z.boolean().optional(),
    },
    async ({ path, rootFolderId, compact }) => {
      const params = new URLSearchParams({ path });
      if (rootFolderId) params.set("rootFolderId", rootFolderId);
      return jsonResult(await studioFetch(`/workspace/resolve-path?${params}`), compact);
    },
  );

  server.tool(
    "studio_search",
    "[preferred] Search folders, assets, documents, and elements by name/title. Use before exploring blindly.",
    {
      query: z.string(),
      kinds: z
        .array(z.enum(["folder", "asset", "document", "element"]))
        .optional(),
      folderId: z.string().optional().describe("Limit search to this folder subtree"),
      limit: z.number().optional(),
      compact: z.boolean().optional(),
    },
    async ({ query, kinds, folderId, limit, compact }) => {
      const params = new URLSearchParams({ q: query });
      if (kinds?.length) params.set("kinds", kinds.join(","));
      if (folderId) params.set("folderId", folderId);
      if (limit != null) params.set("limit", String(limit));
      return jsonResult(await studioFetch(`/workspace/search?${params}`), compact);
    },
  );

  server.tool(
    "studio_project_context",
    "[preferred] One-shot project pack for a folder: breadcrumb, shallow tree, element summaries, active style sheet, recent generations, counts.",
    {
      folderId: z.string(),
      recentGenerationLimit: z.number().optional(),
      compact: z.boolean().optional(),
    },
    async ({ folderId, recentGenerationLimit, compact }) => {
      const params = new URLSearchParams({ folderId });
      if (recentGenerationLimit != null) {
        params.set("recentGenerationLimit", String(recentGenerationLimit));
      }
      return jsonResult(await studioFetch(`/workspace/project-context?${params}`), compact);
    },
  );

  server.tool(
    "studio_bulk_move",
    "[preferred] Move up to 50 assets/documents/elements/folders into targetFolderId. Requires write scope. Partial success returns moved + errors.",
    {
      targetFolderId: z.string(),
      items: z.array(
        z.object({
          kind: z.enum(["asset", "document", "element", "folder"]),
          id: z.string(),
        }),
      ),
      compact: z.boolean().optional(),
    },
    async ({ targetFolderId, items, compact }) =>
      jsonResult(
        await studioFetch("/workspace/bulk-move", {
          method: "POST",
          body: JSON.stringify({ targetFolderId, items }),
        }),
        compact,
      ),
  );
}
