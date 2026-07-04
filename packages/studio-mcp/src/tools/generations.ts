import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { jsonResult, pollGeneration, studioFetch } from "../client.js";

const estimateSchema = {
  mode: z.enum(["image", "video", "script"]).optional(),
  resolution: z.string().optional(),
  durationSeconds: z.number().optional(),
  audioEnabled: z.boolean().optional(),
  referenceAssetIds: z.array(z.string()).optional(),
  referenceElementIds: z
    .array(z.string())
    .optional()
    .describe("Built elements — video: prop/location sheets as [Image N] refs; characters prompt-only"),
  startFrameAssetId: z
    .string()
    .optional()
    .describe(
      "Storyboard / opening still for video (first_frame I2V). Required when people are on camera. Generate via studio_generate_image first.",
    ),
  videoModel: z
    .enum(["seedance-2.0", "kling-3.0-i2v"])
    .optional()
    .describe("Video engine. Default seedance-2.0. Use kling-3.0-i2v for easier human faces (requires startFrameAssetId)."),
};

const rawPresetHint =
  'Default stylePreset to "raw" with skipPromptEnhancement: true for cinema — passes prompt directly without preset rewrite.';

export function registerGenerationTools(server: McpServer) {
  server.tool(
    "studio_estimate_generation",
    "Estimate credit cost before generating. Call this before studio_generate_image, studio_generate_video, or studio_generate_script. Returns cost, creditBalance, and canGenerate.",
    estimateSchema,
    async (args) =>
      jsonResult(
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
            mode: args.mode ?? "image",
          }),
        }),
      ),
  );

  server.tool(
    "studio_list_video_models",
    "List available video generation models (Seedance 2.0 default, Kling 3.0 I2V secondary).",
    {},
    async () => jsonResult(await studioFetch("/video-models")),
  );

  server.tool(
    "Estimate total production budget for multiple generation items (props, shots, etc.) with contingency. Returns credits, TT$, and creditBalance. Call before cinema-ad-production budget approval.",
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
          maxRounds: z.number(),
        }),
      ),
      contingencyPercent: z.number().optional().describe("Default 15"),
    },
    async (args) =>
      jsonResult(
        await studioFetch("/generations/estimate-batch", {
          method: "POST",
          body: JSON.stringify(args),
        }),
      ),
  );

  server.tool(
    "studio_list_presets",
    "List style presets (slug, name, kind). Call before first generate if unsure which stylePreset slug to use.",
    { kind: z.enum(["image", "video", "any"]).optional() },
    async ({ kind }) => {
      const query = kind ? `?kind=${encodeURIComponent(kind)}` : "";
      return jsonResult(await studioFetch(`/style-presets${query}`));
    },
  );

  server.tool(
    "studio_list_generations",
    "List recent generation jobs with status and output assets.",
    { limit: z.number().optional().describe("Max jobs, default 20") },
    async ({ limit }) => {
      const query = limit ? `?limit=${encodeURIComponent(String(limit))}` : "";
      return jsonResult(await studioFetch(`/generations${query}`));
    },
  );

  server.tool(
    "studio_get_generation",
    "Poll a generation job by ID. Status: queued | generating | saving | done | failed.",
    { jobId: z.string() },
    async ({ jobId }) =>
      jsonResult(await studioFetch(`/generations/${encodeURIComponent(jobId)}`)),
  );

  server.tool(
    "studio_generate_image",
    `Generate an image and save it to a Studio folder. Call studio_estimate_generation first. Uses wait=true (usually completes in seconds). ${rawPresetHint}`,
    {
      prompt: z.string(),
      folderId: z.string().optional(),
      stylePreset: z.string().optional().describe('Preset slug, e.g. realism or raw'),
      aspectRatio: z.string().optional(),
      resolution: z.string().optional().describe("1K, 2K, or 4K"),
      referenceAssetIds: z.array(z.string()).optional().describe("Direct asset IDs (e.g. sheetAssetId)"),
      referenceElementIds: z
        .array(z.string())
        .optional()
        .describe("Built element IDs — uses sheet image + description, not upload refs"),
      skipPromptEnhancement: z.boolean().optional().describe("Default true for cinema"),
    },
    async (args) =>
      jsonResult(
        await studioFetch("/generations", {
          method: "POST",
          body: JSON.stringify({
            mode: "image",
            wait: true,
            ...args,
            stylePreset: args.stylePreset ?? "raw",
            skipPromptEnhancement: args.skipPromptEnhancement ?? true,
          }),
        }),
      ),
  );

  server.tool(
    "studio_generate_video",
    `Generate a video and save it to a Studio folder. Call studio_estimate_generation first. Async + poll (up to 5 min).

VIDEO WITH PEOPLE (required workflow):
1. studio_generate_image — storyboard still with referenceElementIds (characters + props + locations compose the opening shot)
2. studio_generate_video — pass startFrameAssetId from step 1 + referenceElementIds for prop/location lock. Characters are IN the start frame, not face-sheet refs.

Wait ≥65s between video calls (1 req/min gateway quota). ${rawPresetHint}`,
    {
      prompt: z.string(),
      folderId: z.string().optional(),
      stylePreset: z.string().optional(),
      aspectRatio: z.string().optional(),
      resolution: z.string().optional().describe("854x480, 1280x720, or 1920x1080"),
      durationSeconds: z.number().optional().describe("4-15 seconds"),
      audioEnabled: z.boolean().optional(),
      referenceAssetIds: z.array(z.string()).optional(),
      referenceElementIds: z
        .array(z.string())
        .optional()
        .describe("Prop + location element IDs for [Image N] refs; character descriptions append to prompt only"),
      startFrameAssetId: z
        .string()
        .optional()
        .describe("Storyboard asset ID — first_frame I2V. Required for Kling and when people appear on camera."),
      videoModel: z
        .enum(["seedance-2.0", "kling-3.0-i2v"])
        .optional()
        .describe("Video engine. Default seedance-2.0. kling-3.0-i2v for human-heavy shots (requires startFrameAssetId)."),
      skipPromptEnhancement: z.boolean().optional(),
    },
    async (args) => {
      const queued = await studioFetch("/generations", {
        method: "POST",
        body: JSON.stringify({
          mode: "video",
          wait: false,
          ...args,
          stylePreset: args.stylePreset ?? "raw",
          skipPromptEnhancement: args.skipPromptEnhancement ?? true,
        }),
      });
      const jobId = queued.id as string;
      const result = await pollGeneration(jobId);
      return jsonResult({ ...queued, ...result });
    },
  );

  server.tool(
    "studio_generate_script",
    `Generate a script document in a folder. Call studio_estimate_generation with mode=script first. Upload audio refs for voice briefs — Flash listens to attached audio. Returns documentId and title. ${rawPresetHint}`,
    {
      prompt: z.string(),
      folderId: z.string().optional(),
      stylePreset: z.string().optional(),
      referenceAssetIds: z.array(z.string()).optional(),
      referenceElementIds: z.array(z.string()).optional(),
      skipPromptEnhancement: z.boolean().optional(),
    },
    async (args) =>
      jsonResult(
        await studioFetch("/generations", {
          method: "POST",
          body: JSON.stringify({
            mode: "script",
            ...args,
            stylePreset: args.stylePreset ?? "raw",
            skipPromptEnhancement: args.skipPromptEnhancement ?? true,
          }),
        }),
      ),
  );
}
