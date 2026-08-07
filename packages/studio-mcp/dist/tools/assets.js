import { z } from "zod";
import { jsonResult, studioFetch } from "../client.js";
function registerAssetTools(server) {
  server.tool(
    "studio_get_asset",
    "Get asset metadata and signed read/thumbnail URLs (1h TTL).",
    { assetId: z.string() },
    async ({ assetId }) => jsonResult(await studioFetch(`/assets/${encodeURIComponent(assetId)}`))
  );
  server.tool(
    "studio_view_media",
    "Return signed media URLs for the host client to view (e.g. Cursor Read on preferredViewUrl). Does NOT call Studio AI and uses no generation credits. Prefer thumbnailUrl/preferredViewUrl for images. For VIDEO stills before editing, use studio_pull_frames (Cursor cannot scrub MP4 via Read).",
    { assetId: z.string() },
    async ({ assetId }) => jsonResult(await studioFetch(`/assets/${encodeURIComponent(assetId)}/media`))
  );
  const pullFramesSchema = {
    assetId: z.string(),
    startSec: z.number().optional().describe("Window start in source seconds (default 0)"),
    endSec: z.number().optional().describe("Window end in source seconds (default = duration)"),
    count: z.number().optional().describe(
      "Evenly spaced samples in [startSec, endSec], inclusive endpoints when count>=2 (default 3, max 12)"
    ),
    timesSec: z.array(z.number()).optional().describe("Exact source timestamps (overrides start/end/count when set)")
  };
  const pullFramesHandler = async ({
    assetId,
    startSec,
    endSec,
    count,
    timesSec
  }) => jsonResult(
    await studioFetch(`/assets/${encodeURIComponent(assetId)}/frames`, {
      method: "POST",
      body: JSON.stringify({ startSec, endSec, count, timesSec })
    })
  );
  server.tool(
    "studio_pull_frames",
    "[preferred] Pull N stills from a source video between startSec and endSec (or exact timesSec). Saves Frame \xB7 *.jpg into a sibling Pulled Frames folder (not next to the clip). Returns preferredViewUrl per frame \u2014 Cursor Read those images. No edit project required. See MCP resource studio://guides/pull-frames. Uses generate+write scope.",
    pullFramesSchema,
    pullFramesHandler
  );
  server.tool(
    "studio_sample_video_frames",
    "[deprecated] Alias of studio_pull_frames. Prefer studio_pull_frames (startSec/endSec/count \u2192 Pulled Frames folder).",
    pullFramesSchema,
    pullFramesHandler
  );
  server.tool(
    "studio_duplicate_asset",
    "Duplicate an asset (same Bunny bytes, new row). Optional target folderId and name. Requires write scope.",
    {
      assetId: z.string(),
      folderId: z.string().optional(),
      name: z.string().optional()
    },
    async ({ assetId, folderId, name }) => jsonResult(
      await studioFetch(`/assets/${encodeURIComponent(assetId)}/duplicate`, {
        method: "POST",
        body: JSON.stringify({ folderId, name })
      })
    )
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
