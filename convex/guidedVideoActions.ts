"use node";

/**
 * Assistance actions: multimodal brief analysis + approve → generate.
 * Assistance is mode-agnostic; video types (e.g. hypermotion_ad) inject context only.
 */
import { getAuthUserId } from "@convex-dev/auth/server";
import { makeFunctionReference, type FunctionReference } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { putObject } from "./lib/bunny";
import {
  generateImage,
  generateScript as generateScriptWithGateway,
  generateVideo,
} from "./lib/aiGateway";
import { runAssistanceAgentLoop } from "./lib/assistanceAgent";
import {
  emptyBriefPayload,
  attachmentRoleValidator,
  isGuidedVideoAssistanceEnabled,
  normalizeAssistedMode,
  normalizeVideoType,
  parseAgentState,
  type AssistedBriefPayload,
  type AssistedMode,
  type AttachmentRole,
  type VideoType,
} from "./lib/guidedVideoTypes";
import type { ReferenceInput } from "./lib/referenceInput";
import { friendlyGenerationErrorText } from "./lib/generationUserErrors";
import {
  extractCreativeVideoPrompt,
  finalizeGatewayVideoPrompt,
} from "./lib/videoGeneration";
import { isDirectPromptMode } from "./lib/skipPromptEnhancement";
import {
  normalizeScriptType,
  scriptDocumentTitle,
} from "./lib/composerScriptTypes";
import { styleSheetSystemInstructions } from "./lib/styleSheetGuides";
import {
  parseAssistanceGenerationPlan,
  type AssistanceGenerationPlan,
} from "./lib/assistanceGenerationPlan";
import { MAX_GENERATION_REFERENCE_ASSETS } from "./lib/elementAssetModel";

const attachmentArg = v.object({
  assetId: v.optional(v.id("assets")),
  documentId: v.optional(v.id("documents")),
  elementId: v.optional(v.id("elements")),
  role: attachmentRoleValidator,
  label: v.optional(v.string()),
  sortOrder: v.number(),
});

type BriefMediaRow = {
  attachmentId?: Id<"guidedBriefAttachments">;
  assetId?: Id<"assets">;
  documentId?: Id<"documents">;
  elementId?: Id<"elements">;
  role: string;
  label?: string;
  sortOrder: number;
  kind?: "image" | "video" | "audio" | "document";
  mimeType?: string;
  url?: string;
  summary: string;
};

type AssistanceConversation = {
  context: string[];
  generatedMedia: Array<{
    assetId: Id<"assets">;
    kind: "image" | "video" | "audio";
    url: string;
    mimeType?: string;
  }>;
};

type ClaimResult = {
  briefId: Id<"guidedBriefs">;
  threadId: Id<"generationThreads">;
  revision: number;
  mode: AssistedMode;
  videoType?: VideoType;
  compiledPrompt: string;
  generationPlanJson: string;
  generationPlanFingerprint: string;
  estimatedCredits?: number;
  payload: AssistedBriefPayload;
  stylePresetId?: Id<"stylePresets">;
  styleSheetElementId?: Id<"elements">;
  alreadyApprovedJobId?: Id<"generationJobs">;
  attachmentIds: Array<{
    assetId?: Id<"assets">;
    documentId?: Id<"documents">;
    elementId?: Id<"elements">;
    role: string;
    sortOrder: number;
  }>;
};

function expiresInOneHour(): number {
  return Math.floor(Date.now() / 1000) + 3600;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function extensionForContentType(mediaType: string): string {
  const mime = mediaType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("webm")) return "webm";
  return "bin";
}

function internalMutationRef<Args extends Record<string, unknown>, Return>(
  name: string,
): FunctionReference<"mutation", "internal", Args, Return> {
  return makeFunctionReference<"mutation", Args, Return>(name) as unknown as FunctionReference<
    "mutation",
    "internal",
    Args,
    Return
  >;
}

async function runDynamicAgentQuery<
  Args extends Record<string, unknown>,
  Result,
>(ctx: ActionCtx, name: string, args: Args): Promise<Result> {
  return (await ctx.runQuery(
    makeFunctionReference<"query", Record<string, unknown>, unknown>(name),
    args,
  )) as Result;
}

async function runDynamicAgentMutation<
  Args extends Record<string, unknown>,
  Result,
>(ctx: ActionCtx, name: string, args: Args): Promise<Result> {
  return (await ctx.runMutation(
    makeFunctionReference<"mutation", Record<string, unknown>, unknown>(name),
    args,
  )) as Result;
}

function publicMutationRef<Args extends Record<string, unknown>, Return>(
  name: string,
): FunctionReference<"mutation", "public", Args, Return> {
  return makeFunctionReference<"mutation", Args, Return>(name) as unknown as FunctionReference<
    "mutation",
    "public",
    Args,
    Return
  >;
}

function internalQueryRef<Args extends Record<string, unknown>, Return>(
  name: string,
): FunctionReference<"query", "internal", Args, Return> {
  return makeFunctionReference<"query", Args, Return>(name) as unknown as FunctionReference<
    "query",
    "internal",
    Args,
    Return
  >;
}

function publicQueryRef<Args extends Record<string, unknown>, Return>(
  name: string,
): FunctionReference<"query", "public", Args, Return> {
  return makeFunctionReference<"query", Args, Return>(name) as unknown as FunctionReference<
    "query",
    "public",
    Args,
    Return
  >;
}

function internalActionRef<Args extends Record<string, unknown>, Return>(
  name: string,
): FunctionReference<"action", "internal", Args, Return> {
  return makeFunctionReference<"action", Args, Return>(name) as unknown as FunctionReference<
    "action",
    "internal",
    Args,
    Return
  >;
}

const ensureBriefRef = publicMutationRef<
  {
    threadId: Id<"generationThreads">;
    mode: AssistedMode;
    videoType?: VideoType;
    stylePresetId?: Id<"stylePresets">;
    styleSheetElementId?: Id<"elements">;
    production?: AssistedBriefPayload["production"];
  },
  Id<"guidedBriefs">
>("guidedVideo:ensureBrief");

const getBriefInternalRef = internalQueryRef<
  { briefId: Id<"guidedBriefs"> },
  { brief: Doc<"guidedBriefs">; attachments: Doc<"guidedBriefAttachments">[] } | null
