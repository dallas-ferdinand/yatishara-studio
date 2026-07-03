import { z } from "zod";
import { jsonResult, studioFetch } from "../client.js";
export function registerFolderTools(server) {
    server.tool("studio_list_folders", "List folders in Yatishara Studio. Omit parentId for root folders. Use folder IDs when calling generate or upload tools; pass folderId or rely on the API key default folder.", { parentId: z.string().optional().describe("Parent folder ID") }, async ({ parentId }) => {
        const query = parentId ? `?parentId=${encodeURIComponent(parentId)}` : "";
        return jsonResult(await studioFetch(`/folders${query}`));
    });
    server.tool("studio_folder_contents", "List subfolders, assets, and documents in a folder. Use asset IDs as referenceAssetIds for generation.", { folderId: z.string() }, async ({ folderId }) => jsonResult(await studioFetch(`/folders/${encodeURIComponent(folderId)}/contents`)));
    server.tool("studio_create_folder", "Create a folder. Requires write scope.", {
        name: z.string(),
        parentId: z.string().optional(),
    }, async ({ name, parentId }) => jsonResult(await studioFetch("/folders", {
        method: "POST",
        body: JSON.stringify({ name, parentId }),
    })));
}
