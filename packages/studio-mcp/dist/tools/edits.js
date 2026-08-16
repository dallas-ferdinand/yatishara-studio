import { z } from "zod";
import { jsonResult, studioFetch } from "../client.js";
import {
  getTextPreset,
  listTextPresets
} from "../data/textPresets.js";
const clipSpec = z.object({
  assetId: z.string(),
  trackId: z.string().optional(),
  startTime: z.number().optional(),
  trimIn: z.number().optional(),
  trimOut: z.number().optional(),
  label: z.string().optional(),
  duration: z.number().optional()
});
const clipEffects = z.object({
  fadeIn: z.number().optional().describe("Picture edge fade-in seconds"),
  fadeOut: z.number().optional().describe("Picture edge fade-out seconds"),
  audioFadeIn: z.number().optional().describe("Audio edge fade-in seconds"),
  audioFadeOut: z.number().optional().describe("Audio edge fade-out seconds"),
  volume: z.number().optional().describe("0\u20131 gain; set 0 to mute this clip (per-clip mute)"),
  speed: z.number().optional().describe("Playback rate; timeline duration = trim / speed"),
  scale: z.number().optional().describe("Canvas zoom; 1 = 100% cover"),
  x: z.number().optional().describe("Horizontal pan as fraction of canvas width"),
  y: z.number().optional().describe("Vertical pan as fraction of canvas height"),
  rotation: z.number().optional().describe("Rotation degrees")
}).describe("ClipEffects \u2014 volume/fades/speed/transform");
const clipPatch = z.object({
  clipId: z.string(),
  startTime: z.number().optional(),
  trimIn: z.number().optional(),
  trimOut: z.number().optional(),
  trackId: z.string().optional(),
  label: z.string().optional(),
  effects: clipEffects.nullable().optional(),
  transitionOut: z.object({
    type: z.string(),
    duration: z.number()
  }).nullable().optional(),
  text: z.object({
    text: z.string().optional(),
    fontSize: z.number().optional(),
    color: z.string().optional(),
    align: z.enum(["left", "center", "right"]).optional(),
    animation: z.enum(["none", "fadeIn", "fadeOut", "slideUp", "slideDown", "popIn"]).optional(),
    animationDuration: z.number().optional(),
    animationOut: z.enum(["none", "fadeIn", "fadeOut", "slideUp", "slideDown", "popIn"]).optional(),
    animationOutDuration: z.number().optional(),
    fontFamily: z.string().optional(),
    underline: z.boolean().optional(),
    textCase: z.enum(["none", "upper", "lower", "title"]).optional(),
    letterSpacing: z.number().optional(),
    lineHeight: z.number().optional(),
    verticalAlign: z.enum(["top", "middle", "bottom"]).optional(),
    backgroundColor: z.string().nullable().optional(),
    backgroundPadding: z.number().optional(),
    backgroundRadius: z.number().optional().describe("BG corner radius px (0=sharp)"),
    shadowColor: z.string().nullable().optional(),
    shadowBlur: z.number().optional(),
    shadowOffsetX: z.number().optional(),
    shadowOffsetY: z.number().optional(),
    glow: z.boolean().optional(),
    glowColor: z.string().optional(),
    glowBlur: z.number().optional(),
    opacity: z.number().optional(),
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    strokeColor: z.string().optional(),
    strokeWidth: z.number().optional(),
    flipX: z.boolean().optional(),
    flipY: z.boolean().optional()
  }).nullable().optional()
});
function registerEditTools(server) {
  server.tool(
    "studio_create_edit",
    "[preferred] Create a video edit project. Pass assetIds to seed sequential clips on the timeline (video/image on track-v1, audio on audio tracks). Before cutting: studio_pull_frames on each source (startSec/endSec/count). Keep source audio unless user asks mute (do NOT set effects.volume 0 by default). Open editor live-syncs MCP writes \u2014 still prefer studio_get_edit after big replaces.",
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
    "Save full project JSON (PUT) and/or rename/move (set name/folderId). Prefer granular studio_edit_* tools for clip ops. Pass project for full timeline replace when remove/append races or mute state is stuck. Open editor adopts newer Convex updatedAt automatically; verify with studio_get_edit then studio_export_edit.",
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
    "[preferred] Patch clips by id: trimIn/trimOut, startTime, trackId, label, effects (volume/fades/speed/scale/x/y/rotation), transitionOut, text (text clips). Per-clip mute = effects.volume 0 \u2014 only when the user asks to mute; exports will be silent if volume is 0. Default leave volume unset/1 to keep source audio.",
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
    "[preferred] Extract one still from an open edit via ffmpeg (saved in sibling Pulled Frames folder). Pass timeSec for timeline playhead, or assetId + localTimeSec for a source. Then Read preferredViewUrl. For multi-frame pulls on a source clip, use studio_pull_frames instead.",
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
    "Export a saved edit to a Studio asset (ffmpeg). Requires generate scope. Returns { assetId }. exportKind=video (default) or audio. Video: exportResolution 720p|1080p|4K (default 1080p). Audio: audioFormat mp3|wav|m4a (default mp3). Optional name overrides filename.",
    {
      projectId: z.string(),
      name: z.string().optional(),
      exportKind: z.enum(["video", "audio"]).optional().describe("Default video \u2014 matches editor Export rail"),
      exportResolution: z.enum(["720p", "1080p", "4K"]).optional().describe("Video only; default 1080p"),
      audioFormat: z.enum(["mp3", "wav", "m4a"]).optional().describe("Audio export only; default mp3")
    },
    async ({ projectId, name, exportKind, exportResolution, audioFormat }) => jsonResult(
      await studioFetch(`/edits/${encodeURIComponent(projectId)}/export`, {
        method: "POST",
        body: JSON.stringify({ name, exportKind, exportResolution, audioFormat })
      })
    )
  );
  server.tool(
    "studio_download_edit_package",
    "[preferred] Portable .studio package manifest for a video edit (project.json + signed media URLs + icon). Same payload the Files/Export UI zips client-side. Optional expiresUnix (default ~1h).",
    {
      projectId: z.string(),
      expiresUnix: z.number().optional()
    },
    async ({ projectId, expiresUnix }) => jsonResult(
      await studioFetch(`/edits/${encodeURIComponent(projectId)}/package`, {
        method: "POST",
        body: JSON.stringify({ expiresUnix })
      })
    )
  );
  server.tool(
    "studio_download_clip_segment",
    "[preferred] Download a trimmed clip segment (Save as video/audio). Prefer clipId on a project; or pass assetId + trimIn + trimOut. Returns short-lived { url, filename, contentType }. Requires generate scope.",
    {
      projectId: z.string().optional(),
      clipId: z.string().optional().describe("Preferred \u2014 resolve trim/speed from timeline"),
      assetId: z.string().optional(),
      trimIn: z.number().optional(),
      trimOut: z.number().optional(),
      mode: z.enum(["video", "audio"]).optional(),
      filename: z.string().optional(),
      speed: z.number().optional()
    },
    async (args) => {
      const projectId = args.projectId;
      if (!projectId) {
        return jsonResult({
          error: "projectId is required (clip download is scoped to an edit project)."
        });
      }
      return jsonResult(
        await studioFetch(
          `/edits/${encodeURIComponent(projectId)}/clips/download`,
          {
            method: "POST",
            body: JSON.stringify({
              clipId: args.clipId,
              assetId: args.assetId,
              trimIn: args.trimIn,
              trimOut: args.trimOut,
              mode: args.mode,
              filename: args.filename,
              speed: args.speed
            })
          }
        )
      );
    }
  );
  server.tool(
    "studio_edit_add_text",
    "[preferred] Add a title/text overlay clip. Creates a Title track if needed. Patch text later via studio_edit_update_clips.",
    {
      projectId: z.string(),
      startTime: z.number().optional(),
      duration: z.number().optional().describe("Default 3s"),
      trackId: z.string().optional(),
      label: z.string().optional(),
      text: z.string().optional().describe("Caption body (default Your text)"),
      fontSize: z.number().optional(),
      color: z.string().optional(),
      align: z.enum(["left", "center", "right"]).optional(),
      animation: z.enum(["none", "fadeIn", "fadeOut", "slideUp", "slideDown", "popIn"]).optional(),
      animationDuration: z.number().optional(),
      animationOut: z.enum(["none", "fadeIn", "fadeOut", "slideUp", "slideDown", "popIn"]).optional(),
      animationOutDuration: z.number().optional(),
      fontFamily: z.string().optional(),
      underline: z.boolean().optional(),
      textCase: z.enum(["none", "upper", "lower", "title"]).optional(),
      letterSpacing: z.number().optional(),
      lineHeight: z.number().optional(),
      verticalAlign: z.enum(["top", "middle", "bottom"]).optional(),
      backgroundColor: z.string().nullable().optional(),
      backgroundPadding: z.number().optional(),
      backgroundRadius: z.number().optional().describe("BG corner radius px (0=sharp)"),
      shadowColor: z.string().nullable().optional(),
      shadowBlur: z.number().optional(),
      shadowOffsetX: z.number().optional(),
      shadowOffsetY: z.number().optional(),
      glow: z.boolean().optional(),
      glowColor: z.string().optional(),
      glowBlur: z.number().optional(),
      opacity: z.number().optional(),
      bold: z.boolean().optional(),
      italic: z.boolean().optional(),
      strokeColor: z.string().optional(),
      strokeWidth: z.number().optional(),
      flipX: z.boolean().optional(),
      flipY: z.boolean().optional(),
      compact: z.boolean().optional()
    },
    async ({
      projectId,
      text,
      fontSize,
      color,
      align,
      verticalAlign,
      animation,
      animationDuration,
      animationOut,
      animationOutDuration,
      fontFamily,
      bold,
      italic,
      underline,
      textCase,
      letterSpacing,
      lineHeight,
      strokeColor,
      strokeWidth,
      backgroundColor,
      backgroundPadding,
      backgroundRadius,
      shadowColor,
      shadowBlur,
      shadowOffsetX,
      shadowOffsetY,
      glow,
      glowColor,
      glowBlur,
      opacity,
      flipX,
      flipY,
      ...rest
    }) => jsonResult(
      await studioFetch(`/edits/${encodeURIComponent(projectId)}/text`, {
        method: "POST",
        body: JSON.stringify({
          ...rest,
          text: {
            text,
            fontSize,
            color,
            align,
            verticalAlign,
            animation,
            animationDuration,
            animationOut,
            animationOutDuration,
            fontFamily,
            bold,
            italic,
            underline,
            textCase,
            letterSpacing,
            lineHeight,
            strokeColor,
            strokeWidth,
            backgroundColor,
            backgroundPadding,
            backgroundRadius,
            shadowColor,
            shadowBlur,
            shadowOffsetX,
            shadowOffsetY,
            glow,
            glowColor,
            glowBlur,
            opacity,
            flipX,
            flipY
          }
        })
      })
    )
  );
  server.tool(
    "studio_edit_duplicate_clip",
    "Duplicate a clip immediately after it on the same track.",
    {
      projectId: z.string(),
      clipId: z.string(),
      compact: z.boolean().optional()
    },
    async ({ projectId, ...body }) => jsonResult(
      await studioFetch(`/edits/${encodeURIComponent(projectId)}/clips/duplicate`, {
        method: "POST",
        body: JSON.stringify(body)
      })
    )
  );
  server.tool(
    "studio_edit_detach_audio",
    "CapCut-style: mute the video clip and add a synced audio bed from the same asset.",
    {
      projectId: z.string(),
      clipId: z.string(),
      compact: z.boolean().optional()
    },
    async ({ projectId, ...body }) => jsonResult(
      await studioFetch(`/edits/${encodeURIComponent(projectId)}/clips/detach-audio`, {
        method: "POST",
        body: JSON.stringify(body)
      })
    )
  );
  server.tool(
    "studio_edit_set_track_muted",
    "Mute or unmute a timeline track (video/audio/text).",
    {
      projectId: z.string(),
      trackId: z.string(),
      muted: z.boolean(),
      compact: z.boolean().optional()
    },
    async ({ projectId, trackId, muted, compact }) => jsonResult(
      await studioFetch(
        `/edits/${encodeURIComponent(projectId)}/tracks/${encodeURIComponent(trackId)}`,
        {
          method: "PATCH",
          body: JSON.stringify({ muted, compact })
        }
      )
    )
  );
  server.tool(
    "studio_edit_set_frame_ratio",
    "Set canvas frame ratio: 16:9 | 9:16 | 1:1 (affects export composition).",
    {
      projectId: z.string(),
      frameRatio: z.enum(["16:9", "9:16", "1:1"]),
      compact: z.boolean().optional()
    },
    async ({ projectId, ...body }) => jsonResult(
      await studioFetch(`/edits/${encodeURIComponent(projectId)}/frame-ratio`, {
        method: "POST",
        body: JSON.stringify(body)
      })
    )
  );
  server.tool(
    "studio_list_text_presets",
    "[preferred] List clean built-in text style presets. Use studio_edit_apply_text_preset to apply. Filter by category: title | soft | outline | badge | all.",
    {
      category: z.enum(["all", "title", "soft", "outline", "badge"]).optional().describe("Default all")
    },
    async ({ category }) => {
      const presets = listTextPresets(
        category ?? "all"
      );
      return jsonResult({
        count: presets.length,
        presets: presets.map((preset) => ({
          id: preset.id,
          name: preset.name,
          category: preset.category,
          sample: preset.sample,
          style: preset.style,
          effects: [
            Number(preset.style.strokeWidth ?? 0) > 0 ? "stroke" : null,
            preset.style.glow ? "glow" : null,
            preset.style.shadowColor ? "shadow" : null,
            preset.style.backgroundColor ? "background" : null
          ].filter(Boolean)
        }))
      });
    }
  );
  server.tool(
    "studio_edit_apply_text_preset",
    "[preferred] Apply a built-in text style template by id (from studio_list_text_presets). Pass clipId to restyle an existing text clip, or omit clipId to add a new text clip with that look. Optional text overrides the caption body.",
    {
      projectId: z.string(),
      presetId: z.string().describe("e.g. clean-white, title-white, badge-dark"),
      clipId: z.string().optional().describe("Existing text clip to restyle; omit to create one"),
      text: z.string().optional().describe("Caption body override"),
      startTime: z.number().optional(),
      duration: z.number().optional(),
      trackId: z.string().optional(),
      label: z.string().optional(),
      compact: z.boolean().optional()
    },
    async ({
      projectId,
      presetId,
      clipId,
      text,
      startTime,
      duration,
      trackId,
      label,
      compact
    }) => {
      const preset = getTextPreset(presetId);
      if (!preset) {
        return jsonResult({
          error: `Unknown text preset: ${presetId}`,
          hint: "Call studio_list_text_presets for ids"
        });
      }
      const style = { ...preset.style };
      const applied = {
        ...style,
        strokeWidth: style.strokeWidth ?? 0,
        strokeColor: style.strokeColor ?? "#000000",
        backgroundColor: style.backgroundColor === void 0 ? null : style.backgroundColor,
        backgroundPadding: style.backgroundPadding ?? 8,
        backgroundRadius: style.backgroundRadius ?? (style.backgroundColor ? 0 : 0),
        shadowColor: style.shadowColor === void 0 ? null : style.shadowColor,
        shadowBlur: style.shadowBlur ?? 0,
        shadowOffsetX: style.shadowOffsetX ?? 0,
        shadowOffsetY: style.shadowOffsetY ?? 0,
        glow: style.glow ?? false,
        glowColor: style.glowColor ?? "#ffffff",
        glowBlur: style.glowBlur ?? 12
      };
      if (clipId) {
        return jsonResult(
          await studioFetch(
            `/edits/${encodeURIComponent(projectId)}/clips`,
            {
              method: "PATCH",
              body: JSON.stringify({
                compact,
                clips: [
                  {
                    clipId,
                    text: {
                      ...applied,
                      ...text !== void 0 ? { text } : {}
                    }
                  }
                ]
              })
            }
          )
        );
      }
      return jsonResult(
        await studioFetch(`/edits/${encodeURIComponent(projectId)}/text`, {
          method: "POST",
          body: JSON.stringify({
            startTime,
            duration,
            trackId,
            label: label ?? preset.name,
            compact,
            text: {
              ...applied,
              text: text ?? preset.sample
            }
          })
        })
      );
    }
  );
}
export {
  registerEditTools
};