>("guidedVideo:getBriefInternal");

const getAssistanceConversationInternalRef = internalQueryRef<
  { briefId: Id<"guidedBriefs">; limit?: number; expiresUnix: number },
  AssistanceConversation
>("guidedVideo:getAssistanceConversationInternal");

const resolveBriefMediaInternalRef = internalQueryRef<
  { briefId: Id<"guidedBriefs">; expiresUnix: number },
  BriefMediaRow[]
>("guidedVideo:resolveBriefMediaInternal");

const beginAssistanceTurnRef = internalMutationRef<
  {
    ownerId: Id<"users">;
    threadId: Id<"generationThreads">;
    briefId: Id<"guidedBriefs">;
    clientTurnId: string;
    userPrompt: string;
    requestJson?: string;
    creditTransactionId?: Id<"creditTransactions">;
  },
  {
    turnId: Id<"assistanceTurns">;
    briefId: Id<"guidedBriefs">;
    revision: number;
    phase: string;
    idempotent: boolean;
    recoverable: boolean;
    resultJson?: string;
  }
>("guidedVideo:beginAssistanceTurn");

const chargeAssistanceTurnRef = internalMutationRef<
  {
    turnId: Id<"assistanceTurns">;
    ownerId: Id<"users">;
    folderId: Id<"folders">;
    inputTokens?: number;
    outputTokens?: number;
  },
  {
    creditTransactionId: Id<"creditTransactions">;
    creditsCharged: number;
    idempotent: boolean;
  }
>("guidedVideo:chargeAssistanceTurn");

const assertAssistanceTurnAffordableRef = internalQueryRef<
  { ownerId: Id<"users"> },
  { ok: boolean; creditBalance: number; minimumCredits: number }
>("guidedVideo:assertAssistanceTurnAffordable");

const commitAssistanceTurnRef = internalMutationRef<
  {
    turnId: Id<"assistanceTurns">;
    expectedRevision: number;
    userPrompt: string;
    message: string;
    decision: "ask" | "review_ready";
    patchJson?: string;
    questionsJson?: string;
    agentStateJson?: string;
    proposedModeJson?: string;
    proposedStyleJson?: string;
    assumptions: string[];
    warnings: string[];
    inferredFields: string[];
    forceUnlockFields?: string[];
    finalPrompt?: string;
    attachments?: Array<{
      assetId?: Id<"assets">;
      documentId?: Id<"documents">;
      elementId?: Id<"elements">;
      role: AttachmentRole;
      label?: string;
      sortOrder: number;
    }>;
    syncAttachments?: boolean;
    approvals?: Array<{
      toolCallId: string;
      action: "trash" | "move" | "generation" | "element_build";
      title: string;
      summary: string;
      argumentsJson: string;
      estimatedCredits?: number;
    }>;
    toolCalls?: Array<{
      toolCallId: string;
      toolName: string;
      argumentsJson: string;
      outputJson?: string;
    }>;
    attachmentRoleUpdates: Array<{
      attachmentId: Id<"guidedBriefAttachments">;
      role: AttachmentRole;
    }>;
    modelId?: string;
    repaired?: boolean;
    analysisJson?: string;
  },
  {
    turnId: Id<"assistanceTurns">;
    briefId: Id<"guidedBriefs">;
    revision: number;
    status: string;
    decision: "ask" | "review_ready";
    idempotent: boolean;
  }
>("guidedVideo:commitAssistanceTurn");

const failAssistanceTurnRef = internalMutationRef<
  {
    turnId: Id<"assistanceTurns">;
    error: string;
    assistantMessage?: string;
  },
  {
    turnId: Id<"assistanceTurns">;
    briefId: Id<"guidedBriefs">;
    revision: number;
    creditTransactionId?: Id<"creditTransactions">;
    alreadyFailed: boolean;
  }
>("guidedVideo:failAssistanceTurn");

const claimBriefApprovalRef = publicMutationRef<
  {
    briefId: Id<"guidedBriefs">;
    expectedRevision: number;
    stylePresetId?: Id<"stylePresets">;
  },
  ClaimResult
>("guidedVideo:claimBriefApproval");

const approveAssistedMediaRef = internalMutationRef<
  {
    userId: Id<"users">;
    briefId: Id<"guidedBriefs">;
    expectedRevision: number;
    planFingerprint: string;
  },
  { jobId: Id<"generationJobs">; created: boolean; replacement: boolean }
>("generation:approveAssistedMedia");

const markBriefTerminalRef = internalMutationRef<
  {
    briefId: Id<"guidedBriefs">;
    jobId?: Id<"generationJobs">;
    status: "done" | "failed";
    error?: string;
  },
  null
>("guidedVideo:markBriefTerminal");

const chargeTextGenerationRef = publicMutationRef<
  {
    folderId: Id<"folders">;
    imageReferenceCount?: number;
    videoReferenceCount?: number;
    audioReferenceCount?: number;
  },
  Id<"creditTransactions">
>("generation:chargeTextGeneration");

const refundTextGenerationRef = publicMutationRef<
  {
    transactionId: Id<"creditTransactions">;
    reason?: string;
  },
  null
>("generation:refundTextGeneration");

const getStylePresetRef = publicQueryRef<
  { presetId: Id<"stylePresets"> },
  {
    _id: Id<"stylePresets">;
    name: string;
    systemInstructions: string;
    scriptInstructions?: string;
  } | null
>("stylePresets:get");

const getElementRef = publicQueryRef<
  { elementId: Id<"elements"> },
  Doc<"elements"> | null
>("elements:get");

const completeScriptApprovalRef = publicMutationRef<
  {
    briefId: Id<"guidedBriefs">;
    expectedRevision: number;
    folderId: Id<"folders">;
    title: string;
    contentMarkdown: string;
  },
  Id<"documents">
>("guidedVideo:completeScriptApproval");

const beginElementApprovalRef = publicMutationRef<
  {
    briefId: Id<"guidedBriefs">;
    expectedRevision: number;
    folderId: Id<"folders">;
    type: "character" | "prop" | "location" | "doc";
    name: string;
    description: string;
    sourceAssetIds: Id<"assets">[];
  },
  { elementId: Id<"elements">; created: boolean }
