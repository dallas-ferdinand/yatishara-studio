import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { authedMutation, authedQuery } from "./lib/customFunctions";
import {
  assistedBriefPayloadValidator,
  assistedModeValidator,
  attachmentRoleValidator,
  briefStatusValidator,
  emptyBriefPayload,
  emptyAgentState,
  guidedQuestionValidator,
  isGuidedVideoAssistanceEnabled,
  normalizeAssistedMode,
  normalizeVideoType,
  parseAgentState,
  videoTypeValidator,
  type AssistedBriefPayload,
  type AssistanceAgentState,
  type AssistedMode,
  type AttachmentRole,
  type BriefStatus,
  type GuidedQuestion,
  type VideoType,
} from "./lib/guidedVideoTypes";
import { formatAssistanceChatMessage } from "./lib/assistedAnalysis";
import {
  applyQuestionAnswer,
  attachmentPresenceFromRoles,
  compileBriefPrompt,
  evaluateBrief,
  listVideoTypesForUi,
  mergeBriefPayload,
  normalizeAssistanceAspectRatio,
  transitionAssistedMode,
} from "./lib/hypermotionWorkflow";
import {
  CREDIT_PRICE_TTD,
  creditCostForGeneration,
  textCreditCost,
  TEXT_MIN_SELL_TTD,
} from "./lib/generationPricing";
import { signBunnyFullUrl } from "./lib/bunny";
import {
  buildAssistanceGenerationPlan,
  parseAssistanceGenerationPlan,
  type AssistanceGenerationPlan,
  type AssistanceReferenceManifestItem,
  type AssistanceStyleContext,
} from "./lib/assistanceGenerationPlan";
import { resolveVideoModel } from "./lib/videoModels";
import { styleSheetSystemInstructions } from "./lib/styleSheetGuides";
import { isFolderInSandbox } from "./lib/studioApi/folderScope";

const briefReturn = v.object({
  _id: v.id("guidedBriefs"),
  threadId: v.id("generationThreads"),
  mode: assistedModeValidator,
  videoType: v.optional(videoTypeValidator),
  status: briefStatusValidator,
  revision: v.number(),
  userPrompt: v.string(),
  payload: assistedBriefPayloadValidator,
  lockedFields: v.array(v.string()),
  inferredFields: v.array(v.string()),
  assumptions: v.array(v.string()),
  warnings: v.array(v.string()),
  offeredOptionalIds: v.array(v.string()),
  skippedOptionalIds: v.array(v.string()),
  pendingQuestions: v.optional(v.array(guidedQuestionValidator)),
  compiledPrompt: v.optional(v.string()),
  generationPlanJson: v.optional(v.string()),
  generationPlanFingerprint: v.optional(v.string()),
  stylePresetId: v.optional(v.id("stylePresets")),
  styleSheetElementId: v.optional(v.id("elements")),
  approvedRevision: v.optional(v.number()),
  approvedJobId: v.optional(v.id("generationJobs")),
  approvedDocumentId: v.optional(v.id("documents")),
  approvedElementId: v.optional(v.id("elements")),
  approvedAt: v.optional(v.number()),
  error: v.optional(v.string()),
  estimatedCredits: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

const attachmentReturn = v.object({
  _id: v.id("guidedBriefAttachments"),
  briefId: v.id("guidedBriefs"),
  assetId: v.optional(v.id("assets")),
  documentId: v.optional(v.id("documents")),
  elementId: v.optional(v.id("elements")),
  role: v.string(),
  label: v.optional(v.string()),
  sortOrder: v.number(),
  briefRevision: v.number(),
});

function parsePayload(raw: unknown): AssistedBriefPayload {
  if (raw && typeof raw === "object") {
    return raw as AssistedBriefPayload;
  }
  return emptyBriefPayload();
}

function parseQuestions(json?: string | null): GuidedQuestion[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as GuidedQuestion[]) : [];
  } catch {
    return [];
  }
}

function serializeQuestions(questions: GuidedQuestion[]): string {
  return JSON.stringify(questions);
}

function serializeReviewSnapshot(args: {
  mode: string;
  videoType?: string;
  payload: AssistedBriefPayload;
  assumptions: string[];
  warnings: string[];
  lockedFields: string[];
  inferredFields: string[];
  compiledPrompt?: string;
  plan?: AssistanceGenerationPlan;
  stylePresetId?: Id<"stylePresets">;
  styleSheetElementId?: Id<"elements">;
}): string {
  return JSON.stringify({
    mode: args.mode,
    videoType: args.videoType,
    payload: args.payload,
    assumptions: args.assumptions,
    warnings: args.warnings,
    lockedFields: args.lockedFields,
    inferredFields: args.inferredFields,
    compiledPrompt: args.plan?.finalPrompt ?? args.compiledPrompt,
    estimatedCredits: args.plan?.estimate.credits,
    stylePresetId: args.stylePresetId ? String(args.stylePresetId) : undefined,
    styleSheetElementId: args.styleSheetElementId
      ? String(args.styleSheetElementId)
      : undefined,
    styleSheetLabel: args.plan?.style?.name,
    modelLabel: args.plan?.settings.resolvedModel,
    referenceSummary: args.plan?.references.map((reference) =>
      reference.label ? `${reference.role}: ${reference.label}` : reference.role,
    ),
  });
}

type AuthedCtx = (QueryCtx | MutationCtx) & {
  user: Doc<"users"> & { _id: Id<"users"> };
};

async function asUserCtx(ctx: QueryCtx | MutationCtx, userId: Id<"users">): Promise<AuthedCtx> {
  const user = await ctx.db.get("users", userId);
  if (!user) {
    throw new Error("User not found");
  }
  return Object.assign(ctx, { user: { ...user, _id: userId } });
}

async function requireThreadOwner(
  ctx: AuthedCtx,
  threadId: Id<"generationThreads">,
) {
  const thread = await ctx.db.get("generationThreads", threadId);
  if (!thread || thread.ownerId !== ctx.user._id) {
    throw new Error("Unauthorized");
  }
  return thread;
}

async function requireBriefOwner(
  ctx: AuthedCtx,
  briefId: Id<"guidedBriefs">,
) {
  const brief = await ctx.db.get("guidedBriefs", briefId);
  if (!brief || brief.ownerId !== ctx.user._id) {
    throw new Error("Brief not found");
  }
  return brief;
}

function estimateCreditsForBrief(
  mode: string,
  payload: AssistedBriefPayload,
  hasRefs: boolean,
): number | undefined {
  if (mode === "video") {
    return creditCostForGeneration({
      tier: "pro_video",
      resolution: payload.production.resolution,
      aspectRatio: payload.production.aspectRatio,
      durationSeconds: payload.production.durationSeconds,
      hasReferenceInput: hasRefs,
      audioEnabled:
        payload.audio.voiceover === "include" ||
        payload.audio.sfx === "include" ||
        payload.audio.music === "include",
      videoModel: resolveVideoModel().slug,
    });
  }
  if (mode === "image") {
    return creditCostForGeneration({
      tier: "image",
      resolution: payload.production.resolution ?? "2K",
      quality: payload.production.quality ?? "medium",
      aspectRatio: payload.production.aspectRatio,
      hasReferenceInput: hasRefs,
    });
  }
  return undefined;
}

async function requireOwnedAttachment(
  ctx: QueryCtx | MutationCtx,
  ownerId: Id<"users">,
  attachment: {
    assetId?: Id<"assets">;
    documentId?: Id<"documents">;
    elementId?: Id<"elements">;
  },
): Promise<void> {
  const ids = [attachment.assetId, attachment.documentId, attachment.elementId].filter(Boolean);
  if (ids.length !== 1) throw new Error("Attachment must identify exactly one item.");
  if (attachment.assetId) {
    const asset = await ctx.db.get("assets", attachment.assetId);
    if (!asset || asset.ownerId !== ownerId || asset.deletedAt) {
      throw new Error("Attachment asset not found.");
    }
  } else if (attachment.documentId) {
    const document = await ctx.db.get("documents", attachment.documentId);
    if (!document || document.ownerId !== ownerId || document.deletedAt) {
      throw new Error("Attachment document not found.");
    }
  } else if (attachment.elementId) {
    const element = await ctx.db.get("elements", attachment.elementId);
    if (!element || element.ownerId !== ownerId || element.deletedAt) {
      throw new Error("Attachment element not found.");
    }
  }
}

async function buildPlanForBrief(
  ctx: MutationCtx,
  brief: Doc<"guidedBriefs">,
  payload: AssistedBriefPayload,
  compiledPrompt: string,
  warnings: string[],
): Promise<AssistanceGenerationPlan> {
  const attachments = await ctx.db
    .query("guidedBriefAttachments")
    .withIndex("by_brief", (q) => q.eq("briefId", brief._id))
    .collect();
  const references: AssistanceReferenceManifestItem[] = [];
  for (const attachment of attachments) {
    if (attachment.assetId) {
      const asset = await ctx.db.get("assets", attachment.assetId);
      if (!asset || asset.ownerId !== brief.ownerId || asset.deletedAt) continue;
      references.push({
        kind: "asset",
        id: String(asset._id),
        role: attachment.role as AttachmentRole,
        mediaKind:
          asset.kind === "image" || asset.kind === "video" || asset.kind === "audio"
            ? asset.kind
            : undefined,
        label: attachment.label ?? asset.name,
        sortOrder: attachment.sortOrder,
      });
    } else if (attachment.documentId) {
      const document = await ctx.db.get("documents", attachment.documentId);
      if (!document || document.ownerId !== brief.ownerId || document.deletedAt) continue;
      references.push({
        kind: "document",
        id: String(document._id),
        role: attachment.role as AttachmentRole,
        label: attachment.label ?? document.title,
        sortOrder: attachment.sortOrder,
      });
    } else if (attachment.elementId) {
      const element = await ctx.db.get("elements", attachment.elementId);
      if (!element || element.ownerId !== brief.ownerId || element.deletedAt) continue;
      const sheetAsset = element.sheetAssetId
        ? await ctx.db.get("assets", element.sheetAssetId)
        : null;
      references.push({
        kind: "element",
        id: String(element._id),
        role: attachment.role as AttachmentRole,
        mediaKind:
          sheetAsset &&
          sheetAsset.ownerId === brief.ownerId &&
          !sheetAsset.deletedAt
            ? sheetAsset.kind === "image" ||
              sheetAsset.kind === "video" ||
              sheetAsset.kind === "audio"
              ? sheetAsset.kind
              : undefined
            : undefined,
        label: attachment.label ?? element.name,
        sortOrder: attachment.sortOrder,
      });
    }
  }

  let style: AssistanceStyleContext | undefined;
  if (brief.styleSheetElementId) {
    const sheet = await ctx.db.get("elements", brief.styleSheetElementId);
    if (
      !sheet ||
      sheet.ownerId !== brief.ownerId ||
      sheet.deletedAt ||
      sheet.type !== "style_sheet"
    ) {
      throw new Error("Style Sheet not found.");
    }
    if (!sheet.styleRules?.trim() && !sheet.sheetAssetId) {
      throw new Error("Build the Style Sheet before using it for generation.");
    }
    style = {
      elementId: String(sheet._id),
      name: sheet.name,
      styleRules: sheet.styleRules?.slice(0, 20_000),
      renderMode: sheet.renderMode,
      sheetAssetId: sheet.sheetAssetId ? String(sheet.sheetAssetId) : undefined,
      instructions: styleSheetSystemInstructions({
        name: sheet.name,
        styleRules: sheet.styleRules,
        renderMode: sheet.renderMode,
        hasVisualReference: Boolean(sheet.sheetAssetId),
      }),
    };
    if (sheet.sheetAssetId) {
      const visual = await ctx.db.get("assets", sheet.sheetAssetId);
      if (visual && visual.ownerId === brief.ownerId && !visual.deletedAt) {
        references.push({
          kind: "style_sheet_visual",
          id: String(visual._id),
          role: "style",
          mediaKind:
            visual.kind === "image" || visual.kind === "video" || visual.kind === "audio"
              ? visual.kind
              : undefined,
          label: `${sheet.name} style visual`,
          sortOrder: -1,
        });
      }
    }
  }

  const mode = normalizeAssistedMode(brief.mode);
  const videoModel = mode === "video" ? resolveVideoModel() : undefined;
  const stylePreset = brief.stylePresetId
    ? await ctx.db.get("stylePresets", brief.stylePresetId)
    : null;
  const promptWithPreset = [
    stylePreset?.systemInstructions?.trim(),
    stylePreset?.negativePrompt?.trim()
      ? `Style negative constraints: ${stylePreset.negativePrompt.trim()}`
      : undefined,
    compiledPrompt,
  ]
    .filter((part): part is string => Boolean(part))
    .join("\n\n");
  return buildAssistanceGenerationPlan({
    mode,
    videoType: brief.videoType,
    payload,
    compiledPrompt: promptWithPreset,
    references,
    warnings,
    resolvedModel:
      videoModel?.gatewayModelId ??
      process.env.GATEWAY_IMAGE_MODEL_ID?.trim() ??
      "openai/gpt-image-2",
    videoModel: videoModel?.slug,
    videoCapabilities: videoModel,
    stylePresetId: brief.stylePresetId ? String(brief.stylePresetId) : undefined,
    style,
  });
}

function toBriefReturn(
  brief: Doc<"guidedBriefs">,
  attachments: Doc<"guidedBriefAttachments">[],
) {
  const payload = parsePayload(brief.payload);
  const roles = attachments.map((a) => a.role as AttachmentRole);
  return {
    _id: brief._id,
    threadId: brief.threadId,
    mode: brief.mode,
    videoType: brief.videoType,
    status: brief.status,
    revision: brief.revision,
    userPrompt: brief.userPrompt,
    payload,
    lockedFields: brief.lockedFields,
    inferredFields: brief.inferredFields,
    assumptions: brief.assumptions,
    warnings: brief.warnings,
    offeredOptionalIds: brief.offeredOptionalIds,
    skippedOptionalIds: brief.skippedOptionalIds,
    pendingQuestions: parseQuestions(brief.pendingQuestionsJson),
    compiledPrompt: brief.compiledPrompt,
    generationPlanJson: brief.generationPlanJson,
    generationPlanFingerprint: brief.generationPlanFingerprint,
    stylePresetId: brief.stylePresetId,
    styleSheetElementId: brief.styleSheetElementId,
    approvedRevision: brief.approvedRevision,
    approvedJobId: brief.approvedJobId,
    approvedDocumentId: brief.approvedDocumentId,
    approvedElementId: brief.approvedElementId,
    approvedAt: brief.approvedAt,
    error: brief.error,
    estimatedCredits:
      brief.estimatedCredits ??
      parseAssistanceGenerationPlan(brief.generationPlanJson)?.estimate.credits ??
      estimateCreditsForBrief(brief.mode, payload, roles.length > 0),
    createdAt: brief.createdAt,
    updatedAt: brief.updatedAt,
  };
}

