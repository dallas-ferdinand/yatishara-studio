/**
 * Create-tab generation library — paginated owner tiles + detail for the
 * right rail. Prefer jobs (includes in-progress) joined to output assets.
 */
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import {
  assetThumbnailPath,
  signBunnyCdnUrl,
  signBunnyFullUrl,
  THUMB_TRANSFORM,
} from "./lib/bunny";
import { authedQuery } from "./lib/customFunctions";

const kindFilter = v.union(
  v.literal("all"),
  v.literal("image"),
  v.literal("video"),
  v.literal("audio"),
);

const stageReturn = v.union(
  v.literal("queued"),
  v.literal("generating"),
  v.literal("saving"),
  v.literal("done"),
  v.literal("failed"),
);

const modeReturn = v.union(
  v.literal("image"),
  v.literal("video"),
  v.literal("audio"),
);

const tileReturn = v.object({
  jobId: v.id("generationJobs"),
  assetId: v.optional(v.id("assets")),
  kind: modeReturn,
  name: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
  stage: stageReturn,
  thumbnailUrl: v.optional(v.string()),
  playableUrl: v.optional(v.string()),
  width: v.optional(v.number()),
  height: v.optional(v.number()),
  durationSeconds: v.optional(v.number()),
  threadId: v.optional(v.id("generationThreads")),
  promptSnippet: v.optional(v.string()),
  modelLabel: v.optional(v.string()),
  mode: modeReturn,
  folderId: v.optional(v.id("folders")),
  error: v.optional(v.string()),
});

const PAGE_DEFAULT = 24;
const PAGE_MAX = 48;
const SCAN_MULTIPLIER = 4;

