import { v } from "convex/values";
import { styleSheetSystemInstructions } from "./lib/styleSheetGuides";
import { makeFunctionReference, type FunctionReference } from "convex/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, internalQuery } from "./_generated/server";
import { buildAssetPath, LQIP_TRANSFORM, signBunnyCdnUrl, THUMB_TRANSFORM } from "./lib/bunny";
import { adminQuery, authedMutation, authedQuery } from "./lib/customFunctions";
import {
  CREDIT_PRICE_TTD,
  creditCostForGeneration,
  imageCreditCost,
  textCreditCost,
} from "./lib/generationPricing";
import {
  billingTierForMode,
  validateVideoModelCapabilities,
  videoPricingModelFromGatewayId,
} from "./lib/videoModels";
import {
  canReuseAssistanceMediaJob,
  parseAssistanceGenerationPlan,
} from "./lib/assistanceGenerationPlan";

const generationMode = v.union(
  v.literal("image"),
  v.literal("video"),
  v.literal("audio"),
);
const audioGenType = v.union(
  v.literal("voiceover"),
  v.literal("sfx"),
  v.literal("music"),
);
const generationTier = v.union(
  v.literal("image"),
  v.literal("pro_video"),
  v.literal("audio"),
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
);
const generationStage = v.union(
  v.literal("queued"),
  v.literal("generating"),
  v.literal("saving"),
  v.literal("done"),
  v.literal("failed"),
);

const sendPushForNotificationRef = makeFunctionReference<
  "action",
  { notificationId: Id<"notifications"> },
  number
>("notificationsActions:sendPushForNotification") as unknown as FunctionReference<
  "action",
  "internal",
  { notificationId: Id<"notifications"> },
  number
>;

const threadPreviewChip = v.object({
  label: v.string(),
  kind: v.string(),
  elementType: v.optional(v.string()),
  thumbnailUrl: v.optional(v.string()),
});

const threadReturn = v.object({
  _id: v.id("generationThreads"),
  _creationTime: v.number(),
  ownerId: v.id("users"),
  linkedFolderId: v.id("folders"),
  title: v.string(),
  sortOrder: v.number(),
  archivedAt: v.optional(v.number()),
  assistanceEnabled: v.optional(v.boolean()),
  createdAt: v.number(),
  updatedAt: v.number(),
  previewSnippet: v.optional(v.string()),
  previewChips: v.optional(v.array(threadPreviewChip)),
  resultThumbs: v.optional(
    v.array(
      v.object({
        _id: v.id("assets"),
        kind: v.union(v.literal("image"), v.literal("video"), v.literal("audio"), v.literal("document")),
        thumbnailUrl: v.optional(v.string()),
      }),
    ),
  ),
});

const REFERENCES_MARKER = "\n\nReferences:\n";

function parseHistoryReferenceLine(line: string) {
  const trimmed = String(line ?? "").trim();
  const match = trimmed.match(/^-\s*@(.+?)(?:\s*\|\s*(.+))?$/);
  if (!match) return null;
  const label = match[1].trim();
  if (!label || label === "[object Object]") return null;
  const metaParts = String(match[2] ?? "")
    .split("|")
    .map((piece) => piece.trim())
    .filter(Boolean);
  let kind = "file";
  let elementType = "";
  let thumb = "";
  for (const part of metaParts) {
    const [key, ...rest] = part.split(":");
    const value = rest.join(":").trim();
    if (!value) continue;
    if (key === "kind") kind = value;
    else if (key === "element") elementType = value;
    else if (key === "thumb") thumb = value;
  }
  return {
    label,
    kind,
    ...(elementType ? { elementType } : {}),
    ...(thumb ? { thumbnailUrl: thumb } : {}),
  };
}

/** Strip composer object placeholders so tab titles never show a dashed "OBJ". */
function sanitizeThreadTitle(title?: string, fallback = "New generation") {
  const cleaned = String(title ?? "")
    .replace(/\uFFFC/g, " ")
    .replace(/\n\nReferences:\n[\s\S]*$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 64);
  return cleaned || fallback;
}

function historyPromptSummary(prompt?: string) {
  const raw = String(prompt ?? "");
  const splitIdx = raw.indexOf(REFERENCES_MARKER);
  const body = (splitIdx === -1 ? raw : raw.slice(0, splitIdx))
    .replace(/\uFFFC/g, " ")
    .replace(/@([^\s@|]+)/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  const chips: Array<{
    label: string;
    kind: string;
    elementType?: string;
    thumbnailUrl?: string;
  }> = [];
  if (splitIdx !== -1) {
    for (const line of raw.slice(splitIdx + REFERENCES_MARKER.length).split("\n")) {
      const parsed = parseHistoryReferenceLine(line);
      if (!parsed) continue;
      chips.push(parsed);
      if (chips.length >= 4) break;
    }
  }
  const snippet = body.replace(/\s+/g, " ").trim();
  return {
    snippet: snippet ? snippet.slice(0, 120) : undefined,
    chips,
  };
}

/** Cap history queries — unbounded collect() exceeds Convex's 1s query limit. */
const LIST_THREADS_LIMIT = 100;
const HISTORY_PAGE_LIMIT = 12;
const HISTORY_SCAN_LIMIT = 240;

const historyRange = v.union(
  v.literal("recent"),
  v.literal("this_week"),
  v.literal("older"),
);

const historyPageReturn = v.object({
  threads: v.array(threadReturn),
  nextCursor: v.optional(v.number()),
  hasMore: v.boolean(),
});

function historyRangeBounds(range: "recent" | "this_week" | "older") {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  const yesterdayStart = todayStart - dayMs;
  const weekStart = todayStart - 7 * dayMs;
  if (range === "recent") {
    return { minMs: yesterdayStart, maxMs: Number.POSITIVE_INFINITY };
  }
  if (range === "this_week") {
    return { minMs: weekStart, maxMs: yesterdayStart };
  }
  return { minMs: 0, maxMs: weekStart };
}

async function enrichHistoryThread(
  ctx: QueryCtx,
  thread: Doc<"generationThreads">,
  expiresUnix: number | undefined,
  signThumb: boolean,
) {
  const recentEvents = await ctx.db
    .query("generationEvents")
    .withIndex("by_thread_and_order", (q) => q.eq("threadId", thread._id))
    .order("desc")
    .take(8);

  const promptEvent = recentEvents.find((event) => event.kind === "prompt" && event.prompt);
  const resultEvent = recentEvents.find(
    (event) => event.kind === "result" && (event.assetIds?.length ?? 0) > 0,
  );
  const { snippet, chips } = historyPromptSummary(promptEvent?.prompt);

  let resultThumbs:
    | Array<{
        _id: Id<"assets">;
        kind: Doc<"assets">["kind"];
        thumbnailUrl?: string;
      }>
    | undefined;

  if (signThumb && resultEvent?.assetIds?.length && expiresUnix) {
    const asset = await ctx.db.get("assets", resultEvent.assetIds[0]!);
    if (asset) {
      const thumbPath =
        asset.thumbnailPath ||
        (asset.bunnyPath && asset.kind === "image" ? asset.bunnyPath : undefined);
      let thumbnailUrl = thumbPath
        ? await signBunnyCdnUrl(thumbPath, expiresUnix, THUMB_TRANSFORM)
        : undefined;
      // History chips: videos without a poster still need a preview frame source.
      if (!thumbnailUrl && asset.kind === "video" && asset.bunnyPath) {
        thumbnailUrl = await signBunnyCdnUrl(asset.bunnyPath, expiresUnix);
      }
      resultThumbs = [
        {
          _id: asset._id,
          kind: asset.kind,
          ...(thumbnailUrl ? { thumbnailUrl } : {}),
        },
      ];
    }
  }

  const cleanedTitle =
    thread.title?.trim() && thread.title.trim() !== "[object Object]"
      ? sanitizeThreadTitle(thread.title, "")
      : undefined;

  return {
    ...thread,
    title:
      cleanedTitle &&
      cleanedTitle !== "New generation" &&
      cleanedTitle !== "API generation"
        ? cleanedTitle
        : snippet || cleanedTitle || "Untitled",
    ...(snippet ? { previewSnippet: snippet } : {}),
    ...(chips.length ? { previewChips: chips } : {}),
    ...(resultThumbs?.length ? { resultThumbs } : {}),
  };
}

export const listThreads = authedQuery({
  args: {},
  returns: v.array(threadReturn),
  handler: async (ctx) => {
    // Newest first within non-archived (archivedAt is unused today but keep the filter).
    const threads = await ctx.db
      .query("generationThreads")
      .withIndex("by_owner_and_archived", (q) =>
        q.eq("ownerId", ctx.user._id).eq("archivedAt", undefined),
      )
      .order("desc")
      .take(LIST_THREADS_LIMIT);

    return threads.map((thread) => {
      const cleanedTitle =
        thread.title?.trim() && thread.title.trim() !== "[object Object]"
          ? sanitizeThreadTitle(thread.title, "Untitled")
          : "Untitled";
      return {
        ...thread,
        title: cleanedTitle,
      };
    });
  },
});

/**
 * Paginated enriched history for one time range.
 * recent = today + yesterday; this_week / older load only when their accordion opens.
 */
export const listHistoryThreads = authedQuery({
  args: {
    range: historyRange,
    expiresUnix: v.optional(v.number()),
    cursor: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  returns: historyPageReturn,
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? HISTORY_PAGE_LIMIT, 1), HISTORY_PAGE_LIMIT);
    const { minMs, maxMs } = historyRangeBounds(args.range);
    const cursor = args.cursor;

    // Prefer the updatedAt index so "load more" can walk beyond the newest window.
    let scanned = await ctx.db
      .query("generationThreads")
      .withIndex("by_owner_archived_updated", (q) =>
        q.eq("ownerId", ctx.user._id).eq("archivedAt", undefined),
      )
      .order("desc")
      .take(HISTORY_SCAN_LIMIT);

    if (scanned.length === 0) {
      scanned = await ctx.db
        .query("generationThreads")
        .withIndex("by_owner_and_archived", (q) =>
          q.eq("ownerId", ctx.user._id).eq("archivedAt", undefined),
        )
        .order("desc")
        .take(HISTORY_SCAN_LIMIT);
    }

    const matched = scanned.filter((thread) => {
      const ts = thread.updatedAt ?? thread._creationTime;
      if (cursor != null && ts >= cursor) return false;
      return ts >= minMs && ts < maxMs;
    });

    const page = matched.slice(0, limit);
    const hasMore = matched.length > limit;
    const nextCursor = hasMore
      ? page[page.length - 1]?.updatedAt ?? page[page.length - 1]?._creationTime
      : undefined;

    const threads = [];
    for (let index = 0; index < page.length; index += 1) {
      threads.push(
        await enrichHistoryThread(ctx, page[index]!, args.expiresUnix, index < 8),
      );
    }

    return {
      threads,
      ...(nextCursor != null ? { nextCursor } : {}),
      hasMore,
    };
  },
});