export const featureEnabled = authedQuery({
  args: {},
  returns: v.boolean(),
  handler: async () => isGuidedVideoAssistanceEnabled(),
});

export const listVideoTypes = authedQuery({
  args: {},
  returns: v.array(
    v.object({
      slug: videoTypeValidator,
      label: v.string(),
      description: v.string(),
    }),
  ),
  handler: async () => listVideoTypesForUi(),
});

export const getBriefForThread = authedQuery({
  args: { threadId: v.id("generationThreads") },
  returns: v.union(briefReturn, v.null()),
  handler: async (ctx, args) => {
    await requireThreadOwner(ctx, args.threadId);
    const brief = await ctx.db
      .query("guidedBriefs")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .order("desc")
      .first();
    if (!brief) return null;
    const attachments = await ctx.db
      .query("guidedBriefAttachments")
      .withIndex("by_brief", (q) => q.eq("briefId", brief._id))
      .collect();
    attachments.sort((a, b) => a.sortOrder - b.sortOrder || a._creationTime - b._creationTime);
    return toBriefReturn(brief, attachments);
  },
});

export const listBriefAttachments = authedQuery({
  args: { briefId: v.id("guidedBriefs") },
  returns: v.array(attachmentReturn),
  handler: async (ctx, args) => {
    await requireBriefOwner(ctx, args.briefId);
    const rows = await ctx.db
      .query("guidedBriefAttachments")
      .withIndex("by_brief", (q) => q.eq("briefId", args.briefId))
      .collect();
    return rows.map((row) => ({
      _id: row._id,
      briefId: row.briefId,
      assetId: row.assetId,
      documentId: row.documentId,
      elementId: row.elementId,
      role: row.role,
      label: row.label,
      sortOrder: row.sortOrder,
      briefRevision: row.briefRevision,
    }));
  },
});

async function ensureBriefHandler(
  ctx: AuthedCtx & MutationCtx,
  args: {
    threadId: Id<"generationThreads">;
    mode: AssistedMode;
    videoType?: VideoType;
    stylePresetId?: Id<"stylePresets">;
    styleSheetElementId?: Id<"elements">;
    durationIsUserExplicit?: boolean;
    production?: AssistedBriefPayload["production"];
  },
): Promise<Id<"guidedBriefs">> {
  if (!isGuidedVideoAssistanceEnabled()) {
    throw new Error("Assistance is disabled on this deployment.");
  }
  await requireThreadOwner(ctx, args.threadId);
  if (args.styleSheetElementId) {
    const sheet = await ctx.db.get("elements", args.styleSheetElementId);
    if (
      !sheet ||
      sheet.ownerId !== ctx.user._id ||
      sheet.deletedAt ||
      sheet.type !== "style_sheet"
    ) {
      throw new Error("Style Sheet not found.");
    }
  }
  const existing = await ctx.db
    .query("guidedBriefs")
    .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
    .order("desc")
    .first();
  const now = Date.now();
  if (existing && !["approved", "generating", "done"].includes(existing.status)) {
    const currentMode = normalizeAssistedMode(existing.mode);
    const modeChanged = currentMode !== args.mode;
    const nextVideoType =
      args.mode === "video" ? normalizeVideoType(args.videoType) : undefined;
    const videoTypeChanged =
      args.mode === "video" &&
      (existing.videoType ?? "standard") !== (nextVideoType ?? "standard");
    // Composer settings may refresh style/production, but must not silently
    // overwrite an agent-resolved mode or wipe a reviewable plan every turn.
    if (!modeChanged && !videoTypeChanged) {
      const explicitDurationPath = "production.durationSeconds";
      const protectedProductionFields = existing.inferredFields.filter(
        (path) => path.startsWith("production."),
      );
      const merged = mergeBriefPayload({
        current: parsePayload(existing.payload),
        patch: args.production ? { production: args.production } : undefined,
        lockedFields: [
          ...new Set([...existing.lockedFields, ...protectedProductionFields]),
        ],
        forceUnlock: args.durationIsUserExplicit ? [explicitDurationPath] : [],
      });
      await ctx.db.patch(existing._id, {
        payload: merged.payload,
        lockedFields: args.durationIsUserExplicit
          ? [...new Set([...existing.lockedFields, explicitDurationPath])]
          : existing.lockedFields,
        inferredFields: args.durationIsUserExplicit
          ? existing.inferredFields.filter((path) => path !== explicitDurationPath)
          : existing.inferredFields,
        stylePresetId: args.stylePresetId ?? existing.stylePresetId,
        styleSheetElementId:
          args.styleSheetElementId ?? existing.styleSheetElementId,
        updatedAt: now,
      });
      return existing._id;
    }
    const transitioned = transitionAssistedMode({
      currentMode,
      nextMode: args.mode,
      currentVideoType: existing.videoType,
      nextVideoType,
      payload: parsePayload(existing.payload),
      lockedFields: existing.lockedFields,
    });
    const merged = mergeBriefPayload({
      current: transitioned.payload,
      patch: args.production ? { production: args.production } : undefined,
      lockedFields: [
        ...new Set([
          ...transitioned.lockedFields,
          ...existing.inferredFields.filter((path) =>
            path.startsWith("production."),
          ),
        ]),
      ],
      forceUnlock: args.durationIsUserExplicit
        ? ["production.durationSeconds"]
        : [],
    });
    const previousAgentState = (() => {
      try {
        return existing.agentStateJson
          ? parseAgentState(JSON.parse(existing.agentStateJson))
          : undefined;
      } catch {
        return undefined;
      }
    })();
    const switchedAgentState = emptyAgentState({
      goal: `Create a strong ${args.mode} for the user`,
      knownFacts: [
        ...(previousAgentState?.knownFacts ?? []),
        `Output mode: ${args.mode}${nextVideoType ? ` / ${nextVideoType}` : ""}`,
      ],
      missingCritical: [],
      missingOptional: previousAgentState?.missingOptional ?? [],
      nextFocus: `Re-evaluate the preserved brief for ${args.mode} requirements`,
      unresolvedDecisions: [],
      readinessRationale: "",
      readyForReview: false,
      turnStrategy: "confirm",
    });
    await ctx.db.patch(existing._id, {
      mode: args.mode,
      videoType: nextVideoType,
      payload: merged.payload,
      revision: existing.revision + 1,
      lockedFields: args.durationIsUserExplicit
        ? [
            ...new Set([
              ...transitioned.lockedFields,
              "production.durationSeconds",
            ]),
          ]
        : transitioned.lockedFields,
      inferredFields: existing.inferredFields.filter((path) =>
        transitioned.lockedFields.includes(path) &&
        !(args.durationIsUserExplicit && path === "production.durationSeconds"),
      ),
      stylePresetId: args.stylePresetId ?? existing.stylePresetId,
      styleSheetElementId: args.styleSheetElementId ?? existing.styleSheetElementId,
      agentStateJson: JSON.stringify(switchedAgentState),
      agentPlanJson: JSON.stringify(switchedAgentState),
      generationPlanJson: undefined,
      generationPlanFingerprint: undefined,
      estimatedCredits: undefined,
      compiledPrompt: undefined,
      pendingQuestionsJson: undefined,
      assumptions: [],
      warnings: [],
      error: undefined,
      approvedRevision: undefined,
      approvedJobId: undefined,
      approvedDocumentId: undefined,
      approvedElementId: undefined,
      approvedAt: undefined,
      status: "collecting",
      updatedAt: now,
    });
    return existing._id;
  }
  const payload = emptyBriefPayload(args.production);
  return await ctx.db.insert("guidedBriefs", {
    ownerId: ctx.user._id,
    threadId: args.threadId,
    mode: args.mode,
    videoType: args.mode === "video" ? normalizeVideoType(args.videoType) : undefined,
    status: "collecting",
    revision: 1,
    userPrompt: "",
    payload,
    lockedFields: args.durationIsUserExplicit
      ? ["production.durationSeconds"]
      : [],
    inferredFields: [],
    assumptions: [],
    warnings: [],
    offeredOptionalIds: [],
    skippedOptionalIds: [],
    stylePresetId: args.stylePresetId,
    styleSheetElementId: args.styleSheetElementId,
    createdAt: now,
    updatedAt: now,
  });
}

export const ensureBrief = authedMutation({
  args: {
    threadId: v.id("generationThreads"),
    mode: assistedModeValidator,
    videoType: v.optional(videoTypeValidator),
    stylePresetId: v.optional(v.id("stylePresets")),
    styleSheetElementId: v.optional(v.id("elements")),
    durationIsUserExplicit: v.optional(v.boolean()),
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
  },
  returns: v.id("guidedBriefs"),
  handler: async (ctx, args) => ensureBriefHandler(ctx, args),
});

/**
 * @deprecated Compatibility shim for cached clients. New UI uses composer turns
 * via `submitAssistedTurn` only. Do not call from StudioShell. Remove after
 * `migrateLegacyAssistanceData` drains and analytics show zero callers.
 */
export const answerQuestions = authedMutation({
  args: {
    briefId: v.id("guidedBriefs"),
    expectedRevision: v.number(),
    answers: v.array(
      v.object({
        questionId: v.string(),
        value: v.optional(v.string()),
        values: v.optional(v.array(v.string())),
        leaveOut: v.optional(v.boolean()),
        assetId: v.optional(v.id("assets")),
        uploadRole: v.optional(attachmentRoleValidator),
      }),
    ),
  },
  returns: briefReturn,
  handler: async (ctx, args) => {
    const brief = await requireBriefOwner(ctx, args.briefId);
    if (brief.revision !== args.expectedRevision) {
      throw new Error("Brief was updated elsewhere. Refresh and try again.");
    }
    if (["approved", "generating", "done"].includes(brief.status)) {
      throw new Error("This brief is already approved.");
    }

    let payload = parsePayload(brief.payload);
    const lockedFields = new Set(brief.lockedFields);
    const offered = new Set(brief.offeredOptionalIds);
    const skipped = new Set(brief.skippedOptionalIds);
    const pendingQuestions = parseQuestions(brief.pendingQuestionsJson);
    let resolvedMode = normalizeAssistedMode(brief.mode);
    let resolvedVideoType = brief.videoType;
    let styleSheetElementId = brief.styleSheetElementId;
    const now = Date.now();

    for (const answer of args.answers) {
      const question = pendingQuestions.find((candidate) => candidate.id === answer.questionId);
      if (!question) {
        throw new Error("Question is no longer active. Refresh and try again.");
      }
      if (question.id === "resolve_mode_conflict" && answer.value) {
        const nextMode = normalizeAssistedMode(answer.value);
        const offeredModes = new Set(question.options?.map((option) => option.value) ?? []);
        if (!offeredModes.has(answer.value)) {
          throw new Error("Answer does not match the offered output choices.");
        }
        const transitioned = transitionAssistedMode({
          currentMode: resolvedMode,
          nextMode,
          currentVideoType: resolvedVideoType,
          nextVideoType: nextMode === "video" ? "standard" : undefined,
          payload,
          lockedFields: [...lockedFields],
        });
        resolvedMode = transitioned.mode;
        resolvedVideoType = transitioned.videoType;
        payload = transitioned.payload;
        lockedFields.clear();
        for (const field of transitioned.lockedFields) lockedFields.add(field);
        continue;
      }
      if (
        question.id === "resolve_style_conflict" &&
        (answer.value === "photoreal" || answer.value === "illustrated") &&
        styleSheetElementId
      ) {
        const selectedSheet = await ctx.db.get("elements", styleSheetElementId);
        const selectedDirection =
          selectedSheet?.renderMode === "photoreal" ? "photoreal" : "illustrated";
        if (answer.value !== selectedDirection) {
          // The user chose the request over the selected sheet. Remove the
          // conflicting sheet so the confirmed setting actually takes effect.
          styleSheetElementId = undefined;
          payload.production.styleSheetElementId = undefined;
          lockedFields.add("production.styleSheetElementId");
        }
      }
      const applied = applyQuestionAnswer({
        payload,
        questionId: answer.questionId,
        value: answer.value,
        values: answer.values,
        leaveOut: answer.leaveOut,
        question,
      });
      if (
        !applied.accepted &&
        (answer.value !== undefined || answer.values !== undefined || answer.leaveOut)
      ) {
        throw new Error("Answer does not match the offered question.");
      }
      payload = applied.payload;
      for (const field of applied.lockedFields) lockedFields.add(field);
      for (const id of applied.offeredOptionalIds) offered.add(id);
      for (const id of applied.skippedOptionalIds) skipped.add(id);

      if (answer.assetId) {
        const asset = await ctx.db.get("assets", answer.assetId);
        if (!asset || asset.ownerId !== ctx.user._id || asset.deletedAt) {
          throw new Error("Upload not found");
        }
        const role = question.uploadRole ?? answer.uploadRole ?? "supporting";
        await ctx.db.insert("guidedBriefAttachments", {
          briefId: brief._id,
          ownerId: ctx.user._id,
          assetId: answer.assetId,
          role,
          label: asset.name,
          sortOrder: now,
          briefRevision: brief.revision + 1,
          createdAt: now,
        });
        if (role === "logo") {
          payload.brand.logo = "include";
          lockedFields.add("brand.logo");
          offered.add("logo");
        }
        if (role === "product") {
          lockedFields.add("brand.productFidelity");
        }
      }
    }

    const attachments = await ctx.db
      .query("guidedBriefAttachments")
      .withIndex("by_brief", (q) => q.eq("briefId", brief._id))
      .collect();
    const presence = attachmentPresenceFromRoles(
      attachments.map((a) => a.role as AttachmentRole),
    );
    const policy = evaluateBrief({
      mode: resolvedMode,
      videoType: resolvedVideoType,
      payload,
      attachments: presence,
      offeredOptionalIds: [...offered],
      skippedOptionalIds: [...skipped],
      lockedFields: [...lockedFields],
    });
    const compiled = policy.complete
      ? compileBriefPrompt(
          resolvedMode,
          resolvedVideoType,
          payload,
          presence,
        )
      : undefined;
    const warnings = [...new Set([...brief.warnings, ...policy.warnings])];
    const plan =
      policy.complete && compiled
        ? await buildPlanForBrief(
            ctx,
            {
              ...brief,
              mode: resolvedMode,
              videoType: resolvedVideoType,
              styleSheetElementId,
            },
            payload,
            compiled,
            warnings,
          )
        : undefined;

    const nextRevision = brief.revision + 1;
    await ctx.db.patch(brief._id, {
      payload,
      mode: resolvedMode,
      videoType: resolvedVideoType,
      revision: nextRevision,
      lockedFields: [...lockedFields],
      offeredOptionalIds: [...offered],
      skippedOptionalIds: [...skipped],
      status: policy.complete ? "review_ready" : "awaiting_input",
      pendingQuestionsJson: serializeQuestions(policy.questions),
      warnings,
      compiledPrompt: compiled,
      generationPlanJson: plan ? JSON.stringify(plan) : undefined,
      generationPlanFingerprint: plan?.fingerprint,
      estimatedCredits: plan?.estimate.credits,
      styleSheetElementId,
      updatedAt: now,
    });

    // Compatibility path: never emit interactive question cards. Chat owns replies.
    await ctx.db.insert("generationEvents", {
      ownerId: ctx.user._id,
      threadId: brief.threadId,
      kind: policy.complete ? "review" : "assistant",
      order: now,
      briefId: brief._id,
      briefRevision: nextRevision,
      message: policy.complete
        ? "Brief ready — review and approve to generate."
        : formatAssistanceChatMessage(
            "Thanks — keep replying in the chat and I’ll refine this.",
            policy.questions,
          ),
      briefSnapshotJson: policy.complete
        ? serializeReviewSnapshot({
            mode: resolvedMode,
            videoType: resolvedVideoType,
            payload,
            assumptions: brief.assumptions,
            warnings,
            lockedFields: [...lockedFields],
            inferredFields: brief.inferredFields,
            compiledPrompt: compiled,
            plan,
            stylePresetId: brief.stylePresetId,
            styleSheetElementId,
          })
        : undefined,
      createdAt: now,
    });

    const updated = await ctx.db.get("guidedBriefs", brief._id);
    if (!updated) throw new Error("Brief missing after update");
    const atts = await ctx.db
      .query("guidedBriefAttachments")
      .withIndex("by_brief", (q) => q.eq("briefId", brief._id))
      .collect();
    return toBriefReturn(updated, atts);
  },
});

