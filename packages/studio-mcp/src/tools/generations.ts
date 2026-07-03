import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { jsonResult, pollGeneration, studioFetch } from "../client.js";

const estimateSchema = {
  mode: z.enum(["image", "video", "script"]).optional(),
  resolution: z.string().optional(),
  durationSeconds: z.number().optional(),
  audioEnabled: z.boolean().optional(),
  referenceAssetIds: z.array(z.string()).optional(),
};

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
            mode: args.mode ?? "image",
          }),
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
    "Generate an image and save it to a Studio folder. Call studio_estimate_generation first. Uses wait=true (usually completes in seconds).",
    {
      prompt: z.string(),
      folderId: z.string().optional(),
      stylePreset: z.string().optional().describe("Preset slug, e.g. realism"),
      aspectRatio: z.string().optional(),
      resolution: z.string().optional().describe("1K, 2K, or 4K"),
      referenceAssetIds: z.array(z.string()).optional(),
    },
    async (args) =>
      jsonResult(
        await studioFetch("/generations", {
          method: "POST",
          body: JSON.stringify({ mode: "image", wait: true, ...args }),
        }),
      ),
  );

  server.tool(
    "studio_generate_video",
    "Generate a video and save it to a Studio folder. Call studio_estimate_generation first. Starts async and polls until done (up to 5 min). Pass folderId or use key default.",
    {
      prompt: z.string(),
      folderId: z.string().optional(),
      stylePreset: z.string().optional(),
      aspectRatio: z.string().optional(),
      resolution: z.string().optional().describe("854x480, 1280x720, or 1920x1080"),
      durationSeconds: z.number().optional().describe("4-15 seconds"),
      audioEnabled: z.boolean().optional(),
      referenceAssetIds: z.array(z.string()).optional(),
    },
    async (args) => {
      const queued = await studioFetch("/generations", {
        method: "POST",
        body: JSON.stringify({ mode: "video", wait: false, ...args }),
      });
      const jobId = queued.id as string;
      const result = await pollGeneration(jobId);
      return jsonResult({ ...queued, ...result });
    },
  );

  server.tool(
    "studio_generate_script",
    "Generate a script document in a folder. Call studio_estimate_generation with mode=script first. Upload audio refs for voice briefs — Flash listens to attached audio. Returns documentId and title.",
    {
      prompt: z.string(),
      folderId: z.string().optional(),
      stylePreset: z.string().optional(),
      referenceAssetIds: z.array(z.string()).optional(),
    },
    async (args) =>
      jsonResult(
        await studioFetch("/generations", {
          method: "POST",
          body: JSON.stringify({ mode: "script", ...args }),
        }),
      ),
  );
}
