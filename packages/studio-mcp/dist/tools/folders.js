import { z } from "zod";
import { jsonResult, studioFetch } from "../client.js";
function registerFolderTools(server) {
  server.tool(
    "studio_list_folders",
    "List child folders one level deep. For orientation prefer studio_bootstrap / studio_workspace_tree / studio_search.",
    { parentId: z.string().optional().describe("Parent folder ID"), compact: z.boolean().optional() },
    async ({ parentId, compact }) => {
      const query = parentId ? `?parentId=${encodeURIComponent(parentId)}` : "";
      return jsonResult(await studioFetch(`/folders${query}`), compact);
    }
  );
  server.tool(
    "studio_get_folder",
    "Get a single folder by ID (name, parentId, icon).",
    { folderId: z.string(), compact: z.boolean().optional() },
    async ({ folderId, compact }) => jsonResult(await studioFetch(`/folders/${encodeURIComponent(folderId)}`), compact)
  );
  server.tool(
    "studio_folder_contents",
    "List breadcrumb, subfolders, assets, documents, and elements in a folder. For a fuller pack use studio_project_context.",
    { folderId: z.string(), compact: z.boolean().optional() },
    async ({ folderId, compact }) => jsonResult(
      await studioFetch(`/folders/${encodeURIComponent(folderId)}/contents`),
      compact
    )
  );
  server.tool(
    "studio_create_folder",
    "Create a single folder. For nested paths prefer studio_ensure_path. Requires write scope.",
    {
      name: z.string(),
      parentId: z.string().optional(),
      icon: z.string().optional(),
      color: z.string().optional(),
      compact: z.boolean().optional()
    },
    async ({ name, parentId, icon, color, compact }) => jsonResult(
      await studioFetch("/folders", {
        method: "POST",
        body: JSON.stringify({ name, parentId, icon, color })
      }),
      compact
    )
  );
  server.tool(
    "studio_update_folder",
    "Rename a folder or move it under another parent. Requires write scope. Cannot move the API key sandbox root folder.",
    {
      folderId: z.string(),
      name: z.string().optional(),
      icon: z.string().optional(),
      color: z.string().optional(),
      parentId: z.string().optional().describe("New parent folder ID (use sandbox root to move to top level)"),
      compact: z.boolean().optional()
    },
    async ({ folderId, name, icon, color, parentId, compact }) => jsonResult(
      await studioFetch(`/folders/${encodeURIComponent(folderId)}`, {
        method: "PATCH",
        body: JSON.stringify({ name, icon, color, parentId })
      }),
      compact
    )
  );
}
export {
  registerFolderTools
};