/**
 * @deprecated Compatibility shim for cached clients. Corrections go through the
 * composer via `submitAssistedTurn`. Remove with answerQuestions after drain.
 */
async function editBriefHandler(
  ctx: AuthedCtx & MutationCtx,
  args: {
    briefId: Id<"guidedBriefs">;
    expectedRevision: number;
    patch: AssistedBriefPayload;
    lockFields?: string[];
  },
) {
    const brief = await requireBriefOwner(ctx, args.briefId);
    if (brief.revision !== args.expectedRevision) {
      throw new Error("Brief was updated elsewhere. Refresh and try again.");
    }
    if (["approved", "generating", "done"].includes(brief.status)) {
      throw new Error("This brief is already approved.");
    }
    const current = parsePayload(brief.payload);
    const forceUnlock = args.lockFields ?? [];
    const { payload } = mergeBriefPayload({
      current,
      patch: args.patch,
      lockedFields: brief.lockedFields,
      forceUnlock,
    });
    const locked = new Set([...brief.lockedFields, ...forceUnlock]);
    const attachments = await ctx.db
      .query("guidedBriefAttachments")
      .withIndex("by_brief", (q) => q.eq("briefId", brief._id))
      .collect();
    const presence = attachmentPresenceFromRoles(
      attachments.map((a) => a.role as AttachmentRole),
    );
    const policy = evaluateBrief({
      mode: normalizeAssistedMode(brief.mode),
      videoType: brief.videoType,
      payload,
      attachments: presence,
      offeredOptionalIds: brief.offeredOptionalIds,
      skippedOptionalIds: brief.skippedOptionalIds,
      lockedFields: [...locked],
    });
    const now = Date.now();
    const nextRevision = brief.revision + 1;
    const compiled = policy.complete
      ? compileBriefPrompt(
          normalizeAssistedMode(brief.mode),
          brief.videoType,
          payload,
          presence,
        )
      : undefined;
    const plan =
      policy.complete && compiled
        ? await buildPlanForBrief(ctx, brief, payload, compiled, brief.warnings)
        : undefined;
    await ctx.db.patch(brief._id, {
      payload,
      revision: nextRevision,
      lockedFields: [...locked],
      status: policy.complete ? "review_ready" : "awaiting_input",
      pendingQuestionsJson: serializeQuestions(policy.questions),
      compiledPrompt: compiled,
      generationPlanJson: plan ? JSON.stringify(plan) : undefined,
      generationPlanFingerprint: plan?.fingerprint,
      estimatedCredits: plan?.estimate.credits,
      updatedAt: now,
    });
    if (policy.complete) {
      await ctx.db.insert("generationEvents", {
        ownerId: ctx.user._id,
        threadId: brief.threadId,
        kind: "review",
        order: now,
        briefId: brief._id,
        briefRevision: nextRevision,
        message: "updated — hit generate when you want",
        briefSnapshotJson: serializeReviewSnapshot({
          mode: brief.mode,
          videoType: brief.videoType,
          payload,
          assumptions: brief.assumptions,
          warnings: brief.warnings,
          lockedFields: [...locked],
          inferredFields: brief.inferredFields,
          compiledPrompt: compiled,
          plan,
          stylePresetId: brief.stylePresetId,
          styleSheetElementId: brief.styleSheetElementId,
        }),
        createdAt: now,
      });
    }
    const updated = await ctx.db.get("guidedBriefs", brief._id);
    if (!updated) throw new Error("Brief missing after update");
    return toBriefReturn(updated, attachments);
}

export const editBrief = authedMutation({
  args: {
    briefId: v.id("guidedBriefs"),
    expectedRevision: v.number(),
    patch: assistedBriefPayloadValidator,
    lockFields: v.optional(v.array(v.string())),
  },
  returns: briefReturn,
  handler: async (ctx, args) => editBriefHandler(ctx, args),
});

/** UI production tweaks for review cards — rebuilds plan/estimate without a chat event. */
async function patchBriefProductionHandler(
  ctx: AuthedCtx & MutationCtx,
  args: {
    briefId: Id<"guidedBriefs">;
    expectedRevision: number;
    production: {
      aspectRatio?: string;
      resolution?: string;
      quality?: string;
      durationSeconds?: number;
      videoType?: VideoType;
      audioEnabled?: boolean;
    };
  },
) {
    const brief = await requireBriefOwner(ctx, args.briefId);
    if (brief.revision !== args.expectedRevision) {
      throw new Error("Brief was updated elsewhere. Refresh and try again.");
    }
    if (["approved", "generating", "done"].includes(brief.status)) {
      throw new Error("This brief is already approved.");
    }
    let payload = parsePayload(brief.payload);
    if (!payload.production || typeof payload.production !== "object") {
      payload.production = emptyBriefPayload().production;
    }
    const mode = normalizeAssistedMode(brief.mode);
    let videoType =
      mode === "video"
        ? (normalizeVideoType(brief.videoType) as VideoType)
        : undefined;
    const locked = new Set(brief.lockedFields);

    if (args.production.videoType !== undefined) {
      if (mode !== "video") {
        throw new Error("Video type can only be set for video jobs.");
      }
      const nextVideoType = normalizeVideoType(args.production.videoType);
      if ((videoType ?? "standard") !== nextVideoType) {
        const transitioned = transitionAssistedMode({
          currentMode: "video",
          nextMode: "video",
          currentVideoType: videoType,
          nextVideoType,
          payload,
          lockedFields: [...locked],
        });
        payload = transitioned.payload;
        locked.clear();
        for (const field of transitioned.lockedFields) locked.add(field);
        videoType = transitioned.videoType;
      } else {
        videoType = nextVideoType;
      }
      // Keep a formerly complete Standard review editable after switching into
      // Hypermotion by applying safe leave-out defaults for undecided brand fields.
      if (videoType === "hypermotion_ad") {
        if (!payload.brand.productFidelity) {
          payload.brand.productFidelity = "conceptual";
          locked.add("brand.productFidelity");
        }
        if (payload.brand.logo === "undecided") {
          payload.brand.logo = "omit";
          locked.add("brand.logo");
        }
        if (payload.brand.ctaMode === "undecided") {
          payload.brand.ctaMode = "omit";
          locked.add("brand.ctaMode");
        }
      }
      locked.add("videoType");
    }

    if (args.production.aspectRatio !== undefined) {
      const aspectRatio = normalizeAssistanceAspectRatio(args.production.aspectRatio);
      if (!aspectRatio) {
        throw new Error("Unsupported aspect ratio.");
      }
      payload.production.aspectRatio = aspectRatio;
      locked.add("production.aspectRatio");
    }

    if (args.production.resolution !== undefined) {
      const raw = args.production.resolution.trim();
      if (mode === "image") {
        const compact = raw.toUpperCase().replace(/\s+/g, "");
        if (!["1K", "2K", "4K"].includes(compact)) {
          throw new Error("Image resolution must be 1K, 2K, or 4K.");
        }
        payload.production.resolution = compact;
      } else if (mode === "video") {
        const lower = raw.toLowerCase();
        let next: string | null = null;
        if (
          lower === "720p" ||
          lower === "720" ||
          lower === "hd" ||
          lower === "1280x720"
        ) {
          next = "1280x720";
        } else if (
          lower === "1080p" ||
          lower === "1080" ||
          lower === "fhd" ||
          lower === "1920x1080"
        ) {
          next = "1920x1080";
        }
        if (!next) {
          throw new Error("Video resolution must be 720p or 1080p.");
        }
        payload.production.resolution = next;
      } else {
        throw new Error("Resolution is only editable for image and video jobs.");
      }
      locked.add("production.resolution");
    }

    if (args.production.quality !== undefined) {
      if (mode !== "image") {
        throw new Error("Quality is only editable for image jobs.");
      }
      const quality = args.production.quality.trim().toLowerCase();
      if (!["low", "medium", "high"].includes(quality)) {
        throw new Error("Image quality must be low, medium, or high.");
      }
      payload.production.quality = quality;
      locked.add("production.quality");
    }

    if (args.production.durationSeconds !== undefined) {
      if (mode !== "video") {
        throw new Error("Duration is only editable for video jobs.");
      }
      const duration = Math.round(Number(args.production.durationSeconds));
      if (!Number.isFinite(duration) || duration < 4 || duration > 15) {
        throw new Error("Video duration must be between 4 and 15 seconds.");
      }
      const previousDuration = payload.production.durationSeconds;
      payload.production.durationSeconds = duration;
      locked.add("production.durationSeconds");
      if (previousDuration !== duration) {
        payload.timedBeats = undefined;
      }
    }

    if (args.production.audioEnabled !== undefined) {
      if (mode !== "video") {
        throw new Error("Audio is only editable for video jobs.");
      }
      if (args.production.audioEnabled) {
        const alreadyOn =
          payload.audio.voiceover === "include" ||
          payload.audio.sfx === "include" ||
          payload.audio.music === "include";
        if (!alreadyOn) {
          payload.audio = {
            ...payload.audio,
            music: "include",
            voiceover: payload.audio.voiceover === "include" ? "include" : "none",
            sfx: payload.audio.sfx === "include" ? "include" : "none",
          };
        }
      } else {
        payload.audio = {
          ...payload.audio,
          voiceover: "none",
          sfx: "none",
          music: "none",
          voiceoverCopy: undefined,
        };
      }
      locked.add("audio.voiceover");
      locked.add("audio.sfx");
      locked.add("audio.music");
    }

    const attachments = await ctx.db
      .query("guidedBriefAttachments")
      .withIndex("by_brief", (q) => q.eq("briefId", brief._id))
      .collect();
    const presence = attachmentPresenceFromRoles(
      attachments.map((a) => a.role as AttachmentRole),
    );
    const policy = evaluateBrief({
      mode,
      videoType,
      payload,
      attachments: presence,
      offeredOptionalIds: brief.offeredOptionalIds,
      skippedOptionalIds: brief.skippedOptionalIds,
      lockedFields: [...locked],
    });
    const compiled = policy.complete
      ? compileBriefPrompt(mode, videoType, payload, presence)
      : undefined;
    const plan =
      policy.complete && compiled
        ? await buildPlanForBrief(
            ctx,
            { ...brief, videoType },
            payload,
            compiled,
            brief.warnings,
          )
        : undefined;
    const now = Date.now();
    await ctx.db.patch(brief._id, {
      payload,
      videoType,
      lockedFields: [...locked],
      inferredFields: brief.inferredFields.filter((path) => !locked.has(path)),
      status: policy.complete ? "review_ready" : "awaiting_input",
      pendingQuestionsJson: serializeQuestions(policy.questions),
      compiledPrompt: compiled,
      generationPlanJson: plan ? JSON.stringify(plan) : undefined,
      generationPlanFingerprint: plan?.fingerprint,
      estimatedCredits: plan?.estimate.credits,
      updatedAt: now,
    });
    const updated = await ctx.db.get("guidedBriefs", brief._id);
    if (!updated) throw new Error("Brief missing after update");
    return toBriefReturn(updated, attachments);
}

export const patchBriefProduction = authedMutation({
  args: {
    briefId: v.id("guidedBriefs"),
    expectedRevision: v.number(),
    production: v.object({
      aspectRatio: v.optional(v.string()),
      resolution: v.optional(v.string()),
      quality: v.optional(v.string()),
      durationSeconds: v.optional(v.number()),
      videoType: v.optional(videoTypeValidator),
      audioEnabled: v.optional(v.boolean()),
    }),
  },
  returns: briefReturn,
  handler: async (ctx, args) => patchBriefProductionHandler(ctx, args),
});

/** Internal helpers used by guidedVideoActions. */
export const getBriefInternal = internalQuery({
  args: { briefId: v.id("guidedBriefs") },
  returns: v.any(),
  handler: async (ctx, args) => {
    const brief = await ctx.db.get("guidedBriefs", args.briefId);
    if (!brief) return null;
    const attachments = await ctx.db
      .query("guidedBriefAttachments")
      .withIndex("by_brief", (q) => q.eq("briefId", brief._id))
      .collect();
    return { brief, attachments };
  },
});

