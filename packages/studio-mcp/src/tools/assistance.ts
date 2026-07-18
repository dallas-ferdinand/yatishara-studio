import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { jsonResult, studioFetch } from "../client.js";

const productionSchema = z
  .object({
    aspectRatio: z.string().optional(),
    resolution: z.string().optional(),
    quality: z.string().optional(),
    durationSeconds: z.number().optional(),
    videoType: z.string().optional(),
    audioEnabled: z.boolean().optional(),
    scriptType: z.string().optional(),
    elementType: z.string().optional(),
    referenceIntent: z.string().optional(),
    skipPromptEnhancement: z.boolean().optional(),
  })
  .optional();

export function registerAssistanceTools(server: McpServer) {
  server.tool(
    "studio_ensure_brief",
    "Ensure an assisted production brief (creates a thread if needed). Does not run the chat co-pilot — set production knobs then approve when review_ready.",
    {
      threadId: z.string().optional(),
      folderId: z.string().optional(),
      mode: z.enum(["image", "video", "script", "element"]),
      videoType: z.enum(["standard", "hypermotion_ad"]).optional(),
      styleSheetElementId: z.string().optional(),
      production: productionSchema,
    },
    async (args) =>
      jsonResult(
        await studioFetch("/assistance/briefs", {
          method: "POST",
          body: JSON.stringify(args),
        }),
      ),
  );

  server.tool(
    "studio_get_brief",
    "Get an assisted brief by briefId, or by threadId (pass threadId only).",
    {
      briefId: z.string().optional(),
      threadId: z.string().optional(),
    },
    async ({ briefId, threadId }) => {
      if (briefId) {
        return jsonResult(await studioFetch(`/assistance/briefs/${encodeURIComponent(briefId)}`));
      }
      if (threadId) {
        return jsonResult(
          await studioFetch(`/assistance/threads/${encodeURIComponent(threadId)}/brief`),
        );
      }
      throw new Error("Pass briefId or threadId");
    },
  );

  server.tool(
    "studio_patch_brief_production",
    "Patch production knobs on a brief (aspectRatio, duration, resolution, etc.). Requires expectedRevision for optimistic concurrency.",
    {
      briefId: z.string(),
      expectedRevision: z.number(),
      production: z.object({
        aspectRatio: z.string().optional(),
        resolution: z.string().optional(),
        quality: z.string().optional(),
        durationSeconds: z.number().optional(),
        videoType: z.string().optional(),
        audioEnabled: z.boolean().optional(),
        scriptType: z.string().optional(),
        elementType: z.string().optional(),
        referenceIntent: z.string().optional(),
        skipPromptEnhancement: z.boolean().optional(),
      }),
    },
    async ({ briefId, expectedRevision, production }) =>
      jsonResult(
        await studioFetch(`/assistance/briefs/${encodeURIComponent(briefId)}/production`, {
          method: "PATCH",
          body: JSON.stringify({ expectedRevision, production }),
        }),
      ),
  );

  server.tool(
    "studio_list_pending_approvals",
    "List pending review_ready briefs and workspace side-effect approvals.",
    {
      status: z.enum(["pending"]).optional(),
      threadId: z.string().optional(),
    },
    async ({ status, threadId }) => {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (threadId) params.set("threadId", threadId);
      const query = params.toString() ? `?${params}` : "?status=pending";
      return jsonResult(await studioFetch(`/assistance/approvals${query}`));
    },
  );

  server.tool(
    "studio_approve_brief",
    "Approve a review_ready brief and start generation. Returns jobId / documentId / elementId. Requires generate scope.",
    {
      briefId: z.string(),
      expectedRevision: z.number(),
      folderId: z.string().optional(),
      stylePresetSlug: z.string().optional(),
    },
    async (args) =>
      jsonResult(
        await studioFetch(`/assistance/briefs/${encodeURIComponent(args.briefId)}/approve`, {
          method: "POST",
          body: JSON.stringify({
            expectedRevision: args.expectedRevision,
            folderId: args.folderId,
            stylePresetSlug: args.stylePresetSlug,
          }),
        }),
      ),
  );

  server.tool(
    "studio_reject_brief",
    "Reject / abandon an assisted brief. Requires write scope.",
    {
      briefId: z.string(),
      expectedRevision: z.number(),
      reason: z.string().optional(),
    },
    async ({ briefId, expectedRevision, reason }) =>
      jsonResult(
        await studioFetch(`/assistance/briefs/${encodeURIComponent(briefId)}/reject`, {
          method: "POST",
          body: JSON.stringify({ expectedRevision, reason }),
        }),
      ),
  );

  server.tool(
    "studio_decide_assistance_approval",
    "Approve or deny a workspace side-effect approval (trash/move/element_build).",
    {
      approvalId: z.string(),
      decision: z.enum(["approve", "deny"]),
    },
    async ({ approvalId, decision }) =>
      jsonResult(
        await studioFetch(`/assistance/approvals/${encodeURIComponent(approvalId)}/decide`, {
          method: "POST",
          body: JSON.stringify({ decision }),
        }),
      ),
  );
}