>("guidedVideo:beginElementApproval");

const generateElementSheetForApiRef = internalActionRef<
  {
    userId: Id<"users">;
    sandboxFolderId: Id<"folders">;
    elementId: Id<"elements">;
    referenceAssetIds?: Id<"assets">[];
    referenceElementIds?: Id<"elements">[];
    sourceMode?: "photographic" | "designed";
    stylePresetSlug?: string;
    expiresUnix: number;
  },
  {
    assetId: Id<"assets">;
    elementId: Id<"elements">;
    sheetUrl: string;
    creditsSpent: number;
    buildStatus: "unbuilt" | "built";
  }
>("elementActions:generateElementSheetForApi");

const completeElementApprovalRef = internalMutationRef<
  {
    briefId: Id<"guidedBriefs">;
    elementId: Id<"elements">;
    status: "done" | "failed";
    error?: string;
  },
  null
>("guidedVideo:completeElementApproval");

const generateGuidedElementSheetRef = internalActionRef<
  {
    userId: Id<"users">;
    briefId: Id<"guidedBriefs">;
    folderId: Id<"folders">;
    elementId: Id<"elements">;
    referenceAssetIds: Id<"assets">[];
    referenceElementIds: Id<"elements">[];
    stylePresetSlug?: string;
  },
  null
>("guidedVideoActions:generateGuidedElementSheet");

const executeApprovedJobRef = internalActionRef<
  {
    jobId: Id<"generationJobs">;
    briefId: Id<"guidedBriefs">;
    mode: "image" | "video";
    aspectRatio?: string;
    resolution?: string;
    quality?: string;
    durationSeconds?: number;
    audioEnabled?: boolean;
    referenceUrls?: string[];
    referenceInputs?: ReferenceInput[];
    startFrameUrl?: string;
    skipClaim?: boolean;
  },
  null
>("guidedVideoActions:executeApprovedJob");

const markStageRef = internalMutationRef<
  {
    jobId: Id<"generationJobs">;
    stage: "queued" | "generating" | "saving" | "done" | "failed";
    error?: string;
  },
  null
>("generation:markStage");

const getJobRunContextRef = internalQueryRef<
  { jobId: Id<"generationJobs"> },
  {
    job: {
      _id: Id<"generationJobs">;
      userPrompt: string;
      mode: "image" | "video";
      resolvedModel: string;
      durationSeconds?: number;
      resolution?: string;
      aspectRatio?: string;
      quality?: string;
      skipPromptEnhancement?: boolean;
      styleSheetElementId?: Id<"elements">;
      audioEnabled?: boolean;
    };
    preset: {
      slug: string;
      name: string;
      systemInstructions: string;
      scriptInstructions?: string;
      storytelling?: boolean;
      negativePrompt?: string;
    };
  }
>("generation:getJobRunContext");

const setEnhancedPromptRef = internalMutationRef<
  {
    jobId: Id<"generationJobs">;
    enhancedPrompt: string;
    negativePrompt?: string;
  },
  null
>("generation:setEnhancedPrompt");

const createGeneratedAssetRef = internalMutationRef<
  {
    jobId: Id<"generationJobs">;
    name: string;
    kind: "image" | "video";
    mimeType: string;
  },
  { assetId: Id<"assets">; bunnyPath: string }
>("generation:createGeneratedAsset");

const completeWithOutputsRef = internalMutationRef<
  { jobId: Id<"generationJobs">; assetIds: Id<"assets">[] },
  null
>("generation:completeWithOutputs");

const failJobRef = internalMutationRef<
  { jobId: Id<"generationJobs">; error: string },
  null
>("generation:failJob");

async function saveGeneratedMedia(
  ctx: ActionCtx,
  args: {
    jobId: Id<"generationJobs">;
    kind: "image" | "video";
    name: string;
    mediaType: string;
    body: Uint8Array;
  },
): Promise<Id<"assets">> {
  const asset = await ctx.runMutation(createGeneratedAssetRef, {
    jobId: args.jobId,
    name: args.name,
    kind: args.kind,
    mimeType: args.mediaType,
  });
  await putObject({
    path: asset.bunnyPath,
    body: toArrayBuffer(args.body),
    contentType: args.mediaType,
  });
  return asset.assetId;
}

function mediaToReferenceInputs(rows: BriefMediaRow[]): ReferenceInput[] {
  const out: ReferenceInput[] = [];
  for (const row of rows) {
    if (!row.url) continue;
    if (row.kind === "image" || row.kind === "video" || row.kind === "audio") {
      out.push({
        kind: row.kind,
        url: row.url,
        mimeType: row.mimeType,
      });
    }
  }
  return out;
}