export const getAssistanceConversationInternal = internalQuery({
  args: {
    briefId: v.id("guidedBriefs"),
    limit: v.optional(v.number()),
    expiresUnix: v.number(),
  },
  returns: v.object({
    context: v.array(v.string()),
    generatedMedia: v.array(
      v.object({
        assetId: v.id("assets"),
        kind: v.union(v.literal("image"), v.literal("video"), v.literal("audio")),
        url: v.string(),
        mimeType: v.optional(v.string()),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const brief = await ctx.db.get("guidedBriefs", args.briefId);
    if (!brief) return { context: [], generatedMedia: [] };
    const events = await ctx.db
      .query("generationEvents")
      .withIndex("by_thread_and_order", (q) => q.eq("threadId", brief.threadId))
      .order("desc")
      .take(Math.min(Math.max(args.limit ?? 16, 1), 24));

    const context: string[] = [];
    const generatedMedia: Array<{
      assetId: Id<"assets">;
      kind: "image" | "video" | "audio";
      url: string;
      mimeType?: string;
    }> = [];
    const includedMedia = new Set<string>();

    for (const event of events.reverse()) {
      if (event.ownerId !== brief.ownerId) continue;
      const job = event.generationJobId
        ? await ctx.db.get("generationJobs", event.generationJobId)
        : null;
      const jobSummary =
        job && job.ownerId === brief.ownerId
          ? `job ${job._id}: mode=${job.mode}, status=${job.stage}, model=${job.resolvedModel}, format=${job.aspectRatio ?? "unspecified"}, resolution=${job.resolution ?? "unspecified"}${job.error ? `, error=${job.error.slice(0, 500)}` : ""}`
          : event.generationJobId
            ? `job ${event.generationJobId}`
            : undefined;

      if (event.kind === "prompt" && event.prompt) {
        context.push(
          event.briefId && event.generationJobId
            ? `Provider prompt used for the approved assisted generation${jobSummary ? ` (${jobSummary})` : ""}: ${event.prompt.slice(0, 2_000)}`
            : `User requested generation${jobSummary ? ` (${jobSummary})` : ""}: ${event.prompt.slice(0, 2_000)}`,
        );
      } else if (event.kind === "assistant" && event.message) {
        context.push(`Assistant: ${event.message.slice(0, 2_000)}`);
      } else if (event.kind === "question") {
        const questions = parseQuestions(event.questionsJson);
        const prompts = questions
          .map((question) => question.prompt)
          .filter(Boolean)
          .join(" | ");
        if (prompts) context.push(`Assistant asked: ${prompts.slice(0, 2_000)}`);
      } else if (event.kind === "stage") {
        context.push(
          `Generation status${jobSummary ? ` (${jobSummary})` : ""}: event=${event.stage ?? "unknown"}`,
        );
      } else if (event.kind === "result") {
        const assetSummaries: string[] = [];
        for (const assetId of event.assetIds ?? []) {
          const asset = await ctx.db.get("assets", assetId);
          if (!asset || asset.ownerId !== brief.ownerId || asset.deletedAt) {
            assetSummaries.push(`asset ${assetId} unavailable`);
            continue;
          }
          assetSummaries.push(
            `${asset.kind} “${asset.name}” (asset ${asset._id}, mime=${asset.mimeType})`,
          );
          if (
            !includedMedia.has(String(asset._id)) &&
            asset.bunnyPath &&
            (asset.kind === "image" ||
              asset.kind === "video" ||
              asset.kind === "audio")
          ) {
            generatedMedia.push({
              assetId: asset._id,
              kind: asset.kind,
              url: await signBunnyFullUrl(
                asset.bunnyPath,
                args.expiresUnix,
                asset.kind,
              ),
              mimeType: asset.mimeType,
            });
            includedMedia.add(String(asset._id));
            if (generatedMedia.length > 4) generatedMedia.shift();
          }
        }
        context.push(
          `Generation result${jobSummary ? ` (${jobSummary})` : ""}: ${
            assetSummaries.join("; ") || "completed without listed assets"
          }`,
        );
      } else if (event.kind === "review") {
        context.push(
          `Review${event.briefRevision ? ` revision ${event.briefRevision}` : ""}: ${
            event.message?.slice(0, 1_000) || "ready for confirmation"
          }${
            event.briefSnapshotJson
              ? ` | snapshot=${event.briefSnapshotJson.slice(0, 2_000)}`
              : ""
          }`,
        );
      } else if (event.kind === "approval" && event.approvalId) {
        const approval = await ctx.db.get(
          "assistanceApprovals",
          event.approvalId,
        );
        if (approval && approval.ownerId === brief.ownerId) {
          context.push(
            `Approval request: ${approval.title} | action=${approval.action} | status=${approval.status} | ${approval.summary.slice(0, 1_000)}`,
          );
        }
      } else if (event.kind === "folder_switched") {
        const fromFolder = event.fromFolderId
          ? await ctx.db.get("folders", event.fromFolderId)
          : null;
        const toFolder = event.toFolderId
          ? await ctx.db.get("folders", event.toFolderId)
          : null;
        context.push(
          `Save folder changed: ${fromFolder?.name ?? event.fromFolderId ?? "unknown"} → ${
            toFolder?.name ?? event.toFolderId ?? "unknown"
          }`,
        );
      }
    }

    const activeApprovals = await ctx.db
      .query("assistanceApprovals")
      .withIndex("by_thread_and_status", (q) =>
        q.eq("threadId", brief.threadId),
      )
      .collect();
    for (const approval of activeApprovals) {
      if (
        approval.ownerId === brief.ownerId &&
        (approval.status === "pending" ||
          approval.status === "approved" ||
          approval.status === "executing")
      ) {
        context.push(
          `Active approval: ${approval.title} | action=${approval.action} | status=${approval.status} | ${approval.summary.slice(0, 1_000)}`,
        );
      }
    }

    return { context, generatedMedia };
  },
});

export const applyAnalysisResult = internalMutation({
  args: {
    briefId: v.id("guidedBriefs"),
    expectedRevision: v.number(),
    userPrompt: v.string(),
    message: v.string(),
    decision: v.union(v.literal("ask"), v.literal("review_ready")),
    patchJson: v.optional(v.string()),
    questionsJson: v.optional(v.string()),
    agentPlanJson: v.optional(v.string()),
    proposedModeJson: v.optional(v.string()),
    proposedStyleJson: v.optional(v.string()),
    assumptions: v.array(v.string()),
    warnings: v.array(v.string()),
    inferredFields: v.array(v.string()),
    forceUnlockFields: v.optional(v.array(v.string())),
    finalPrompt: v.optional(v.string()),
    attachmentRoleUpdates: v.array(
      v.object({
        attachmentId: v.id("guidedBriefAttachments"),
        role: attachmentRoleValidator,
      }),
    ),
  },
  returns: v.object({
    briefId: v.id("guidedBriefs"),
    revision: v.number(),
    status: briefStatusValidator,
  }),
  handler: async (ctx, args) => {
    const brief = await ctx.db.get("guidedBriefs", args.briefId);
    if (!brief) throw new Error("Brief not found");
    if (brief.revision !== args.expectedRevision) {
      throw new Error("Stale brief revision");
    }
    const current = parsePayload(brief.payload);
    let patch: Partial<AssistedBriefPayload> | undefined;
    if (args.patchJson) {
      try {
        patch = JSON.parse(args.patchJson) as Partial<AssistedBriefPayload>;
      } catch {
        patch = undefined;
      }
    }

    let resolvedMode = normalizeAssistedMode(brief.mode) as AssistedMode;
    let resolvedVideoType = brief.videoType as VideoType | undefined;
    let styleSheetElementId = brief.styleSheetElementId;
    let lockedFields = [...brief.lockedFields];
    let payload = current;
    const forceUnlock = [...(args.forceUnlockFields ?? [])];

    // Apply chat-resolved mode changes from the agent.
    if (args.proposedModeJson) {
      try {
        const proposed = JSON.parse(args.proposedModeJson) as {
          decision?: string;
          mode?: string;
          videoType?: string;
        };
        if (
          proposed.decision === "change" &&
          proposed.mode &&
          ["image", "video", "script", "element"].includes(proposed.mode)
        ) {
          const transitioned = transitionAssistedMode({
            currentMode: resolvedMode,
            nextMode: proposed.mode as AssistedMode,
            currentVideoType: resolvedVideoType,
            nextVideoType:
              proposed.mode === "video"
                ? normalizeVideoType(proposed.videoType)
                : undefined,
            payload,
            lockedFields,
          });
          resolvedMode = transitioned.mode;
          resolvedVideoType = transitioned.videoType;
          payload = transitioned.payload;
          lockedFields = transitioned.lockedFields;
        }
      } catch {
        // ignore malformed proposal
      }
    }

    const merged = mergeBriefPayload({
      current: payload,
      patch,
      lockedFields,
      forceUnlock,
    });
    payload = merged.payload;
    const newlyInferred = merged.newlyInferred;
    lockedFields = [...new Set([...lockedFields, ...forceUnlock, ...newlyInferred])];

    // Apply chat-resolved style conflicts (drop conflicting sheet when needed).
    if (args.proposedStyleJson && styleSheetElementId) {
      try {
        const proposed = JSON.parse(args.proposedStyleJson) as {
          decision?: string;
          value?: string;
          conflict?: string;
        };
        if (
          proposed.decision === "change" &&
          (proposed.value === "photoreal" || proposed.value === "illustrated")
        ) {
          const selectedSheet = await ctx.db.get("elements", styleSheetElementId);
          const selectedDirection =
            selectedSheet?.renderMode === "photoreal" ? "photoreal" : "illustrated";
          if (proposed.value !== selectedDirection) {
            styleSheetElementId = undefined;
            payload.production.styleSheetElementId = undefined;
            lockedFields = [...lockedFields, "production.styleSheetElementId"];
          }
          if (proposed.value && !payload.visualDirection?.trim()) {
            payload.visualDirection =
              proposed.value === "photoreal"
                ? "Photoreal photographic look"
                : "Illustrated stylized look";
          }
        }
      } catch {
        // ignore malformed proposal
      }
    }

    for (const update of args.attachmentRoleUpdates) {
      const attachment = await ctx.db.get("guidedBriefAttachments", update.attachmentId);
      if (
        attachment &&
        attachment.briefId === brief._id &&
        attachment.ownerId === brief.ownerId
      ) {
        await ctx.db.patch(attachment._id, { role: update.role });
      }
    }
    const attachments = await ctx.db
      .query("guidedBriefAttachments")
      .withIndex("by_brief", (q) => q.eq("briefId", brief._id))
      .collect();
    const presence = attachmentPresenceFromRoles(
      attachments.map((a) => a.role as AttachmentRole),
    );
    // Product photos imply exact fidelity unless the user already chose otherwise.
    if (
      presence.roles.includes("product") &&
      !payload.brand.productFidelity &&
      !lockedFields.includes("brand.productFidelity")
    ) {
      payload.brand.productFidelity = "exact";
      lockedFields = [...lockedFields, "brand.productFidelity"];
    }
    const modelQuestions = parseQuestions(args.questionsJson);
    const policy = evaluateBrief({
      mode: resolvedMode,
      videoType: resolvedVideoType,
      payload,
      attachments: presence,
      offeredOptionalIds: brief.offeredOptionalIds,
      skippedOptionalIds: brief.skippedOptionalIds,
      lockedFields,
    });
    const questions = [
      ...modelQuestions.filter((question) => question.id === "resolve_mode_conflict"),
      ...modelQuestions.filter((question) => question.field === "visualDirection"),
      ...policy.questions,
      ...modelQuestions,
    ]
      .filter(
        (question, index, all) =>
          all.findIndex((candidate) => candidate.id === question.id) === index,
      )
      .slice(0, 3);
    const offered = new Set(brief.offeredOptionalIds);
    const skipped = new Set(brief.skippedOptionalIds);
    for (const q of questions) {
      if (q.field === "brand.logo") offered.add("logo");
      if (q.field === "brand.ctaMode") offered.add("cta");
      if (q.field === "brand.offerText" || q.field === "offer") offered.add("offer");
    }
    // Resolved brand optionals must not be re-offered on later turns.
    if (payload.brand.logo !== "undecided") {
      offered.add("logo");
      if (payload.brand.logo === "omit") skipped.add("logo");
    }
    if (payload.brand.ctaMode !== "undecided") {
      offered.add("cta");
      if (payload.brand.ctaMode === "omit") skipped.add("cta");
    }
    if (payload.brand.offerText?.trim()) {
      offered.add("offer");
    }

    let agentState: AssistanceAgentState = emptyAgentState();
    try {
      agentState =
        (args.agentPlanJson
          ? parseAgentState(JSON.parse(args.agentPlanJson))
          : undefined) ??
        (brief.agentStateJson
          ? parseAgentState(JSON.parse(brief.agentStateJson))
          : undefined) ??
        (brief.agentPlanJson
          ? parseAgentState(JSON.parse(brief.agentPlanJson))
          : undefined) ??
        emptyAgentState();
    } catch {
      agentState = emptyAgentState();
    }

    const requiredPending = questions.filter((question) => question.required);
    const planAllowsReview =
      agentState.readyForReview &&
      agentState.missingCritical.length === 0 &&
      agentState.unresolvedDecisions.length === 0;

    // Hard gate: LLM decision alone cannot skip required policy/conflicts.
    const complete =
      args.decision === "review_ready" &&
      policy.complete &&
      requiredPending.length === 0 &&
      planAllowsReview;

    if (!complete) {
      agentState = {
        ...agentState,
        readyForReview: false,
        turnStrategy:
          agentState.turnStrategy === "review" ? "deepen" : agentState.turnStrategy,
        missingCritical:
          agentState.missingCritical.length > 0
            ? agentState.missingCritical
            : requiredPending.map((question) => question.prompt).slice(0, 6),
      };
    } else {
      agentState = {
        ...agentState,
        readyForReview: true,
        missingCritical: [],
        unresolvedDecisions: [],
        turnStrategy: "review",
      };
    }

    const status: BriefStatus = complete ? "review_ready" : "awaiting_input";
    const chatMessage = formatAssistanceChatMessage(
      args.message,
      complete ? [] : questions,
    );
    const agentFinalPrompt = args.finalPrompt?.trim();
    const compiled = complete
      ? agentFinalPrompt && agentFinalPrompt.length >= 80
        ? agentFinalPrompt.slice(0, 12_000)
        : compileBriefPrompt(resolvedMode, resolvedVideoType, payload, presence)
      : undefined;
    const warnings = [
      ...new Set([...brief.warnings, ...args.warnings, ...policy.warnings]),
    ];
    const plan =
      complete && compiled
        ? await buildPlanForBrief(
            ctx,
            {
              ...brief,
              mode: resolvedMode,
              videoType: resolvedVideoType,
              styleSheetElementId,
            },
            payload,
            compiled,
            warnings,
          )
        : undefined;
    const now = Date.now();
    const nextRevision = brief.revision + 1;
    await ctx.db.patch(brief._id, {
      userPrompt: args.userPrompt,
      mode: resolvedMode,
      videoType: resolvedVideoType,
      styleSheetElementId,
      payload,
      revision: nextRevision,
      lockedFields,
      inferredFields: [
        ...new Set([...brief.inferredFields, ...args.inferredFields, ...newlyInferred]),
      ],
      assumptions: [...new Set([...brief.assumptions, ...args.assumptions])],
      warnings,
      offeredOptionalIds: [...offered],
      skippedOptionalIds: [...skipped],
      status,
      pendingQuestionsJson: complete ? undefined : serializeQuestions(questions),
      agentStateJson: JSON.stringify(agentState),
      agentPlanJson: JSON.stringify(agentState),
      compiledPrompt: compiled,
      generationPlanJson: plan ? JSON.stringify(plan) : undefined,
      generationPlanFingerprint: plan?.fingerprint,
      estimatedCredits: plan?.estimate.credits,
      error: undefined,
      updatedAt: now,
    });

    // Chat-native: one bubble per turn. Ready turns clip Generate onto the
    // real assistant message — never a separate "ready when you are" row.
    if (complete) {
      await ctx.db.insert("generationEvents", {
        ownerId: brief.ownerId,
        threadId: brief.threadId,
        kind: "review",
        order: now,
        briefId: brief._id,
        briefRevision: nextRevision,
        message: chatMessage,
        briefSnapshotJson: serializeReviewSnapshot({
          mode: resolvedMode,
          videoType: resolvedVideoType,
          payload,
          assumptions: [...new Set([...brief.assumptions, ...args.assumptions])],
          warnings,
          lockedFields,
          inferredFields: [
            ...new Set([...brief.inferredFields, ...args.inferredFields, ...newlyInferred]),
          ],
          compiledPrompt: compiled,
          plan,
          stylePresetId: brief.stylePresetId,
          styleSheetElementId,
        }),
        createdAt: now,
      });
    } else {
      await ctx.db.insert("generationEvents", {
        ownerId: brief.ownerId,
        threadId: brief.threadId,
        kind: "assistant",
        order: now,
        briefId: brief._id,
        briefRevision: nextRevision,
        message: chatMessage,
        createdAt: now,
      });
    }
    return { briefId: brief._id, revision: nextRevision, status };
  },
});

const assistanceAttachmentArg = v.object({
  assetId: v.optional(v.id("assets")),
  documentId: v.optional(v.id("documents")),
  elementId: v.optional(v.id("elements")),
  role: attachmentRoleValidator,
  label: v.optional(v.string()),
  sortOrder: v.number(),
});

const assistanceApprovalArg = v.object({
  toolCallId: v.string(),
  action: v.union(
    v.literal("trash"),
    v.literal("move"),
    v.literal("generation"),
    v.literal("element_build"),
  ),
  title: v.string(),
  summary: v.string(),
  argumentsJson: v.string(),
  estimatedCredits: v.optional(v.number()),
});

const assistanceToolCallArg = v.object({
  toolCallId: v.string(),
  toolName: v.string(),
  argumentsJson: v.string(),
  outputJson: v.optional(v.string()),
});

const ASSISTANCE_TURN_LEASE_MS = 10 * 60 * 1000;

function sameAssistanceRequest(
  existing: { userPrompt: string; requestJson?: string },
  next: { userPrompt: string; requestJson?: string },
) {
  return (
    existing.userPrompt === next.userPrompt &&
    (existing.requestJson ?? "") === (next.requestJson ?? "")
  );
}

/**
 * Begin an idempotent Assistance turn. Does not mutate the brief payload/plan
 * or write chat events — that happens only on commit.
 */
export const beginAssistanceTurn = internalMutation({
  args: {
    ownerId: v.id("users"),
    threadId: v.id("generationThreads"),
    briefId: v.id("guidedBriefs"),
    clientTurnId: v.string(),
    userPrompt: v.string(),
    requestJson: v.optional(v.string()),
    creditTransactionId: v.optional(v.id("creditTransactions")),
  },
  returns: v.object({
    turnId: v.id("assistanceTurns"),
    briefId: v.id("guidedBriefs"),
    revision: v.number(),
    phase: v.string(),
    idempotent: v.boolean(),
    recoverable: v.boolean(),
    resultJson: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const brief = await ctx.db.get("guidedBriefs", args.briefId);
    if (!brief || brief.ownerId !== args.ownerId) {
      throw new Error("Brief not found");
    }
    if (brief.threadId !== args.threadId) {
      throw new Error("Brief does not belong to this thread");
    }
    const clientTurnId = args.clientTurnId.trim().slice(0, 128);
    if (!clientTurnId) throw new Error("clientTurnId is required");
    const existing = await ctx.db
      .query("assistanceTurns")
      .withIndex("by_brief_and_client_turn", (q) =>
        q.eq("briefId", args.briefId).eq("clientTurnId", clientTurnId),
      )
      .unique();
    if (existing) {
      if (
        !sameAssistanceRequest(existing, {
          userPrompt: args.userPrompt,
          requestJson: args.requestJson,
        })
      ) {
        throw new Error("idempotency_key_conflict");
      }
      const leaseExpired =
        existing.phase === "begun" &&
        Date.now() - existing.updatedAt > ASSISTANCE_TURN_LEASE_MS;
      return {
        turnId: existing._id,
        briefId: existing.briefId,
        revision: existing.briefRevisionAtCommit ?? existing.briefRevisionAtBegin,
        phase: existing.phase,
        idempotent: true,
        recoverable: leaseExpired,
        resultJson: existing.resultJson,
      };
    }
    const now = Date.now();
    const turnId = await ctx.db.insert("assistanceTurns", {
      ownerId: args.ownerId,
      threadId: args.threadId,
      briefId: args.briefId,
      clientTurnId,
      phase: "begun",
      briefRevisionAtBegin: brief.revision,
      userPrompt: args.userPrompt,
      requestJson: args.requestJson,
      creditTransactionId: args.creditTransactionId,
      createdAt: now,
      updatedAt: now,
    });
    return {
      turnId,
      briefId: brief._id,
      revision: brief.revision,
      phase: "begun",
      idempotent: false,
      recoverable: false,
    };
  },
});

export const attachAssistanceTurnCharge = internalMutation({
  args: {
    turnId: v.id("assistanceTurns"),
    creditTransactionId: v.id("creditTransactions"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const turn = await ctx.db.get("assistanceTurns", args.turnId);
    if (!turn || turn.phase !== "begun") return null;
    if (turn.creditTransactionId) return null;
    await ctx.db.patch(turn._id, {
      creditTransactionId: args.creditTransactionId,
      updatedAt: Date.now(),
    });
    return null;
  },
});

/**
 * Atomically charge and attach the Assistance turn cost from measured usage so a
 * crash cannot leave an orphan spent credit without a turn linkage.
 */
export const chargeAssistanceTurn = internalMutation({
  args: {
    turnId: v.id("assistanceTurns"),
    ownerId: v.id("users"),
    folderId: v.id("folders"),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
  },
  returns: v.object({
    creditTransactionId: v.id("creditTransactions"),
    creditsCharged: v.number(),
    idempotent: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const turn = await ctx.db.get("assistanceTurns", args.turnId);
    if (!turn || turn.ownerId !== args.ownerId) {
      throw new Error("Assistance turn not found");
    }
    if (turn.phase !== "begun") {
      throw new Error("Assistance turn is no longer chargeable");
    }
    if (turn.creditTransactionId) {
      return {
        creditTransactionId: turn.creditTransactionId,
        creditsCharged: 0,
        idempotent: true,
      };
    }
    const folder = await ctx.db.get("folders", args.folderId);
    if (!folder || folder.ownerId !== args.ownerId || folder.deletedAt) {
      throw new Error("Folder not found");
    }
    const account = await ctx.db
      .query("billingAccounts")
      .withIndex("by_user", (q) => q.eq("userId", args.ownerId))
      .unique();
    const cost = textCreditCost({
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
    });
    const now = Date.now();
    if (!account || account.creditBalance < cost) {
      const amount = cost * CREDIT_PRICE_TTD;
      const formatted = Number.isInteger(amount)
        ? String(amount)
        : amount.toFixed(2).replace(/\.?0+$/, "");
      throw new Error(
        `You need $${formatted} TTD to continue. Top up to continue.`,
      );
    }
    const balanceAfter = account.creditBalance - cost;
    await ctx.db.patch(account._id, {
      creditBalance: balanceAfter,
      updatedAt: now,
    });
    const creditTransactionId = await ctx.db.insert("creditTransactions", {
      userId: args.ownerId,
      billingAccountId: account._id,
      kind: "spent",
      amount: -cost,
      balanceAfter,
      reason: "Assistance turn",
      createdAt: now,
    });
    await ctx.db.patch(turn._id, {
      creditTransactionId,
      updatedAt: now,
    });
    return { creditTransactionId, creditsCharged: cost, idempotent: false };
  },
});

export const assertAssistanceTurnAffordable = internalQuery({
  args: {
    ownerId: v.id("users"),
  },
  returns: v.object({
    ok: v.boolean(),
    creditBalance: v.number(),
    minimumCredits: v.number(),
  }),
  handler: async (ctx, args) => {
    const account = await ctx.db
      .query("billingAccounts")
      .withIndex("by_user", (q) => q.eq("userId", args.ownerId))
      .unique();
    const minimumCredits = TEXT_MIN_SELL_TTD / CREDIT_PRICE_TTD;
    const creditBalance = account?.creditBalance ?? 0;
    return {
      ok: creditBalance >= minimumCredits,
      creditBalance,
      minimumCredits,
    };
  },
});

/**
 * Commit a validated Assistance turn: attachments + brief patch + one prompt
 * and one assistant event (+ optional review).
 */
export const commitAssistanceTurn = internalMutation({
  args: {
    turnId: v.id("assistanceTurns"),
    expectedRevision: v.number(),
    userPrompt: v.string(),
    message: v.string(),
    decision: v.union(v.literal("ask"), v.literal("review_ready")),
    patchJson: v.optional(v.string()),
    questionsJson: v.optional(v.string()),
    agentStateJson: v.optional(v.string()),
    proposedModeJson: v.optional(v.string()),
    proposedStyleJson: v.optional(v.string()),
    assumptions: v.array(v.string()),
    warnings: v.array(v.string()),
    inferredFields: v.array(v.string()),
    forceUnlockFields: v.optional(v.array(v.string())),
    finalPrompt: v.optional(v.string()),
    attachments: v.optional(v.array(assistanceAttachmentArg)),
    syncAttachments: v.optional(v.boolean()),
    approvals: v.optional(v.array(assistanceApprovalArg)),
    toolCalls: v.optional(v.array(assistanceToolCallArg)),
    attachmentRoleUpdates: v.array(
      v.object({
        attachmentId: v.id("guidedBriefAttachments"),
        role: attachmentRoleValidator,
      }),
    ),
    modelId: v.optional(v.string()),
    repaired: v.optional(v.boolean()),
    analysisJson: v.optional(v.string()),
  },
  returns: v.object({
    turnId: v.id("assistanceTurns"),
    briefId: v.id("guidedBriefs"),
    revision: v.number(),
    status: briefStatusValidator,
    decision: v.union(v.literal("ask"), v.literal("review_ready")),
    idempotent: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const turn = await ctx.db.get("assistanceTurns", args.turnId);
    if (!turn) throw new Error("Assistance turn not found");
    if (turn.phase === "committed" && turn.resultJson) {
      const cached = JSON.parse(turn.resultJson) as {
        briefId: Id<"guidedBriefs">;
        revision: number;
        status: BriefStatus;
        decision: "ask" | "review_ready";
      };
      return {
        turnId: turn._id,
        briefId: cached.briefId,
        revision: cached.revision,
        status: cached.status,
        decision: cached.decision,
        idempotent: true,
      };
    }
    if (turn.phase === "failed") {
      throw new Error("Assistance turn already failed");
    }
    if (turn.briefRevisionAtBegin !== args.expectedRevision) {
      throw new Error("Stale brief revision");
    }

    if (args.attachments !== undefined) {
      const brief = await ctx.db.get("guidedBriefs", turn.briefId);
      if (!brief) throw new Error("Brief not found");
      const attachments = args.attachments.filter((attachment) => {
        const idCount = [
          attachment.assetId,
          attachment.documentId,
          attachment.elementId,
        ].filter(Boolean).length;
        return idCount === 1;
      });
      for (const attachment of attachments) {
        await requireOwnedAttachment(ctx, brief.ownerId, attachment);
      }
      const existing = await ctx.db
        .query("guidedBriefAttachments")
        .withIndex("by_brief", (q) => q.eq("briefId", turn.briefId))
        .collect();
      const attachmentKey = (attachment: {
        assetId?: Id<"assets">;
        documentId?: Id<"documents">;
        elementId?: Id<"elements">;
      }) =>
        attachment.assetId
          ? `asset:${attachment.assetId}`
          : attachment.documentId
            ? `document:${attachment.documentId}`
            : `element:${attachment.elementId}`;
      const existingByKey = new Map(
        existing.map((row) => [attachmentKey(row), row]),
      );
      if (args.syncAttachments) {
        const requestedKeys = new Set(attachments.map(attachmentKey));
        for (const row of existing) {
          if (!requestedKeys.has(attachmentKey(row))) {
            await ctx.db.delete(row._id);
          }
        }
      }
      const nowAttach = Date.now();
      for (const attachment of attachments) {
        const current = existingByKey.get(attachmentKey(attachment));
        if (current) {
          await ctx.db.patch(current._id, {
            role: attachment.role,
            label: attachment.label ?? current.label,
            sortOrder: attachment.sortOrder,
            briefRevision: args.expectedRevision,
          });
          continue;
        }
        await ctx.db.insert("guidedBriefAttachments", {
          briefId: turn.briefId,
          ownerId: turn.ownerId,
          assetId: attachment.assetId,
          documentId: attachment.documentId,
          elementId: attachment.elementId,
          role: attachment.role,
          label: attachment.label,
          sortOrder: attachment.sortOrder,
          briefRevision: args.expectedRevision,
          createdAt: nowAttach,
        });
      }
    }

    const nowPrompt = Date.now();
    await ctx.db.insert("generationEvents", {
      ownerId: turn.ownerId,
      threadId: turn.threadId,
      kind: "prompt",
      order: nowPrompt,
      prompt: args.userPrompt.trim() || "(attachments)",
      briefId: turn.briefId,
      briefRevision: args.expectedRevision,
      createdAt: nowPrompt,
    });

    const applied = (await ctx.runMutation(
      internal.guidedVideo.applyAnalysisResult,
      {
        briefId: turn.briefId,
        expectedRevision: args.expectedRevision,
        userPrompt: args.userPrompt,
        message: args.message,
        decision: args.decision,
        patchJson: args.patchJson,
        questionsJson: args.questionsJson,
        agentPlanJson: args.agentStateJson,
        proposedModeJson: args.proposedModeJson,
        proposedStyleJson: args.proposedStyleJson,
        assumptions: args.assumptions,
        warnings: args.warnings,
        inferredFields: args.inferredFields,
        forceUnlockFields: args.forceUnlockFields,
        finalPrompt: args.finalPrompt,
        attachmentRoleUpdates: args.attachmentRoleUpdates,
      },
    )) as {
      briefId: Id<"guidedBriefs">;
      revision: number;
      status: BriefStatus;
    };
    for (const approval of args.approvals ?? []) {
      const existingApproval = await ctx.db
        .query("assistanceApprovals")
        .withIndex("by_turn_and_call", (q) =>
          q.eq("turnId", turn._id).eq("toolCallId", approval.toolCallId),
        )
        .unique();
      const approvalId =
        existingApproval?._id ??
        (await ctx.db.insert("assistanceApprovals", {
          ownerId: turn.ownerId,
          threadId: turn.threadId,
          briefId: turn.briefId,
          turnId: turn._id,
          toolCallId: approval.toolCallId,
          action: approval.action,
          title: approval.title,
          summary: approval.summary,
          argumentsJson: approval.argumentsJson,
          status: "pending",
          estimatedCredits: approval.estimatedCredits,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }));
      if (!existingApproval) {
        const eventNow = Date.now();
        await ctx.db.insert("generationEvents", {
          ownerId: turn.ownerId,
          threadId: turn.threadId,
          kind: "approval",
          order: eventNow,
          briefId: turn.briefId,
          briefRevision: applied.revision,
          approvalId,
          message: approval.summary,
          createdAt: eventNow,
        });
      }
    }
    for (const toolCall of args.toolCalls ?? []) {
      const existingToolCall = await ctx.db
        .query("assistanceToolCalls")
        .withIndex("by_turn_and_call", (q) =>
          q.eq("turnId", turn._id).eq("toolCallId", toolCall.toolCallId),
        )
        .unique();
      if (existingToolCall) {
        continue;
      }
      await ctx.db.insert("assistanceToolCalls", {
        ownerId: turn.ownerId,
        threadId: turn.threadId,
        turnId: turn._id,
        toolCallId: toolCall.toolCallId,
        toolName: toolCall.toolName,
        argumentsJson: toolCall.argumentsJson,
        status: "completed",
        outputJson: toolCall.outputJson,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    const decision =
      applied.status === "review_ready" ? ("review_ready" as const) : ("ask" as const);
    const resultJson = JSON.stringify({
      briefId: applied.briefId,
      revision: applied.revision,
      status: applied.status,
      decision,
    });
    const now = Date.now();
    await ctx.db.patch(turn._id, {
      phase: "committed",
      briefRevisionAtCommit: applied.revision,
      analysisJson: args.analysisJson,
      resultJson,
      modelId: args.modelId,
      repaired: args.repaired,
      updatedAt: now,
    });
    return {
      turnId: turn._id,
      briefId: applied.briefId,
      revision: applied.revision,
      status: applied.status,
      decision,
      idempotent: false,
    };
  },
});

export const failAssistanceTurn = internalMutation({
  args: {
    turnId: v.id("assistanceTurns"),
    error: v.string(),
    userPrompt: v.optional(v.string()),
    assistantMessage: v.optional(v.string()),
  },
  returns: v.object({
    turnId: v.id("assistanceTurns"),
    briefId: v.id("guidedBriefs"),
    revision: v.number(),
    creditTransactionId: v.optional(v.id("creditTransactions")),
    alreadyFailed: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const turn = await ctx.db.get("assistanceTurns", args.turnId);
    if (!turn) throw new Error("Assistance turn not found");
    if (turn.phase === "committed") {
      throw new Error("Assistance turn already committed");
    }
    if (turn.phase === "failed") {
      return {
        turnId: turn._id,
        briefId: turn.briefId,
        revision: turn.briefRevisionAtBegin,
        creditTransactionId: turn.creditTransactionId,
        alreadyFailed: true,
      };
    }
    const now = Date.now();
    if (args.userPrompt?.trim()) {
      await ctx.db.insert("generationEvents", {
        ownerId: turn.ownerId,
        threadId: turn.threadId,
        kind: "prompt",
        order: now - 1,
        prompt: args.userPrompt.trim(),
        briefId: turn.briefId,
        briefRevision: turn.briefRevisionAtBegin,
        createdAt: now - 1,
      });
    }
    if (args.assistantMessage?.trim()) {
      await ctx.db.insert("generationEvents", {
        ownerId: turn.ownerId,
        threadId: turn.threadId,
        kind: "assistant",
        order: now,
        briefId: turn.briefId,
        briefRevision: turn.briefRevisionAtBegin,
        message: args.assistantMessage.trim(),
        createdAt: now,
      });
    }
    await ctx.db.patch(turn._id, {
      phase: "failed",
      error: args.error.slice(0, 2_000),
      updatedAt: now,
    });
    return {
      turnId: turn._id,
      briefId: turn.briefId,
      revision: turn.briefRevisionAtBegin,
      creditTransactionId: turn.creditTransactionId,
      alreadyFailed: false,
    };
  },
});

/**
 * Migrate legacy question events → assistant prose and refresh incomplete reviews.
 * Additive / idempotent. Safe to re-run.
 */
export const migrateLegacyAssistanceData = internalMutation({
  args: { limit: v.optional(v.number()) },
  returns: v.object({
    questionEventsConverted: v.number(),
    staleReviewsRefreshed: v.number(),
  }),
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 100, 1), 500);
    let questionEventsConverted = 0;
    let staleReviewsRefreshed = 0;

    const events = await ctx.db.query("generationEvents").take(2_000);
    for (const event of events) {
      if (event.kind !== "question") continue;
      if (questionEventsConverted >= limit) break;
      let prompts: string[] = [];
      try {
        const parsed = event.questionsJson
          ? (JSON.parse(event.questionsJson) as Array<{ prompt?: string }>)
          : [];
        prompts = Array.isArray(parsed)
          ? parsed
              .map((item) =>
                typeof item?.prompt === "string" ? item.prompt.trim() : "",
              )
              .filter(Boolean)
          : [];
      } catch {
        prompts = [];
      }
      const base = event.message?.trim() ?? "";
      const extras = prompts.filter((prompt) => {
        const needle = prompt.slice(0, Math.min(40, prompt.length)).toLowerCase();
        return needle.length > 0 && !base.toLowerCase().includes(needle);
      });
      const message = [base, ...extras].filter(Boolean).join("\n\n") ||
        "Please reply in the chat to continue.";
      await ctx.db.patch(event._id, {
        kind: "assistant",
        message,
        questionsJson: undefined,
      });
      questionEventsConverted += 1;
    }

    const briefs = await ctx.db.query("guidedBriefs").take(500);
    for (const brief of briefs) {
      if (brief.status !== "review_ready") continue;
      if (brief.generationPlanJson && brief.generationPlanFingerprint) continue;
      if (staleReviewsRefreshed >= limit) break;
      const payload = parsePayload(brief.payload);
      const attachments = await ctx.db
        .query("guidedBriefAttachments")
        .withIndex("by_brief", (q) => q.eq("briefId", brief._id))
        .collect();
      const presence = attachmentPresenceFromRoles(
        attachments.map((a) => a.role as AttachmentRole),
      );
      const policy = evaluateBrief({
        mode: normalizeAssistedMode(brief.mode),
        videoType: brief.videoType,
        payload,
        attachments: presence,
        offeredOptionalIds: brief.offeredOptionalIds,
        skippedOptionalIds: brief.skippedOptionalIds,
        lockedFields: brief.lockedFields,
      });
      const now = Date.now();
      const nextRevision = brief.revision + 1;
      if (!policy.complete) {
        await ctx.db.patch(brief._id, {
          revision: nextRevision,
          status: "awaiting_input",
          pendingQuestionsJson: serializeQuestions(policy.questions),
          generationPlanJson: undefined,
          generationPlanFingerprint: undefined,
          estimatedCredits: undefined,
          compiledPrompt: undefined,
          updatedAt: now,
        });
        await ctx.db.insert("generationEvents", {
          ownerId: brief.ownerId,
          threadId: brief.threadId,
          kind: "assistant",
          order: now,
          briefId: brief._id,
          briefRevision: nextRevision,
          message:
            "I refreshed this older review — reply in the chat so we can confirm a few details before generating.",
          createdAt: now,
        });
      } else {
        const compiled = compileBriefPrompt(
          normalizeAssistedMode(brief.mode),
          brief.videoType,
          payload,
          presence,
        );
        const plan = await buildPlanForBrief(
          ctx,
          brief,
          payload,
          compiled,
          brief.warnings,
        );
        await ctx.db.patch(brief._id, {
          revision: nextRevision,
          status: "review_ready",
          compiledPrompt: compiled,
          generationPlanJson: JSON.stringify(plan),
          generationPlanFingerprint: plan.fingerprint,
          estimatedCredits: plan.estimate.credits,
          pendingQuestionsJson: undefined,
          updatedAt: now,
        });
        const priorAssistant = events
          .filter(
            (event) =>
              event.kind === "assistant" &&
              event.briefId === brief._id &&
              typeof event.message === "string" &&
              event.message.trim().length > 0,
          )
          .sort(
            (a, b) =>
              (b.createdAt ?? b.order ?? 0) - (a.createdAt ?? a.order ?? 0),
          )[0];
        await ctx.db.insert("generationEvents", {
          ownerId: brief.ownerId,
          threadId: brief.threadId,
          kind: "review",
          order: now,
          briefId: brief._id,
          briefRevision: nextRevision,
          message:
            priorAssistant?.message?.trim() ||
            "looks set — hit generate when you want",
          briefSnapshotJson: serializeReviewSnapshot({
            mode: brief.mode,
            videoType: brief.videoType,
            payload,
            assumptions: brief.assumptions,
            warnings: brief.warnings,
            lockedFields: brief.lockedFields,
            inferredFields: brief.inferredFields,
            compiledPrompt: compiled,
            plan,
            stylePresetId: brief.stylePresetId,
            styleSheetElementId: brief.styleSheetElementId,
          }),
          createdAt: now,
        });
      }
      staleReviewsRefreshed += 1;
    }

    return { questionEventsConverted, staleReviewsRefreshed };
  },
});

export const recordUserPromptEvent = internalMutation({
  args: {
    threadId: v.id("generationThreads"),
    briefId: v.id("guidedBriefs"),
    prompt: v.string(),
    briefRevision: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const brief = await ctx.db.get("guidedBriefs", args.briefId);
    if (!brief) return null;
    const now = Date.now();
    await ctx.db.insert("generationEvents", {
      ownerId: brief.ownerId,
      threadId: args.threadId,
      kind: "prompt",
      order: now,
      prompt: args.prompt,
      briefId: args.briefId,
      briefRevision: args.briefRevision,
      createdAt: now,
    });
    return null;
  },
});

export const mergeBriefAttachments = internalMutation({
  args: {
    briefId: v.id("guidedBriefs"),
    briefRevision: v.number(),
    attachments: v.array(
      v.object({
        assetId: v.optional(v.id("assets")),
        documentId: v.optional(v.id("documents")),
        elementId: v.optional(v.id("elements")),
        role: attachmentRoleValidator,
        label: v.optional(v.string()),
        sortOrder: v.number(),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const brief = await ctx.db.get("guidedBriefs", args.briefId);
    if (!brief) throw new Error("Brief not found");
    for (const attachment of args.attachments) {
      await requireOwnedAttachment(ctx, brief.ownerId, attachment);
    }
    const existing = await ctx.db
      .query("guidedBriefAttachments")
      .withIndex("by_brief", (q) => q.eq("briefId", args.briefId))
      .collect();
    const attachmentKey = (attachment: {
      assetId?: Id<"assets">;
      documentId?: Id<"documents">;
      elementId?: Id<"elements">;
    }) =>
      attachment.assetId
        ? `asset:${attachment.assetId}`
        : attachment.documentId
          ? `document:${attachment.documentId}`
          : `element:${attachment.elementId}`;
    const existingByKey = new Map(existing.map((row) => [attachmentKey(row), row]));
    const now = Date.now();
    for (const attachment of args.attachments) {
      const current = existingByKey.get(attachmentKey(attachment));
      if (current) {
        await ctx.db.patch(current._id, {
          role: attachment.role,
          label: attachment.label ?? current.label,
          sortOrder: attachment.sortOrder,
          briefRevision: args.briefRevision,
        });
        continue;
      }
      await ctx.db.insert("guidedBriefAttachments", {
        briefId: args.briefId,
        ownerId: brief.ownerId,
        assetId: attachment.assetId,
        documentId: attachment.documentId,
        elementId: attachment.elementId,
        role: attachment.role,
        label: attachment.label,
        sortOrder: attachment.sortOrder,
        briefRevision: args.briefRevision,
        createdAt: now,
      });
    }
    return null;
  },
});

export const mirrorBriefJobStage = internalMutation({
  args: {
    briefId: v.id("guidedBriefs"),
    status: briefStatusValidator,
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const brief = await ctx.db.get("guidedBriefs", args.briefId);
    if (!brief) return null;
    await ctx.db.patch(brief._id, {
      status: args.status,
      error: args.error,
      updatedAt: Date.now(),
    });
    return null;
  },
});

async function completeScriptApprovalHandler(
  ctx: AuthedCtx & MutationCtx,
  args: {
    briefId: Id<"guidedBriefs">;
    expectedRevision: number;
    folderId: Id<"folders">;
    title: string;
    contentMarkdown: string;
  },
) {
    const brief = await requireBriefOwner(ctx, args.briefId);
    if (brief.revision !== args.expectedRevision) throw new Error("Stale brief revision");
    if (brief.mode !== "script") throw new Error("Brief is not a script");
    if (brief.approvedDocumentId) return brief.approvedDocumentId;
    if (brief.status !== "approved") throw new Error("Script brief is not approved");
    const folder = await ctx.db.get("folders", args.folderId);
    if (!folder || folder.ownerId !== ctx.user._id || folder.deletedAt) {
      throw new Error("Folder not found");
    }
    const now = Date.now();
    const documentId = await ctx.db.insert("documents", {
      ownerId: ctx.user._id,
      folderId: args.folderId,
      title: args.title.trim().slice(0, 160) || "Generated script",
      contentMarkdown: args.contentMarkdown,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(brief._id, {
      status: "done",
      approvedDocumentId: documentId,
      approvedRevision: brief.revision,
      error: undefined,
      updatedAt: now,
    });
    return documentId;
}

export const completeScriptApproval = authedMutation({
  args: {
    briefId: v.id("guidedBriefs"),
    expectedRevision: v.number(),
    folderId: v.id("folders"),
    title: v.string(),
    contentMarkdown: v.string(),
  },
  returns: v.id("documents"),
  handler: async (ctx, args) => completeScriptApprovalHandler(ctx, args),
});

async function beginElementApprovalHandler(
  ctx: AuthedCtx & MutationCtx,
  args: {
    briefId: Id<"guidedBriefs">;
    expectedRevision: number;
    folderId: Id<"folders">;
    type: "character" | "prop" | "location" | "doc";
    name: string;
    description: string;
    sourceAssetIds: Id<"assets">[];
  },
) {
    const brief = await requireBriefOwner(ctx, args.briefId);
    if (brief.revision !== args.expectedRevision) throw new Error("Stale brief revision");
    if (brief.mode !== "element") throw new Error("Brief is not an element");
    if (
      brief.status !== "approved" &&
      brief.status !== "failed" &&
      brief.status !== "generating"
    ) {
      throw new Error("Element brief is not approved");
    }
    const folder = await ctx.db.get("folders", args.folderId);
    if (!folder || folder.ownerId !== ctx.user._id || folder.deletedAt) {
      throw new Error("Folder not found");
    }
    if (brief.approvedElementId) {
      const existing = await ctx.db.get("elements", brief.approvedElementId);
      if (existing && existing.ownerId === ctx.user._id && !existing.deletedAt) {
        await ctx.db.patch(brief._id, {
          status: "generating",
          error: undefined,
          updatedAt: Date.now(),
        });
        return { elementId: existing._id, created: false };
      }
    }
    for (const assetId of args.sourceAssetIds) {
      const asset = await ctx.db.get("assets", assetId);
      if (!asset || asset.ownerId !== ctx.user._id || asset.deletedAt) {
        throw new Error("Element source asset not found");
      }
    }
    const now = Date.now();
    const elementId = await ctx.db.insert("elements", {
      ownerId: ctx.user._id,
      folderId: args.folderId,
      type: args.type,
      name: args.name.trim().slice(0, 80) || "New element",
      description: args.description,
      sourceMode: "designed",
      sourceAssetIds: args.sourceAssetIds,
      referenceAssetIds: args.sourceAssetIds,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(brief._id, {
      status: "generating",
      approvedElementId: elementId,
      approvedRevision: brief.revision,
      approvedAt: brief.approvedAt ?? now,
      error: undefined,
      updatedAt: now,
    });
    return { elementId, created: true };
}

export const beginElementApproval = authedMutation({
  args: {
    briefId: v.id("guidedBriefs"),
    expectedRevision: v.number(),
    folderId: v.id("folders"),
    type: v.union(
      v.literal("character"),
      v.literal("prop"),
      v.literal("location"),
      v.literal("doc"),
    ),
    name: v.string(),
    description: v.string(),
    sourceAssetIds: v.array(v.id("assets")),
  },
  returns: v.object({
    elementId: v.id("elements"),
    created: v.boolean(),
  }),
  handler: async (ctx, args) => beginElementApprovalHandler(ctx, args),
});

export const completeElementApproval = internalMutation({
  args: {
    briefId: v.id("guidedBriefs"),
    elementId: v.id("elements"),
    status: v.union(v.literal("done"), v.literal("failed")),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const brief = await ctx.db.get("guidedBriefs", args.briefId);
    if (!brief || brief.approvedElementId !== args.elementId) return null;
    await ctx.db.patch(brief._id, {
      status: args.status,
      error: args.error,
      updatedAt: Date.now(),
    });
    return null;
  },
});

async function claimBriefApprovalHandler(
  ctx: AuthedCtx & MutationCtx,
  args: {
    briefId: Id<"guidedBriefs">;
    expectedRevision: number;
    stylePresetId?: Id<"stylePresets">;
  },
) {
    if (!isGuidedVideoAssistanceEnabled()) {
      throw new Error("Assistance is disabled on this deployment.");
    }
    const brief = await requireBriefOwner(ctx, args.briefId);
    if (brief.mode === "image" || brief.mode === "video") {
      throw new Error("Media approval must use the atomic generation transaction.");
    }
    if (brief.approvedJobId && brief.approvedRevision === args.expectedRevision) {
      const attachments = await ctx.db
        .query("guidedBriefAttachments")
        .withIndex("by_brief", (q) => q.eq("briefId", brief._id))
        .collect();
      for (const attachment of attachments) {
        await requireOwnedAttachment(ctx, brief.ownerId, attachment);
      }
      const existingPlan = parseAssistanceGenerationPlan(brief.generationPlanJson);
      if (!existingPlan) throw new Error("Approved generation plan is invalid.");
      return {
        briefId: brief._id,
        threadId: brief.threadId,
        revision: brief.revision,
        mode: brief.mode,
        videoType: brief.videoType,
        compiledPrompt: existingPlan.finalPrompt,
        generationPlanJson: JSON.stringify(existingPlan),
        generationPlanFingerprint: existingPlan.fingerprint,
        estimatedCredits: existingPlan.estimate.credits,
        payload: parsePayload(brief.payload),
        stylePresetId: brief.stylePresetId,
        styleSheetElementId: brief.styleSheetElementId,
        alreadyApprovedJobId: brief.approvedJobId,
        attachmentIds: attachments.map((a) => ({
          assetId: a.assetId,
          documentId: a.documentId,
          elementId: a.elementId,
          role: a.role,
          sortOrder: a.sortOrder,
        })),
      };
    }
    if (brief.revision !== args.expectedRevision) {
      throw new Error("Brief was updated elsewhere. Refresh and try again.");
    }
    if (brief.status !== "review_ready" && brief.status !== "failed") {
      throw new Error("Brief is not ready to approve yet.");
    }
    const payload = parsePayload(brief.payload);
    const attachments = await ctx.db
      .query("guidedBriefAttachments")
      .withIndex("by_brief", (q) => q.eq("briefId", brief._id))
      .collect();
    for (const attachment of attachments) {
      await requireOwnedAttachment(ctx, brief.ownerId, attachment);
    }
    const presence = attachmentPresenceFromRoles(
      attachments.map((a) => a.role as AttachmentRole),
    );
    const policy = evaluateBrief({
      mode: normalizeAssistedMode(brief.mode),
      videoType: brief.videoType,
      payload,
      attachments: presence,
      offeredOptionalIds: brief.offeredOptionalIds,
      skippedOptionalIds: brief.skippedOptionalIds,
      lockedFields: brief.lockedFields,
    });
    if (!policy.complete) {
      throw new Error(
        policy.blockers[0] ?? "Brief still needs answers before approval.",
      );
    }
    const compiled =
      brief.compiledPrompt ??
      compileBriefPrompt(
        normalizeAssistedMode(brief.mode),
        brief.videoType,
        payload,
        presence,
      );
    const storedPlan = parseAssistanceGenerationPlan(brief.generationPlanJson);
    const currentPlan = await buildPlanForBrief(
      ctx,
      brief,
      payload,
      compiled,
      brief.warnings,
    );
    if (
      storedPlan &&
      (storedPlan.fingerprint !== brief.generationPlanFingerprint ||
        storedPlan.fingerprint !== currentPlan.fingerprint)
    ) {
      throw new Error("Generation inputs changed after review. Review the brief again.");
    }
    const plan = currentPlan;
    const effectiveStylePresetId = args.stylePresetId ?? brief.stylePresetId;
    if (brief.mode === "script" && !effectiveStylePresetId) {
      throw new Error("Select a style before reviewing this generation.");
    }
    if (
      effectiveStylePresetId &&
      plan.settings.stylePresetId !== String(effectiveStylePresetId)
    ) {
      throw new Error("Style changed after review. Review the brief again.");
    }
    const now = Date.now();
    await ctx.db.patch(brief._id, {
      status: "approved",
      compiledPrompt: plan.finalPrompt,
      generationPlanJson: JSON.stringify(plan),
      generationPlanFingerprint: plan.fingerprint,
      estimatedCredits: plan.estimate.credits,
      approvedRevision: brief.revision,
      approvedAt: now,
      error: undefined,
      updatedAt: now,
    });
    return {
      briefId: brief._id,
      threadId: brief.threadId,
      revision: brief.revision,
      mode: brief.mode,
      videoType: brief.videoType,
      compiledPrompt: plan.finalPrompt,
      generationPlanJson: JSON.stringify(plan),
      generationPlanFingerprint: plan.fingerprint,
      estimatedCredits: plan.estimate.credits,
      payload,
      stylePresetId: brief.stylePresetId,
      styleSheetElementId: brief.styleSheetElementId,
      attachmentIds: attachments.map((a) => ({
        assetId: a.assetId,
        documentId: a.documentId,
        elementId: a.elementId,
        role: a.role,
        sortOrder: a.sortOrder,
      })),
    };
}

export const claimBriefApproval = authedMutation({
  args: {
    briefId: v.id("guidedBriefs"),
    expectedRevision: v.number(),
    stylePresetId: v.optional(v.id("stylePresets")),
  },
  returns: v.object({
    briefId: v.id("guidedBriefs"),
    threadId: v.id("generationThreads"),
    revision: v.number(),
    mode: assistedModeValidator,
    videoType: v.optional(videoTypeValidator),
    compiledPrompt: v.string(),
    generationPlanJson: v.string(),
    generationPlanFingerprint: v.string(),
    estimatedCredits: v.optional(v.number()),
    payload: assistedBriefPayloadValidator,
    stylePresetId: v.optional(v.id("stylePresets")),
    styleSheetElementId: v.optional(v.id("elements")),
    alreadyApprovedJobId: v.optional(v.id("generationJobs")),
    attachmentIds: v.array(
      v.object({
        assetId: v.optional(v.id("assets")),
        documentId: v.optional(v.id("documents")),
        elementId: v.optional(v.id("elements")),
        role: v.string(),
        sortOrder: v.number(),
      }),
    ),
  }),
  handler: async (ctx, args) => claimBriefApprovalHandler(ctx, args),
});

export const attachApprovedJob = internalMutation({
  args: {
    briefId: v.id("guidedBriefs"),
    jobId: v.id("generationJobs"),
    inputs: v.array(
      v.object({
        assetId: v.optional(v.id("assets")),
        documentId: v.optional(v.id("documents")),
        elementId: v.optional(v.id("elements")),
        kind: v.union(
          v.literal("asset"),
          v.literal("document"),
          v.literal("element"),
        ),
        role: v.optional(v.string()),
        sortOrder: v.number(),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const brief = await ctx.db.get("guidedBriefs", args.briefId);
    if (!brief) return null;
    await ctx.db.patch(brief._id, {
      approvedJobId: args.jobId,
      status: "generating",
      updatedAt: Date.now(),
    });
    for (const input of args.inputs) {
      await ctx.db.insert("generationInputs", {
        jobId: args.jobId,
        assetId: input.assetId,
        documentId: input.documentId,
        elementId: input.elementId,
        kind: input.kind,
        role: input.role as AttachmentRole | undefined,
        sortOrder: input.sortOrder,
      });
    }
    return null;
  },
});

/** Resolve brief attachment assets to signed reference URLs for assistant + generation. */
export const resolveBriefMediaInternal = internalQuery({
  args: {
    briefId: v.id("guidedBriefs"),
    expiresUnix: v.number(),
  },
  returns: v.array(
    v.object({
      attachmentId: v.optional(v.id("guidedBriefAttachments")),
      assetId: v.optional(v.id("assets")),
      documentId: v.optional(v.id("documents")),
      elementId: v.optional(v.id("elements")),
      role: v.string(),
      label: v.optional(v.string()),
      sortOrder: v.number(),
      kind: v.optional(
        v.union(
          v.literal("image"),
          v.literal("video"),
          v.literal("audio"),
          v.literal("document"),
        ),
      ),
      mimeType: v.optional(v.string()),
      url: v.optional(v.string()),
      summary: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const brief = await ctx.db.get("guidedBriefs", args.briefId);
    if (!brief) return [];
    const attachments = await ctx.db
      .query("guidedBriefAttachments")
      .withIndex("by_brief", (q) => q.eq("briefId", args.briefId))
      .collect();
    attachments.sort((a, b) => a.sortOrder - b.sortOrder || a._creationTime - b._creationTime);
    const out: Array<{
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
    }> = [];
    for (const row of attachments) {
      await requireOwnedAttachment(ctx, brief.ownerId, row);
      if (row.assetId) {
        const asset = await ctx.db.get("assets", row.assetId);
        if (
          !asset ||
          asset.ownerId !== brief.ownerId ||
          asset.deletedAt ||
          !asset.bunnyPath
        ) continue;
        const url = await signBunnyFullUrl(
          asset.bunnyPath,
          args.expiresUnix,
          asset.kind,
        );
        out.push({
          attachmentId: row._id,
          assetId: row.assetId,
          role: row.role,
          label: row.label ?? asset.name,
          sortOrder: row.sortOrder,
          kind: asset.kind,
          mimeType: asset.mimeType,
          url,
          summary: `[${row.role}] ${asset.kind} “${asset.name}”`,
        });
        continue;
      }
      if (row.elementId) {
        const el = await ctx.db.get("elements", row.elementId);
        if (!el || el.ownerId !== brief.ownerId || el.deletedAt) continue;
        let url: string | undefined;
        let mimeType: string | undefined;
        if (el.sheetAssetId) {
          const sheet = await ctx.db.get("assets", el.sheetAssetId);
          if (
            sheet &&
            sheet.ownerId === brief.ownerId &&
            !sheet.deletedAt &&
            sheet.bunnyPath
          ) {
            url = await signBunnyFullUrl(
              sheet.bunnyPath,
              args.expiresUnix,
              sheet.kind,
            );
            mimeType = sheet.mimeType;
          }
        }
        out.push({
          attachmentId: row._id,
          elementId: row.elementId,
          role: row.role,
          label: row.label ?? el.name,
          sortOrder: row.sortOrder,
          kind: url ? "image" : undefined,
          mimeType,
          url,
          summary: `[${row.role}] element “${el.name}” (${el.type})${el.description?.trim() ? `\nDescription: ${el.description.trim().slice(0, 4_000)}` : ""}${url ? "\nBuilt reference sheet attached." : ""}`,
        });
        continue;
      }
      if (row.documentId) {
        const doc = await ctx.db.get("documents", row.documentId);
        if (!doc || doc.ownerId !== brief.ownerId || doc.deletedAt) continue;
        out.push({
          attachmentId: row._id,
          documentId: row.documentId,
          role: row.role,
          label: row.label ?? doc.title,
          sortOrder: row.sortOrder,
          kind: "document",
          summary: `[${row.role}] document “${doc.title}”\n${doc.contentMarkdown.slice(0, 8_000)}`,
        });
      }
    }
    if (brief.styleSheetElementId) {
      const sheet = await ctx.db.get("elements", brief.styleSheetElementId);
      if (
        sheet &&
        sheet.ownerId === brief.ownerId &&
        !sheet.deletedAt &&
        sheet.type === "style_sheet"
      ) {
        let url: string | undefined;
        let mimeType: string | undefined;
        let visualAssetId: Id<"assets"> | undefined;
        if (sheet.sheetAssetId) {
          const visual = await ctx.db.get("assets", sheet.sheetAssetId);
          if (
            visual &&
            visual.ownerId === brief.ownerId &&
            !visual.deletedAt &&
            visual.bunnyPath
          ) {
            visualAssetId = visual._id;
            url = await signBunnyFullUrl(
              visual.bunnyPath,
              args.expiresUnix,
              visual.kind,
            );
            mimeType = visual.mimeType;
          }
        }
        // Identity must be exactly one of asset/document/element. Keep the style
        // sheet element as the attachment id; the sheet visual is exposed via url.
        out.unshift({
          elementId: sheet._id,
          role: "style",
          label: sheet.name,
          sortOrder: -1,
          kind: url ? "image" : undefined,
          mimeType,
          url,
          summary: `[style] selected Style Sheet “${sheet.name}”\nRender mode: ${sheet.renderMode ?? "unspecified"}\nRules:\n${sheet.styleRules?.trim().slice(0, 12_000) || "(visual reference only)"}${url ? "\nStyle Sheet visual attached." : ""}${visualAssetId ? `\nSheet asset: ${visualAssetId}` : ""}`,
        });
      }
    }
    return out;
  },
});

export const findBriefByJobInternal = internalQuery({
  args: { jobId: v.id("generationJobs") },
  returns: v.union(v.id("guidedBriefs"), v.null()),
  handler: async (ctx, args) => {
    const brief = await ctx.db
      .query("guidedBriefs")
      .withIndex("by_job", (q) => q.eq("approvedJobId", args.jobId))
      .first();
    return brief?._id ?? null;
  },
});

export const markBriefTerminal = internalMutation({
  args: {
    briefId: v.id("guidedBriefs"),
    jobId: v.optional(v.id("generationJobs")),
    status: v.union(v.literal("done"), v.literal("failed")),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const brief = await ctx.db.get("guidedBriefs", args.briefId);
    if (!brief) return null;
    if (args.jobId && brief.approvedJobId !== args.jobId) return null;
    await ctx.db.patch(brief._id, {
      status: args.status,
      error: args.error,
      updatedAt: Date.now(),
    });
    return null;
  },
});

const productionPatchValidator = v.object({
  durationSeconds: v.optional(v.number()),
  aspectRatio: v.optional(v.string()),
  resolution: v.optional(v.string()),
  quality: v.optional(v.string()),
  scriptType: v.optional(v.string()),
  elementType: v.optional(v.string()),
  referenceIntent: v.optional(v.string()),
  skipPromptEnhancement: v.optional(v.boolean()),
});

async function loadBriefReturn(ctx: QueryCtx | MutationCtx, briefId: Id<"guidedBriefs">) {
  const brief = await ctx.db.get("guidedBriefs", briefId);
  if (!brief) throw new Error("Brief not found");
  const attachments = await ctx.db
    .query("guidedBriefAttachments")
    .withIndex("by_brief", (q) => q.eq("briefId", brief._id))
    .collect();
  attachments.sort((a, b) => a.sortOrder - b.sortOrder || a._creationTime - b._creationTime);
  return toBriefReturn(brief, attachments);
}

export const getBriefForApi = internalQuery({
  args: {
    userId: v.id("users"),
    briefId: v.id("guidedBriefs"),
  },
  returns: v.union(briefReturn, v.null()),
  handler: async (ctx, args) => {
    const brief = await ctx.db.get("guidedBriefs", args.briefId);
    if (!brief || brief.ownerId !== args.userId) return null;
    const attachments = await ctx.db
      .query("guidedBriefAttachments")
      .withIndex("by_brief", (q) => q.eq("briefId", brief._id))
      .collect();
    attachments.sort((a, b) => a.sortOrder - b.sortOrder || a._creationTime - b._creationTime);
    return toBriefReturn(brief, attachments);
  },
});

export const getBriefForThreadForApi = internalQuery({
  args: {
    userId: v.id("users"),
    threadId: v.id("generationThreads"),
  },
  returns: v.union(briefReturn, v.null()),
  handler: async (ctx, args) => {
    const authed = await asUserCtx(ctx, args.userId);
    await requireThreadOwner(authed, args.threadId);
    const brief = await ctx.db
      .query("guidedBriefs")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .order("desc")
      .first();
    if (!brief) return null;
    const attachments = await ctx.db
      .query("guidedBriefAttachments")
      .withIndex("by_brief", (q) => q.eq("briefId", brief._id))
      .collect();
    attachments.sort((a, b) => a.sortOrder - b.sortOrder || a._creationTime - b._creationTime);
    return toBriefReturn(brief, attachments);
  },
});

export const ensureBriefForApi = internalMutation({
  args: {
    userId: v.id("users"),
    sandboxFolderId: v.id("folders"),
    threadId: v.optional(v.id("generationThreads")),
    folderId: v.optional(v.id("folders")),
    mode: assistedModeValidator,
    videoType: v.optional(videoTypeValidator),
    stylePresetId: v.optional(v.id("stylePresets")),
    styleSheetElementId: v.optional(v.id("elements")),
    durationIsUserExplicit: v.optional(v.boolean()),
    production: v.optional(productionPatchValidator),
  },
  returns: briefReturn,
  handler: async (ctx, args) => {
    const authed = (await asUserCtx(ctx, args.userId)) as AuthedCtx & MutationCtx;
    let threadId = args.threadId;
    if (threadId) {
      await requireThreadOwner(authed, threadId);
    } else {
      const folderId = args.folderId ?? args.sandboxFolderId;
      const folder = await ctx.db.get("folders", folderId);
      if (!folder || folder.ownerId !== args.userId || folder.deletedAt) {
        throw new Error("Folder not found");
      }
      if (!(await isFolderInSandbox(ctx, folderId, args.sandboxFolderId))) {
        throw new Error("Folder not found");
      }
      const now = Date.now();
      threadId = await ctx.db.insert("generationThreads", {
        ownerId: args.userId,
        linkedFolderId: folderId,
        title: "Assisted production",
        sortOrder: now,
        assistanceEnabled: true,
        createdAt: now,
        updatedAt: now,
      });
    }
    const briefId = await ensureBriefHandler(authed, {
      threadId,
      mode: args.mode,
      videoType: args.videoType,
      stylePresetId: args.stylePresetId,
      styleSheetElementId: args.styleSheetElementId,
      durationIsUserExplicit: args.durationIsUserExplicit,
      production: args.production,
    });
    return await loadBriefReturn(ctx, briefId);
  },
});

export const editBriefForApi = internalMutation({
  args: {
    userId: v.id("users"),
    briefId: v.id("guidedBriefs"),
    expectedRevision: v.number(),
    patch: assistedBriefPayloadValidator,
    lockFields: v.optional(v.array(v.string())),
  },
  returns: briefReturn,
  handler: async (ctx, args) => {
    const authed = (await asUserCtx(ctx, args.userId)) as AuthedCtx & MutationCtx;
    return await editBriefHandler(authed, {
      briefId: args.briefId,
      expectedRevision: args.expectedRevision,
      patch: args.patch,
      lockFields: args.lockFields,
    });
  },
});

export const patchBriefProductionForApi = internalMutation({
  args: {
    userId: v.id("users"),
    briefId: v.id("guidedBriefs"),
    expectedRevision: v.number(),
    production: v.object({
      aspectRatio: v.optional(v.string()),
      resolution: v.optional(v.string()),
      quality: v.optional(v.string()),
      durationSeconds: v.optional(v.number()),
      videoType: v.optional(videoTypeValidator),
      audioEnabled: v.optional(v.boolean()),
    }),
  },
  returns: briefReturn,
  handler: async (ctx, args) => {
    const authed = (await asUserCtx(ctx, args.userId)) as AuthedCtx & MutationCtx;
    return await patchBriefProductionHandler(authed, {
      briefId: args.briefId,
      expectedRevision: args.expectedRevision,
      production: args.production,
    });
  },
});

export const rejectBriefForApi = internalMutation({
  args: {
    userId: v.id("users"),
    briefId: v.id("guidedBriefs"),
    expectedRevision: v.number(),
    reason: v.optional(v.string()),
    status: v.optional(v.union(v.literal("abandoned"), v.literal("failed"))),
  },
  returns: briefReturn,
  handler: async (ctx, args) => {
    const brief = await ctx.db.get("guidedBriefs", args.briefId);
    if (!brief || brief.ownerId !== args.userId) {
      throw new Error("Brief not found");
    }
    if (brief.revision !== args.expectedRevision) {
      throw new Error("Brief was updated elsewhere. Refresh and try again.");
    }
    if (["approved", "generating", "done"].includes(brief.status)) {
      throw new Error("Cannot reject an approved or generating brief.");
    }
    const now = Date.now();
    await ctx.db.patch(brief._id, {
      status: args.status ?? "abandoned",
      error: args.reason?.trim() || undefined,
      revision: brief.revision + 1,
      updatedAt: now,
    });
    return await loadBriefReturn(ctx, brief._id);
  },
});

export const listReviewReadyBriefsForApi = internalQuery({
  args: {
    userId: v.id("users"),
    threadId: v.optional(v.id("generationThreads")),
  },
  returns: v.array(briefReturn),
  handler: async (ctx, args) => {
    if (args.threadId) {
      const thread = await ctx.db.get("generationThreads", args.threadId);
      if (!thread || thread.ownerId !== args.userId) return [];
    }
    const rows = args.threadId
      ? await ctx.db
          .query("guidedBriefs")
          .withIndex("by_thread", (q) => q.eq("threadId", args.threadId!))
          .collect()
      : await ctx.db
          .query("guidedBriefs")
          .withIndex("by_owner_and_status", (q) =>
            q.eq("ownerId", args.userId).eq("status", "review_ready"),
          )
          .collect();
    const briefs = rows.filter(
      (row) =>
        row.ownerId === args.userId &&
        row.status === "review_ready" &&
        (!args.threadId || row.threadId === args.threadId),
    );
    const results = [];
    for (const brief of briefs) {
      const attachments = await ctx.db
        .query("guidedBriefAttachments")
        .withIndex("by_brief", (q) => q.eq("briefId", brief._id))
        .collect();
      attachments.sort((a, b) => a.sortOrder - b.sortOrder || a._creationTime - b._creationTime);
      results.push(toBriefReturn(brief, attachments));
    }
    return results;
  },
});

export const claimBriefApprovalForApi = internalMutation({
  args: {
    userId: v.id("users"),
    briefId: v.id("guidedBriefs"),
    expectedRevision: v.number(),
    stylePresetId: v.optional(v.id("stylePresets")),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const authed = (await asUserCtx(ctx, args.userId)) as AuthedCtx & MutationCtx;
    return await claimBriefApprovalHandler(authed, {
      briefId: args.briefId,
      expectedRevision: args.expectedRevision,
      stylePresetId: args.stylePresetId,
    });
  },
});

export const completeScriptApprovalForApi = internalMutation({
  args: {
    userId: v.id("users"),
    briefId: v.id("guidedBriefs"),
    expectedRevision: v.number(),
    folderId: v.id("folders"),
    title: v.string(),
    contentMarkdown: v.string(),
  },
  returns: v.id("documents"),
  handler: async (ctx, args) => {
    const authed = (await asUserCtx(ctx, args.userId)) as AuthedCtx & MutationCtx;
    return await completeScriptApprovalHandler(authed, {
      briefId: args.briefId,
      expectedRevision: args.expectedRevision,
      folderId: args.folderId,
      title: args.title,
      contentMarkdown: args.contentMarkdown,
    });
  },
});

export const beginElementApprovalForApi = internalMutation({
  args: {
    userId: v.id("users"),
    briefId: v.id("guidedBriefs"),
    expectedRevision: v.number(),
    folderId: v.id("folders"),
    type: v.union(
      v.literal("character"),
      v.literal("prop"),
      v.literal("location"),
      v.literal("doc"),
    ),
    name: v.string(),
    description: v.string(),
    sourceAssetIds: v.array(v.id("assets")),
  },
  returns: v.object({
    elementId: v.id("elements"),
    created: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const authed = (await asUserCtx(ctx, args.userId)) as AuthedCtx & MutationCtx;
    return await beginElementApprovalHandler(authed, {
      briefId: args.briefId,
      expectedRevision: args.expectedRevision,
      folderId: args.folderId,
      type: args.type,
      name: args.name,
      description: args.description,
      sourceAssetIds: args.sourceAssetIds,
    });
  },
});
