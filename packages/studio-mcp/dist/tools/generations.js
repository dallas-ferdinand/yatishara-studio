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
        .describe("Storyboard / opening still for video (first_frame I2V). Required when people are on camera. Generate via studio_generate_image first."),
    videoModel: z
        .string()
        .optional()
        .describe('Explicit video model choice. Call studio_list_video_models first. Omit = seedance-2.0 (Studio UI default). MCP-only: kling-3.0-i2v for start-frame I2V with faces.'),
};
const cartoonPresetHint = 'MCP handoff default: stylePreset "unstyled" + skipPromptEnhancement true (prompt reaches Seedance verbatim). Use toon-prime|toon-adult|toon-surreal|toon-family|toon-cgi|toon-neon-idol only when you want GPT rewrite (set skipPromptEnhancement: false).';
const stylePresetFieldDesc = "Preset slug: unstyled (default MCP handoff — no style rewrite), raw (alias), or toon-prime|toon-adult|toon-surreal|toon-family|toon-cgi|toon-neon-idol";
const scriptTypeFieldDesc = "Script output type: production (full timed script), storyboard (panel beats + storyboard/generation prompts), shot_list (table of shots), image_prompt (still brief + ## Generation prompt), video_prompt (Seedance beats + video prompt), scene_split (multiple ## Scene N blocks), style_guide (cartoon look bible), element_brief (character/prop/location bible), reference_sheet_guide (multi-panel sheet build guide), vo_script (narrator/VO lines only). Enhancement runs when skipPromptEnhancement is false.";
const referenceIntentFieldDesc = "How attached references influence rewrite: auto (infer from preset), stylize (translate uploads into preset look), match_reference (photographic fidelity), element_lock (built element sheets are canonical).";
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
];
const REFERENCE_INTENT_ENUM = ["auto", "stylize", "match_reference", "element_lock"];
export function registerGenerationTools(server) {
    server.tool("studio_estimate_generation", "Estimate credit cost before generating. Call this before studio_generate_image, studio_generate_video, or studio_generate_script. Returns cost, creditBalance, and canGenerate.", estimateSchema, async (args) => jsonResult(await studioFetch("/generations/estimate", {
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
    })));
    server.tool("studio_list_video_models", "List video models for MCP selection. Includes kling-3.0-i2v (MCP-only, not in Studio UI).", {}, async () => jsonResult(await studioFetch("/video-models?scope=mcp")));
    server.tool("Estimate total production budget for multiple generation items (props, shots, etc.) with contingency. Returns credits, TT$, and creditBalance. Call before cartoon-ad-production budget approval.", {
        items: z.array(z.object({
            label: z.string(),
            mode: z.enum(["image", "video", "script"]),
            resolution: z.string().optional(),
            durationSeconds: z.number().optional(),
            audioEnabled: z.boolean().optional(),
            hasReferenceInput: z.boolean().optional(),
            referenceAssetIds: z.array(z.string()).optional(),
            maxRounds: z.number(),
        })),
        contingencyPercent: z.number().optional().describe("Default 15"),
    }, async (args) => jsonResult(await studioFetch("/generations/estimate-batch", {
        method: "POST",
        body: JSON.stringify(args),
    })));
    server.tool("studio_list_presets", "List style presets (slug, name, kind). Call before first generate if unsure which stylePreset slug to use.", { kind: z.enum(["image", "video", "any"]).optional() }, async ({ kind }) => {
        const query = kind ? `?kind=${encodeURIComponent(kind)}` : "";
        return jsonResult(await studioFetch(`/style-presets${query}`));
    });
    server.tool("studio_list_generations", "List recent generation jobs with status and output assets.", { limit: z.number().optional().describe("Max jobs, default 20") }, async ({ limit }) => {
        const query = limit ? `?limit=${encodeURIComponent(String(limit))}` : "";
        return jsonResult(await studioFetch(`/generations${query}`));
    });
    server.tool("studio_get_generation", "Poll a generation job by ID. Status: queued | generating | saving | done | failed.", { jobId: z.string() }, async ({ jobId }) => jsonResult(await studioFetch(`/generations/${encodeURIComponent(jobId)}`)));
    server.tool("studio_generate_image", `Generate an image and save it to a Studio folder. Call studio_estimate_generation first. Uses wait=true (usually completes in seconds).

DEFAULT: skipPromptEnhancement=true + stylePreset unstyled — prompt goes DIRECT to GPT Image 2 with NO rewrite pass. ${cartoonPresetHint}`, {
        prompt: z.string(),
        folderId: z.string().optional(),
        stylePreset: z.string().optional().describe(stylePresetFieldDesc),
        aspectRatio: z.string().optional(),
        resolution: z.string().optional().describe("1K, 2K, or 4K"),
        referenceAssetIds: z.array(z.string()).optional().describe("Direct asset IDs (e.g. sheetAssetId)"),
        referenceElementIds: z
            .array(z.string())
            .optional()
            .describe("Built element IDs — uses sheet image + description, not upload refs"),
        skipPromptEnhancement: z.boolean().optional().describe("Default true — pass prompt verbatim (use with unstyled preset)"),
        referenceIntent: z.enum(REFERENCE_INTENT_ENUM).optional().describe(referenceIntentFieldDesc),
    }, async (args) => jsonResult(await studioFetch("/generations", {
        method: "POST",
        body: JSON.stringify({
            mode: "image",
            wait: true,
            ...args,
            stylePreset: args.stylePreset ?? "unstyled",
            skipPromptEnhancement: args.skipPromptEnhancement ?? true,
        }),
    })));
    server.tool("studio_generate_video", `Generate a video and save it to a Studio folder. Call studio_estimate_generation first. Async + poll (up to 5 min).

DEFAULT: skipPromptEnhancement=true + stylePreset unstyled — your prompt goes DIRECT to Seedance/Kling with NO GPT rewrite pass. Only optional [Image N] ref lines append when referenceElementIds are set; startFrameAssetId attaches as I2V first_frame separately.

VIDEO WITH PEOPLE (required workflow):
1. studio_generate_image — storyboard still with referenceElementIds (characters + props + locations compose the opening shot)
2. studio_generate_video — pass startFrameAssetId from step 1 + referenceElementIds for prop/location lock. Characters are IN the start frame, not face-sheet refs.

Wait ≥65s between video calls (1 req/min gateway quota). ${cartoonPresetHint}

videoModel: explicit choice — call studio_list_video_models. Omit = seedance-2.0. Pass kling-3.0-i2v when production selects Kling (start-frame I2V, faces).`, {
        prompt: z.string(),
        folderId: z.string().optional(),
        stylePreset: z.string().optional().describe(stylePresetFieldDesc),
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
            .describe("Storyboard asset ID — first_frame I2V. Required when people appear on camera."),
        skipPromptEnhancement: z.boolean().optional(),
        referenceIntent: z.enum(REFERENCE_INTENT_ENUM).optional().describe(referenceIntentFieldDesc),
        videoModel: z
            .string()
            .optional()
            .describe('Explicit model slug from studio_list_video_models. Omit = seedance-2.0. Use kling-3.0-i2v when chosen for I2V/faces.'),
    }, async (args) => {
        const queued = await studioFetch("/generations", {
            method: "POST",
            body: JSON.stringify({
                mode: "video",
                wait: false,
                ...args,
                stylePreset: args.stylePreset ?? "unstyled",
                skipPromptEnhancement: args.skipPromptEnhancement ?? true,
            }),
        });
        const jobId = queued.id;
        const result = await pollGeneration(jobId);
        return jsonResult({ ...queued, ...result });
    });
    server.tool("studio_generate_script", `Generate a script document in a folder. Call studio_estimate_generation with mode=script first. Upload audio refs for voice briefs — Flash listens to attached audio. Returns documentId and title. ${cartoonPresetHint}`, {
        prompt: z.string(),
        folderId: z.string().optional(),
        stylePreset: z.string().optional().describe(stylePresetFieldDesc),
        referenceAssetIds: z.array(z.string()).optional(),
        referenceElementIds: z.array(z.string()).optional(),
        skipPromptEnhancement: z.boolean().optional(),
        scriptType: z.enum(COMPOSER_SCRIPT_TYPE_ENUM).optional().describe(scriptTypeFieldDesc),
        referenceIntent: z.enum(REFERENCE_INTENT_ENUM).optional().describe(referenceIntentFieldDesc),
    }, async (args) => jsonResult(await studioFetch("/generations", {
        method: "POST",
        body: JSON.stringify({
            mode: "script",
            ...args,
            stylePreset: args.stylePreset ?? "unstyled",
            skipPromptEnhancement: args.skipPromptEnhancement ?? true,
            scriptType: args.scriptType ?? "production",
        }),
    })));
}