function promptSnippet(prompt: string | undefined, max = 120): string | undefined {
  const trimmed = prompt?.trim();
  if (!trimmed) return undefined;
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

function modelLabel(resolvedModel: string | undefined): string | undefined {
  const raw = resolvedModel?.trim();
  if (!raw) return undefined;
  // Prefer a short readable tail after the last slash / colon.
  const parts = raw.split(/[/:]/);
  const tail = parts[parts.length - 1]?.trim();
  return tail || raw;
}

async function creditsForJob(
  ctx: QueryCtx,
  job: Doc<"generationJobs">,
): Promise<number | undefined> {
  const txId = job.spentCreditTransactionId ?? job.reservedCreditTransactionId;
  if (!txId) return undefined;
  const tx = await ctx.db.get("creditTransactions", txId);
  if (tx && tx.amount < 0) return Math.abs(tx.amount);
  return undefined;
}

async function primaryOutputAsset(
  ctx: QueryCtx,
  jobId: Id<"generationJobs">,
): Promise<Doc<"assets"> | null> {
  const outputs = await ctx.db
    .query("generationOutputs")
    .withIndex("by_job", (q) => q.eq("jobId", jobId))
    .collect();
  outputs.sort((a, b) => a.sortOrder - b.sortOrder);
  for (const output of outputs) {
    const asset = await ctx.db.get("assets", output.assetId);
    if (asset && !asset.deletedAt && !asset.purgedAt) {
      return asset;
    }
  }
  // Some older jobs only stamped sourceGenerationJobId on the asset row.
  const bySource = await ctx.db
    .query("assets")
    .withIndex("by_generation_job", (q) => q.eq("sourceGenerationJobId", jobId))
    .order("desc")
    .take(4);
  for (const asset of bySource) {
    if (!asset.deletedAt && !asset.purgedAt) return asset;
  }
  return null;
}

async function signTileMedia(
  asset: Doc<"assets"> | null,
  expiresUnix: number | undefined,
): Promise<{ thumbnailUrl?: string; playableUrl?: string }> {
  if (!asset || expiresUnix === undefined) return {};
  const thumbPath = assetThumbnailPath(asset);
  // Real image poster only — never treat a video file URL as an <img> thumb.
  const thumbnailUrl = thumbPath
    ? await signBunnyCdnUrl(thumbPath, expiresUnix, THUMB_TRANSFORM)
    : undefined;
  let playableUrl: string | undefined;
  if (asset.bunnyPath) {
    playableUrl = await signBunnyFullUrl(asset.bunnyPath, expiresUnix, asset.kind);
  }
  // Images: if Optimizer thumb fails to resolve, fall back to full signed image.
  const displayThumb =
    thumbnailUrl ||
    (asset.kind === "image" && playableUrl ? playableUrl : undefined);
  return {
    ...(displayThumb ? { thumbnailUrl: displayThumb } : {}),
    ...(playableUrl ? { playableUrl } : {}),
  };
}

async function tileFromJob(
  ctx: QueryCtx,
  job: Doc<"generationJobs">,
  expiresUnix: number | undefined,
  signMedia: boolean,
) {
  const asset = await primaryOutputAsset(ctx, job._id);
  const media = signMedia ? await signTileMedia(asset, expiresUnix) : {};
  const name =
    asset?.name?.trim() ||
    promptSnippet(job.userPrompt, 48) ||
    `${job.mode} generation`;
  return {
    jobId: job._id,
    ...(asset ? { assetId: asset._id } : {}),
    kind: job.mode,
    name,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    stage: job.stage,
    ...(media.thumbnailUrl ? { thumbnailUrl: media.thumbnailUrl } : {}),
    ...(media.playableUrl ? { playableUrl: media.playableUrl } : {}),
    ...(asset?.width != null ? { width: asset.width } : {}),
    ...(asset?.height != null ? { height: asset.height } : {}),
    ...(asset?.durationSeconds != null
      ? { durationSeconds: asset.durationSeconds }
      : job.durationSeconds != null
        ? { durationSeconds: job.durationSeconds }
        : {}),
    threadId: job.threadId,
    ...(promptSnippet(job.userPrompt) ? { promptSnippet: promptSnippet(job.userPrompt) } : {}),
    ...(modelLabel(job.resolvedModel) ? { modelLabel: modelLabel(job.resolvedModel) } : {}),
    mode: job.mode,
    folderId: job.saveFolderId,
    ...(job.error ? { error: job.error } : {}),
  };
}

/**
 * Paginated Create library: owner generation jobs (newest first), optional kind filter.
 * Cursor is the previous page's last `createdAt` (exclusive upper bound).
 */
export const listMyGenerations = authedQuery({
  args: {
    kind: v.optional(kindFilter),
    cursor: v.optional(v.number()),
    limit: v.optional(v.number()),
    expiresUnix: v.optional(v.number()),
  },
  returns: v.object({
    tiles: v.array(tileReturn),
    nextCursor: v.optional(v.number()),
    hasMore: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? PAGE_DEFAULT, 1), PAGE_MAX);
    const kind = args.kind && args.kind !== "all" ? args.kind : null;
    const cursor = args.cursor;

    const scanned = await ctx.db
      .query("generationJobs")
      .withIndex("by_owner_and_created", (q) => q.eq("ownerId", ctx.user._id))
      .order("desc")
      .take(limit * SCAN_MULTIPLIER);

    const matched = scanned.filter((job) => {
      if (cursor != null && job.createdAt >= cursor) return false;
      if (kind && job.mode !== kind) return false;
      return true;
    });

    const page = matched.slice(0, limit);
    const hasMore = matched.length > limit;
    const nextCursor = hasMore ? page[page.length - 1]?.createdAt : undefined;

    const tiles = [];
    for (let index = 0; index < page.length; index += 1) {
      // Sign media for the first page chunk so the masonry paints immediately.
      tiles.push(await tileFromJob(ctx, page[index]!, args.expiresUnix, index < limit));
    }

    return {
      tiles,
      ...(nextCursor != null ? { nextCursor } : {}),
      hasMore,
    };
  },
});

const detailReturn = v.object({
  jobId: v.id("generationJobs"),
  assetId: v.optional(v.id("assets")),
  kind: modeReturn,
  name: v.string(),
  stage: stageReturn,
  createdAt: v.number(),
  updatedAt: v.number(),
  prompt: v.string(),
  enhancedPrompt: v.optional(v.string()),
  negativePrompt: v.optional(v.string()),
  modelLabel: v.optional(v.string()),
  resolvedModel: v.optional(v.string()),
  mode: modeReturn,
  resolution: v.optional(v.string()),
  aspectRatio: v.optional(v.string()),
  quality: v.optional(v.string()),
  durationSeconds: v.optional(v.number()),
  audioEnabled: v.optional(v.boolean()),
  audioType: v.optional(
    v.union(v.literal("voiceover"), v.literal("sfx"), v.literal("music")),
  ),
  creditsSpent: v.optional(v.number()),
  folderId: v.id("folders"),
  threadId: v.id("generationThreads"),
  thumbnailUrl: v.optional(v.string()),
  playableUrl: v.optional(v.string()),
  width: v.optional(v.number()),
  height: v.optional(v.number()),
  error: v.optional(v.string()),
  referenceAssetIds: v.array(v.id("assets")),
});