const eventReturn = v.object({
  _id: v.id("generationEvents"),
  _creationTime: v.number(),
  ownerId: v.id("users"),
  threadId: v.id("generationThreads"),
  kind: v.union(
    v.literal("prompt"),
    v.literal("result"),
    v.literal("folder_switched"),
    v.literal("stage"),
    v.literal("assistant"),
    v.literal("question"),
    v.literal("review"),
    v.literal("approval"),
  ),
  order: v.number(),
  prompt: v.optional(v.string()),
  stage: v.optional(generationStage),
  generationJobId: v.optional(v.id("generationJobs")),
  assetIds: v.optional(v.array(v.id("assets"))),
  fromFolderId: v.optional(v.id("folders")),
  toFolderId: v.optional(v.id("folders")),
  fromFolderName: v.optional(v.string()),
  toFolderName: v.optional(v.string()),
  briefId: v.optional(v.id("guidedBriefs")),
  briefRevision: v.optional(v.number()),
  message: v.optional(v.string()),
  questionsJson: v.optional(v.string()),
  briefSnapshotJson: v.optional(v.string()),
  approvalId: v.optional(v.id("assistanceApprovals")),
  createdAt: v.number(),
  error: v.optional(v.string()),
  jobMode: v.optional(generationMode),
  aspectRatio: v.optional(v.string()),
  resultAssets: v.optional(v.array(v.object({
    _id: v.id("assets"),
    name: v.string(),
    kind: v.union(v.literal("image"), v.literal("video"), v.literal("audio"), v.literal("document")),
    mimeType: v.string(),
    byteSize: v.optional(v.number()),
    folderId: v.optional(v.id("folders")),
    storageStatus: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("ready"),
        v.literal("failed"),
      ),
    ),
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
    signedReadUrl: v.optional(v.string()),
    signedThumbnailUrl: v.optional(v.string()),
    signedThumbnailLqipUrl: v.optional(v.string()),
  }))),
});

export const listEvents = authedQuery({
  args: {
    threadId: v.id("generationThreads"),
    expiresUnix: v.optional(v.number()),
    /** When set, return only the newest N events (reactive live tail). */
    limit: v.optional(v.number()),
  },
  returns: v.array(eventReturn),
  handler: async (ctx, args) => {
    await requireThreadOwner(ctx, args.threadId);
    const limit = args.limit != null ? Math.min(Math.max(args.limit, 1), 200) : undefined;
    const eventQuery = ctx.db
      .query("generationEvents")
      .withIndex("by_thread_and_order", (q) => q.eq("threadId", args.threadId));
    const events = limit
      ? (await eventQuery.order("desc").take(limit)).reverse()
      : await eventQuery.collect();
    const resultAssetIds = Array.from(new Set(events.flatMap((event) => event.assetIds ?? [])));
    const assets = (await Promise.all(resultAssetIds.map((assetId) => ctx.db.get("assets", assetId))))
      .filter((asset): asset is Doc<"assets"> => asset !== null);
    const assetsById = new Map(assets.map((asset) => [asset._id, asset]));
    const jobIds = Array.from(
      new Set(
        events
          .map((event) => event.generationJobId)
          .filter((jobId): jobId is Id<"generationJobs"> => jobId !== undefined),
      ),
    );
    const jobs = (await Promise.all(jobIds.map((jobId) => ctx.db.get("generationJobs", jobId)))).filter(
      (job): job is Doc<"generationJobs"> => job !== null,
    );
    const jobsById = new Map(jobs.map((job) => [job._id, job]));
    const folderIds = Array.from(
      new Set(
        events.flatMap((event) =>
          event.kind === "folder_switched"
            ? [event.fromFolderId, event.toFolderId].filter(
                (folderId): folderId is Id<"folders"> => folderId !== undefined,
              )
            : [],
        ),
      ),
    );
    const folders = (
      await Promise.all(folderIds.map((folderId) => ctx.db.get("folders", folderId)))
    ).filter((folder): folder is Doc<"folders"> => folder !== null);
    const foldersById = new Map(folders.map((folder) => [folder._id, folder]));
    return await Promise.all(events.map(async (event) => {
      const job = event.generationJobId ? jobsById.get(event.generationJobId) : null;
      const fromFolder =
        event.kind === "folder_switched" && event.fromFolderId
          ? foldersById.get(event.fromFolderId)
          : null;
      const toFolder =
        event.kind === "folder_switched" && event.toFolderId
          ? foldersById.get(event.toFolderId)
          : null;
      return {
        ...event,
        ...(job?.mode ? { jobMode: job.mode } : {}),
        ...(job?.aspectRatio ? { aspectRatio: job.aspectRatio } : {}),
        ...(event.kind === "stage" && event.stage === "failed" && job?.error
          ? { error: job.error }
          : {}),
        ...(fromFolder?.name ? { fromFolderName: fromFolder.name } : {}),
        ...(toFolder?.name ? { toFolderName: toFolder.name } : {}),
        resultAssets: event.assetIds?.length
        ? await Promise.all(
            event.assetIds
              .map((assetId) => assetsById.get(assetId))
              .filter((asset): asset is Doc<"assets"> => asset !== undefined)
              .map(async (asset) => {
                const thumbPath =
                  asset.thumbnailPath ||
                  (asset.bunnyPath && asset.kind === "image" ? asset.bunnyPath : undefined);
                const [signedThumbnailUrl, signedThumbnailLqipUrl] = thumbPath && args.expiresUnix
                  ? await Promise.all([
                      signBunnyCdnUrl(thumbPath, args.expiresUnix, THUMB_TRANSFORM),
                      signBunnyCdnUrl(thumbPath, args.expiresUnix, LQIP_TRANSFORM),
                    ])
                  : [undefined, undefined];
                // Chat result cards need a full playable URL for video/audio even
                // when a poster thumbnail exists (posters must not become <video src>).
                // Folder grid also reuses this for video first-frame thumbs.
                let signedReadUrl: string | undefined;
                if (
                  (asset.kind === "video" || asset.kind === "audio" || !signedThumbnailUrl) &&
                  asset.bunnyPath &&
                  args.expiresUnix
                ) {
                  signedReadUrl = await signBunnyCdnUrl(asset.bunnyPath, args.expiresUnix);
                }
                return {
                  _id: asset._id,
                  name: asset.name,
                  kind: asset.kind,
                  mimeType: asset.mimeType,
                  byteSize: asset.byteSize,
                  folderId: asset.folderId,
                  storageStatus: asset.storageStatus,
                  createdAt: asset.createdAt,
                  updatedAt: asset.updatedAt,
                  signedReadUrl,
                  signedThumbnailUrl,
                  signedThumbnailLqipUrl,
                };
              }),
          )
        : undefined,
      };
    }));
  },
});

