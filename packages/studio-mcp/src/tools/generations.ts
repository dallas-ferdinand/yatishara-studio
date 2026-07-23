import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { jsonResult, pollGeneration, pollGenerations, studioFetch } from "../client.js";

const estimateSchema = {
  mode: z.enum(["image", "video", "script", "audio"]).optional(),
  resolution: z.string().optional(),
  durationSeconds: z.number().optional(),
  audioEnabled: z.boolean().optional(),
  audioType: z.enum(["voiceover", "sfx"]).optional(),
  characterCount: z.number().optional(),
  prompt: z
    .string()
    .optional()
    .describe("For mode=audio voiceover: character count is taken from prompt length when characterCount is omitted"),
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
    .string()
    .optional()
    .describe(
      'Explicit video model choice. Call studio_list_video_models first. Omit = seedance-2.0 (Studio default). MCP-only: kling-3.0-i2v, google-omni-flash.',
    ),
};

const directHandoffHint =
  "Direct handoff: omit styleSheetElementId (prompt reaches the model verbatim). Pass styleSheetElementId to run the enhancement sticking layer (style + script/elements).";

const styleSheetFieldDesc =
  "Built Style Sheet element ID. When set, enhancement sticks style + attached context into the prompt unless skipPromptEnhancement is true.";

const stylePresetFieldDesc =
  "Deprecated for styled work — use styleSheetElementId. Direct only: unstyled (default) or raw (alias). Legacy toon-* slugs return 410.";

const scriptTypeFieldDesc =
  "Script output type: production, storyboard, shot_list, image_prompt, video_prompt, scene_split, vo_script (Studio UI). Also accepted: style_guide, element_brief, reference_sheet_guide (agent/API). With a Style Sheet, enhancement merges look into the document.";

const referenceIntentFieldDesc =
  "How attached references influence rewrite: auto (infer from style), stylize (translate uploads into active look), match_reference (photographic fidelity), element_lock (built element sheets are canonical).";

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
  "vo_script",
] as const;

const REFERENCE_INTENT_ENUM = ["auto", "stylize", "match_reference", "element_lock"] as const;

const batchItemSchema = z.object({
  label: z.string().optional().describe("Human label for this item in the batch result"),
  mode: z.enum(["image", "video", "script", "audio"]),
  prompt: z.string(),
  folderId: z.string().optional(),
  styleSheetElementId: z.string().optional(),
  stylePreset: z.string().optional(),
  aspectRatio: z.string().optional(),
  resolution: z.string().optional(),
  quality: z.enum(["low", "medium", "high"]).optional(),
  durationSeconds: z.number().optional(),
  audioEnabled: z.boolean().optional(),
  audioType: z.enum(["voiceover", "sfx"]).optional(),
  elevenVoiceId: z.string().optional(),
  elevenVoiceName: z.string().optional(),
  elevenPublicOwnerId: z.string().optional(),
  audioLoop: z.boolean().optional(),
  promptInfluence: z.number().optional(),
  referenceAssetIds: z.array(z.string()).optional(),
  referenceElementIds: z.array(z.string()).optional(),
  startFrameAssetId: z.string().optional(),
  skipPromptEnhancement: z.boolean().optional(),
  referenceIntent: z.enum(REFERENCE_INTENT_ENUM).optional(),
  videoModel: z.string().optional(),
  scriptType: z.enum(COMPOSER_SCRIPT_TYPE_ENUM).optional(),
});

function generationBody(
  item: z.infer<typeof batchItemSchema>,
  wait: boolean,
): Record<string, unknown> {
  const skip =
    item.skipPromptEnhancement ?? (item.styleSheetElementId ? false : true);
  const body: Record<string, unknown> = {
    mode: item.mode,
    wait,
    prompt: item.prompt,
    folderId: item.folderId,
    styleSheetElementId: item.styleSheetElementId,
    stylePreset: item.stylePreset ?? "unstyled",
    aspectRatio: item.aspectRatio,
    resolution: item.resolution,
    quality: item.quality,
    durationSeconds: item.durationSeconds,
    audioEnabled: item.audioEnabled,
    referenceAssetIds: item.referenceAssetIds,
    referenceElementIds: item.referenceElementIds,
    startFrameAssetId: item.startFrameAssetId,
    skipPromptEnhancement: skip,
    referenceIntent: item.referenceIntent,
    videoModel: item.videoModel,
  };
  if (item.mode === "script") {
    body.scriptType = item.scriptType ?? "production";
  }
  if (item.mode === "audio") {
    body.audioType = item.audioType ?? "voiceover";
    body.elevenVoiceId = item.elevenVoiceId;
    body.elevenVoiceName = item.elevenVoiceName;
    body.elevenPublicOwnerId = item.elevenPublicOwnerId;
    body.audioLoop = item.audioLoop;
    body.promptInfluence = item.promptInfluence;
  }
  return body;
}

