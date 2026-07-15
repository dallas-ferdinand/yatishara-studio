import { z } from "zod";
import { jsonResult, studioFetch } from "../client.js";
function registerAssetTools(server) {
  server.tool(
    "studio_get_asset",
    "Get asset metadata and a signed read URL (1h TTL).",
    { assetId: z.string() },
    async ({ assetId }) => jsonResult(await studioFetch(`/assets/${encodeURIComponent(assetId)}`))
  );
  server.tool(
    "studio_upload_asset",
    "Upload a reference photo or media file to a folder. For element sheets: upload multiple angles first (see studio_element_sheet_guide). Requires write scope.",
    {
      folderId: z.string().optional(),
      name: z.string(),
      kind: z.enum(["image", "video", "audio", "document"]),
      mimeType: z.string(),
      dataBase64: z.string().describe("Base64-encoded file bytes")
    },
    async ({ folderId, name, kind, mimeType, dataBase64 }) => jsonResult(
      await studioFetch("/assets/upload-inline", {
        method: "POST",
        body: JSON.stringify({ folderId, name, kind, mimeType, dataBase64 })
      })
    )
  );
  server.tool(
    "studio_update_asset",
    "Rename an asset (image, video, audio) or move it to another folder. Requires write scope.",
    {
      assetId: z.string(),
      name: z.string().optional(),
      folderId: z.string().optional()
    },
    async ({ assetId, name, folderId }) => jsonResult(
      await studioFetch(`/assets/${encodeURIComponent(assetId)}`, {
        method: "PATCH",
        body: JSON.stringify({ name, folderId })
      })
    )
  );
}
export {
  registerAssetTools
};
