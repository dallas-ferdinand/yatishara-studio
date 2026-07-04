import { z } from "zod";
import { jsonResult, studioFetch } from "../client.js";
export function registerFolderTools(server) {
    server.tool("studio_list_folders", "List folders in Yatishara Studio. Omit parentId for root folders. Use folder IDs when calling generate or upload tools; pass folderId or rely on the API key default folder.", { parentId: z.string().optional().describe("Parent folder ID") }, async ({ parentId }) => {
        const query = parentId ? `?parentId=${encodeURIComponent(parentId)}` : "";
        return jsonResult(await studioFetch(`/folders${query}`));
    });
    server.tool("studio_get_folder", "Get a single folder by ID (name, parentId, icon).", { folderId: z.string() }, async ({ folderId }) => jsonResult(await studioFetch(`/folders/${encodeURIComponent(folderId)}`)));
    server.tool("studio_folder_contents", "List subfolders, assets, and documents in a folder. Use asset IDs as referenceAssetIds for generation.", { folderId: z.string() }, async ({ folderId }) => jsonResult(await studioFetch(`/folders/${encodeURIComponent(folderId)}/contents`)));
    server.tool("studio_create_folder", "Create a folder. Requires write scope.", {
        name: z.string(),
        parentId: z.string().optional(),
    }, async ({ name, parentId }) => jsonResult(await studioFetch("/folders", {
        method: "POST",
        body: JSON.stringify({ name, parentId }),
    })));
    server.tool("studio_update_folder", "Rename a folder or move it under another parent. Requires write scope. Use parentId to move; omit fields you do not want to change. Cannot move the API key sandbox root folder.", {
        folderId: z.string(),
        name: z.string().optional(),
        icon: z.string().optional(),
        color: z.string().optional(),
        parentId: z.string().optional().describe("New parent folder ID (use sandbox root to move to top level)"),
    }, async ({ folderId, name, icon, color, parentId }) => jsonResult(await studioFetch(`/folders/${encodeURIComponent(folderId)}`, {
        method: "PATCH",
        body: JSON.stringify({ name, icon, color, parentId }),
    })));
}
