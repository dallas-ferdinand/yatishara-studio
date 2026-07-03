import { z } from "zod";
import { jsonResult, studioFetch } from "../client.js";
export function registerAssetTools(server) {
    server.tool("studio_get_asset", "Get asset metadata and a signed read URL (1h TTL).", { assetId: z.string() }, async ({ assetId }) => jsonResult(await studioFetch(`/assets/${encodeURIComponent(assetId)}`)));
    server.tool("studio_upload_asset", "Upload a file to a folder via base64. Requires write scope. Use returned asset ID as referenceAssetIds for generation.", {
        folderId: z.string().optional(),
        name: z.string(),
        kind: z.enum(["image", "video", "audio", "document"]),
        mimeType: z.string(),
        dataBase64: z.string().describe("Base64-encoded file bytes"),
    }, async ({ folderId, name, kind, mimeType, dataBase64 }) => jsonResult(await studioFetch("/assets/upload-inline", {
        method: "POST",
        body: JSON.stringify({ folderId, name, kind, mimeType, dataBase64 }),
    })));
}
