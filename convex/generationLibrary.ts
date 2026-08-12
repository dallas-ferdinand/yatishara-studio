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
  aspectRatio: v.optional(v.string()),
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

/** Pull asset ids from References blocks (pipe-meta or asset:// markdown links). */
function assetIdsFromPromptReferences(prompt: string | undefined): string[] {
  const raw = String(prompt ?? "");
  const ids: string[] = [];
  const seen = new Set<string>();
  const push = (id: string | undefined) => {
    const cleaned = String(id ?? "").trim();
    if (!cleaned || seen.has(cleaned)) return;
    seen.add(cleaned);
    ids.push(cleaned);
  };

  for (const match of raw.matchAll(/\[([^\]]+)\]\(\s*asset:\/\/([a-z0-9]+)\s*\)/gi)) {
    push(match[2]);
  }
  for (const match of raw.matchAll(/asset:\/\/([a-z0-9]+)/gi)) {
    push(match[1]);
  }

  const marker = "\n\nReferences:\n";
  const heading = raw.match(/\n##?\s*References\s*\n/i);
  let block = "";
  const idx = raw.indexOf(marker);
  if (idx >= 0) block = raw.slice(idx + marker.length);
  else if (heading?.index != null) {
    block = raw.slice(heading.index + heading[0].length);
  }
  for (const line of block.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("-")) continue;
    if (/\/Studio\/elements\//i.test(trimmed) || /\belement:\s*/i.test(trimmed)) {
      continue;
    }
    const studio = trimmed.match(/\bstudio:\s*([^\s|]+)/i)?.[1]?.trim();
    const path = trimmed.match(/\bpath:\s*([^|]+?)(?:\s*\||$)/i)?.[1]?.trim() ?? "";
    const fromPath =
      path.match(/\/Studio\/assets\/([^/.]+)/i)?.[1] ||
      path.match(/^asset:([^\s|/]+)/i)?.[1] ||
      undefined;
    const fromLink = trimmed.match(/asset:\/\/([a-z0-9]+)/i)?.[1];
    push(fromLink || fromPath || studio);
  }
  return ids;
}

function modelLabel(resolvedModel: string | undefined): string | undefined {
  const raw = resolvedModel?.trim();
  if (!raw) return undefined;
  const lower = raw.toLowerCase();

  // Prefer product names users see in the composer, not gateway / Ark ids.
  const rules: Array<{ test: RegExp; label: string }> = [
    { test: /seedance[-_/.\s]?2[.\-_]?5|dreamina-seedance-2-5/i, label: "Seedance 2.5" },
    { test: /seedance[-_/.\s]?2[.\-_]?0|dreamina-seedance-2-0/i, label: "Seedance 2.0" },
    { test: /seedream[-_/.\s]?5|dola-seedream-5/i, label: "Seedream 5.0" },
    { test: /seedream[-_/.\s]?4[.\-_]?5/i, label: "Seedream 4.5" },
    { test: /seedream[-_/.\s]?4|seedream-4-0/i, label: "Seedream 4.0" },
    { test: /seedream[-_/.\s]?3/i, label: "Seedream 3.0" },
    { test: /gpt[-_/.\s]?image[-_/.\s]?2|openai\/gpt-image/i, label: "GPT Image 2" },
    { test: /nano[-_/.\s]?banana/i, label: "Nano Banana" },
    { test: /eleven_text_to_sound|sound_v2|text_to_sound/i, label: "ElevenLabs SFX" },
    { test: /elevenlabs\/music|music_v2/i, label: "ElevenLabs Music" },
    { test: /eleven_v3|elevenlabs\/eleven_v3|eleven[-_/]?v3/i, label: "ElevenLabs Voice" },
    { test: /elevenlabs/i, label: "ElevenLabs" },
  ];
  for (const rule of rules) {
    if (rule.test.test(raw) || rule.test.test(lower)) return rule.label;
  }

  const tail = (raw.split(/[/:]/).pop() || raw).trim();
  return humanizeModelId(tail) || raw;
}

/** Last-resort readable label from a raw model id (drops date stamps). */
function humanizeModelId(id: string): string {
  const cleaned = id
    .replace(/[-_]?\d{6,8}$/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return id;
  return cleaned.replace(/\b([a-z])/g, (ch) => ch.toUpperCase());
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
  // Bunny path exists before the PUT finishes (storageStatus=pending). Signing
  // early makes the Create grid <img> 404 once; React keeps the same URL after
  // ready, so the thumb stays blank until remount/tab switch.
  if (asset.storageStatus !== undefined && asset.storageStatus !== "ready") {
    return {};
  }
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
    ...(job.aspectRatio ? { aspectRatio: job.aspectRatio } : {}),
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

const referenceReturn = v.object({
  assetId: v.id("assets"),
  name: v.string(),
  kind: v.union(
    v.literal("image"),
    v.literal("video"),
    v.literal("audio"),
    v.literal("file"),
  ),
  thumbnailUrl: v.optional(v.string()),
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
  references: v.array(referenceReturn),
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

    const promptRefIds = assetIdsFromPromptReferences(job.userPrompt);
    const allRefIds: Id<"assets">[] = [];
    const seenRefIds = new Set<string>();
    for (const id of [...referenceAssetIds, ...promptRefIds]) {
      if (seenRefIds.has(id)) continue;
      seenRefIds.add(id);
      allRefIds.push(id as Id<"assets">);
    }

    const references: Array<{
      assetId: Id<"assets">;
      name: string;
      kind: "image" | "video" | "audio" | "file";
      thumbnailUrl?: string;
    }> = [];
    for (const refId of allRefIds) {
      const refAsset = await ctx.db.get("assets", refId);
      if (!refAsset || refAsset.deletedAt || refAsset.purgedAt) continue;
      if (refAsset.ownerId !== ctx.user._id) continue;
      const refMedia = await signTileMedia(refAsset, args.expiresUnix);
      const kind =
        refAsset.kind === "image" || refAsset.kind === "video" || refAsset.kind === "audio"
          ? refAsset.kind
          : "file";
      references.push({
        assetId: refAsset._id,
        name: refAsset.name?.trim() || "Reference",
        kind,
        ...(refMedia.thumbnailUrl
          ? { thumbnailUrl: refMedia.thumbnailUrl }
          : refAsset.kind === "image" && refMedia.playableUrl
            ? { thumbnailUrl: refMedia.playableUrl }
            : {}),
      });
    }

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
      referenceAssetIds: allRefIds,
      references,
    };
  },
});