export function registerGenerationTools(server: McpServer) {
  server.tool(
    "studio_estimate_generation",
    "[preferred] Estimate credit cost before generating. Call before studio_generate_* or studio_generate_batch.",
    estimateSchema,
    async (args) =>
      jsonResult(
        await studioFetch("/generations/estimate", {
          method: "POST",
          body: JSON.stringify({
            resolution: args.resolution,
            durationSeconds: args.durationSeconds,
            audioEnabled: args.audioEnabled,
            audioType: args.audioType,
            characterCount: args.characterCount,
            prompt: args.prompt,
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
    "List video models for MCP selection. Includes kling-3.0-i2v (MCP-only, not in Studio UI).",
    {},
    async () => jsonResult(await studioFetch("/video-models?scope=mcp")),
  );

  server.tool(
    "studio_estimate_batch",
    "[preferred] Estimate total production budget for multiple generation items with contingency. Call before studio_generate_batch / cartoon budget approval.",
    {
      items: z.array(
        z.object({
          label: z.string(),
          mode: z.enum(["image", "video", "script", "audio"]),
          resolution: z.string().optional(),
          durationSeconds: z.number().optional(),
          audioEnabled: z.boolean().optional(),
          audioType: z.enum(["voiceover", "sfx"]).optional(),
          characterCount: z.number().optional(),
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
    "studio_list_script_types",
    "List script output types for studio_generate_script (production, storyboard, vo_script, etc.).",
    {},
    async () => jsonResult(await studioFetch("/catalog/script-types")),
  );

  server.tool(
    "studio_list_reference_intents",
    "List referenceIntent values for styled/Direct generation (auto, stylize, match_reference, element_lock).",
    {},
    async () => jsonResult(await studioFetch("/catalog/reference-intents")),
  );

  server.tool(
    "studio_list_presets",
    "[deprecated] Style Sheets replaced presets. Returns Direct/unstyled only — use studio_list_style_sheets for styled work.",
    { kind: z.enum(["image", "video", "any"]).optional() },
    async ({ kind }) => {
      const query = kind ? `?kind=${encodeURIComponent(kind)}` : "";
      return jsonResult(await studioFetch(`/style-presets${query}`));
    },
  );

  server.tool(
    "studio_list_style_sheets",
    "[preferred] List Style Sheet elements (drafts + built). Styled generation needs styleRules and/or built sheetAssetId.",
    {},
    async () => jsonResult(await studioFetch("/style-sheets")),
  );

  server.tool(
    "studio_list_generations",
    "List recent generation jobs with status and output assets.",
    {
      limit: z.number().optional().describe("Max jobs, default 20"),
      compact: z.boolean().optional(),
    },
    async ({ limit, compact }) => {
      const query = limit ? `?limit=${encodeURIComponent(String(limit))}` : "";
      return jsonResult(await studioFetch(`/generations${query}`), compact);
    },
  );

  server.tool(
    "studio_get_generation",
    "Poll a generation job by ID. Returns status, prompts, model, settings, creditsSpent, and output assets.",
    { jobId: z.string(), compact: z.boolean().optional() },
    async ({ jobId, compact }) =>
      jsonResult(await studioFetch(`/generations/${encodeURIComponent(jobId)}`), compact),
  );

  server.tool(
    "studio_generate_batch",
    `[preferred] Queue multiple generations then poll until done. Prefer for props/shots packs after studio_estimate_batch.

Rules:
- Max 8 items per call.
- Images/scripts/audio can run in parallel.
- Videos are queued with ≥65s spacing (gateway 1 req/min).
- Call studio_estimate_batch first for budget.
- Inspect outputs with studio_view_media before another round. ${directHandoffHint}`,
    {
      items: z.array(batchItemSchema).min(1).max(8),
      poll: z
        .boolean()
        .optional()
        .describe("Default true — wait for all jobs. false returns queued jobIds only."),
      videoGapMs: z
        .number()
        .optional()
        .describe("Delay between video queue calls. Default 65000."),
      timeoutMs: z.number().optional().describe("Poll timeout for the whole batch. Default 600000."),
      compact: z.boolean().optional(),
    },
    async (args) => {
      const poll = args.poll !== false;
      const videoGapMs = args.videoGapMs ?? 65_000;
      const queued: Array<{
        label?: string;
        mode: string;
        jobId?: string;
        documentId?: string;
        ok: boolean;
        error?: string;
        raw?: unknown;
      }> = [];

      let lastVideoAt = 0;
      for (const [index, item] of args.items.entries()) {
        const label = item.label ?? `${item.mode}-${index + 1}`;
        try {
          if (item.mode === "audio" && item.audioType !== "sfx" && !item.elevenVoiceId?.trim()) {
            throw new Error("elevenVoiceId is required for voiceover");
          }
          if (item.mode === "video") {
            const wait = Date.now() - lastVideoAt;
            if (lastVideoAt > 0 && wait < videoGapMs) {
              await new Promise((r) => setTimeout(r, videoGapMs - wait));
            }
          }
          const waitSync = item.mode === "image" || item.mode === "script";
          const result = (await studioFetch("/generations", {
            method: "POST",
            body: JSON.stringify(generationBody(item, waitSync)),
          })) as {
            id?: string;
            jobId?: string;
            documentId?: string;
            status?: string;
          };
          if (item.mode === "video") lastVideoAt = Date.now();
          const jobId = result.id ?? result.jobId;
          queued.push({
            label,
            mode: item.mode,
            jobId,
            documentId: result.documentId,
            ok: true,
            raw: waitSync ? result : undefined,
          });
        } catch (error) {
          queued.push({
            label,
            mode: item.mode,
            ok: false,
            error: error instanceof Error ? error.message : "queue failed",
          });
        }
      }

      if (!poll) {
        return jsonResult({ queued, polled: false }, args.compact);
      }

      const toPoll = queued.filter((q) => q.ok && q.jobId && !q.raw).map((q) => q.jobId!);
      const polled = toPoll.length
        ? await pollGenerations(toPoll, { timeoutMs: args.timeoutMs ?? 600_000 })
        : [];
      const byId = new Map(polled.map((p) => [p.jobId, p]));

      const results = queued.map((q) => {
        if (!q.ok) return q;
        if (q.raw) {
          return { ...q, status: "done", result: q.raw };
        }
        if (!q.jobId) return q;
        const p = byId.get(q.jobId);
        if (!p) return { ...q, status: "unknown" };
        return {
          label: q.label,
          mode: q.mode,
          jobId: q.jobId,
          ok: p.ok,
          status: p.job?.status ?? (p.ok ? "done" : "failed"),
          error: p.error,
          result: p.job,
        };
      });

      return jsonResult(
        {
          results,
          summary: {
            total: results.length,
            ok: results.filter((r) => r.ok).length,
            failed: results.filter((r) => !r.ok).length,
          },
        },
        args.compact,
      );
    },
  );

  server.tool(
    "studio_generate_image",
    `[preferred] Generate an image and save it to a Studio folder. Call studio_estimate_generation first. Uses wait=true (usually completes in seconds).

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
      referenceElementIds: z
        .array(z.string())
        .optional()
        .describe("Built element IDs — uses sheet image + description, not upload refs"),
      skipPromptEnhancement: z
        .boolean()
        .optional()
        .describe("Override. Default: true for Direct, false when styleSheetElementId is set."),
      referenceIntent: z.enum(REFERENCE_INTENT_ENUM).optional().describe(referenceIntentFieldDesc),
      compact: z.boolean().optional(),
    },
    async (args) =>
      jsonResult(
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
            skipPromptEnhancement:
              args.skipPromptEnhancement ?? (args.styleSheetElementId ? false : true),
            referenceIntent: args.referenceIntent,
          }),
        }),
        args.compact,
      ),
  );

  server.tool(
    "studio_generate_video",
    `[preferred] Generate a video and save it to a Studio folder. Call studio_estimate_generation first. Async + poll (up to 5 min).

DEFAULT: Direct handoff (verbatim prompt). Pass styleSheetElementId to enable the enhancement sticking layer.

VIDEO WITH PEOPLE (required workflow):
1. studio_generate_image — storyboard still with referenceElementIds
2. studio_generate_video — pass startFrameAssetId from step 1 + referenceElementIds for prop/location lock.

Wait ≥65s between video calls (1 req/min gateway quota). For packs use studio_generate_batch. ${directHandoffHint}`,
    {
      prompt: z.string(),
      folderId: z.string().optional(),
      styleSheetElementId: z.string().optional().describe(styleSheetFieldDesc),
      stylePreset: z.string().optional().describe(stylePresetFieldDesc),
      aspectRatio: z.string().optional(),
      resolution: z.string().optional().describe("1280x720 (720p) or 1920x1080 (1080p)"),
      durationSeconds: z.number().optional().describe("4-15 seconds"),
      audioEnabled: z.boolean().optional(),
      referenceAssetIds: z.array(z.string()).optional(),
      referenceElementIds: z
        .array(z.string())
        .optional()
        .describe("Prop + location element IDs for [Image N] refs"),
      startFrameAssetId: z
        .string()
        .optional()
        .describe("Storyboard asset ID — first_frame I2V. Required when people appear on camera."),
      skipPromptEnhancement: z
        .boolean()
        .optional()
        .describe("Override. Default: true for Direct, false when styleSheetElementId is set."),
      referenceIntent: z.enum(REFERENCE_INTENT_ENUM).optional().describe(referenceIntentFieldDesc),
      videoModel: z
        .string()
        .optional()
        .describe(
          'Explicit model slug from studio_list_video_models. Omit = seedance-2.0 (Studio default).',
        ),
      compact: z.boolean().optional(),
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
          skipPromptEnhancement:
            args.skipPromptEnhancement ?? (args.styleSheetElementId ? false : true),
          referenceIntent: args.referenceIntent,
          videoModel: args.videoModel,
        }),
      });
      const jobId = (queued as { id: string }).id;
      const result = await pollGeneration(jobId);
      return jsonResult({ ...queued, ...result }, args.compact);
    },
  );

  server.tool(
    "studio_generate_script",
    `[preferred] Generate a script document in a folder. Call studio_estimate_generation with mode=script first. ${directHandoffHint}`,
    {
      prompt: z.string(),
      folderId: z.string().optional(),
      styleSheetElementId: z.string().optional().describe(styleSheetFieldDesc),
      stylePreset: z.string().optional().describe(stylePresetFieldDesc),
      referenceAssetIds: z.array(z.string()).optional(),
      referenceElementIds: z.array(z.string()).optional(),
      skipPromptEnhancement: z.boolean().optional(),
      scriptType: z.enum(COMPOSER_SCRIPT_TYPE_ENUM).optional().describe(scriptTypeFieldDesc),
      referenceIntent: z.enum(REFERENCE_INTENT_ENUM).optional().describe(referenceIntentFieldDesc),
      compact: z.boolean().optional(),
    },
    async (args) =>
      jsonResult(
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
            skipPromptEnhancement:
              args.skipPromptEnhancement ?? (args.styleSheetElementId ? false : true),
            scriptType: args.scriptType ?? "production",
            referenceIntent: args.referenceIntent,
          }),
        }),
        args.compact,
      ),
  );

  server.tool(
    "studio_generate_audio",
    `[preferred] Generate voiceover (TTS) or SFX and save to a folder. Call studio_estimate_generation with mode=audio first.

Voiceover: requires elevenVoiceId (from studio_explore_voices or studio_list_saved_voices). Prompt = spoken text (max ~3000 chars).
SFX: prompt = sound description; optional durationSeconds 0.5–30 (omit = Auto ~5s).
Music is not available. Async by default (wait=false) then polls up to 3 min.`,
    {
      prompt: z.string(),
      audioType: z.enum(["voiceover", "sfx"]),
      folderId: z.string().optional(),
      elevenVoiceId: z.string().optional().describe("Required for voiceover"),
      elevenVoiceName: z.string().optional(),
      elevenPublicOwnerId: z.string().optional().describe("Library owner id; omit for account/premade voices"),
      durationSeconds: z.number().optional().describe("SFX only: 0.5–30"),
      audioLoop: z.boolean().optional(),
      promptInfluence: z.number().optional().describe("SFX only: 0–1"),
      wait: z.boolean().optional().describe("Default false (poll). Set true for sync wait on server."),
      compact: z.boolean().optional(),
    },
    async (args) => {
      if (args.audioType === "voiceover" && !args.elevenVoiceId?.trim()) {
        throw new Error("elevenVoiceId is required for voiceover");
      }
      const wait = args.wait === true;
      const queued = await studioFetch("/generations", {
        method: "POST",
        body: JSON.stringify({
          mode: "audio",
          wait,
          prompt: args.prompt,
          folderId: args.folderId,
          audioType: args.audioType,
          elevenVoiceId: args.elevenVoiceId,
          elevenVoiceName: args.elevenVoiceName,
          elevenPublicOwnerId: args.elevenPublicOwnerId,
          durationSeconds: args.durationSeconds,
          audioLoop: args.audioLoop,
          promptInfluence: args.promptInfluence,
        }),
      });
      if (wait) return jsonResult(queued, args.compact);
      const jobId = (queued as { id: string }).id;
      const result = await pollGeneration(jobId, { timeoutMs: 180_000 });
      return jsonResult({ ...queued, ...result }, args.compact);
    },
  );
}