async function overlayTurnAttachments(
  ctx: ActionCtx,
  ownerId: Id<"users">,
  base: BriefMediaRow[],
  attachments: Array<{
    assetId?: Id<"assets">;
    documentId?: Id<"documents">;
    elementId?: Id<"elements">;
    role: AttachmentRole;
    label?: string;
    sortOrder: number;
  }>,
  expiresUnix: number,
): Promise<BriefMediaRow[]> {
  const keyOf = (row: {
    assetId?: Id<"assets">;
    documentId?: Id<"documents">;
    elementId?: Id<"elements">;
  }) =>
    row.assetId
      ? `asset:${row.assetId}`
      : row.documentId
        ? `document:${row.documentId}`
        : `element:${row.elementId}`;
  const byKey = new Map(base.map((row) => [keyOf(row), row]));

  for (const attachment of attachments) {
    const existing = byKey.get(keyOf(attachment));
    if (existing) {
      byKey.set(keyOf(attachment), {
        ...existing,
        role: attachment.role,
        label: attachment.label ?? existing.label,
        sortOrder: attachment.sortOrder,
      });
      continue;
    }
    if (attachment.assetId) {
      const asset = await runDynamicAgentQuery<
        { ownerId: Id<"users">; assetId: Id<"assets">; expiresUnix: number },
        {
          name: string;
          kind: string;
          mimeType: string;
          url?: string;
        } | null
      >(ctx, "assistanceWorkspace:getAssetForAgent", {
        ownerId,
        assetId: attachment.assetId,
        expiresUnix,
      });
      if (!asset) throw new Error("Attachment asset not found.");
      const kind =
        asset.kind === "image" || asset.kind === "video" || asset.kind === "audio"
          ? asset.kind
          : undefined;
      byKey.set(keyOf(attachment), {
        ...attachment,
        kind,
        mimeType: asset.mimeType,
        url: asset.url,
        summary: `${attachment.role}: ${attachment.label ?? asset.name} (${asset.kind})`,
      });
    } else if (attachment.elementId) {
      const element = await runDynamicAgentQuery<
        { ownerId: Id<"users">; elementId: Id<"elements">; expiresUnix: number },
        {
          name: string;
          type: string;
          description?: string;
          sheetUrl?: string;
        } | null
      >(ctx, "assistanceWorkspace:getElementForAgent", {
        ownerId,
        elementId: attachment.elementId,
        expiresUnix,
      });
      if (!element) throw new Error("Attachment element not found.");
      byKey.set(keyOf(attachment), {
        ...attachment,
        kind: element.sheetUrl ? "image" : undefined,
        url: element.sheetUrl,
        summary: `${attachment.role}: ${attachment.label ?? element.name} (${element.type})${element.description ? ` — ${element.description.slice(0, 500)}` : ""}`,
      });
    } else if (attachment.documentId) {
      const document = await runDynamicAgentQuery<
        { ownerId: Id<"users">; documentId: Id<"documents"> },
        { title: string; contentMarkdown: string } | null
      >(ctx, "assistanceWorkspace:getDocumentForAgent", {
        ownerId,
        documentId: attachment.documentId,
      });
      if (!document) throw new Error("Attachment document not found.");
      byKey.set(keyOf(attachment), {
        ...attachment,
        kind: "document",
        summary: `${attachment.role}: ${attachment.label ?? document.title} — ${document.contentMarkdown.slice(0, 1_500)}`,
      });
    }
  }
  return [...byKey.values()].sort((a, b) => a.sortOrder - b.sortOrder);
}

function mediaForPlan(
  rows: BriefMediaRow[],
  plan: AssistanceGenerationPlan,
): BriefMediaRow[] {
  return plan.references.map((reference) => {
    const row = rows.find((candidate) => {
      if (reference.kind === "asset") return String(candidate.assetId ?? "") === reference.id;
      if (reference.kind === "document") {
        return String(candidate.documentId ?? "") === reference.id;
      }
      if (reference.kind === "element") return String(candidate.elementId ?? "") === reference.id;
      return (
        candidate.role === "style" &&
        String(candidate.assetId ?? "") === reference.id
      );
    });
    if (!row) {
      throw new Error(`Reviewed reference “${reference.label ?? reference.id}” is no longer available.`);
    }
    return {
      ...row,
      role: reference.role,
      sortOrder: reference.sortOrder,
    };
  });
}

/**
 * User turn under Assistance — records prompt, upserts attachments, runs the
 * tool-using agent loop, never generates until explicit approval.
 */