/**
 * One generation for the Create detail sidebar (full prompt + model meta).
 * Pass `assetId` and/or `jobId` (jobId wins when both are set).
 */
export const getGenerationDetail = authedQuery({
  args: {
    assetId: v.optional(v.id("assets")),
    jobId: v.optional(v.id("generationJobs")),
    expiresUnix: v.optional(v.number()),
  },
  returns: v.union(detailReturn, v.null()),
  handler: async (ctx, args) => {
    if (!args.assetId && !args.jobId) return null;

    let job: Doc<"generationJobs"> | null = null;
    let asset: Doc<"assets"> | null = null;

    if (args.jobId) {
      job = await ctx.db.get("generationJobs", args.jobId);
      if (!job || job.ownerId !== ctx.user._id) return null;
      asset = await primaryOutputAsset(ctx, job._id);
    } else if (args.assetId) {
      asset = await ctx.db.get("assets", args.assetId);
      if (!asset || asset.ownerId !== ctx.user._id || asset.deletedAt || asset.purgedAt) {
        return null;
      }
      if (asset.sourceGenerationJobId) {
        job = await ctx.db.get("generationJobs", asset.sourceGenerationJobId);
      }
      if (!job) {
        const output = await ctx.db
          .query("generationOutputs")
          .withIndex("by_asset", (q) => q.eq("assetId", asset!._id))
          .first();
        if (output) {
          job = await ctx.db.get("generationJobs", output.jobId);
        }
      }
      if (!job || job.ownerId !== ctx.user._id) return null;
    }

    if (!job) return null;
    if (!asset) {
      asset = await primaryOutputAsset(ctx, job._id);
    }

    const media = await signTileMedia(asset, args.expiresUnix);
    const creditsSpent = await creditsForJob(ctx, job);

    const inputs = await ctx.db
      .query("generationInputs")
      .withIndex("by_job", (q) => q.eq("jobId", job!._id))
      .collect();
    const referenceAssetIds = inputs
      .map((row) => row.assetId)
      .filter((id): id is Id<"assets"> => id != null);

    const name =
      asset?.name?.trim() ||
      promptSnippet(job.userPrompt, 48) ||
      `${job.mode} generation`;

    return {
      jobId: job._id,
      ...(asset ? { assetId: asset._id } : {}),
      kind: job.mode,
      name,
      stage: job.stage,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      prompt: job.userPrompt,
      ...(job.enhancedPrompt ? { enhancedPrompt: job.enhancedPrompt } : {}),
      ...(job.negativePrompt ? { negativePrompt: job.negativePrompt } : {}),
      ...(modelLabel(job.resolvedModel)
        ? { modelLabel: modelLabel(job.resolvedModel) }
        : {}),
      ...(job.resolvedModel ? { resolvedModel: job.resolvedModel } : {}),
      mode: job.mode,
      ...(job.resolution ? { resolution: job.resolution } : {}),
      ...(job.aspectRatio ? { aspectRatio: job.aspectRatio } : {}),
      ...(job.quality ? { quality: job.quality } : {}),
      ...(asset?.durationSeconds != null
        ? { durationSeconds: asset.durationSeconds }
        : job.durationSeconds != null
          ? { durationSeconds: job.durationSeconds }
          : {}),
      ...(job.audioEnabled != null ? { audioEnabled: job.audioEnabled } : {}),
      ...(job.audioType ? { audioType: job.audioType } : {}),
      ...(creditsSpent != null ? { creditsSpent } : {}),
      folderId: job.saveFolderId,
      threadId: job.threadId,
      ...(media.thumbnailUrl ? { thumbnailUrl: media.thumbnailUrl } : {}),
      ...(media.playableUrl ? { playableUrl: media.playableUrl } : {}),
      ...(asset?.width != null ? { width: asset.width } : {}),
      ...(asset?.height != null ? { height: asset.height } : {}),
      ...(job.error ? { error: job.error } : {}),
      referenceAssetIds,
    };
  },
});
