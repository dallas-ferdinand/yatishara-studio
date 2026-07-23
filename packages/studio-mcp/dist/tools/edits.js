import { z } from "zod";
import { jsonResult, studioFetch } from "../client.js";
const clipSpec = z.object({
  assetId: z.string(),
  trackId: z.string().optional(),
  startTime: z.number().optional(),
  trimIn: z.number().optional(),
  trimOut: z.number().optional(),
  label: z.string().optional(),
  duration: z.number().optional()
});
const clipPatch = z.object({
  clipId: z.string(),
  startTime: z.number().optional(),
  trimIn: z.number().optional(),
  trimOut: z.number().optional(),
  trackId: z.string().optional(),
  label: z.string().optional(),
  effects: z.record(z.unknown()).nullable().optional(),
  transitionOut: z.object({
    type: z.string(),
    duration: z.number()
  }).nullable().optional()
});
function registerEditTools(server) {
  server.tool(
    "studio_create_edit",
    "[preferred] Create a video edit project. Pass assetIds to seed sequential clips on the timeline (video/image on track-v1, audio on audio tracks).",
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
    "Save full project JSON (PUT) and/or rename/move (set name/folderId). Prefer granular studio_edit_* tools for clip ops. Pass project for full timeline replace.",
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
    "studio_edit_append_clips",
    "[preferred] Append image/video/audio clips to an edit. Pass assetIds for simple sequential append, or clips[] for trim/start/track control.",
    {
      projectId: z.string(),
      assetIds: z.array(z.string()).optional(),
      clips: z.array(clipSpec).optional(),
      atTime: z.number().optional().describe("Timeline time to place first clip (default: end of track)"),
      compact: z.boolean().optional().describe("Default true \u2014 omit full project JSON")
    },
    async ({ projectId, ...body }) => jsonResult(
      await studioFetch(`/edits/${encodeURIComponent(projectId)}/clips`, {
        method: "POST",
        body: JSON.stringify(body)
      })
    )
  );
  server.tool(
    "studio_edit_update_clips",
    "[preferred] Patch clips by id: trimIn/trimOut, startTime, trackId, label, effects, transitionOut.",
    {
      projectId: z.string(),
      clips: z.array(clipPatch).min(1),
      compact: z.boolean().optional()
    },
    async ({ projectId, ...body }) => jsonResult(
      await studioFetch(`/edits/${encodeURIComponent(projectId)}/clips`, {
        method: "PATCH",
        body: JSON.stringify(body)
      })
    )
  );
  server.tool(
    "studio_edit_remove_clips",
    "Remove clips by id. Set ripple=true to close gaps on the same track.",
    {
      projectId: z.string(),
      clipIds: z.array(z.string()).min(1),
      ripple: z.boolean().optional(),
      compact: z.boolean().optional()
    },
    async ({ projectId, ...body }) => jsonResult(
      await studioFetch(`/edits/${encodeURIComponent(projectId)}/clips`, {
        method: "DELETE",
        body: JSON.stringify(body)
      })
    )
  );
  server.tool(
    "studio_edit_reorder_clips",
    "Reorder all clips on a track. clipIds must list every clip on that track exactly once; startTimes are recomputed.",
    {
      projectId: z.string(),
      trackId: z.string().default("track-v1"),
      clipIds: z.array(z.string()).min(1),
      compact: z.boolean().optional()
    },
    async ({ projectId, ...body }) => jsonResult(
      await studioFetch(`/edits/${encodeURIComponent(projectId)}/clips/reorder`, {
        method: "POST",
        body: JSON.stringify(body)
      })
    )
  );
  server.tool(
    "studio_edit_split_clip",
    "Split a clip at a timeline timeSec (must fall inside the clip).",
    {
      projectId: z.string(),
      clipId: z.string(),
      timeSec: z.number(),
      compact: z.boolean().optional()
    },
    async ({ projectId, ...body }) => jsonResult(
      await studioFetch(`/edits/${encodeURIComponent(projectId)}/clips/split`, {
        method: "POST",
        body: JSON.stringify(body)
      })
    )
  );
  server.tool(
    "studio_edit_set_transition",
    "Set or clear transitionOut on a clip (applies into the following clip on export). Types: none, crossfade, dipToBlack, dipToWhite, wipeLeft, wipeRight, wipeUp, slideLeft, zoomIn, blur.",
    {
      projectId: z.string(),
      clipId: z.string(),
      type: z.enum([
        "none",
        "crossfade",
        "dipToBlack",
        "dipToWhite",
        "wipeLeft",
        "wipeRight",
        "wipeUp",
        "slideLeft",
        "zoomIn",
        "blur"
      ]).optional(),
      duration: z.number().optional(),
      clear: z.boolean().optional(),
      compact: z.boolean().optional()
    },
    async ({ projectId, ...body }) => jsonResult(
      await studioFetch(`/edits/${encodeURIComponent(projectId)}/clips/transition`, {
        method: "POST",
        body: JSON.stringify(body)
      })
    )
  );
  server.tool(
    "studio_pull_frame",
    "[preferred] Extract a still frame via ffmpeg and save it as an image asset in the edit folder. Pass timeSec for timeline playhead, or assetId + localTimeSec for a source asset. Then studio_view_media / Read preferredViewUrl.",
    {
      projectId: z.string(),
      timeSec: z.number().optional().describe("Timeline playhead seconds (default 0)"),
      assetId: z.string().optional(),
      localTimeSec: z.number().optional()
    },
    async ({ projectId, ...body }) => jsonResult(
      await studioFetch(`/edits/${encodeURIComponent(projectId)}/frame`, {
        method: "POST",
        body: JSON.stringify(body)
      })
    )
  );
  server.tool(
    "studio_export_edit",
    "Export a saved edit project to a video asset (ffmpeg). Requires generate scope. Returns { assetId }. Optional name overrides the export filename.",
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
