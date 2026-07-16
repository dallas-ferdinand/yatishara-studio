import { z } from "zod";
import { jsonResult, pollGeneration, studioFetch } from "../client.js";
const estimateSchema = {
  mode: z.enum(["image", "video", "script"]).optional(),
  resolution: z.string().optional(),
  durationSeconds: z.number().optional(),
  audioEnabled: z.boolean().optional(),
  referenceAssetIds: z.array(z.string()).optional(),
  referenceElementIds: z.array(z.string()).optional().describe("Built elements \u2014 video: prop/location sheets as [Image N] refs; characters prompt-only"),
  startFrameAssetId: z.string().optional().describe(
    "Storyboard / opening still for video (first_frame I2V). Required when people are on camera. Generate via studio_generate_image first."
  ),
  videoModel: z.string().optional().describe(
    "Explicit video model choice. Call studio_list_video_models first. Omit = seedance-2.0 (Studio default). MCP-only: kling-3.0-i2v, google-omni-flash."
  )
};
const directHandoffHint = "Direct handoff: omit styleSheetElementId (prompt reaches the model verbatim). Pass styleSheetElementId to run the enhancement sticking layer (style + script/elements).";
const styleSheetFieldDesc = "Built Style Sheet element ID. When set, enhancement sticks style + attached context into the prompt unless skipPromptEnhancement is true.";
const stylePresetFieldDesc = "Deprecated for styled work \u2014 use styleSheetElementId. Direct only: unstyled (default) or raw (alias). Legacy toon-* slugs return 410.";
const scriptTypeFieldDesc = "Script output type: production, storyboard, shot_list, image_prompt, video_prompt, scene_split, vo_script (Studio UI). Also accepted: style_guide, element_brief, reference_sheet_guide (agent/API). With a Style Sheet, enhancement merges look into the document.";
const referenceIntentFieldDesc = "How attached references influence rewrite: auto (infer from style), stylize (translate uploads into active look), match_reference (photographic fidelity), element_lock (built element sheets are canonical).";
const COMPOSER_SCRIPT_TYPE_ENUM = [
  "production",
  "storyboard",
  "shot_list",
  "image_prompt",
  "video_prompt",
  "scene_split",
  "style_guide",
  "element_brief",
  "reference_sheet_guide",
  "vo_script"
];
const REFERENCE_INTENT_ENUM = ["auto", "stylize", "match_reference", "element_lock"];
function registerGenerationTools(server) {
  server.tool(
    "studio_estimate_generation",
    "Estimate credit cost before generating. Call this before studio_generate_image, studio_generate_video, or studio_generate_script. Returns cost, creditBalance, and canGenerate.",
    estimateSchema,
    async (args) => jsonResult(
      await studioFetch("/generations/estimate", {
        method: "POST",
        body: JSON.stringify({
          resolution: args.resolution,
          durationSeconds: args.durationSeconds,
          audioEnabled: args.audioEnabled,
          referenceAssetIds: args.referenceAssetIds,
          referenceElementIds: args.referenceElementIds,
          startFrameAssetId: args.startFrameAssetId,
          videoModel: args.videoModel,
          mode: args.mode ?? "image"
        })
      })
    )
  );
  server.tool(
    "studio_list_video_models",
    "List video models for MCP selection. Includes kling-3.0-i2v (MCP-only, not in Studio UI).",
    {},
    async () => jsonResult(await studioFetch("/video-models?scope=mcp"))
  );
  server.tool(
    "Estimate total production budget for multiple generation items (props, shots, etc.) with contingency. Returns credits, TT$, and creditBalance. Call before cartoon-ad-production budget approval.",
    {
      items: z.array(
        z.object({
          label: z.string(),
          mode: z.enum(["image", "video", "script"]),
          resolution: z.string().optional(),
          durationSeconds: z.number().optional(),
          audioEnabled: z.boolean().optional(),
          hasReferenceInput: z.boolean().optional(),
          referenceAssetIds: z.array(z.string()).optional(),
          maxRounds: z.number()
        })
      ),
      contingencyPercent: z.number().optional().describe("Default 15")
    },
    async (args) => jsonResult(
      await studioFetch("/generations/estimate-batch", {
        method: "POST",
        body: JSON.stringify(args)
      })
    )
  );
  server.tool(
    "studio_list_presets",
    "Deprecated \u2014 Studio composer uses Style Sheet elements. Returns Direct/unstyled preset only.",
    { kind: z.enum(["image", "video", "any"]).optional() },
    async ({ kind }) => {
      const query = kind ? `?kind=${encodeURIComponent(kind)}` : "";
      return jsonResult(await studioFetch(`/style-presets${query}`));
    }
  );
  server.tool(
    "studio_list_style_sheets",
    "List Style Sheet elements for this API key (drafts + built). Each has buildStatus; styled generation requires styleRules and/or a built sheet (sheetAssetId).",
    {},
    async () => jsonResult(await studioFetch("/style-sheets"))
  );
  server.tool(
    "studio_list_generations",
    "List recent generation jobs with status and output assets.",
    { limit: z.number().optional().describe("Max jobs, default 20") },
    async ({ limit }) => {
      const query = limit ? `?limit=${encodeURIComponent(String(limit))}` : "";
      return jsonResult(await studioFetch(`/generations${query}`));
    }
  );
  server.tool(
    "studio_get_generation",
    "Poll a generation job by ID. Status: queued | generating | saving | done | failed.",
    { jobId: z.string() },
    async ({ jobId }) => jsonResult(await studioFetch(`/generations/${encodeURIComponent(jobId)}`))
  );
  server.tool(
    "studio_generate_image",
    `Generate an image and save it to a Studio folder. Call studio_estimate_generation first. Uses wait=true (usually completes in seconds).

DEFAULT: Direct handoff (verbatim prompt). Pass styleSheetElementId to enable the enhancement sticking layer. ${directHandoffHint}`,
    {
      prompt: z.string(),
      folderId: z.string().optional(),
      styleSheetElementId: z.string().optional().describe(styleSheetFieldDesc),
      stylePreset: z.string().optional().describe(stylePresetFieldDesc),
      aspectRatio: z.string().optional(),
      resolution: z.string().optional().describe("1K, 2K, or 4K"),
      quality: z.enum(["low", "medium", "high"]).optional().describe("GPT Image 2 quality"),
      referenceAssetIds: z.array(z.string()).optional().describe("Direct asset IDs (e.g. sheetAssetId)"),
      referenceElementIds: z.array(z.string()).optional().describe("Built element IDs \u2014 uses sheet image + description, not upload refs"),
      skipPromptEnhancement: z.boolean().optional().describe("Override. Default: true for Direct, false when styleSheetElementId is set."),
      referenceIntent: z.enum(REFERENCE_INTENT_ENUM).optional().describe(referenceIntentFieldDesc)
    },
    async (args) => jsonResult(
      await studioFetch("/generations", {
        method: "POST",
        body: JSON.stringify({
          mode: "image",
          wait: true,
          prompt: args.prompt,
          folderId: args.folderId,
          styleSheetElementId: args.styleSheetElementId,
          stylePreset: args.stylePreset ?? "unstyled",
          aspectRatio: args.aspectRatio,
          resolution: args.resolution,
          quality: args.quality,
          referenceAssetIds: args.referenceAssetIds,
          referenceElementIds: args.referenceElementIds,
          skipPromptEnhancement: args.skipPromptEnhancement ?? (args.styleSheetElementId ? false : true),
          referenceIntent: args.referenceIntent
        })
      })
    )
  );
  server.tool(
    "studio_generate_video",
    `Generate a video and save it to a Studio folder. Call studio_estimate_generation first. Async + poll (up to 5 min).

DEFAULT: Direct handoff (verbatim prompt). Pass styleSheetElementId to enable the enhancement sticking layer.

VIDEO WITH PEOPLE (required workflow):
1. studio_generate_image \u2014 storyboard still with referenceElementIds
2. studio_generate_video \u2014 pass startFrameAssetId from step 1 + referenceElementIds for prop/location lock.

Wait \u226565s between video calls (1 req/min gateway quota). ${directHandoffHint}`,
    {
      prompt: z.string(),
      folderId: z.string().optional(),
      styleSheetElementId: z.string().optional().describe(styleSheetFieldDesc),
      stylePreset: z.string().optional().describe(stylePresetFieldDesc),
      aspectRatio: z.string().optional(),
      resolution: z.string().optional().describe("854x480, 1280x720, or 1920x1080"),
      durationSeconds: z.number().optional().describe("4-15 seconds"),
      audioEnabled: z.boolean().optional(),
      referenceAssetIds: z.array(z.string()).optional(),
      referenceElementIds: z.array(z.string()).optional().describe("Prop + location element IDs for [Image N] refs"),
      startFrameAssetId: z.string().optional().describe("Storyboard asset ID \u2014 first_frame I2V. Required when people appear on camera."),
      skipPromptEnhancement: z.boolean().optional().describe("Override. Default: true for Direct, false when styleSheetElementId is set."),
      referenceIntent: z.enum(REFERENCE_INTENT_ENUM).optional().describe(referenceIntentFieldDesc),
      videoModel: z.string().optional().describe(
        "Explicit model slug from studio_list_video_models. Omit = seedance-2.0 (Studio default)."
      )
    },
    async (args) => {
      const queued = await studioFetch("/generations", {
        method: "POST",
        body: JSON.stringify({
          mode: "video",
          wait: false,
          prompt: args.prompt,
          folderId: args.folderId,
          styleSheetElementId: args.styleSheetElementId,
          stylePreset: args.stylePreset ?? "unstyled",
          aspectRatio: args.aspectRatio,
          resolution: args.resolution,
          durationSeconds: args.durationSeconds,
          audioEnabled: args.audioEnabled,
          referenceAssetIds: args.referenceAssetIds,
          referenceElementIds: args.referenceElementIds,
          startFrameAssetId: args.startFrameAssetId,
          skipPromptEnhancement: args.skipPromptEnhancement ?? (args.styleSheetElementId ? false : true),
          referenceIntent: args.referenceIntent,
          videoModel: args.videoModel
        })
      });
      const jobId = queued.id;
      const result = await pollGeneration(jobId);
      return jsonResult({ ...queued, ...result });
    }
  );
  server.tool(
    "studio_generate_script",
    `Generate a script document in a folder. Call studio_estimate_generation with mode=script first. ${directHandoffHint}`,
    {
      prompt: z.string(),
      folderId: z.string().optional(),
      styleSheetElementId: z.string().optional().describe(styleSheetFieldDesc),
      stylePreset: z.string().optional().describe(stylePresetFieldDesc),
      referenceAssetIds: z.array(z.string()).optional(),
      referenceElementIds: z.array(z.string()).optional(),
      skipPromptEnhancement: z.boolean().optional(),
      scriptType: z.enum(COMPOSER_SCRIPT_TYPE_ENUM).optional().describe(scriptTypeFieldDesc),
      referenceIntent: z.enum(REFERENCE_INTENT_ENUM).optional().describe(referenceIntentFieldDesc)
    },
    async (args) => jsonResult(
      await studioFetch("/generations", {
        method: "POST",
        body: JSON.stringify({
          mode: "script",
          prompt: args.prompt,
          folderId: args.folderId,
          styleSheetElementId: args.styleSheetElementId,
          stylePreset: args.stylePreset ?? "unstyled",
          referenceAssetIds: args.referenceAssetIds,
          referenceElementIds: args.referenceElementIds,
          skipPromptEnhancement: args.skipPromptEnhancement ?? (args.styleSheetElementId ? false : true),
          scriptType: args.scriptType ?? "production",
          referenceIntent: args.referenceIntent
        })
      })
    )
  );
}
export {
  registerGenerationTools
};