export const createThread = authedMutation({
  args: {
    folderId: v.id("folders"),
    title: v.optional(v.string()),
    assistanceEnabled: v.optional(v.boolean()),
  },
  returns: v.id("generationThreads"),
  handler: async (ctx, args) => {
    await requireFolderOwner(ctx, args.folderId);
    const now = Date.now();
    // Missing user default → on; only an explicit false opts out.
    const assistanceEnabled =
      args.assistanceEnabled ?? ctx.user.assistanceDefaultEnabled !== false;
    return await ctx.db.insert("generationThreads", {
      ownerId: ctx.user._id,
      linkedFolderId: args.folderId,
      title: sanitizeThreadTitle(args.title, "New generation"),
      sortOrder: now,
      assistanceEnabled,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const setThreadAssistance = authedMutation({
  args: {
    threadId: v.id("generationThreads"),
    enabled: v.boolean(),
    /** When true, also update the account default for future chats. */
    updateAccountDefault: v.optional(v.boolean()),
  },
  returns: v.object({
    assistanceEnabled: v.boolean(),
    assistanceDefaultEnabled: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const thread = await requireThreadOwner(ctx, args.threadId);
    const now = Date.now();
    await ctx.db.patch(thread._id, {
      assistanceEnabled: args.enabled,
      updatedAt: now,
    });
    let assistanceDefaultEnabled = ctx.user.assistanceDefaultEnabled !== false;
    if (args.updateAccountDefault !== false) {
      await ctx.db.patch(ctx.user._id, {
        assistanceDefaultEnabled: args.enabled,
        updatedAt: now,
      });
      assistanceDefaultEnabled = args.enabled;
    }
    return {
      assistanceEnabled: args.enabled,
      assistanceDefaultEnabled,
    };
  },
});

export const switchThreadFolder = authedMutation({
  args: {
    threadId: v.id("generationThreads"),
    folderId: v.id("folders"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const thread = await requireThreadOwner(ctx, args.threadId);
    await requireFolderOwner(ctx, args.folderId);
    const now = Date.now();
    await ctx.db.patch(thread._id, {
      linkedFolderId: args.folderId,
      updatedAt: now,
    });
    await ctx.db.insert("generationEvents", {
      ownerId: ctx.user._id,
      threadId: thread._id,
      kind: "folder_switched",
      order: now,
      fromFolderId: thread.linkedFolderId,
      toFolderId: args.folderId,
      createdAt: now,
    });
    return null;
  },
});

export const canGenerate = authedQuery({
  args: {
    tier: generationTier,
    now: v.number(),
    resolution: v.optional(v.string()),
    quality: v.optional(v.string()),
    aspectRatio: v.optional(v.string()),
    durationSeconds: v.optional(v.number()),
    hasReferenceInput: v.optional(v.boolean()),
    hasVideoReferenceInput: v.optional(v.boolean()),
    hasNonVideoReferenceInput: v.optional(v.boolean()),
    audioEnabled: v.optional(v.boolean()),
    videoModel: v.optional(v.string()),
    audioType: v.optional(audioGenType),
    characterCount: v.optional(v.number()),
  },
  returns: v.object({
    canGenerate: v.boolean(),
    creditBalance: v.number(),
    cost: v.number(),
    hasActiveSubscription: v.boolean(),
    reason: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const account = await ctx.db
      .query("billingAccounts")
      .withIndex("by_user", (q) => q.eq("userId", ctx.user._id))
      .unique();
    if (args.tier === "pro_video" && args.resolution === "3840x2160") {
      return {
        canGenerate: false,
        creditBalance: account?.creditBalance ?? 0,
        cost: 0,
        hasActiveSubscription: false,
        reason: "4K video isn't available yet. Try 1080p or 720p for now.",
      };
    }
    if (args.tier === "pro_video" && !isSupportedVideoDuration(args.durationSeconds)) {
      return {
        canGenerate: false,
        creditBalance: account?.creditBalance ?? 0,
        cost: 0,
        hasActiveSubscription: false,
        reason: "Video duration must be between 4 and 15 seconds.",
      };
    }
    const cost = generationCreditCost({
      tier: args.tier,
      resolution: args.resolution,
      quality: args.quality,
      aspectRatio: args.aspectRatio,
      durationSeconds: args.durationSeconds,
      hasReferenceInput: args.hasReferenceInput,
      hasVideoReferenceInput: args.hasVideoReferenceInput,
      hasNonVideoReferenceInput: args.hasNonVideoReferenceInput,
      audioEnabled: args.audioEnabled,
      videoModel: args.videoModel,
      audioType: args.audioType,
      characterCount: args.characterCount,
    });
    const creditBalance = account?.creditBalance ?? 0;
    const hasActiveSubscription = await hasActiveSubscriptionForUser(
      ctx,
      ctx.user._id,
      args.now,
    );
    const canGenerate = creditBalance >= cost;
    return {
      canGenerate,
      creditBalance,
      cost,
      hasActiveSubscription,
      reason: canGenerate ? undefined : insufficientCreditsMessage(cost),
    };
  },
});

export const createQueuedJob = authedMutation({
  args: {
    threadId: v.id("generationThreads"),
    mode: generationMode,
    tier: generationTier,
    resolvedModel: v.string(),
    stylePresetId: v.optional(v.id("stylePresets")),
    styleSheetElementId: v.optional(v.id("elements")),
    userPrompt: v.string(),
    audioEnabled: v.optional(v.boolean()),
    aspectRatio: v.optional(v.string()),
    resolution: v.optional(v.string()),
    quality: v.optional(v.string()),
    durationSeconds: v.optional(v.number()),
    hasReferenceInput: v.optional(v.boolean()),
    hasVideoReferenceInput: v.optional(v.boolean()),
    hasNonVideoReferenceInput: v.optional(v.boolean()),
    hasStartFrame: v.optional(v.boolean()),
    skipPromptEnhancement: v.optional(v.boolean()),
    audioType: v.optional(audioGenType),
    elevenVoiceId: v.optional(v.string()),
    elevenVoiceName: v.optional(v.string()),
    elevenPublicOwnerId: v.optional(v.string()),
    audioLoop: v.optional(v.boolean()),
    promptInfluence: v.optional(v.number()),
    /** Current Studio folder — overrides stale thread.linkedFolderId for this job. */
    folderId: v.optional(v.id("folders")),
  },
  returns: v.id("generationJobs"),
  handler: async (ctx, args) => {
    const thread = await requireThreadOwner(ctx, args.threadId);
    const saveFolderId = args.folderId ?? thread.linkedFolderId;
    await requireFolderOwner(ctx, saveFolderId);
    if (args.folderId && args.folderId !== thread.linkedFolderId) {
      await ctx.db.patch(thread._id, {
        linkedFolderId: args.folderId,
        updatedAt: Date.now(),
      });
    }
    if (args.mode === "video" && args.resolution === "3840x2160") {
      throw new Error("4K video is not available yet. Video generation supports up to 1080p.");
    }
    if (args.mode === "video" && !isSupportedVideoDuration(args.durationSeconds)) {
      throw new Error("Video duration must be between 4 and 15 seconds");
    }
    if (args.mode === "video") {
      validateVideoModelCapabilities(args.resolvedModel, {
        durationSeconds: args.durationSeconds,
        hasStartFrame: args.hasStartFrame,
        hasMultimodalReferences:
          args.hasVideoReferenceInput || args.hasNonVideoReferenceInput,
        surface: "studio",
      });
    }
    if (args.mode === "audio") {
      if (args.audioType === "music") {
        throw new Error("Music generation is coming soon.");
      }
      if (args.audioType === "voiceover" && !args.elevenVoiceId?.trim()) {
        throw new Error("Select a voice for the voiceover.");
      }
      if (!args.userPrompt.trim()) {
        throw new Error(
          args.audioType === "sfx"
            ? "Describe the sound effect to generate."
            : "Enter voiceover text.",
        );
      }
    }
    if (args.mode !== "audio") {
      if (!args.stylePresetId) {
        throw new Error("Style preset not available");
      }
      const preset = await ctx.db.get("stylePresets", args.stylePresetId);
      if (!preset || !preset.enabled) {
        throw new Error("Style preset not available");
      }
    }
    if (args.styleSheetElementId) {
      const sheet = await ctx.db.get("elements", args.styleSheetElementId);
      if (!sheet || sheet.ownerId !== ctx.user._id || sheet.deletedAt || sheet.type !== "style_sheet") {
        throw new Error("Style Sheet not found");
      }
      if (!sheet.styleRules?.trim() && !sheet.sheetAssetId) {
        throw new Error("Build the Style Sheet before using it for generation");
      }
    }
    const now = Date.now();
    const billingTier = billingTierForMode(args.mode);
    const reservedCreditTransactionId = await reserveCreditsForJob(ctx, {
      tier: billingTier,
      resolution: args.resolution,
      quality: args.quality,
      aspectRatio: args.aspectRatio,
      durationSeconds: args.durationSeconds,
      hasReferenceInput: args.hasReferenceInput,
      hasVideoReferenceInput: args.hasVideoReferenceInput,
      hasNonVideoReferenceInput: args.hasNonVideoReferenceInput,
      audioEnabled: args.audioEnabled,
      resolvedModel: args.resolvedModel,
      audioType: args.audioType,
      characterCount:
        args.mode === "audio" && args.audioType === "voiceover"
          ? args.userPrompt.trim().length
          : undefined,
    });
    const jobId = await ctx.db.insert("generationJobs", {
      ownerId: ctx.user._id,
      threadId: args.threadId,
      saveFolderId,
      mode: args.mode,
      tier: billingTier,
      resolvedModel: args.resolvedModel,
      stylePresetId: args.stylePresetId,
      styleSheetElementId: args.styleSheetElementId,
      userPrompt: args.userPrompt,
      stage: "queued",
      audioEnabled: args.audioEnabled,
      aspectRatio: args.aspectRatio,
      resolution: args.resolution,
      quality: args.quality,
      durationSeconds: args.durationSeconds,
      hasReferenceInput: args.hasReferenceInput,
      hasVideoReferenceInput: args.hasVideoReferenceInput,
      hasNonVideoReferenceInput: args.hasNonVideoReferenceInput,
      audioType: args.audioType,
      elevenVoiceId: args.elevenVoiceId,
      elevenVoiceName: args.elevenVoiceName,
      elevenPublicOwnerId: args.elevenPublicOwnerId,
      audioLoop: args.audioLoop,
      promptInfluence: args.promptInfluence,
      reservedCreditTransactionId,
      skipPromptEnhancement: args.skipPromptEnhancement,
      source: "ui",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("generationEvents", {
      ownerId: ctx.user._id,
      threadId: args.threadId,
      kind: "prompt",
      order: now,
      prompt: args.userPrompt,
      generationJobId: jobId,
      createdAt: now,
    });
    await ctx.db.insert("generationEvents", {
      ownerId: ctx.user._id,
      threadId: args.threadId,
      kind: "stage",
      order: now + 1,
      stage: "queued",
      generationJobId: jobId,
      createdAt: now,
    });
    return jobId;
  },
});

/**
 * Assistance media approval transaction. Every fallible validation and the exact
 * credit reservation happens before the brief is advanced or a job is exposed.
 * Internal-only so clients cannot bypass the action’s media preflight.
 */
export const approveAssistedMedia = internalMutation({
  args: {
    userId: v.id("users"),
    briefId: v.id("guidedBriefs"),
    expectedRevision: v.number(),
    planFingerprint: v.string(),
    /** Current Studio folder — overrides stale thread.linkedFolderId for this job. */
    folderId: v.optional(v.id("folders")),
  },
  returns: v.object({
    jobId: v.id("generationJobs"),
    created: v.boolean(),
    replacement: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const brief = await ctx.db.get("guidedBriefs", args.briefId);
    if (!brief || brief.ownerId !== args.userId) throw new Error("Brief not found");
    if (brief.revision !== args.expectedRevision) {
      throw new Error("Brief was updated elsewhere. Refresh and try again.");
    }
    const plan = parseAssistanceGenerationPlan(brief.generationPlanJson);
    if (
      !plan ||
      plan.fingerprint !== args.planFingerprint ||
      brief.generationPlanFingerprint !== args.planFingerprint ||
      (plan.mode !== "image" && plan.mode !== "video")
    ) {
      throw new Error("The reviewed generation plan is stale. Review the brief again.");
    }
    if (brief.status !== "review_ready" && brief.status !== "failed" && brief.status !== "generating") {
      throw new Error("Brief is not ready to approve.");
    }

    let replacement = false;
    if (brief.approvedJobId && brief.approvedRevision === args.expectedRevision) {
      const previous = await ctx.db.get("generationJobs", brief.approvedJobId);
      if (
        previous &&
        previous.ownerId === args.userId &&
        canReuseAssistanceMediaJob(previous.stage)
      ) {
        return { jobId: previous._id, created: false, replacement: false };
      }
      replacement = true;
    }

    const thread = await requireThreadForUser(ctx, args.userId, brief.threadId);
    const saveFolderId = args.folderId ?? thread.linkedFolderId;
    await requireFolderForUser(ctx, args.userId, saveFolderId);
    if (args.folderId && args.folderId !== thread.linkedFolderId) {
      await ctx.db.patch(thread._id, {
        linkedFolderId: args.folderId,
        updatedAt: Date.now(),
      });
    }
    const stylePresetId = plan.settings.stylePresetId as Id<"stylePresets"> | undefined;
    if (!stylePresetId) throw new Error("Select a style before approving.");
    const preset = await ctx.db.get("stylePresets", stylePresetId);
    if (!preset || !preset.enabled) throw new Error("Style preset not available");

    const styleSheetElementId = plan.settings.styleSheetElementId as
      | Id<"elements">
      | undefined;
    if (styleSheetElementId) {
      const sheet = await ctx.db.get("elements", styleSheetElementId);
      if (
        !sheet ||
        sheet.ownerId !== args.userId ||
        sheet.deletedAt ||
        sheet.type !== "style_sheet" ||
        (!sheet.styleRules?.trim() && !sheet.sheetAssetId) ||
        sheet.name !== plan.style?.name ||
        sheet.styleRules?.slice(0, 20_000) !== plan.style?.styleRules ||
        sheet.renderMode !== plan.style?.renderMode ||
        String(sheet.sheetAssetId ?? "") !== String(plan.style?.sheetAssetId ?? "")
      ) {
        throw new Error("Style Sheet changed after review. Review the brief again.");
      }
    }

    const referenceKinds: Array<"image" | "video" | "audio"> = [];
    for (const reference of plan.references) {
      if (reference.kind === "asset" || reference.kind === "style_sheet_visual") {
        const asset = await ctx.db.get("assets", reference.id as Id<"assets">);
        if (!asset || asset.ownerId !== args.userId || asset.deletedAt) {
          throw new Error(`Reviewed reference “${reference.label ?? reference.id}” is unavailable.`);
        }
        if (!asset.bunnyPath) {
          throw new Error(
            `Reviewed reference “${reference.label ?? reference.id}” has no stored media.`,
          );
        }
        if (reference.mediaKind && asset.kind !== reference.mediaKind) {
          throw new Error("A reviewed reference changed after review.");
        }
        if (
          plan.mode === "image" &&
          asset.kind !== "image"
        ) {
          throw new Error("Image jobs accept image references only.");
        }
        if (
          reference.role !== "start_frame" &&
          (asset.kind === "image" || asset.kind === "video" || asset.kind === "audio")
        ) {
          referenceKinds.push(asset.kind);
        }
      } else if (reference.kind === "document") {
        const document = await ctx.db.get("documents", reference.id as Id<"documents">);
        if (!document || document.ownerId !== args.userId || document.deletedAt) {
          throw new Error(`Reviewed document “${reference.label ?? reference.id}” is unavailable.`);
        }
      } else {
        const element = await ctx.db.get("elements", reference.id as Id<"elements">);
        if (!element || element.ownerId !== args.userId || element.deletedAt) {
          throw new Error(`Reviewed element “${reference.label ?? reference.id}” is unavailable.`);
        }
      }
    }

    const hasStartFrame = plan.references.some(
      (reference) => reference.role === "start_frame" && reference.mediaKind === "image",
    );
    if (plan.mode === "video") {
      validateVideoModelCapabilities(plan.settings.resolvedModel, {
        durationSeconds: plan.settings.durationSeconds,
        hasStartFrame,
        referenceKinds: referenceKinds.filter(
          (kind, index, all) => all.indexOf(kind) === index,
        ),
        surface: "studio",
      });
    }
    if (plan.mode === "video" && plan.settings.resolution === "3840x2160") {
      throw new Error("4K video is not available yet.");
    }

    const tier = billingTierForMode(plan.mode);
    const pricingArgs = {
      tier,
      resolution: plan.settings.resolution,
      quality: plan.settings.quality,
      aspectRatio: plan.settings.aspectRatio,
      durationSeconds: plan.settings.durationSeconds,
      hasReferenceInput: plan.estimate.inputs.hasReferenceInput,
      hasVideoReferenceInput: plan.estimate.inputs.hasVideoReferenceInput,
      hasNonVideoReferenceInput: plan.estimate.inputs.hasNonVideoReferenceInput,
      audioEnabled: plan.settings.audioEnabled,
      resolvedModel: plan.settings.resolvedModel,
    };
    const exactCost = generationCreditCost(pricingArgs);
    if (
      exactCost !== plan.estimate.credits ||
      (brief.estimatedCredits !== undefined && exactCost !== brief.estimatedCredits)
    ) {
      throw new Error("Generation pricing changed after review. Review the brief again.");
    }
    const reservedCreditTransactionId = await reserveCreditsForUser(
      ctx,
      args.userId,
      pricingArgs,
    );
    const now = Date.now();
    const jobId = await ctx.db.insert("generationJobs", {
      ownerId: args.userId,
      threadId: brief.threadId,
      saveFolderId,
      mode: plan.mode,
      tier,
      resolvedModel: plan.settings.resolvedModel,
      stylePresetId,
      styleSheetElementId,
      userPrompt: plan.finalPrompt,
      stage: "queued",
      audioEnabled: plan.mode === "video" ? plan.settings.audioEnabled : undefined,
      aspectRatio: plan.settings.aspectRatio,
      resolution: plan.settings.resolution,
      quality: plan.settings.quality,
      durationSeconds: plan.settings.durationSeconds,
      hasReferenceInput: plan.estimate.inputs.hasReferenceInput,
      hasVideoReferenceInput:
        plan.mode === "video" ? plan.estimate.inputs.hasVideoReferenceInput : undefined,
      hasNonVideoReferenceInput:
        plan.mode === "video" ? plan.estimate.inputs.hasNonVideoReferenceInput : undefined,
      reservedCreditTransactionId,
      skipPromptEnhancement: plan.settings.skipPromptEnhancement,
      source: "ui",
      createdAt: now,
      updatedAt: now,
    });
    for (const reference of plan.references) {
      await ctx.db.insert("generationInputs", {
        jobId,
        assetId:
          reference.kind === "asset" || reference.kind === "style_sheet_visual"
            ? (reference.id as Id<"assets">)
            : undefined,
        documentId:
          reference.kind === "document"
            ? (reference.id as Id<"documents">)
            : undefined,
        elementId:
          reference.kind === "element" ? (reference.id as Id<"elements">) : undefined,
        kind:
          reference.kind === "asset" || reference.kind === "style_sheet_visual"
            ? "asset"
            : reference.kind,
        role: reference.role,
        sortOrder: reference.sortOrder,
      });
    }
    await ctx.db.insert("generationEvents", {
      ownerId: args.userId,
      threadId: brief.threadId,
      kind: "prompt",
      order: now,
      prompt: plan.finalPrompt,
      generationJobId: jobId,
      briefId: brief._id,
      briefRevision: brief.revision,
      createdAt: now,
    });
    await ctx.db.insert("generationEvents", {
      ownerId: args.userId,
      threadId: brief.threadId,
      kind: "stage",
      order: now + 1,
      stage: "queued",
      generationJobId: jobId,
      briefId: brief._id,
      briefRevision: brief.revision,
      createdAt: now,
    });
    await ctx.db.patch(brief._id, {
      status: "generating",
      approvedRevision: brief.revision,
      approvedJobId: jobId,
      approvedAt: now,
      error: undefined,
      updatedAt: now,
    });
    // Schedule execution in the same transaction so a crashed action cannot
    // leave a charged queued job permanently unscheduled.
    const runAssistedApprovedJobRef = makeFunctionReference<
      "action",
      { jobId: Id<"generationJobs">; briefId: Id<"guidedBriefs"> },
      null
    >("guidedVideoActions:runAssistedApprovedJob");
    await ctx.scheduler.runAfter(0, runAssistedApprovedJobRef, {
      jobId,
      briefId: brief._id,
    });
    return { jobId, created: true, replacement };
  },
});

export const internalCreateThread = internalMutation({
  args: {
    userId: v.id("users"),
    folderId: v.id("folders"),
    title: v.optional(v.string()),
  },
  returns: v.id("generationThreads"),
  handler: async (ctx, args) => {
    await requireFolderForUser(ctx, args.userId, args.folderId);
    const now = Date.now();
    return await ctx.db.insert("generationThreads", {
      ownerId: args.userId,
      linkedFolderId: args.folderId,
      title: sanitizeThreadTitle(args.title, "API generation"),
      sortOrder: now,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const internalCreateQueuedJob = internalMutation({
  args: {
    userId: v.id("users"),
    threadId: v.id("generationThreads"),
    mode: generationMode,
    tier: generationTier,
    resolvedModel: v.string(),
    stylePresetId: v.id("stylePresets"),
    styleSheetElementId: v.optional(v.id("elements")),
    userPrompt: v.string(),
    audioEnabled: v.optional(v.boolean()),
    aspectRatio: v.optional(v.string()),
    resolution: v.optional(v.string()),
    durationSeconds: v.optional(v.number()),
    hasReferenceInput: v.optional(v.boolean()),
    hasVideoReferenceInput: v.optional(v.boolean()),
    hasNonVideoReferenceInput: v.optional(v.boolean()),
    hasStartFrame: v.optional(v.boolean()),
    apiKeyId: v.optional(v.id("apiKeys")),
  },
  returns: v.id("generationJobs"),
  handler: async (ctx, args) => {
    const thread = await requireThreadForUser(ctx, args.userId, args.threadId);
    await requireFolderForUser(ctx, args.userId, thread.linkedFolderId);
    if (args.mode === "video" && args.resolution === "3840x2160") {
      throw new Error("4K video is not available yet. Video generation supports up to 1080p.");
    }
    if (args.mode === "video" && !isSupportedVideoDuration(args.durationSeconds)) {
      throw new Error("Video duration must be between 4 and 15 seconds");
    }
    if (args.mode === "video") {
      validateVideoModelCapabilities(args.resolvedModel, {
        durationSeconds: args.durationSeconds,
        hasStartFrame: args.hasStartFrame,
        hasMultimodalReferences:
          args.hasVideoReferenceInput || args.hasNonVideoReferenceInput,
        surface: "internal",
      });
    }
    const preset = await ctx.db.get("stylePresets", args.stylePresetId);
    if (!preset || !preset.enabled) {
      throw new Error("Style preset not available");
    }
    const now = Date.now();
    const billingTier = billingTierForMode(args.mode);
    const reservedCreditTransactionId = await reserveCreditsForUser(ctx, args.userId, {
      tier: billingTier,
      resolution: args.resolution,
      durationSeconds: args.durationSeconds,
      hasReferenceInput: args.hasReferenceInput,
      hasVideoReferenceInput: args.hasVideoReferenceInput,
      hasNonVideoReferenceInput: args.hasNonVideoReferenceInput,
      audioEnabled: args.audioEnabled,
      resolvedModel: args.resolvedModel,
    });
    const jobId = await ctx.db.insert("generationJobs", {
      ownerId: args.userId,
      threadId: args.threadId,
      saveFolderId: thread.linkedFolderId,
      mode: args.mode,
      tier: billingTier,
      resolvedModel: args.resolvedModel,
      stylePresetId: args.stylePresetId,
      userPrompt: args.userPrompt,
      stage: "queued",
      audioEnabled: args.audioEnabled,
      aspectRatio: args.aspectRatio,
      resolution: args.resolution,
      durationSeconds: args.durationSeconds,
      hasReferenceInput: args.hasReferenceInput,
      hasVideoReferenceInput: args.hasVideoReferenceInput,
      hasNonVideoReferenceInput: args.hasNonVideoReferenceInput,
      reservedCreditTransactionId,
      source: "api",
      apiKeyId: args.apiKeyId,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("generationEvents", {
      ownerId: args.userId,
      threadId: args.threadId,
      kind: "prompt",
      order: now,
      prompt: args.userPrompt,
      generationJobId: jobId,
      createdAt: now,
    });
    await ctx.db.insert("generationEvents", {
      ownerId: args.userId,
      threadId: args.threadId,
      kind: "stage",
      order: now + 1,
      stage: "queued",
      generationJobId: jobId,
      createdAt: now,
    });
    return jobId;
  },
});

export const prepareApiGeneration = internalMutation({
  args: {
    userId: v.id("users"),
    folderId: v.id("folders"),
    apiKeyId: v.optional(v.id("apiKeys")),
    mode: generationMode,
    tier: generationTier,
    resolvedModel: v.string(),
    stylePresetId: v.id("stylePresets"),
    styleSheetElementId: v.optional(v.id("elements")),
    userPrompt: v.string(),
    title: v.optional(v.string()),
    audioEnabled: v.optional(v.boolean()),
    aspectRatio: v.optional(v.string()),
    resolution: v.optional(v.string()),
    quality: v.optional(v.string()),
    durationSeconds: v.optional(v.number()),
    hasReferenceInput: v.optional(v.boolean()),
    hasVideoReferenceInput: v.optional(v.boolean()),
    hasNonVideoReferenceInput: v.optional(v.boolean()),
    hasStartFrame: v.optional(v.boolean()),
    skipPromptEnhancement: v.optional(v.boolean()),
  },
  returns: v.object({
    threadId: v.id("generationThreads"),
    jobId: v.id("generationJobs"),
  }),
  handler: async (ctx, args) => {
    await requireFolderForUser(ctx, args.userId, args.folderId);
    if (args.mode === "video" && args.resolution === "3840x2160") {
      throw new Error("4K video is not available yet. Video generation supports up to 1080p.");
    }
    if (args.mode === "video" && !isSupportedVideoDuration(args.durationSeconds)) {
      throw new Error("Video duration must be between 4 and 15 seconds");
    }
    if (args.mode === "video") {
      validateVideoModelCapabilities(args.resolvedModel, {
        durationSeconds: args.durationSeconds,
        hasStartFrame: args.hasStartFrame,
        hasMultimodalReferences:
          args.hasVideoReferenceInput || args.hasNonVideoReferenceInput,
        surface: "api",
      });
    }
    const now = Date.now();
    const threadId = await ctx.db.insert("generationThreads", {
      ownerId: args.userId,
      linkedFolderId: args.folderId,
      title: sanitizeThreadTitle(args.title, "API generation"),
      sortOrder: now,
      createdAt: now,
      updatedAt: now,
    });
    const thread = await requireThreadForUser(ctx, args.userId, threadId);
    const preset = await ctx.db.get("stylePresets", args.stylePresetId);
    if (!preset || !preset.enabled) {
      throw new Error("Style preset not available");
    }
    if (args.styleSheetElementId) {
      const sheet = await ctx.db.get("elements", args.styleSheetElementId);
      if (!sheet || sheet.ownerId !== args.userId || sheet.deletedAt || sheet.type !== "style_sheet") {
        throw new Error("Style Sheet not found");
      }
      if (!sheet.styleRules?.trim() && !sheet.sheetAssetId) {
        throw new Error("Build the Style Sheet before using it for generation");
      }
    }
    const billingTier = billingTierForMode(args.mode);
    const reservedCreditTransactionId = await reserveCreditsForUser(ctx, args.userId, {
      tier: billingTier,
      resolution: args.resolution,
      quality: args.quality,
      aspectRatio: args.aspectRatio,
      durationSeconds: args.durationSeconds,
      hasReferenceInput: args.hasReferenceInput,
      hasVideoReferenceInput: args.hasVideoReferenceInput,
      hasNonVideoReferenceInput: args.hasNonVideoReferenceInput,
      audioEnabled: args.audioEnabled,
      resolvedModel: args.resolvedModel,
    });
    const jobId = await ctx.db.insert("generationJobs", {
      ownerId: args.userId,
      threadId: thread._id,
      saveFolderId: thread.linkedFolderId,
      mode: args.mode,
      tier: billingTier,
      resolvedModel: args.resolvedModel,
      stylePresetId: args.stylePresetId,
      styleSheetElementId: args.styleSheetElementId,
      userPrompt: args.userPrompt,
      stage: "queued",
      audioEnabled: args.audioEnabled,
      aspectRatio: args.aspectRatio,
      resolution: args.resolution,
      quality: args.quality,
      durationSeconds: args.durationSeconds,
      hasReferenceInput: args.hasReferenceInput,
      hasVideoReferenceInput: args.hasVideoReferenceInput,
      hasNonVideoReferenceInput: args.hasNonVideoReferenceInput,
      reservedCreditTransactionId,
      source: "api",
      apiKeyId: args.apiKeyId,
      skipPromptEnhancement: args.skipPromptEnhancement,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("generationEvents", {
      ownerId: args.userId,
      threadId: thread._id,
      kind: "prompt",
      order: now,
      prompt: args.userPrompt,
      generationJobId: jobId,
      createdAt: now,
    });
    await ctx.db.insert("generationEvents", {
      ownerId: args.userId,
      threadId: thread._id,
      kind: "stage",
      order: now + 1,
      stage: "queued",
      generationJobId: jobId,
      createdAt: now,
    });
    return { threadId, jobId };
  },
});

/** API audio generation — no style preset / style sheet. */
export const prepareApiAudioGeneration = internalMutation({
  args: {
    userId: v.id("users"),
    folderId: v.id("folders"),
    apiKeyId: v.optional(v.id("apiKeys")),
    userPrompt: v.string(),
    title: v.optional(v.string()),
    audioType: v.union(v.literal("voiceover"), v.literal("sfx")),
    elevenVoiceId: v.optional(v.string()),
    elevenVoiceName: v.optional(v.string()),
    elevenPublicOwnerId: v.optional(v.string()),
    durationSeconds: v.optional(v.number()),
    audioLoop: v.optional(v.boolean()),
    promptInfluence: v.optional(v.number()),
  },
  returns: v.object({
    threadId: v.id("generationThreads"),
    jobId: v.id("generationJobs"),
  }),
  handler: async (ctx, args) => {
    await requireFolderForUser(ctx, args.userId, args.folderId);
    const prompt = args.userPrompt.trim();
    if (!prompt) {
      throw new Error(
        args.audioType === "sfx"
          ? "Describe the sound effect to generate."
          : "Enter voiceover text.",
      );
    }
    if (args.audioType === "voiceover" && !args.elevenVoiceId?.trim()) {
      throw new Error("Select a voice for the voiceover.");
    }

    const now = Date.now();
    const threadId = await ctx.db.insert("generationThreads", {
      ownerId: args.userId,
      linkedFolderId: args.folderId,
      title: sanitizeThreadTitle(args.title, "API audio"),
      sortOrder: now,
      createdAt: now,
      updatedAt: now,
    });
    const thread = await requireThreadForUser(ctx, args.userId, threadId);

    const resolvedModel =
      args.audioType === "sfx"
        ? "elevenlabs/eleven_text_to_sound_v2"
        : "elevenlabs/eleven_v3";
    const billingTier = billingTierForMode("audio");
    const reservedCreditTransactionId = await reserveCreditsForUser(ctx, args.userId, {
      tier: billingTier,
      durationSeconds: args.durationSeconds,
      audioType: args.audioType,
      characterCount: args.audioType === "voiceover" ? prompt.length : undefined,
      resolvedModel,
    });

    const jobId = await ctx.db.insert("generationJobs", {
      ownerId: args.userId,
      threadId: thread._id,
      saveFolderId: thread.linkedFolderId,
      mode: "audio",
      tier: billingTier,
      resolvedModel,
      userPrompt: prompt,
      stage: "queued",
      durationSeconds: args.durationSeconds,
      audioType: args.audioType,
      elevenVoiceId: args.elevenVoiceId,
      elevenVoiceName: args.elevenVoiceName,
      elevenPublicOwnerId: args.elevenPublicOwnerId,
      audioLoop: args.audioLoop,
      promptInfluence: args.promptInfluence,
      reservedCreditTransactionId,
      source: "api",
      apiKeyId: args.apiKeyId,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("generationEvents", {
      ownerId: args.userId,
      threadId: thread._id,
      kind: "prompt",
      order: now,
      prompt,
      generationJobId: jobId,
      createdAt: now,
    });
    await ctx.db.insert("generationEvents", {
      ownerId: args.userId,
      threadId: thread._id,
      kind: "stage",
      order: now + 1,
      stage: "queued",
      generationJobId: jobId,
      createdAt: now,
    });
    return { threadId, jobId };
  },
});

export const getJobRunContext = internalQuery({
  args: { jobId: v.id("generationJobs") },
  returns: v.object({
    job: v.object({
      _id: v.id("generationJobs"),
      ownerId: v.id("users"),
      threadId: v.id("generationThreads"),
      saveFolderId: v.id("folders"),
      mode: generationMode,
      tier: generationTier,
      resolvedModel: v.string(),
      stylePresetId: v.optional(v.id("stylePresets")),
      userPrompt: v.string(),
      enhancedPrompt: v.optional(v.string()),
      negativePrompt: v.optional(v.string()),
      stage: generationStage,
      audioEnabled: v.optional(v.boolean()),
      aspectRatio: v.optional(v.string()),
      resolution: v.optional(v.string()),
      quality: v.optional(v.string()),
      durationSeconds: v.optional(v.number()),
      externalTaskId: v.optional(v.string()),
      error: v.optional(v.string()),
      reservedCreditTransactionId: v.optional(v.id("creditTransactions")),
      spentCreditTransactionId: v.optional(v.id("creditTransactions")),
      skipPromptEnhancement: v.optional(v.boolean()),
      styleSheetElementId: v.optional(v.id("elements")),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
    preset: v.object({
      _id: v.id("stylePresets"),
      slug: v.string(),
      name: v.string(),
      systemInstructions: v.string(),
      scriptInstructions: v.optional(v.string()),
      storytelling: v.optional(v.boolean()),
      negativePrompt: v.optional(v.string()),
    }),
    styleSheet: v.optional(
      v.object({
        _id: v.id("elements"),
        name: v.string(),
        styleRules: v.optional(v.string()),
        renderMode: v.optional(v.string()),
        sheetAssetId: v.optional(v.id("assets")),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const job = await ctx.db.get("generationJobs", args.jobId);
    if (!job) {
      throw new Error("Generation job not found");
    }
    if (!job.stylePresetId) {
      throw new Error("Style preset not found");
    }
    const preset = await ctx.db.get("stylePresets", job.stylePresetId);
    if (!preset) {
      throw new Error("Style preset not found");
    }
    const styleSheet = job.styleSheetElementId
      ? await ctx.db.get("elements", job.styleSheetElementId)
      : null;
    const presetInstructions =
      styleSheet && styleSheet.type === "style_sheet"
        ? styleSheetSystemInstructions({
            name: styleSheet.name,
            styleRules: styleSheet.styleRules,
            renderMode: styleSheet.renderMode,
            hasVisualReference: Boolean(styleSheet.sheetAssetId),
          })
        : preset.systemInstructions;
    return {
      job: {
        _id: job._id,
        ownerId: job.ownerId,
        threadId: job.threadId,
        saveFolderId: job.saveFolderId,
        mode: job.mode,
        tier: job.tier,
        resolvedModel: job.resolvedModel,
        stylePresetId: job.stylePresetId,
        styleSheetElementId: job.styleSheetElementId,
        userPrompt: job.userPrompt,
        enhancedPrompt: job.enhancedPrompt,
        negativePrompt: job.negativePrompt,
        stage: job.stage,
        audioEnabled: job.audioEnabled,
        aspectRatio: job.aspectRatio,
        resolution: job.resolution,
        quality: job.quality,
        durationSeconds: job.durationSeconds,
        externalTaskId: job.externalTaskId,
        error: job.error,
        reservedCreditTransactionId: job.reservedCreditTransactionId,
        spentCreditTransactionId: job.spentCreditTransactionId,
        skipPromptEnhancement: job.skipPromptEnhancement,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      },
      preset: {
        _id: preset._id,
        slug: preset.slug,
        name: styleSheet?.name ?? preset.name,
        systemInstructions: presetInstructions,
        scriptInstructions: preset.scriptInstructions,
        storytelling: preset.storytelling,
        negativePrompt: preset.negativePrompt,
      },
      styleSheet: styleSheet
        ? {
            _id: styleSheet._id,
            name: styleSheet.name,
            styleRules: styleSheet.styleRules,
            renderMode: styleSheet.renderMode,
            sheetAssetId: styleSheet.sheetAssetId,
          }
        : undefined,
    };
  },
});

export const adminGetJobDebug = adminQuery({
  args: { jobId: v.id("generationJobs") },
  returns: v.object({
    _id: v.id("generationJobs"),
    ownerId: v.id("users"),
    threadId: v.id("generationThreads"),
    mode: generationMode,
    tier: generationTier,
    resolvedModel: v.string(),
    stylePresetId: v.optional(v.id("stylePresets")),
    styleSheetElementId: v.optional(v.id("elements")),
    userPrompt: v.string(),
    enhancedPrompt: v.optional(v.string()),
    negativePrompt: v.optional(v.string()),
    stage: generationStage,
    error: v.optional(v.string()),
    externalTaskId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) {
      throw new Error("Generation job not found");
    }
    return {
      _id: job._id,
      ownerId: job.ownerId,
      threadId: job.threadId,
      mode: job.mode,
      tier: job.tier,
      resolvedModel: job.resolvedModel,
      stylePresetId: job.stylePresetId,
      userPrompt: job.userPrompt,
      enhancedPrompt: job.enhancedPrompt,
      negativePrompt: job.negativePrompt,
      stage: job.stage,
      error: job.error,
      externalTaskId: job.externalTaskId,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  },
});

export const getJobForAudio = internalQuery({
  args: { jobId: v.id("generationJobs") },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("generationJobs"),
      stage: generationStage,
      error: v.optional(v.string()),
      userPrompt: v.string(),
      audioType: v.optional(audioGenType),
      elevenVoiceId: v.optional(v.string()),
      elevenVoiceName: v.optional(v.string()),
      elevenPublicOwnerId: v.optional(v.string()),
      durationSeconds: v.optional(v.number()),
      audioLoop: v.optional(v.boolean()),
      promptInfluence: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, args) => {
    const job = await ctx.db.get("generationJobs", args.jobId);
    if (!job || job.mode !== "audio") return null;
    return {
      _id: job._id,
      stage: job.stage,
      error: job.error,
      userPrompt: job.userPrompt,
      audioType: job.audioType,
      elevenVoiceId: job.elevenVoiceId,
      elevenVoiceName: job.elevenVoiceName,
      elevenPublicOwnerId: job.elevenPublicOwnerId,
      durationSeconds: job.durationSeconds,
      audioLoop: job.audioLoop,
      promptInfluence: job.promptInfluence,
    };
  },
});

/** Remove a failed job and its prompt/stage events from the chat thread. */
export const removeFailedJobFromChat = internalMutation({
  args: { jobId: v.id("generationJobs") },
  returns: v.object({
    deletedEvents: v.number(),
    deletedJob: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const job = await ctx.db.get("generationJobs", args.jobId);
    if (!job) return { deletedEvents: 0, deletedJob: false };
    if (job.stage !== "failed") {
      throw new Error("Only failed jobs can be removed from chat.");
    }
    const events = await ctx.db
      .query("generationEvents")
      .withIndex("by_job", (q) => q.eq("generationJobId", args.jobId))
      .collect();
    for (const event of events) {
      await ctx.db.delete(event._id);
    }
    await ctx.db.delete(job._id);
    return { deletedEvents: events.length, deletedJob: true };
  },
});

/** Admin/dev: remove a terminal job's chat turn so the prompt can be sent again. */
export const removeJobTurnFromChat = internalMutation({
  args: { jobId: v.id("generationJobs") },
  returns: v.object({
    deletedEvents: v.number(),
    deletedJob: v.boolean(),
    stage: v.optional(generationStage),
  }),
  handler: async (ctx, args) => {
    const job = await ctx.db.get("generationJobs", args.jobId);
    if (!job) return { deletedEvents: 0, deletedJob: false };
    if (job.stage !== "failed" && job.stage !== "done") {
      throw new Error("Only terminal jobs can be removed from chat.");
    }
    const events = await ctx.db
      .query("generationEvents")
      .withIndex("by_job", (q) => q.eq("generationJobId", args.jobId))
      .collect();
    for (const event of events) {
      await ctx.db.delete(event._id);
    }
    await ctx.db.delete(job._id);
    return {
      deletedEvents: events.length,
      deletedJob: true,
      stage: job.stage,
    };
  },
});

export const markStage = internalMutation({
  args: {
    jobId: v.id("generationJobs"),
    stage: generationStage,
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await requireJob(ctx, args.jobId);
    if (job.stage === "done" || job.stage === "failed") {
      return null;
    }
    const now = Date.now();
    await ctx.db.patch(job._id, {
      stage: args.stage,
      error: args.error,
      updatedAt: now,
    });
    await ctx.db.insert("generationEvents", {
      ownerId: job.ownerId,
      threadId: job.threadId,
      kind: "stage",
      order: now,
      stage: args.stage,
      generationJobId: job._id,
      createdAt: now,
    });
    return null;
  },
});

/**
 * Atomically claim a queued job for provider execution.
 * Returns acquired=false when another worker already claimed it with a live lease.
 */
export const claimJobExecution = internalMutation({
  args: {
    jobId: v.id("generationJobs"),
    attemptId: v.string(),
    /** Lease duration in ms (default 15 minutes). */
    leaseMs: v.optional(v.number()),
  },
  returns: v.object({
    acquired: v.boolean(),
    stage: generationStage,
  }),
  handler: async (ctx, args) => {
    const job = await requireJob(ctx, args.jobId);
    if (job.stage === "done" || job.stage === "failed") {
      return {
        acquired: false,
        stage: job.stage as "queued" | "generating" | "saving" | "done" | "failed",
      };
    }
    const now = Date.now();
    const leaseMs = Math.min(Math.max(args.leaseMs ?? 15 * 60_000, 60_000), 60 * 60_000);
    const leaseLive =
      job.executionLeaseUntil != null && job.executionLeaseUntil > now;
    if (job.executionAttemptId) {
      if (job.executionAttemptId === args.attemptId) {
        await ctx.db.patch(job._id, {
          executionLeaseUntil: now + leaseMs,
          updatedAt: now,
        });
        return {
          acquired: true,
          stage: job.stage as "queued" | "generating" | "saving" | "done" | "failed",
        };
      }
      if (leaseLive) {
        return {
          acquired: false,
          stage: job.stage as "queued" | "generating" | "saving" | "done" | "failed",
        };
      }
      // Stale lease — reclaim for this attempt.
    } else if (job.stage !== "queued") {
      return {
        acquired: false,
        stage: job.stage as "queued" | "generating" | "saving" | "done" | "failed",
      };
    }
    await ctx.db.patch(job._id, {
      stage: "generating",
      executionAttemptId: args.attemptId,
      executionLeaseUntil: now + leaseMs,
      executionAttemptCount: (job.executionAttemptCount ?? 0) + 1,
      updatedAt: now,
    });
    await ctx.db.insert("generationEvents", {
      ownerId: job.ownerId,
      threadId: job.threadId,
      kind: "stage",
      order: now,
      stage: "generating",
      generationJobId: job._id,
      createdAt: now,
    });
    return { acquired: true, stage: "generating" as const };
  },
});

/** Refresh the execution lease while a long provider call is in flight. */
export const heartbeatJobExecution = internalMutation({
  args: {
    jobId: v.id("generationJobs"),
    attemptId: v.string(),
    leaseMs: v.optional(v.number()),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const job = await requireJob(ctx, args.jobId);
    if (job.executionAttemptId !== args.attemptId) return false;
    if (job.stage === "done" || job.stage === "failed") return false;
    const now = Date.now();
    const leaseMs = Math.min(Math.max(args.leaseMs ?? 15 * 60_000, 60_000), 60 * 60_000);
    await ctx.db.patch(job._id, {
      executionLeaseUntil: now + leaseMs,
      updatedAt: now,
    });
    return true;
  },
});

const MAX_EXECUTION_ATTEMPTS = 3;
const STALE_LEASE_GRACE_MS = 2 * 60_000;

/**
 * Fail (and refund) jobs whose execution lease expired without completion.
 * Safe to run periodically from a cron.
 */
export const reclaimStaleJobExecutions = internalMutation({
  args: {},
  returns: v.object({
    scanned: v.number(),
    failed: v.number(),
  }),
  handler: async (ctx) => {
    const now = Date.now();
    const active = await ctx.db
      .query("generationJobs")
      .withIndex("by_stage", (q) => q.eq("stage", "generating"))
      .take(40);
    const saving = await ctx.db
      .query("generationJobs")
      .withIndex("by_stage", (q) => q.eq("stage", "saving"))
      .take(20);
    const queued = await ctx.db
      .query("generationJobs")
      .withIndex("by_stage", (q) => q.eq("stage", "queued"))
      .take(20);

    let failed = 0;
    const candidates = [...active, ...saving, ...queued];
    for (const job of candidates) {
      const leaseExpired =
        job.executionLeaseUntil != null &&
        job.executionLeaseUntil + STALE_LEASE_GRACE_MS < now;
      const neverLeasedStuck =
        !job.executionLeaseUntil &&
        job.executionAttemptId &&
        job.updatedAt + 20 * 60_000 < now;
      const queuedTooLong =
        job.stage === "queued" &&
        !job.executionAttemptId &&
        job.updatedAt + 30 * 60_000 < now;

      if (!leaseExpired && !neverLeasedStuck && !queuedTooLong) continue;

      const attempts = job.executionAttemptCount ?? 0;
      if (attempts >= MAX_EXECUTION_ATTEMPTS || queuedTooLong || job.stage === "saving") {
        if (job.stage === "done" || job.stage === "failed") continue;
        if (job.reservedCreditTransactionId) {
          await refundReservedCredits(ctx, job, "Generation timed out");
        }
        await ctx.db.patch(job._id, {
          stage: "failed",
          error: "Generation timed out and was automatically refunded.",
          updatedAt: now,
          executionAttemptId: undefined,
          executionLeaseUntil: undefined,
        });
        await ctx.db.insert("generationEvents", {
          ownerId: job.ownerId,
          threadId: job.threadId,
          kind: "stage",
          order: now,
          stage: "failed",
          generationJobId: job._id,
          createdAt: now,
        });
        failed += 1;
      } else {
        // Clear claim so a retry scheduler can re-acquire.
        await ctx.db.patch(job._id, {
          stage: "queued",
          executionAttemptId: undefined,
          executionLeaseUntil: undefined,
          updatedAt: now,
        });
      }
    }

    return { scanned: candidates.length, failed };
  },
});

export const setEnhancedPrompt = internalMutation({
  args: {
    jobId: v.id("generationJobs"),
    enhancedPrompt: v.string(),
    negativePrompt: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await requireJob(ctx, args.jobId);
    await ctx.db.patch(job._id, {
      enhancedPrompt: args.enhancedPrompt,
      negativePrompt: args.negativePrompt,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const setVideoTask = internalMutation({
  args: {
    jobId: v.id("generationJobs"),
    externalTaskId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await requireJob(ctx, args.jobId);
    await ctx.db.patch(job._id, {
      externalTaskId: args.externalTaskId,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const createGeneratedAsset = internalMutation({
  args: {
    jobId: v.id("generationJobs"),
    name: v.string(),
    kind: v.union(v.literal("image"), v.literal("video"), v.literal("audio")),
    mimeType: v.string(),
  },
  returns: v.object({
    assetId: v.id("assets"),
    bunnyPath: v.string(),
  }),
  handler: async (ctx, args) => {
    const job = await requireJob(ctx, args.jobId);
    const now = Date.now();
    const assetId = await ctx.db.insert("assets", {
      ownerId: job.ownerId,
      folderId: job.saveFolderId,
      name: args.name,
      kind: args.kind,
      mimeType: args.mimeType,
      storageStatus: "pending",
      sourceGenerationJobId: job._id,
      createdAt: now,
      updatedAt: now,
    });
    const bunnyPath = buildAssetPath({
      userId: job.ownerId,
      folderId: job.saveFolderId,
      assetId,
      filename: args.name,
    });
    await ctx.db.patch(assetId, { bunnyPath, updatedAt: now });
    return { assetId, bunnyPath };
  },
});

export const setGeneratedAssetStorageStatus = internalMutation({
  args: {
    jobId: v.id("generationJobs"),
    assetId: v.id("assets"),
    status: v.union(v.literal("ready"), v.literal("failed")),
    byteSize: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await requireJob(ctx, args.jobId);
    const asset = await ctx.db.get("assets", args.assetId);
    if (
      !asset ||
      asset.ownerId !== job.ownerId ||
      asset.sourceGenerationJobId !== job._id
    ) {
      throw new Error("Generated asset not found");
    }
    await ctx.db.patch(asset._id, {
      storageStatus: args.status,
      byteSize: args.status === "ready" ? args.byteSize : asset.byteSize,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const completeWithOutputs = internalMutation({
  args: {
    jobId: v.id("generationJobs"),
    assetIds: v.array(v.id("assets")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await requireJob(ctx, args.jobId);
    if (job.stage === "done" || job.stage === "failed") {
      return null;
    }
    const now = Date.now();
    for (const [index, assetId] of args.assetIds.entries()) {
      await ctx.db.insert("generationOutputs", {
        jobId: job._id,
        assetId,
        sortOrder: index,
        createdAt: now,
      });
    }
    const spentCreditTransactionId = job.reservedCreditTransactionId
      ? await settleReservedCredits(ctx, job)
      : undefined;
    await ctx.db.patch(job._id, {
      stage: "done",
      spentCreditTransactionId,
      updatedAt: now,
    });
    await ctx.db.insert("generationEvents", {
      ownerId: job.ownerId,
      threadId: job.threadId,
      kind: "result",
      order: now,
      generationJobId: job._id,
      assetIds: args.assetIds,
      createdAt: now,
    });
    const guidedBrief = await ctx.db
      .query("guidedBriefs")
      .withIndex("by_job", (q) => q.eq("approvedJobId", job._id))
      .first();
    if (guidedBrief) {
      await ctx.db.patch(guidedBrief._id, {
        status: "done",
        error: undefined,
        updatedAt: now,
      });
    }
    const notificationId = await ctx.db.insert("notifications", {
      userId: job.ownerId,
      kind: "generation_completed",
      title: "Generation complete",
      body: "Your generated media is ready.",
      generationJobId: job._id,
      createdAt: now,
    });
    await ctx.scheduler.runAfter(0, sendPushForNotificationRef, {
      notificationId,
    });
    return null;
  },
});

export const failJob = internalMutation({
  args: {
    jobId: v.id("generationJobs"),
    error: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await requireJob(ctx, args.jobId);
    if (job.stage === "done" || job.stage === "failed") {
      return null;
    }
    const now = Date.now();
    if (job.reservedCreditTransactionId) {
      await refundReservedCredits(ctx, job, args.error);
    }
    await ctx.db.patch(job._id, {
      stage: "failed",
      error: args.error,
      updatedAt: now,
    });
    const guidedBrief = await ctx.db
      .query("guidedBriefs")
      .withIndex("by_job", (q) => q.eq("approvedJobId", job._id))
      .first();
    if (guidedBrief) {
      await ctx.db.patch(guidedBrief._id, {
        status: "failed",
        error: args.error,
        updatedAt: now,
      });
    }
    await ctx.db.insert("generationEvents", {
      ownerId: job.ownerId,
      threadId: job.threadId,
      kind: "stage",
      order: now,
      stage: "failed",
      generationJobId: job._id,
      createdAt: now,
    });
    const notificationId = await ctx.db.insert("notifications", {
      userId: job.ownerId,
      kind: "generation_failed",
      title: "Generation failed",
      body: "Credits were refunded automatically.",
      generationJobId: job._id,
      createdAt: now,
    });
    await ctx.scheduler.runAfter(0, sendPushForNotificationRef, {
      notificationId,
    });
    return null;
  },
});

async function requireThreadOwner(
  ctx: (QueryCtx | MutationCtx) & { user: Doc<"users"> & { _id: Id<"users"> } },
  threadId: Id<"generationThreads">,
) {
  const thread = await ctx.db.get("generationThreads", threadId);
  if (!thread || thread.ownerId !== ctx.user._id) {
    throw new Error("Unauthorized");
  }
  return thread;
}

async function requireFolderOwner(
  ctx: (QueryCtx | MutationCtx) & { user: Doc<"users"> & { _id: Id<"users"> } },
  folderId: Id<"folders">,
) {
  const folder = await ctx.db.get("folders", folderId);
  if (!folder || folder.ownerId !== ctx.user._id) {
    throw new Error("Unauthorized");
  }
  return folder;
}

async function requireJob(ctx: QueryCtx | MutationCtx, jobId: Id<"generationJobs">) {
  const job = await ctx.db.get("generationJobs", jobId);
  if (!job) {
    throw new Error("Generation job not found");
  }
  return job;
}

function insufficientCreditsMessage(cost: number): string {
  const amount = cost * CREDIT_PRICE_TTD;
  const formatted = Number.isInteger(amount)
    ? String(amount)
    : amount.toFixed(2).replace(/\.?0+$/, "");
  return `You need $${formatted} TTD to generate this. Top up to continue.`;
}

function resolveVideoPricingModel(args: {
  tier: "image" | "pro_video" | "audio" | "low" | "medium" | "high";
  videoModel?: string;
  resolvedModel?: string;
}): "seedance-2.0" | "google-omni-flash" | "kling-3.0-i2v" | undefined {
  if (args.tier !== "pro_video") {
    return undefined;
  }
  if (
    args.videoModel === "seedance-2.0" ||
    args.videoModel === "google-omni-flash" ||
    args.videoModel === "kling-3.0-i2v"
  ) {
    return args.videoModel;
  }
  if (args.resolvedModel) {
    return videoPricingModelFromGatewayId(args.resolvedModel);
  }
  return "seedance-2.0";
}

function generationCreditCost(args: {
  tier: "image" | "pro_video" | "audio" | "low" | "medium" | "high";
  resolution?: string;
  quality?: string;
  aspectRatio?: string;
  durationSeconds?: number;
  hasReferenceInput?: boolean;
  hasVideoReferenceInput?: boolean;
  hasNonVideoReferenceInput?: boolean;
  audioEnabled?: boolean;
  videoModel?: string;
  resolvedModel?: string;
  audioType?: "voiceover" | "sfx" | "music";
  characterCount?: number;
}): number {
  return creditCostForGeneration({
    tier: args.tier,
    resolution: args.resolution,
    quality: args.quality,
    aspectRatio: args.aspectRatio,
    durationSeconds: args.durationSeconds,
    hasReferenceInput: args.hasReferenceInput,
    hasVideoReferenceInput: args.hasVideoReferenceInput,
    hasNonVideoReferenceInput: args.hasNonVideoReferenceInput,
    audioEnabled: args.audioEnabled,
    videoModel: resolveVideoPricingModel(args),
    audioType: args.audioType,
    characterCount: args.characterCount,
  });
}

async function reserveCreditsForJob(
  ctx: MutationCtx & { user: Doc<"users"> & { _id: Id<"users"> } },
  args: {
    tier: "image" | "pro_video" | "audio" | "low" | "medium" | "high";
    resolution?: string;
    quality?: string;
    aspectRatio?: string;
    durationSeconds?: number;
    hasReferenceInput?: boolean;
    hasVideoReferenceInput?: boolean;
    hasNonVideoReferenceInput?: boolean;
    audioEnabled?: boolean;
    videoModel?: string;
    resolvedModel?: string;
    audioType?: "voiceover" | "sfx" | "music";
    characterCount?: number;
  },
): Promise<Id<"creditTransactions">> {
  return await reserveCreditsForUser(ctx, ctx.user._id, args);
}

async function reserveCreditsForUser(
  ctx: MutationCtx,
  userId: Id<"users">,
  args: {
    tier: "image" | "pro_video" | "audio" | "low" | "medium" | "high";
    resolution?: string;
    quality?: string;
    aspectRatio?: string;
    durationSeconds?: number;
    hasReferenceInput?: boolean;
    hasVideoReferenceInput?: boolean;
    hasNonVideoReferenceInput?: boolean;
    audioEnabled?: boolean;
    videoModel?: string;
    resolvedModel?: string;
    audioType?: "voiceover" | "sfx" | "music";
    characterCount?: number;
  },
): Promise<Id<"creditTransactions">> {
  const account = await ctx.db
    .query("billingAccounts")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  const cost = generationCreditCost(args);
  const now = Date.now();
  if (!account || account.creditBalance < cost) {
    throw new Error(insufficientCreditsMessage(cost));
  }
  const balanceAfter = account.creditBalance - cost;
  await ctx.db.patch(account._id, {
    creditBalance: balanceAfter,
    reservedCredits: account.reservedCredits + cost,
    updatedAt: now,
  });
  return await ctx.db.insert("creditTransactions", {
    userId,
    billingAccountId: account._id,
    kind: "reserved",
    amount: -cost,
    balanceAfter,
    reason: `Reserved for ${args.tier} generation`,
    createdAt: now,
  });
}

async function requireFolderForUser(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  folderId: Id<"folders">,
) {
  const folder = await ctx.db.get("folders", folderId);
  if (!folder || folder.ownerId !== userId || folder.deletedAt) {
    throw new Error("Folder not found");
  }
  return folder;
}

async function requireThreadForUser(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  threadId: Id<"generationThreads">,
) {
  const thread = await ctx.db.get("generationThreads", threadId);
  if (!thread || thread.ownerId !== userId) {
    throw new Error("Unauthorized");
  }
  return thread;
}

export const chargeTextGeneration = authedMutation({
  args: {
    folderId: v.id("folders"),
    imageReferenceCount: v.optional(v.number()),
    videoReferenceCount: v.optional(v.number()),
    audioReferenceCount: v.optional(v.number()),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
  },
  returns: v.id("creditTransactions"),
  handler: async (ctx, args) => {
    await requireFolderOwner(ctx, args.folderId);
    const account = await ctx.db
      .query("billingAccounts")
      .withIndex("by_user", (q) => q.eq("userId", ctx.user._id))
      .unique();
    const cost = textCreditCost(args);
    const now = Date.now();
    if (!account || account.creditBalance < cost) {
      throw new Error(insufficientCreditsMessage(cost));
    }
    const balanceAfter = account.creditBalance - cost;
    await ctx.db.patch(account._id, {
      creditBalance: balanceAfter,
      updatedAt: now,
    });
    return await ctx.db.insert("creditTransactions", {
      userId: ctx.user._id,
      billingAccountId: account._id,
      kind: "spent",
      amount: -cost,
      balanceAfter,
      reason: "Text generation",
      createdAt: now,
    });
  },
});

export const chargeImageGeneration = authedMutation({
  args: {
    folderId: v.id("folders"),
    resolution: v.optional(v.string()),
    hasReferenceInput: v.optional(v.boolean()),
  },
  returns: v.id("creditTransactions"),
  handler: async (ctx, args) => {
    await requireFolderOwner(ctx, args.folderId);
    const account = await ctx.db
      .query("billingAccounts")
      .withIndex("by_user", (q) => q.eq("userId", ctx.user._id))
      .unique();
    const cost = imageCreditCost({
      resolution: args.resolution,
      hasReferenceInput: args.hasReferenceInput,
    });
    const now = Date.now();
    if (!account || account.creditBalance < cost) {
      throw new Error(insufficientCreditsMessage(cost));
    }
    const balanceAfter = account.creditBalance - cost;
    await ctx.db.patch(account._id, {
      creditBalance: balanceAfter,
      updatedAt: now,
    });
    return await ctx.db.insert("creditTransactions", {
      userId: ctx.user._id,
      billingAccountId: account._id,
      kind: "spent",
      amount: -cost,
      balanceAfter,
      reason: "Image generation",
      createdAt: now,
    });
  },
});

export const refundTextGeneration = authedMutation({
  args: {
    transactionId: v.id("creditTransactions"),
    reason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const transaction = await ctx.db.get("creditTransactions", args.transactionId);
    if (
      !transaction ||
      transaction.userId !== ctx.user._id ||
      transaction.kind !== "spent" ||
      transaction.amount >= 0
    ) {
      return null;
    }
    const existingRefund = await ctx.db
      .query("creditTransactions")
      .withIndex("by_reversed_transaction", (q) =>
        q.eq("reversesTransactionId", transaction._id),
      )
      .unique();
    if (existingRefund) return null;
    const account = await ctx.db.get("billingAccounts", transaction.billingAccountId);
    if (!account || account.userId !== ctx.user._id) {
      return null;
    }
    const refundAmount = Math.abs(transaction.amount);
    const now = Date.now();
    const balanceAfter = account.creditBalance + refundAmount;
    await ctx.db.patch(account._id, {
      creditBalance: balanceAfter,
      updatedAt: now,
    });
    await ctx.db.insert("creditTransactions", {
      userId: ctx.user._id,
      billingAccountId: account._id,
      kind: "refunded",
      amount: refundAmount,
      balanceAfter,
      reversesTransactionId: transaction._id,
      reason: args.reason ?? "Text generation failed",
      createdAt: now,
    });
    return null;
  },
});

function isSupportedVideoDuration(durationSeconds?: number): boolean {
  const duration = Number(durationSeconds ?? 4);
  return Number.isFinite(duration) && duration >= 4 && duration <= 15;
}

async function hasActiveSubscriptionForUser(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  now: number,
): Promise<boolean> {
  const subscription = await ctx.db
    .query("subscriptions")
    .withIndex("by_user_and_status", (q) =>
      q.eq("userId", userId).eq("status", "active"),
    )
    .first();
  return Boolean(
    subscription &&
      subscription.currentPeriodStart <= now &&
      subscription.currentPeriodEnd >= now,
  );
}

async function settleReservedCredits(
  ctx: MutationCtx,
  job: Doc<"generationJobs">,
): Promise<Id<"creditTransactions"> | undefined> {
  if (!job.reservedCreditTransactionId) {
    return undefined;
  }
  if (job.spentCreditTransactionId) return job.spentCreditTransactionId;
  const reservation = await ctx.db.get(job.reservedCreditTransactionId);
  if (
    !reservation ||
    reservation.kind !== "reserved" ||
    reservation.userId !== job.ownerId ||
    reservation.amount >= 0
  ) {
    throw new Error("Generation credit reservation is invalid");
  }
  const existingSettlement = await ctx.db
    .query("creditTransactions")
    .withIndex("by_reversed_transaction", (q) =>
      q.eq("reversesTransactionId", reservation._id),
    )
    .unique();
  if (existingSettlement) {
    if (existingSettlement.kind !== "spent") {
      throw new Error("Generation credit reservation was already reversed");
    }
    return existingSettlement._id;
  }
  const account = await ctx.db.get(reservation.billingAccountId);
  if (!account || account.userId !== job.ownerId) {
    throw new Error("Generation billing account is invalid");
  }
  const cost = Math.abs(reservation.amount);
  if (account.reservedCredits < cost) {
    throw new Error("Generation reserved credit balance is inconsistent");
  }
  const now = Date.now();
  await ctx.db.patch(account._id, {
    reservedCredits: account.reservedCredits - cost,
    updatedAt: now,
  });
  return await ctx.db.insert("creditTransactions", {
    userId: job.ownerId,
    billingAccountId: account._id,
    kind: "spent",
    amount: 0,
    balanceAfter: account.creditBalance,
    generationJobId: job._id,
    reversesTransactionId: reservation._id,
    reason: "Generation completed",
    createdAt: now,
  });
}

async function refundReservedCredits(
  ctx: MutationCtx,
  job: Doc<"generationJobs">,
  reason: string,
): Promise<void> {
  if (!job.reservedCreditTransactionId) {
    return;
  }
  const reservation = await ctx.db.get(job.reservedCreditTransactionId);
  if (
    !reservation ||
    reservation.kind !== "reserved" ||
    reservation.userId !== job.ownerId ||
    reservation.amount >= 0
  ) {
    throw new Error("Generation credit reservation is invalid");
  }
  const existingReversal = await ctx.db
    .query("creditTransactions")
    .withIndex("by_reversed_transaction", (q) =>
      q.eq("reversesTransactionId", reservation._id),
    )
    .unique();
  if (existingReversal) return;
  const account = await ctx.db.get(reservation.billingAccountId);
  if (!account || account.userId !== job.ownerId) {
    throw new Error("Generation billing account is invalid");
  }
  const cost = Math.abs(reservation.amount);
  if (account.reservedCredits < cost) {
    throw new Error("Generation reserved credit balance is inconsistent");
  }
  const now = Date.now();
  const balanceAfter = account.creditBalance + cost;
  await ctx.db.patch(account._id, {
    creditBalance: balanceAfter,
    reservedCredits: account.reservedCredits - cost,
    updatedAt: now,
  });
  await ctx.db.insert("creditTransactions", {
    userId: job.ownerId,
    billingAccountId: account._id,
    kind: "refunded",
    amount: cost,
    balanceAfter,
    generationJobId: job._id,
    reversesTransactionId: reservation._id,
    reason,
    createdAt: now,
  });
}

export const chargeImageForUser = internalMutation({
  args: {
    userId: v.id("users"),
    folderId: v.id("folders"),
    resolution: v.optional(v.string()),
    hasReferenceInput: v.optional(v.boolean()),
  },
  returns: v.object({
    transactionId: v.id("creditTransactions"),
    creditsSpent: v.number(),
  }),
  handler: async (ctx, args) => {
    await requireFolderForUser(ctx, args.userId, args.folderId);
    const account = await ctx.db
      .query("billingAccounts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
    const creditsSpent = imageCreditCost({
      resolution: args.resolution,
      hasReferenceInput: args.hasReferenceInput,
    });
    const now = Date.now();
    if (!account || account.creditBalance < creditsSpent) {
      throw new Error(insufficientCreditsMessage(creditsSpent));
    }
    const balanceAfter = account.creditBalance - creditsSpent;
    await ctx.db.patch(account._id, {
      creditBalance: balanceAfter,
      updatedAt: now,
    });
    const transactionId = await ctx.db.insert("creditTransactions", {
      userId: args.userId,
      billingAccountId: account._id,
      kind: "spent",
      amount: -creditsSpent,
      balanceAfter,
      reason: "Image generation",
      createdAt: now,
    });
    return { transactionId, creditsSpent };
  },
});

export const refundCreditTransactionForUser = internalMutation({
  args: {
    userId: v.id("users"),
    transactionId: v.id("creditTransactions"),
    reason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const transaction = await ctx.db.get("creditTransactions", args.transactionId);
    if (
      !transaction ||
      transaction.userId !== args.userId ||
      transaction.kind !== "spent" ||
      transaction.amount >= 0
    ) {
      return null;
    }
    const existingRefund = await ctx.db
      .query("creditTransactions")
      .withIndex("by_reversed_transaction", (q) =>
        q.eq("reversesTransactionId", transaction._id),
      )
      .unique();
    if (existingRefund) return null;
    const account = await ctx.db.get("billingAccounts", transaction.billingAccountId);
    if (!account || account.userId !== args.userId) {
      return null;
    }
    const refundAmount = Math.abs(transaction.amount);
    const now = Date.now();
    const balanceAfter = account.creditBalance + refundAmount;
    await ctx.db.patch(account._id, {
      creditBalance: balanceAfter,
      updatedAt: now,
    });
    await ctx.db.insert("creditTransactions", {
      userId: args.userId,
      billingAccountId: account._id,
      kind: "refunded",
      amount: refundAmount,
      balanceAfter,
      reversesTransactionId: transaction._id,
      reason: args.reason ?? "Generation failed",
      createdAt: now,
    });
    return null;
  },
});
