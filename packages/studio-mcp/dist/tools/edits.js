import { z } from "zod";
import { jsonResult, studioFetch } from "../client.js";
function registerEditTools(server) {
  server.tool(
    "studio_create_edit",
    "Create a video edit project. Pass assetIds to seed sequential clips on the timeline (video/image on track-v1, audio on audio tracks).",
    {
      folderId: z.string().optional(),
      name: z.string().optional(),
      sourceAssetId: z.string().optional(),
      assetIds: z.array(z.string()).optional(),
      frameRatio: z.enum(["16:9", "9:16", "1:1"]).optional()
    },
    async (args) => jsonResult(
      await studioFetch("/edits", {
        method: "POST",
        body: JSON.stringify(args)
      })
    )
  );
  server.tool(
    "studio_list_edits",
    "List video edit projects in a folder (defaults to API key sandbox).",
    { folderId: z.string().optional() },
    async ({ folderId }) => {
      const query = folderId ? `?folderId=${encodeURIComponent(folderId)}` : "";
      return jsonResult(await studioFetch(`/edits${query}`));
    }
  );
  server.tool(
    "studio_get_edit",
    "Get a video edit project including project JSON (tracks/clips).",
    { projectId: z.string() },
    async ({ projectId }) => jsonResult(await studioFetch(`/edits/${encodeURIComponent(projectId)}`))
  );
  server.tool(
    "studio_update_edit",
    "Save full project JSON (PUT) and/or rename/move (set name/folderId). Pass project for full timeline replace.",
    {
      projectId: z.string(),
      name: z.string().optional(),
      folderId: z.string().optional(),
      project: z.record(z.unknown()).optional().describe("Full EditorProject JSON")
    },
    async ({ projectId, name, folderId, project }) => {
      if (project) {
        return jsonResult(
          await studioFetch(`/edits/${encodeURIComponent(projectId)}`, {
            method: "PUT",
            body: JSON.stringify({ name, folderId, project })
          })
        );
      }
      return jsonResult(
        await studioFetch(`/edits/${encodeURIComponent(projectId)}`, {
          method: "PATCH",
          body: JSON.stringify({ name, folderId })
        })
      );
    }
  );
  server.tool(
    "studio_export_edit",
    "Export a saved edit project to a video asset (ffmpeg). Requires generate scope. Returns { assetId }.",
    {
      projectId: z.string(),
      name: z.string().optional()
    },
    async ({ projectId, name }) => jsonResult(
      await studioFetch(`/edits/${encodeURIComponent(projectId)}/export`, {
        method: "POST",
        body: JSON.stringify({ name })
      })
    )
  );
}
export {
  registerEditTools
};
