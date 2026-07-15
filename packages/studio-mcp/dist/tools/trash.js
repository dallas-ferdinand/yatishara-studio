import { z } from "zod";
import { jsonResult, studioFetch } from "../client.js";
const trashKind = z.enum(["folder", "asset", "document", "element"]);
function registerTrashTools(server) {
  server.tool(
    "studio_list_trash",
    "List soft-deleted folders, assets, documents, and elements.",
    { kind: trashKind.optional() },
    async ({ kind }) => {
      const query = kind ? `?kind=${encodeURIComponent(kind)}` : "";
      return jsonResult(await studioFetch(`/trash${query}`));
    }
  );
  server.tool(
    "studio_trash",
    "Move a folder, asset, document, or element to trash (soft delete). Requires write scope.",
    {
      kind: trashKind,
      id: z.string()
    },
    async ({ kind, id }) => {
      const collection = kind === "folder" ? "folders" : kind === "asset" ? "assets" : kind === "document" ? "documents" : "elements";
      return jsonResult(
        await studioFetch(`/${collection}/${encodeURIComponent(id)}`, {
          method: "DELETE"
        })
      );
    }
  );
  server.tool(
    "studio_restore",
    "Restore a trashed folder, asset, document, or element. Requires write scope.",
    {
      kind: trashKind,
      id: z.string()
    },
    async ({ kind, id }) => {
      const collection = kind === "folder" ? "folders" : kind === "asset" ? "assets" : kind === "document" ? "documents" : "elements";
      return jsonResult(
        await studioFetch(`/${collection}/${encodeURIComponent(id)}/restore`, {
          method: "POST",
          body: JSON.stringify({})
        })
      );
    }
  );
}
export {
  registerTrashTools
};