export const submitAssistedTurn = action({
  args: {
    clientTurnId: v.optional(v.string()),
    threadId: v.id("generationThreads"),
    folderId: v.id("folders"),
    mode: v.union(
      v.literal("image"),
      v.literal("video"),
      v.literal("script"),
      v.literal("element"),
    ),
    videoType: v.optional(
      v.union(v.literal("standard"), v.literal("hypermotion_ad")),
    ),
    userPrompt: v.string(),
    stylePresetId: v.optional(v.id("stylePresets")),
    styleSheetElementId: v.optional(v.id("elements")),
    production: v.optional(
      v.object({
        durationSeconds: v.optional(v.number()),
        aspectRatio: v.optional(v.string()),
        resolution: v.optional(v.string()),
        quality: v.optional(v.string()),
        scriptType: v.optional(v.string()),
        elementType: v.optional(v.string()),
        referenceIntent: v.optional(v.string()),
        skipPromptEnhancement: v.optional(v.boolean()),
      }),
    ),
    attachments: v.optional(v.array(attachmentArg)),
  },
  returns: v.object({
    turnId: v.optional(v.id("assistanceTurns")),
    briefId: v.id("guidedBriefs"),
    revision: v.number(),
    status: v.string(),
    decision: v.union(v.literal("ask"), v.literal("review_ready")),
    idempotent: v.optional(v.boolean()),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    turnId?: Id<"assistanceTurns">;
    briefId: Id<"guidedBriefs">;
    revision: number;
    status: string;
    decision: "ask" | "review_ready";
    idempotent?: boolean;
  }> => {
    if (!isGuidedVideoAssistanceEnabled()) {
      throw new Error("Assistance is disabled on this deployment.");
    }
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const composerMode = normalizeAssistedMode(args.mode) as AssistedMode;
    const composerVideoType =
      composerMode === "video"
        ? (normalizeVideoType(args.videoType) as VideoType)
        : undefined;
    const attachmentRows = args.attachments ?? [];
    const clientTurnId =
      args.clientTurnId?.trim() ||
      `turn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

    const briefId = await ctx.runMutation(ensureBriefRef, {
      threadId: args.threadId,
      mode: composerMode,
      videoType: composerVideoType,
      stylePresetId: args.stylePresetId,
      styleSheetElementId: args.styleSheetElementId,
      production: args.production,
    });

    const snapshot = await ctx.runQuery(getBriefInternalRef, { briefId });
    if (!snapshot?.brief) throw new Error("Brief not found");
    const brief = snapshot.brief;
    if (brief.ownerId !== userId) throw new Error("Unauthorized");
    const briefMode = normalizeAssistedMode(brief.mode) as AssistedMode;
    const briefVideoType =
      briefMode === "video"
        ? (normalizeVideoType(brief.videoType) as VideoType)
        : undefined;

    const begun = await ctx.runMutation(beginAssistanceTurnRef, {
      ownerId: userId,
      threadId: args.threadId,
      briefId,
      clientTurnId,
      userPrompt: args.userPrompt.trim() || "(attachments)",
      requestJson: JSON.stringify({
        mode: composerMode,
        videoType: composerVideoType,
        stylePresetId: args.stylePresetId,
        styleSheetElementId: args.styleSheetElementId,
        production: args.production,
        attachments: attachmentRows,
      }),
    });

    if (begun.idempotent && begun.phase === "committed" && begun.resultJson) {
      const cached = JSON.parse(begun.resultJson) as {
        briefId: Id<"guidedBriefs">;
        revision: number;
        status: string;
        decision: "ask" | "review_ready";
      };
      return {
        turnId: begun.turnId,
        briefId: cached.briefId,
        revision: cached.revision,
        status: cached.status,
        decision: cached.decision,
        idempotent: true,
      };
    }
    if (begun.idempotent && begun.phase === "begun" && !begun.recoverable) {
      return {
        turnId: begun.turnId,
        briefId,
        revision: begun.revision,
        status: brief.status,
        decision: brief.status === "review_ready" ? ("review_ready" as const) : ("ask" as const),
        idempotent: true,
      };
    }
    if (begun.idempotent && begun.phase === "failed") {
      throw new Error("Assistance turn previously failed. Send a new message.");
    }

    let transactionId: Id<"creditTransactions"> | null = null;
    try {
      const conversation = await ctx.runQuery(
        getAssistanceConversationInternalRef,
        { briefId, limit: 24, expiresUnix: expiresInOneHour() },
      );
      const persistedMedia = await ctx.runQuery(resolveBriefMediaInternalRef, {
        briefId,
        expiresUnix: expiresInOneHour(),
      });
      const media = await overlayTurnAttachments(
        ctx,
        userId,
        persistedMedia,
        attachmentRows,
        expiresInOneHour(),
      );
      const currentReferenceInputs = mediaToReferenceInputs(media).slice(
        0,
        MAX_GENERATION_REFERENCE_ASSETS,
      );
      const priorReferenceSlots = Math.max(
        0,
        MAX_GENERATION_REFERENCE_ASSETS - currentReferenceInputs.length,
      );
      const referenceInputs = [
        ...currentReferenceInputs,
        ...(priorReferenceSlots > 0
          ? conversation.generatedMedia.slice(-priorReferenceSlots).map((item) => ({
              kind: item.kind,
              url: item.url,
              mimeType: item.mimeType,
            }))
          : []),
      ];
      const currentPayload =
        brief.payload && typeof brief.payload === "object"
          ? (brief.payload as AssistedBriefPayload)
          : emptyBriefPayload();

      const affordability = await ctx.runQuery(assertAssistanceTurnAffordableRef, {
        ownerId: userId,
      });
      if (!affordability.ok) {
        throw new Error(
          "You need a small credit balance to use Assistance. Top up to continue.",
        );
      }

      const previousAgentState =
        (brief.agentStateJson
          ? parseAgentState(JSON.parse(brief.agentStateJson))
          : null) ??
        (brief.agentPlanJson
          ? parseAgentState(JSON.parse(brief.agentPlanJson))
          : null);

      const analyzed = await runAssistanceAgentLoop({
        ownerId: userId,
        turnId: begun.turnId,
        briefId,
        threadId: args.threadId,
        folderId: args.folderId,
        mode: briefMode,
        videoType: briefVideoType,
        userPrompt: args.userPrompt,
        currentPayload,
        lockedFields: brief.lockedFields ?? [],
        inferredFields: brief.inferredFields ?? [],
        attachmentSummaries: media.map((m: BriefMediaRow) => m.summary),
        references: media.map((item: BriefMediaRow) => ({
          assetId: item.assetId,
          documentId: item.documentId,
          elementId: item.elementId,
          role: item.role as AttachmentRole,
          mediaKind: item.kind,
          label: item.label,
          sortOrder: item.sortOrder,
        })),
        conversationContext: conversation.context,
        previousAgentState,
        referenceInputs,
        expiresUnix: expiresInOneHour(),
        runQuery: async (name, queryArgs) =>
          runDynamicAgentQuery(ctx, name, queryArgs),
        runMutation: async (name, mutationArgs) =>
          runDynamicAgentMutation(ctx, name, mutationArgs),
      });

      const tokensUsed =
        (analyzed.usage.inputTokens ?? 0) + (analyzed.usage.outputTokens ?? 0);
      if (tokensUsed > 0 || !analyzed.failed) {
        const charged = await ctx.runMutation(chargeAssistanceTurnRef, {
          turnId: begun.turnId,
          ownerId: userId,
          folderId: args.folderId,
          inputTokens: analyzed.usage.inputTokens,
          outputTokens: analyzed.usage.outputTokens,
        });
        transactionId = charged.creditTransactionId;
      }

      if (analyzed.failed) {
        await ctx.runMutation(failAssistanceTurnRef, {
          turnId: begun.turnId,
          error: "Assistant unavailable",
          assistantMessage: analyzed.analysis.message,
        });
        return {
          turnId: begun.turnId,
          briefId,
          revision: brief.revision,
          status: brief.status,
          decision: "ask" as const,
        };
      }

      const analysis = analyzed.analysis;

      const committed = await ctx.runMutation(commitAssistanceTurnRef, {
        turnId: begun.turnId,
        expectedRevision: brief.revision,
        userPrompt: args.userPrompt,
        message: analysis.message,
        decision: analysis.decision,
        patchJson: JSON.stringify(analyzed.draft),
        questionsJson: analysis.questions?.length
          ? JSON.stringify(analysis.questions)
          : undefined,
        agentStateJson: analysis.agentState
          ? JSON.stringify(analysis.agentState)
          : undefined,
        assumptions: analysis.assumptions ?? [],
        warnings: analysis.warnings ?? [],
        inferredFields: analyzed.inferredFields,
        forceUnlockFields: analyzed.lockedFields,
        finalPrompt: analyzed.finalPrompt,
        attachments: analyzed.attachments.map((attachment) => ({
          assetId: attachment.assetId,
          documentId: attachment.documentId,
          elementId: attachment.elementId,
          role: attachment.role,
          label: attachment.label,
          sortOrder: attachment.sortOrder,
        })),
        syncAttachments: true,
        approvals: analyzed.approvals,
        toolCalls: analyzed.durableToolCalls,
        attachmentRoleUpdates: [],
        modelId: analyzed.modelId,
        repaired: analyzed.repaired,
        analysisJson: JSON.stringify({
          decision: analysis.decision,
          toolTrace: analyzed.toolTrace,
          finalPrompt: analyzed.finalPrompt,
        }),
      });

      return {
        turnId: committed.turnId,
        briefId: committed.briefId,
        revision: committed.revision,
        status: committed.status,
        decision: committed.decision,
        idempotent: committed.idempotent,
      };
    } catch (error) {
      const failed = await ctx.runMutation(failAssistanceTurnRef, {
        turnId: begun.turnId,
        error: error instanceof Error ? error.message : "Assistance turn failed",
        assistantMessage:
          "I couldn’t finish that turn. Reply again in the chat and I’ll pick up where we left off.",
      });
      const refundId = failed.creditTransactionId ?? transactionId;
      if (refundId) {
        await ctx.runMutation(refundTextGenerationRef, {
          transactionId: refundId,
          reason: "Assistance turn failed",
        });
      }
      throw error;
    }
  },
});

/**
 * Atomic approve → freeze inputs → start generation (image/video job, or script/element path).
 */
export const approveAndGenerate = action({
  args: {
    briefId: v.id("guidedBriefs"),
    expectedRevision: v.number(),
    folderId: v.optional(v.id("folders")),
    stylePresetId: v.optional(v.id("stylePresets")),
    stylePresetSlug: v.optional(v.string()),
  },
  returns: v.object({
    jobId: v.optional(v.id("generationJobs")),
    documentId: v.optional(v.id("documents")),
    elementId: v.optional(v.id("elements")),
    mode: v.string(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    jobId?: Id<"generationJobs">;
    documentId?: Id<"documents">;
    elementId?: Id<"elements">;
    mode: string;
  }> => {
    if (!isGuidedVideoAssistanceEnabled()) {
      throw new Error("Assistance is disabled on this deployment.");
    }
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const snapshot = await ctx.runQuery(getBriefInternalRef, { briefId: args.briefId });
    if (!snapshot?.brief || snapshot.brief.ownerId !== userId) {
      throw new Error("Brief not found");
    }
    if (snapshot.brief.revision !== args.expectedRevision) {
      throw new Error("Brief was updated elsewhere. Refresh and try again.");
    }
    const reviewedPlan = parseAssistanceGenerationPlan(
      snapshot.brief.generationPlanJson,
    );
    if (!reviewedPlan) {
      throw new Error("The reviewed generation plan is stale. Review the brief again.");
    }
    if (reviewedPlan.mode === "script" && snapshot.brief.approvedDocumentId) {
      return {
        documentId: snapshot.brief.approvedDocumentId,
        mode: "script",
      };
    }
    if (
      reviewedPlan.mode === "element" &&
      snapshot.brief.status === "done" &&
      snapshot.brief.approvedElementId
    ) {
      return {
        elementId: snapshot.brief.approvedElementId,
        mode: "element",
      };
    }

    if (reviewedPlan.mode === "image" || reviewedPlan.mode === "video") {
      if (
        args.stylePresetId &&
        reviewedPlan.settings.stylePresetId !== String(args.stylePresetId)
      ) {
        throw new Error("Style changed after review. Review the brief again.");
      }
      const media = await ctx.runQuery(resolveBriefMediaInternalRef, {
        briefId: args.briefId,
        expiresUnix: expiresInOneHour(),
      });
      const plannedMedia = mediaForPlan(media, reviewedPlan);
      const referenceInputs = mediaToReferenceInputs(plannedMedia);
      const startFrame = plannedMedia.find(
        (item) => item.role === "start_frame" && item.url,
      );
      const approved = await ctx.runMutation(approveAssistedMediaRef, {
        userId,
        briefId: args.briefId,
        expectedRevision: args.expectedRevision,
        planFingerprint: reviewedPlan.fingerprint,
      });
      // Media execution is scheduled transactionally inside approveAssistedMedia.
      void media;
      void plannedMedia;
      void referenceInputs;
      void startFrame;
      return { jobId: approved.jobId, mode: reviewedPlan.mode };
    }

    const media = await ctx.runQuery(resolveBriefMediaInternalRef, {
      briefId: args.briefId,
      expiresUnix: expiresInOneHour(),
    });
    const plannedMedia = mediaForPlan(media, reviewedPlan);
    const referenceInputs = mediaToReferenceInputs(plannedMedia);
    const claim = await ctx.runMutation(claimBriefApprovalRef, {
      briefId: args.briefId,
      expectedRevision: args.expectedRevision,
      stylePresetId: args.stylePresetId,
    });

    if (claim.alreadyApprovedJobId) {
      return { jobId: claim.alreadyApprovedJobId, mode: claim.mode };
    }

    const plan = parseAssistanceGenerationPlan(claim.generationPlanJson);
    if (
      !plan ||
      plan.fingerprint !== claim.generationPlanFingerprint ||
      plan.mode !== claim.mode
    ) {
      throw new Error("The reviewed generation plan is stale. Review the brief again.");
    }
    const stylePresetId = args.stylePresetId ?? claim.stylePresetId;
    if (
      args.stylePresetId &&
      plan.settings.stylePresetId &&
      String(args.stylePresetId) !== plan.settings.stylePresetId
    ) {
      throw new Error("Style changed after review. Review the brief again.");
    }
    if (
      !stylePresetId &&
      (claim.mode === "image" || claim.mode === "video" || claim.mode === "script")
    ) {
      throw new Error("Select a style before approving.");
    }

    if (claim.mode === "script") {
      let scriptChargeId: Id<"creditTransactions"> | null = null;
      try {
        if (!args.folderId || !stylePresetId) {
          throw new Error("Script approval needs a folder and style preset.");
        }
        const preset = await ctx.runQuery(getStylePresetRef, {
          presetId: stylePresetId,
        });
        if (!preset) throw new Error("Style preset not available.");
        let styleSheet: Doc<"elements"> | null = null;
        if (claim.styleSheetElementId) {
          styleSheet = await ctx.runQuery(getElementRef, {
            elementId: claim.styleSheetElementId,
          });
        }
        const presetInstructions =
          styleSheet && styleSheet.type === "style_sheet"
            ? styleSheetSystemInstructions({
                name: styleSheet.name,
                styleRules: styleSheet.styleRules,
                renderMode: styleSheet.renderMode,
              })
            : preset.systemInstructions;
        const scriptType = normalizeScriptType(
          claim.payload.production.scriptType ?? "production",
        );
        scriptChargeId = await ctx.runMutation(chargeTextGenerationRef, {
          folderId: args.folderId,
          imageReferenceCount: referenceInputs.filter(
            (reference) => reference.kind === "image",
          ).length,
          videoReferenceCount: referenceInputs.filter(
            (reference) => reference.kind === "video",
          ).length,
          audioReferenceCount: referenceInputs.filter(
            (reference) => reference.kind === "audio",
          ).length,
        });
        const markdown = await generateScriptWithGateway({
          userPrompt: plan.finalPrompt,
          presetName: preset.name,
          presetInstructions,
          scriptInstructions: preset.scriptInstructions,
          referenceInputs,
          scriptType,
        });
        const title = scriptDocumentTitle(
          scriptType,
          claim.payload.subject ?? plan.finalPrompt,
          markdown,
        );
        const documentId = await ctx.runMutation(completeScriptApprovalRef, {
          briefId: claim.briefId,
          expectedRevision: claim.revision,
          folderId: args.folderId,
          title,
          contentMarkdown: markdown,
        });
        return { documentId, mode: claim.mode };
      } catch (error) {
        if (scriptChargeId) {
          await ctx.runMutation(refundTextGenerationRef, {
            transactionId: scriptChargeId,
            reason: "Assisted script generation failed",
          });
        }
        await ctx.runMutation(markBriefTerminalRef, {
          briefId: claim.briefId,
          status: "failed",
          error: error instanceof Error ? error.message : "Script generation failed",
        });
        throw error;
      }
    }

    if (claim.mode === "element") {
      try {
        if (!args.folderId) {
          throw new Error("Element approval needs a folder.");
        }
        const rawType = claim.payload.production.elementType ?? "character";
        const elementType =
          rawType === "prop" ||
          rawType === "location" ||
          rawType === "doc" ||
          rawType === "character"
            ? rawType
            : "character";
        const begun = await ctx.runMutation(beginElementApprovalRef, {
          briefId: claim.briefId,
          expectedRevision: claim.revision,
          folderId: args.folderId,
          type: elementType,
          name: (claim.payload.subject ?? "New element").slice(0, 80),
          description: plan.finalPrompt,
          sourceAssetIds: claim.attachmentIds
            .map((attachment) => attachment.assetId)
            .filter((id): id is Id<"assets"> => Boolean(id)),
        });
        if (elementType === "doc") {
          await ctx.runMutation(completeElementApprovalRef, {
            briefId: claim.briefId,
            elementId: begun.elementId,
            status: "done",
          });
        } else {
          await ctx.scheduler.runAfter(0, generateGuidedElementSheetRef, {
            userId,
            briefId: claim.briefId,
            folderId: args.folderId,
            elementId: begun.elementId,
            referenceAssetIds: claim.attachmentIds
              .map((attachment) => attachment.assetId)
              .filter((id): id is Id<"assets"> => Boolean(id)),
            referenceElementIds: claim.attachmentIds
              .map((attachment) => attachment.elementId)
              .filter((id): id is Id<"elements"> => Boolean(id)),
            stylePresetSlug: args.stylePresetSlug ?? "unstyled",
          });
        }
        return { elementId: begun.elementId, mode: claim.mode };
      } catch (error) {
        await ctx.runMutation(markBriefTerminalRef, {
          briefId: claim.briefId,
          status: "failed",
          error: error instanceof Error ? error.message : "Element generation failed",
        });
        throw error;
      }
    }

    throw new Error("Unsupported Assistance mode.");
  },
});

export const generateGuidedElementSheet = internalAction({
  args: {
    userId: v.id("users"),
    briefId: v.id("guidedBriefs"),
    folderId: v.id("folders"),
    elementId: v.id("elements"),
    referenceAssetIds: v.array(v.id("assets")),
    referenceElementIds: v.array(v.id("elements")),
    stylePresetSlug: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      await ctx.runAction(generateElementSheetForApiRef, {
        userId: args.userId,
        sandboxFolderId: args.folderId,
        elementId: args.elementId,
        referenceAssetIds: args.referenceAssetIds,
        referenceElementIds: args.referenceElementIds,
        sourceMode: "designed",
        stylePresetSlug: args.stylePresetSlug ?? "unstyled",
        expiresUnix: expiresInOneHour(),
      });
      await ctx.runMutation(completeElementApprovalRef, {
        briefId: args.briefId,
        elementId: args.elementId,
        status: "done",
      });
    } catch (error) {
      await ctx.runMutation(completeElementApprovalRef, {
        briefId: args.briefId,
        elementId: args.elementId,
        status: "failed",
        error:
          error instanceof Error ? error.message : "Element sheet generation failed",
      });
    }
    return null;
  },
});

const claimJobExecutionRef = internalMutationRef<
  { jobId: Id<"generationJobs">; attemptId: string },
  { acquired: boolean; stage: string }
>("generation:claimJobExecution");

/**
 * Resolve reviewed media from the brief and execute the approved job.
 * Scheduled transactionally from approveAssistedMedia.
 */
export const runAssistedApprovedJob = internalAction({
  args: {
    jobId: v.id("generationJobs"),
    briefId: v.id("guidedBriefs"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const attemptId = `exec_${args.jobId}_${Date.now()}`;
    const claim = await ctx.runMutation(claimJobExecutionRef, {
      jobId: args.jobId,
      attemptId,
    });
    if (!claim.acquired) return null;

    try {
      const snapshot = await ctx.runQuery(getBriefInternalRef, {
      briefId: args.briefId,
      });
      if (!snapshot?.brief) {
        throw new Error("Brief not found for approved job");
      }
      const plan = parseAssistanceGenerationPlan(snapshot.brief.generationPlanJson);
      if (!plan || (plan.mode !== "image" && plan.mode !== "video")) {
        throw new Error("Reviewed generation plan missing for approved job");
      }
      const media = await ctx.runQuery(resolveBriefMediaInternalRef, {
        briefId: args.briefId,
        expiresUnix: expiresInOneHour(),
      });
      const plannedMedia = mediaForPlan(media, plan);
      const startFrame = plannedMedia.find(
        (item) => item.role === "start_frame" && item.url,
      );
      const referenceInputs = mediaToReferenceInputs(
        plannedMedia.filter((item) => item.role !== "start_frame"),
      );
      await ctx.scheduler.runAfter(0, executeApprovedJobRef, {
        jobId: args.jobId,
        briefId: args.briefId,
        mode: plan.mode,
        aspectRatio: plan.settings.aspectRatio,
        resolution: plan.settings.resolution,
        quality: plan.settings.quality,
        durationSeconds: plan.settings.durationSeconds,
        audioEnabled: plan.settings.audioEnabled,
        referenceUrls: referenceInputs
          .filter((reference) => reference.kind === "image")
          .map((reference) => reference.url),
        referenceInputs,
        startFrameUrl: startFrame?.url,
        skipClaim: true,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Approved generation could not start";
      await ctx.runMutation(failJobRef, {
        jobId: args.jobId,
        error: message,
      });
      await ctx.runMutation(markBriefTerminalRef, {
        briefId: args.briefId,
        jobId: args.jobId,
        status: "failed",
        error: message,
      });
    }
    return null;
  },
});

export const executeApprovedJob = internalAction({
  args: {
    jobId: v.id("generationJobs"),
    briefId: v.id("guidedBriefs"),
    mode: v.union(v.literal("image"), v.literal("video")),
    aspectRatio: v.optional(v.string()),
    resolution: v.optional(v.string()),
    quality: v.optional(v.string()),
    durationSeconds: v.optional(v.number()),
    audioEnabled: v.optional(v.boolean()),
    referenceUrls: v.optional(v.array(v.string())),
    referenceInputs: v.optional(
      v.array(
        v.object({
          kind: v.union(
            v.literal("image"),
            v.literal("video"),
            v.literal("audio"),
          ),
          url: v.string(),
          mimeType: v.optional(v.string()),
        }),
      ),
    ),
    startFrameUrl: v.optional(v.string()),
    skipClaim: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const referenceInputs = args.referenceInputs ?? [];
    try {
      if (!args.skipClaim) {
        const claim = await ctx.runMutation(claimJobExecutionRef, {
          jobId: args.jobId,
          attemptId: `exec_${args.jobId}_${Date.now()}`,
        });
        if (!claim.acquired) return null;
      }
      const { job, preset } = await ctx.runQuery(getJobRunContextRef, {
        jobId: args.jobId,
      });
      const enhancedPrompt = job.userPrompt;
      await ctx.runMutation(setEnhancedPromptRef, {
        jobId: args.jobId,
        enhancedPrompt,
      });

      if (args.mode === "video") {
        const referenceImageUrls = referenceInputs
          .filter((input) => input.kind === "image")
          .map((input) => input.url);
        const directPrompt = isDirectPromptMode({
          skipPromptEnhancement: true,
          presetSlug: preset.slug,
          styleSheetElementId: job.styleSheetElementId,
        });
        const videoPrompt = finalizeGatewayVideoPrompt({
          prompt: enhancedPrompt,
          startFrameUrl: args.startFrameUrl,
          referenceImageCount: referenceImageUrls.length,
          gatewayModelId: job.resolvedModel,
          creativePrompt: extractCreativeVideoPrompt(enhancedPrompt),
          directPrompt,
        });
        const video = await generateVideo({
          prompt: videoPrompt,
          aspectRatio: args.aspectRatio,
          resolution: args.resolution,
          durationSeconds: args.durationSeconds,
          generateAudio: args.audioEnabled ?? false,
          modelId: job.resolvedModel,
          startFrameUrl: args.startFrameUrl,
          referenceImageUrls,
          referenceVideoUrls: referenceInputs
            .filter((input) => input.kind === "video")
            .map((input) => input.url),
          referenceAudioUrls: referenceInputs
            .filter((input) => input.kind === "audio")
            .map((input) => input.url),
        });
        await ctx.runMutation(markStageRef, {
          jobId: args.jobId,
          stage: "saving",
        });
        const assetId = await saveGeneratedMedia(ctx, {
          jobId: args.jobId,
          kind: "video",
          name: `assisted-video-${args.jobId.slice(-6)}.${extensionForContentType(video.mediaType)}`,
          mediaType: video.mediaType,
          body: video.data,
        });
        await ctx.runMutation(completeWithOutputsRef, {
          jobId: args.jobId,
          assetIds: [assetId],
        });
        await ctx.runMutation(markBriefTerminalRef, {
          briefId: args.briefId,
          jobId: args.jobId,
          status: "done",
        });
        return null;
      }

      const imageResult = await generateImage({
        prompt: enhancedPrompt,
        modelId: job.resolvedModel,
        aspectRatio: args.aspectRatio,
        resolution: args.resolution,
        quality: args.quality,
        referenceUrls: args.referenceUrls ?? [],
      });
      await ctx.runMutation(markStageRef, {
        jobId: args.jobId,
        stage: "saving",
      });
      const assetIds: Id<"assets">[] = [];
      for (const [index, image] of imageResult.images.entries()) {
        const assetId = await saveGeneratedMedia(ctx, {
          jobId: args.jobId,
          kind: "image",
          name: `assisted-image-${index + 1}.${extensionForContentType(image.mediaType)}`,
          mediaType: image.mediaType,
          body: image.data,
        });
        assetIds.push(assetId);
      }
      await ctx.runMutation(completeWithOutputsRef, {
        jobId: args.jobId,
        assetIds,
      });
      await ctx.runMutation(markBriefTerminalRef, {
        briefId: args.briefId,
        jobId: args.jobId,
        status: "done",
      });
      return null;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Generation failed";
      await ctx.runMutation(failJobRef, {
        jobId: args.jobId,
        error: friendlyGenerationErrorText(
          message,
          args.mode === "video" ? "video" : "image",
        ),
      });
      await ctx.runMutation(markBriefTerminalRef, {
        briefId: args.briefId,
        jobId: args.jobId,
        status: "failed",
        error: friendlyGenerationErrorText(
          message,
          args.mode === "video" ? "video" : "image",
        ),
      });
      return null;
    }
  },
});
