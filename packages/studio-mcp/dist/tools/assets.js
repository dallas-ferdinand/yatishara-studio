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
    "Upload a reference photo or media file to a folder (inline base64, max 50MB). For larger files use studio_reserve_upload + studio_complete_upload. Requires write scope.",
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
    "studio_reserve_upload",
    "Step 1 of two-step upload for large files. Returns { assetId, uploadUrl }. PUT/POST file bytes to uploadUrl, then call studio_complete_upload with the storageId from the upload response.",
    {
      folderId: z.string().optional(),
      name: z.string(),
      kind: z.enum(["image", "video", "audio", "document"]),
      mimeType: z.string()
    },
    async ({ folderId, name, kind, mimeType }) => jsonResult(
      await studioFetch("/assets/upload", {
        method: "POST",
        body: JSON.stringify({ folderId, name, kind, mimeType })
      })
    )
  );
  server.tool(
    "studio_complete_upload",
    "Step 2 of two-step upload. Pass assetId from studio_reserve_upload and storageId from the uploadUrl response.",
    {
      assetId: z.string(),
      storageId: z.string(),
      byteSize: z.number().optional()
    },
    async ({ assetId, storageId, byteSize }) => jsonResult(
      await studioFetch("/assets/upload", {
        method: "POST",
        body: JSON.stringify({ complete: true, assetId, storageId, byteSize })
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
