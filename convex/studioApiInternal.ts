import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { internalMutation, internalQuery } from "./_generated/server";
import { buildAssetPath, getStorageUploadCredentials, signBunnyCdnUrl, signBunnyFullUrl } from "./lib/bunny";
import {
  assertReferenceCount,
  referenceAssetIdsFromInput,
  resolveElementAssets,
} from "./lib/elementAssetModel";
import { isFolderDescendantOf, isFolderInSandbox } from "./lib/studioApi/folderScope";
import {
  inferElementSourceMode,
  type ElementSourceMode,
} from "./lib/elementSheetGuides";
import { creditCostForGeneration, CREDIT_PRICE_TTD, textCreditCost } from "./lib/generationPricing";
import { compactElementPromptLine } from "./lib/klingGatewayPrompt";

const folderShape = v.object({
  id: v.id("folders"),
  name: v.string(),
  icon: v.string(),
  color: v.optional(v.string()),
  parentId: v.optional(v.id("folders")),
  sortOrder: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

const assetShape = v.object({
  id: v.id("assets"),
  folderId: v.id("folders"),
  name: v.string(),
  kind: v.union(
    v.literal("image"),
    v.literal("video"),
    v.literal("audio"),
    v.literal("document"),
  ),
  mimeType: v.string(),
  byteSize: v.optional(v.number()),
  url: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

export const authenticateApiKey = internalQuery({
  args: { keyHash: v.string() },
  returns: v.union(
    v.object({
      userId: v.id("users"),
      userName: v.optional(v.string()),
      userEmail: v.optional(v.string()),
      apiKeyId: v.id("apiKeys"),
      keyPrefix: v.string(),
      scopes: v.array(v.string()),
      sandboxFolderId: v.optional(v.id("folders")),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const key = await ctx.db
      .query("apiKeys")
      .withIndex("by_hash", (q) => q.eq("keyHash", args.keyHash))
      .unique();
    if (!key || key.revokedAt) {
      return null;
    }
    const user = await ctx.db.get("users", key.ownerId);
    if (!user) {
      return null;
    }
    return {
      userId: user._id,
      userName: user.name,
      userEmail: user.email,
      apiKeyId: key._id,
      keyPrefix: key.keyPrefix,
      scopes: key.scopes,
      sandboxFolderId: key.sandboxFolderId ?? key.defaultFolderId,
    };
  },
});

export const resolveSandboxForApiKey = internalMutation({
  args: {
    apiKeyId: v.id("apiKeys"),
    userId: v.id("users"),
  },
  returns: v.id("folders"),
  handler: async (ctx, args) => {
    const key = await ctx.db.get("apiKeys", args.apiKeyId);
    if (!key || key.ownerId !== args.userId || key.revokedAt) {
      throw new Error("API key not found");
    }
    if (key.sandboxFolderId) {
      return key.sandboxFolderId;
    }
    const existingRoot = await ctx.db
      .query("folders")
      .withIndex("by_owner_and_parent", (q) =>
        q.eq("ownerId", args.userId).eq("parentId", undefined),
      )
      .first();
    let sandboxFolderId = existingRoot && !existingRoot.deletedAt ? existingRoot._id : undefined;
    if (!sandboxFolderId) {
      const now = Date.now();
      sandboxFolderId = await ctx.db.insert("folders", {
        ownerId: args.userId,
        parentId: undefined,
        name: "Studio",
        icon: "Folder",
        color: "#22c55e",
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
      });
    }
    await ctx.db.patch(key._id, { sandboxFolderId });
    return sandboxFolderId;
  },
});

export const touchApiKeyLastUsed = internalMutation({
  args: { apiKeyId: v.id("apiKeys") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.apiKeyId, { lastUsedAt: Date.now() });
    return null;
  },
});

export const resolveRootFolderId = internalQuery({
  args: { userId: v.id("users") },
  returns: v.union(v.id("folders"), v.null()),
  handler: async (ctx, args) => {
    const existingRoot = await ctx.db
      .query("folders")
      .withIndex("by_owner_and_parent", (q) =>
        q.eq("ownerId", args.userId).eq("parentId", undefined),
      )
      .first();
    if (existingRoot && !existingRoot.deletedAt) {
      return existingRoot._id;
    }
    return null;
  },
});

export const ensureRootFolder = internalMutation({
  args: { userId: v.id("users") },
  returns: v.id("folders"),
  handler: async (ctx, args) => {
    const existingRoot = await ctx.db
      .query("folders")
      .withIndex("by_owner_and_parent", (q) =>
        q.eq("ownerId", args.userId).eq("parentId", undefined),
      )
      .first();
    if (existingRoot && !existingRoot.deletedAt) {
      return existingRoot._id;
    }
    const now = Date.now();
    return await ctx.db.insert("folders", {
      ownerId: args.userId,
      parentId: undefined,
      name: "Studio",
      icon: "Folder",
      color: "#22c55e",
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const getAccount = internalQuery({
  args: { userId: v.id("users") },
  returns: v.object({
    userId: v.id("users"),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    creditBalance: v.number(),
    reservedCredits: v.number(),
  }),
  handler: async (ctx, args) => {
    const user = await ctx.db.get("users", args.userId);
    if (!user) {
      throw new Error("User not found");
    }
    const account = await ctx.db
      .query("billingAccounts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
    return {
      userId: user._id,
      name: user.name,
      email: user.email,
      creditBalance: account?.creditBalance ?? 0,
      reservedCredits: account?.reservedCredits ?? 0,
    };
  },
});

export const listFolders = internalQuery({
  args: {
    userId: v.id("users"),
    sandboxFolderId: v.id("folders"),
    parentId: v.optional(v.id("folders")),
  },
  returns: v.array(folderShape),
  handler: async (ctx, args) => {
    const parentId = args.parentId ?? args.sandboxFolderId;
    await requireFolderForUser(ctx, args.userId, parentId, args.sandboxFolderId);
    const folders = await ctx.db
      .query("folders")
      .withIndex("by_owner_and_parent", (q) =>
        q.eq("ownerId", args.userId).eq("parentId", parentId),
      )
      .collect();
    return folders
      .filter((folder) => !folder.deletedAt)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(formatFolder);
  },
});

export const getFolder = internalQuery({
  args: {
    userId: v.id("users"),
    sandboxFolderId: v.id("folders"),
    folderId: v.id("folders"),
  },
  returns: v.union(folderShape, v.null()),
  handler: async (ctx, args) => {
    try {
      const folder = await requireFolderForUser(
        ctx,
        args.userId,
        args.folderId,
        args.sandboxFolderId,
      );
      return formatFolder(folder);
    } catch {
      return null;
    }
  },
});

export const getFolderContents = internalQuery({
  args: {
    userId: v.id("users"),
    sandboxFolderId: v.id("folders"),
    folderId: v.id("folders"),
    expiresUnix: v.number(),
  },
  returns: v.object({
    folder: folderShape,
    folders: v.array(folderShape),
    assets: v.array(assetShape),
    documents: v.array(
      v.object({
        id: v.id("documents"),
        title: v.string(),
        folderId: v.id("folders"),
        createdAt: v.number(),
        updatedAt: v.number(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const folder = await requireFolderForUser(
      ctx,
      args.userId,
      args.folderId,
      args.sandboxFolderId,
    );
    const subfolders = await ctx.db
      .query("folders")
      .withIndex("by_owner_and_parent", (q) =>
        q.eq("ownerId", args.userId).eq("parentId", args.folderId),
      )
      .collect();
    const assets = await ctx.db
      .query("assets")
      .withIndex("by_folder", (q) => q.eq("folderId", args.folderId))
      .collect();
    const documents = await ctx.db
      .query("documents")
      .withIndex("by_folder", (q) => q.eq("folderId", args.folderId))
      .collect();
    return {
      folder: formatFolder(folder),
      folders: subfolders.filter((item) => !item.deletedAt).map(formatFolder),
      assets: await Promise.all(
        assets
          .filter((item) => !item.deletedAt)
          .map((asset) => formatAsset(ctx, asset, args.expiresUnix)),
      ),
      documents: documents
        .filter((item) => !item.deletedAt)
        .map((doc) => ({
          id: doc._id,
          title: doc.title,
          folderId: doc.folderId,
          createdAt: doc.createdAt,
          updatedAt: doc.updatedAt,
        })),
    };
  },
});

export const createFolder = internalMutation({
  args: {
    userId: v.id("users"),
    sandboxFolderId: v.id("folders"),
    name: v.string(),
    parentId: v.optional(v.id("folders")),
    icon: v.optional(v.string()),
    color: v.optional(v.string()),
  },
  returns: folderShape,
  handler: async (ctx, args) => {
    const parentId = args.parentId ?? args.sandboxFolderId;
    await requireFolderForUser(ctx, args.userId, parentId, args.sandboxFolderId);
    const now = Date.now();
    const folderId = await ctx.db.insert("folders", {
      ownerId: args.userId,
      parentId,
      name: args.name.trim(),
      icon: args.icon ?? "Folder",
      color: args.color,
      sortOrder: now,
      createdAt: now,
      updatedAt: now,
    });
    const folder = await ctx.db.get("folders", folderId);
    if (!folder) {
      throw new Error("Failed to create folder");
    }
    return formatFolder(folder);
  },
});

export const updateFolderForApi = internalMutation({
  args: {
    userId: v.id("users"),
    sandboxFolderId: v.id("folders"),
    folderId: v.id("folders"),
    name: v.optional(v.string()),
    icon: v.optional(v.string()),
    color: v.optional(v.string()),
    parentId: v.optional(v.id("folders")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireFolderForUser(ctx, args.userId, args.folderId, args.sandboxFolderId);
    if (args.folderId === args.sandboxFolderId && args.parentId !== undefined) {
      throw new Error("Cannot move sandbox root folder");
    }
    if (args.parentId !== undefined) {
      if (args.parentId === args.folderId) {
        throw new Error("Folder cannot be moved into itself");
      }
      await requireFolderForUser(ctx, args.userId, args.parentId, args.sandboxFolderId);
      if (await isFolderDescendantOf(ctx, args.parentId, args.folderId)) {
        throw new Error("Folder cannot be moved into its own subfolder");
      }
    }
    await ctx.db.patch(args.folderId, {
      ...(args.name !== undefined ? { name: args.name.trim() } : {}),
      ...(args.icon !== undefined ? { icon: args.icon } : {}),
      ...(args.color !== undefined ? { color: args.color } : {}),
      ...(args.parentId !== undefined ? { parentId: args.parentId } : {}),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const getAsset = internalQuery({
  args: {
    userId: v.id("users"),
    sandboxFolderId: v.id("folders"),
    assetId: v.id("assets"),
    expiresUnix: v.number(),
  },
  returns: v.union(assetShape, v.null()),
  handler: async (ctx, args) => {
    const asset = await ctx.db.get("assets", args.assetId);
    if (!asset || asset.ownerId !== args.userId || asset.deletedAt) {
      return null;
    }
    if (!(await isFolderInSandbox(ctx, asset.folderId, args.sandboxFolderId))) {
      return null;
    }
    return await formatAsset(ctx, asset, args.expiresUnix);
  },
});

export const getAssetReferenceUrls = internalQuery({
  args: {
    userId: v.id("users"),
    sandboxFolderId: v.id("folders"),
    assetIds: v.array(v.id("assets")),
    expiresUnix: v.number(),
  },
  returns: v.array(
    v.object({
      assetId: v.id("assets"),
      kind: v.union(
        v.literal("image"),
        v.literal("video"),
        v.literal("audio"),
        v.literal("document"),
      ),
      mimeType: v.string(),
      url: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const results: Array<{
      assetId: Id<"assets">;
      kind: "image" | "video" | "audio" | "document";
      mimeType: string;
      url: string;
    }> = [];
    for (const assetId of args.assetIds) {
      const asset = await ctx.db.get("assets", assetId);
      if (!asset || asset.ownerId !== args.userId || asset.deletedAt || !asset.bunnyPath) {
        throw new Error(`Reference asset not found: ${assetId}`);
      }
      if (!(await isFolderInSandbox(ctx, asset.folderId, args.sandboxFolderId))) {
        throw new Error(`Reference asset not found: ${assetId}`);
      }
      results.push({
        assetId: asset._id,
        kind: asset.kind,
        mimeType: asset.mimeType,
        url: await signBunnyFullUrl(asset.bunnyPath, args.expiresUnix, asset.kind),
      });
    }
    return results;
  },
});

export const reserveAssetUpload = internalMutation({
  args: {
    userId: v.id("users"),
    sandboxFolderId: v.id("folders"),
    folderId: v.id("folders"),
    name: v.string(),
    kind: v.union(
      v.literal("image"),
      v.literal("video"),
      v.literal("audio"),
      v.literal("document"),
    ),
    mimeType: v.string(),
  },
  returns: v.object({
    assetId: v.id("assets"),
    putUrl: v.string(),
    storageAccessKey: v.string(),
    bunnyPath: v.string(),
  }),
  handler: async (ctx, args) => {
    await requireFolderForUser(ctx, args.userId, args.folderId, args.sandboxFolderId);
    const now = Date.now();
    const assetId = await ctx.db.insert("assets", {
      ownerId: args.userId,
      folderId: args.folderId,
      name: args.name,
      kind: args.kind,
      mimeType: args.mimeType,
      createdAt: now,
      updatedAt: now,
    });
    const bunnyPath = buildAssetPath({
      userId: args.userId,
      folderId: args.folderId,
      assetId,
      filename: args.name,
    });
    await ctx.db.patch(assetId, { bunnyPath, updatedAt: now });
    return { assetId, ...getStorageUploadCredentials(bunnyPath) };
  },
});

export const completeAssetUpload = internalMutation({
  args: {
    userId: v.id("users"),
    sandboxFolderId: v.id("folders"),
    assetId: v.id("assets"),
    byteSize: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const asset = await ctx.db.get("assets", args.assetId);
    if (!asset || asset.ownerId !== args.userId) {
      throw new Error("Asset not found");
    }
    if (!(await isFolderInSandbox(ctx, asset.folderId, args.sandboxFolderId))) {
      throw new Error("Asset not found");
    }
    await ctx.db.patch(asset._id, {
      byteSize: args.byteSize,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const listStylePresets = internalQuery({
  args: {
    kind: v.optional(v.union(v.literal("image"), v.literal("video"), v.literal("any"))),
  },
  returns: v.array(
    v.object({
      id: v.id("stylePresets"),
      name: v.string(),
      slug: v.string(),
      kind: v.union(v.literal("image"), v.literal("video"), v.literal("any")),
      tagline: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    const presets = await ctx.db
      .query("stylePresets")
      .withIndex("by_enabled_and_sort", (q) => q.eq("enabled", true))
      .collect();
    const filtered = args.kind
      ? presets.filter((preset) => preset.kind === args.kind || preset.kind === "any")
      : presets;
    return filtered
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((preset) => ({
        id: preset._id,
        name: preset.name,
        slug: preset.slug,
        kind: preset.kind,
        tagline: preset.tagline,
      }));
  },
});

export const estimateGenerationCost = internalQuery({
  args: {
    userId: v.id("users"),
    sandboxFolderId: v.id("folders"),
    mode: v.union(v.literal("image"), v.literal("video"), v.literal("script")),
    resolution: v.optional(v.string()),
    quality: v.optional(v.string()),
    aspectRatio: v.optional(v.string()),
    durationSeconds: v.optional(v.number()),
    audioEnabled: v.optional(v.boolean()),
    referenceAssetIds: v.optional(v.array(v.id("assets"))),
    videoModel: v.optional(v.string()),
  },
  returns: v.object({
    mode: v.union(v.literal("image"), v.literal("video"), v.literal("script")),
    resolution: v.optional(v.string()),
    durationSeconds: v.optional(v.number()),
    cost: v.number(),
    creditBalance: v.number(),
    canGenerate: v.boolean(),
    hasActiveSubscription: v.boolean(),
    reason: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const account = await ctx.db
      .query("billingAccounts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
    const creditBalance = account?.creditBalance ?? 0;
    const now = Date.now();
    const hasActiveSubscription = await hasActiveSubscriptionForUser(ctx, args.userId, now);

    if (args.mode === "script") {
      const refs = await loadReferenceKinds(
        ctx,
        args.userId,
        args.referenceAssetIds ?? [],
        args.sandboxFolderId,
      );
      const cost = textCreditCost({
        imageReferenceCount: refs.filter((k) => k === "image").length,
        videoReferenceCount: refs.filter((k) => k === "video").length,
        audioReferenceCount: refs.filter((k) => k === "audio").length,
      });
      const canGenerate = creditBalance >= cost;
      return {
        mode: args.mode,
        cost,
        creditBalance,
        canGenerate,
        hasActiveSubscription,
        reason: canGenerate ? undefined : `Generation needs ${cost} credits. Top up to continue.`,
      };
    }

    const resolution =
      args.resolution ?? (args.mode === "image" ? "2K" : "1280x720");
    const tier = args.mode === "video" ? ("pro_video" as const) : ("image" as const);

    if (args.mode === "video" && resolution === "3840x2160") {
      return {
        mode: args.mode,
        resolution,
        durationSeconds: args.durationSeconds,
        cost: 0,
        creditBalance,
        canGenerate: false,
        hasActiveSubscription,
        reason: "4K video is not available yet. Seedance 2.0 supports up to 1080p through AI Gateway.",
      };
    }
    if (args.mode === "video" && !isSupportedVideoDuration(args.durationSeconds)) {
      return {
        mode: args.mode,
        resolution,
        durationSeconds: args.durationSeconds,
        cost: 0,
        creditBalance,
        canGenerate: false,
        hasActiveSubscription,
        reason: "Video duration must be between 4 and 15 seconds.",
      };
    }

    const referenceFlags = await referenceFlagsForAssets(
      ctx,
      args.userId,
      args.referenceAssetIds ?? [],
      args.mode,
      args.sandboxFolderId,
    );
    const cost = creditCostForGeneration({
      tier,
      resolution,
      quality: args.mode === "image" ? args.quality : undefined,
      aspectRatio: args.mode === "image" ? args.aspectRatio : undefined,
      durationSeconds: args.durationSeconds,
      audioEnabled: args.audioEnabled,
      videoModel:
        args.mode === "video"
          ? ((args.videoModel as
              | "seedance-2.0"
              | "google-omni-flash"
              | "kling-3.0-i2v"
              | undefined) ?? "seedance-2.0")
          : undefined,
      ...referenceFlags,
    });
    const canGenerate = creditBalance >= cost;
    return {
      mode: args.mode,
      resolution,
      durationSeconds: args.durationSeconds,
      cost,
      creditBalance,
      canGenerate,
      hasActiveSubscription,
      reason: canGenerate ? undefined : `Generation needs ${cost} credits. Top up to continue.`,
    };
  },
});

export const estimateBatchProduction = internalQuery({
  args: {
    userId: v.id("users"),
    sandboxFolderId: v.id("folders"),
    items: v.array(
      v.object({
        label: v.string(),
        mode: v.union(v.literal("image"), v.literal("video"), v.literal("script")),
        resolution: v.optional(v.string()),
        durationSeconds: v.optional(v.number()),
        audioEnabled: v.optional(v.boolean()),
        hasReferenceInput: v.optional(v.boolean()),
        referenceAssetIds: v.optional(v.array(v.id("assets"))),
        maxRounds: v.number(),
      }),
    ),
    contingencyPercent: v.optional(v.number()),
  },
  returns: v.object({
    items: v.array(
      v.object({
        label: v.string(),
        unitCost: v.number(),
        maxRounds: v.number(),
        subtotal: v.number(),
      }),
    ),
    subtotalCredits: v.number(),
    contingencyCredits: v.number(),
    totalCredits: v.number(),
    totalTTD: v.number(),
    creditBalance: v.number(),
    canGenerate: v.boolean(),
    creditPriceTTD: v.number(),
  }),
  handler: async (ctx, args) => {
    const account = await ctx.db
      .query("billingAccounts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
    const creditBalance = account?.creditBalance ?? 0;
    const contingencyPercent = Math.max(0, args.contingencyPercent ?? 15);

    const items = [];
    let subtotalCredits = 0;

    for (const item of args.items) {
      const maxRounds = Math.max(1, Math.ceil(item.maxRounds));
      let unitCost = 0;

      if (item.mode === "script") {
        const refs = await loadReferenceKinds(
          ctx,
          args.userId,
          item.referenceAssetIds ?? [],
          args.sandboxFolderId,
        );
        unitCost = textCreditCost({
          imageReferenceCount: refs.filter((k) => k === "image").length,
          videoReferenceCount: refs.filter((k) => k === "video").length,
          audioReferenceCount: refs.filter((k) => k === "audio").length,
        });
      } else {
        const resolution =
          item.resolution ?? (item.mode === "image" ? "2K" : "1280x720");
        const tier = item.mode === "video" ? ("pro_video" as const) : ("image" as const);
        const referenceFlags =
          item.referenceAssetIds?.length
            ? await referenceFlagsForAssets(
                ctx,
                args.userId,
                item.referenceAssetIds,
                item.mode,
                args.sandboxFolderId,
              )
            : {
                hasReferenceInput: item.hasReferenceInput ?? false,
                hasVideoReferenceInput: false,
                hasNonVideoReferenceInput: false,
              };
        unitCost = creditCostForGeneration({
          tier,
          resolution,
          durationSeconds: item.durationSeconds,
          audioEnabled: item.audioEnabled,
          ...referenceFlags,
        });
      }

      const subtotal = unitCost * maxRounds;
      subtotalCredits += subtotal;
      items.push({
        label: item.label,
        unitCost,
        maxRounds,
        subtotal,
      });
    }

    const contingencyCredits = Math.ceil(subtotalCredits * (contingencyPercent / 100));
    const totalCredits = subtotalCredits + contingencyCredits;
    const totalTTD = totalCredits * CREDIT_PRICE_TTD;

    return {
      items,
      subtotalCredits,
      contingencyCredits,
      totalCredits,
      totalTTD,
      creditBalance,
      canGenerate: creditBalance >= totalCredits,
      creditPriceTTD: CREDIT_PRICE_TTD,
    };
  },
});

const DEPRECATED_PRESET_SLUGS: Record<string, string> = {
  raw: "unstyled",
};

const LEGACY_CARTOON_PRESET_SLUGS = new Set([
  "toon-prime",
  "toon-adult",
  "toon-surreal",
  "toon-family",
  "toon-cgi",
  "toon-neon-idol",
  "story-ad",
  "realism",
  "cinematic",
  "product-studio",
  "social-hook",
  "hypermotion",
  "anime",
  "3d-cgi",
  "footage-vfx",
]);

export const resolveStylePresetBySlug = internalQuery({
  args: { slug: v.string() },
  returns: v.union(
    v.object({
      id: v.id("stylePresets"),
      slug: v.string(),
      name: v.string(),
      kind: v.union(v.literal("image"), v.literal("video"), v.literal("any")),
      migratedFrom: v.optional(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    if (LEGACY_CARTOON_PRESET_SLUGS.has(args.slug)) {
      return null;
    }
    const resolvedSlug = DEPRECATED_PRESET_SLUGS[args.slug] ?? args.slug;
    const preset = await ctx.db
      .query("stylePresets")
      .withIndex("by_slug", (q) => q.eq("slug", resolvedSlug))
      .unique();
    if (!preset || !preset.enabled) {
      return null;
    }
    return {
      id: preset._id,
      slug: preset.slug,
      name: preset.name,
      kind: preset.kind,
      migratedFrom: resolvedSlug !== args.slug ? args.slug : undefined,
    };
  },
});

export const getGenerationJob = internalQuery({
  args: {
    userId: v.id("users"),
    sandboxFolderId: v.id("folders"),
    jobId: v.id("generationJobs"),
    expiresUnix: v.number(),
  },
  returns: v.union(
    v.object({
      id: v.id("generationJobs"),
      threadId: v.optional(v.string()),
      status: v.string(),
      mode: v.union(v.literal("image"), v.literal("video")),
      folderId: v.id("folders"),
      prompt: v.string(),
      error: v.optional(v.string()),
      source: v.optional(v.string()),
      stylePresetSlug: v.optional(v.string()),
      resolvedModel: v.optional(v.string()),
      creditsSpent: v.optional(v.number()),
      assets: v.array(assetShape),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const job = await ctx.db.get("generationJobs", args.jobId);
    if (!job || job.ownerId !== args.userId) {
      return null;
    }
    if (!(await isFolderInSandbox(ctx, job.saveFolderId, args.sandboxFolderId))) {
      return null;
    }
    return await formatGenerationJob(ctx, job, args.expiresUnix);
  },
});

export const listGenerationJobs = internalQuery({
  args: {
    userId: v.id("users"),
    sandboxFolderId: v.id("folders"),
    limit: v.optional(v.number()),
    expiresUnix: v.number(),
  },
  returns: v.array(
    v.object({
      id: v.id("generationJobs"),
      threadId: v.optional(v.string()),
      status: v.string(),
      mode: v.union(v.literal("image"), v.literal("video")),
      folderId: v.id("folders"),
      prompt: v.string(),
      error: v.optional(v.string()),
      source: v.optional(v.string()),
      stylePresetSlug: v.optional(v.string()),
      resolvedModel: v.optional(v.string()),
      creditsSpent: v.optional(v.number()),
      assets: v.array(assetShape),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 20, 1), 50);
    const jobs = await ctx.db
      .query("generationJobs")
      .withIndex("by_owner_and_created", (q) => q.eq("ownerId", args.userId))
      .order("desc")
      .take(limit * 3);
    const visible: typeof jobs = [];
    for (const job of jobs) {
      if (await isFolderInSandbox(ctx, job.saveFolderId, args.sandboxFolderId)) {
        visible.push(job);
      }
      if (visible.length >= limit) {
        break;
      }
    }
    return await Promise.all(
      visible.map(async (job) => {
        return await formatGenerationJob(ctx, job, args.expiresUnix);
      }),
    );
  },
});

export const getDocument = internalQuery({
  args: {
    userId: v.id("users"),
    sandboxFolderId: v.id("folders"),
    documentId: v.id("documents"),
    expiresUnix: v.number(),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const doc = await ctx.db.get("documents", args.documentId);
    if (!doc || doc.ownerId !== args.userId || doc.deletedAt) {
      throw new Error("Document not found");
    }
    if (!(await isFolderInSandbox(ctx, doc.folderId, args.sandboxFolderId))) {
      throw new Error("Document not found");
    }
    let asset;
    if (doc.assetId) {
      const row = await ctx.db.get("assets", doc.assetId);
      if (row && !row.deletedAt) {
        asset = await formatAsset(ctx, row, args.expiresUnix);
      }
    }
    return {
      id: doc._id,
      folderId: doc.folderId,
      title: doc.title,
      contentMarkdown: doc.contentMarkdown,
      assetId: doc.assetId,
      asset,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  },
});

export const createDocumentForApi = internalMutation({
  args: {
    userId: v.id("users"),
    sandboxFolderId: v.id("folders"),
    folderId: v.id("folders"),
    title: v.string(),
    contentMarkdown: v.optional(v.string()),
  },
  returns: v.id("documents"),
  handler: async (ctx, args) => {
    await requireFolderForUser(ctx, args.userId, args.folderId, args.sandboxFolderId);
    const now = Date.now();
    return await ctx.db.insert("documents", {
      ownerId: args.userId,
      folderId: args.folderId,
      title: args.title.trim(),
      contentMarkdown: args.contentMarkdown ?? "",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateDocumentForApi = internalMutation({
  args: {
    userId: v.id("users"),
    sandboxFolderId: v.id("folders"),
    documentId: v.id("documents"),
    title: v.optional(v.string()),
    contentMarkdown: v.optional(v.string()),
    folderId: v.optional(v.id("folders")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const doc = await ctx.db.get("documents", args.documentId);
    if (!doc || doc.ownerId !== args.userId || doc.deletedAt) {
      throw new Error("Document not found");
    }
    if (!(await isFolderInSandbox(ctx, doc.folderId, args.sandboxFolderId))) {
      throw new Error("Document not found");
    }
    if (args.folderId !== undefined) {
      await requireFolderForUser(ctx, args.userId, args.folderId, args.sandboxFolderId);
    }
    await ctx.db.patch(doc._id, {
      ...(args.title !== undefined ? { title: args.title.trim() } : {}),
      ...(args.contentMarkdown !== undefined
        ? { contentMarkdown: args.contentMarkdown }
        : {}),
      ...(args.folderId !== undefined ? { folderId: args.folderId } : {}),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const updateAssetForApi = internalMutation({
  args: {
    userId: v.id("users"),
    sandboxFolderId: v.id("folders"),
    assetId: v.id("assets"),
    name: v.optional(v.string()),
    folderId: v.optional(v.id("folders")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const asset = await ctx.db.get("assets", args.assetId);
    if (!asset || asset.ownerId !== args.userId || asset.deletedAt) {
      throw new Error("Asset not found");
    }
    if (!(await isFolderInSandbox(ctx, asset.folderId, args.sandboxFolderId))) {
      throw new Error("Asset not found");
    }
    if (args.folderId !== undefined) {
      await requireFolderForUser(ctx, args.userId, args.folderId, args.sandboxFolderId);
    }
    await ctx.db.patch(asset._id, {
      ...(args.name !== undefined ? { name: args.name.trim() } : {}),
      ...(args.folderId !== undefined ? { folderId: args.folderId } : {}),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const listElementsForApi = internalQuery({
  args: {
    userId: v.id("users"),
    sandboxFolderId: v.id("folders"),
    type: v.optional(
      v.union(
        v.literal("character"),
        v.literal("prop"),
        v.literal("location"),
        v.literal("doc"),
        v.literal("style_sheet"),
      ),
    ),
    folderId: v.optional(v.id("folders")),
    expiresUnix: v.number(),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const elements =
      args.type !== undefined
        ? await ctx.db
            .query("elements")
            .withIndex("by_owner_and_type", (q) =>
              q.eq("ownerId", args.userId).eq("type", args.type!),
            )
            .collect()
        : await ctx.db
            .query("elements")
            .withIndex("by_owner", (q) => q.eq("ownerId", args.userId))
            .collect();
    const active = elements.filter((e) => !e.deletedAt);
    const scoped = [];
    for (const element of active) {
      if (args.folderId !== undefined && element.folderId !== args.folderId) {
        continue;
      }
      if (!element.folderId || (await isFolderInSandbox(ctx, element.folderId, args.sandboxFolderId))) {
        scoped.push(element);
      }
    }
    return await Promise.all(
      scoped.map(async (element) => formatElement(ctx, element, args.expiresUnix)),
    );
  },
});

export const resolveElementAssetsForUser = internalQuery({
  args: {
    userId: v.id("users"),
    elementId: v.id("elements"),
  },
  returns: v.object({
    referenceAssetIds: v.array(v.id("assets")),
    sheetAssetId: v.optional(v.id("assets")),
    buildStatus: v.union(v.literal("unbuilt"), v.literal("built")),
    builtAt: v.optional(v.number()),
  }),
  handler: async (ctx, args) => {
    const element = await ctx.db.get("elements", args.elementId);
    if (!element || element.ownerId !== args.userId || element.deletedAt) {
      throw new Error("Element not found");
    }
    const resolved = await resolveElementAssets(ctx, element);
    return {
      referenceAssetIds: resolved.referenceAssetIds,
      sheetAssetId: resolved.sheetAssetId,
      buildStatus: resolved.buildStatus,
      builtAt: resolved.builtAt,
    };
  },
});

export const resolveReferenceElementIds = internalQuery({
  args: {
    userId: v.id("users"),
    sandboxFolderId: v.id("folders"),
    elementIds: v.array(v.id("elements")),
    /** video: attach prop/location sheets only (Seedance real-person filter). image: attach all sheets. */
    generationMode: v.optional(v.union(v.literal("image"), v.literal("video"))),
    /** full = element bibles on job prompt. gateway_kling = compact stubs (shot packet keeps full definition). */
    promptAppendStyle: v.optional(v.union(v.literal("full"), v.literal("gateway_kling"))),
    hasStartFrame: v.optional(v.boolean()),
    /** Number of image references already placed before element sheets (for [Image N] labels). */
    referenceImageStartIndex: v.optional(v.number()),
  },
  returns: v.object({
    referenceAssetIds: v.array(v.id("assets")),
    promptLines: v.array(v.string()),
    skippedCharacterSheetIds: v.array(v.id("elements")),
    referenceImageLabels: v.array(
      v.object({
        tag: v.string(),
        label: v.string(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const referenceAssetIds: Id<"assets">[] = [];
    const promptLines: string[] = [];
    const skippedCharacterSheetIds: Id<"elements">[] = [];
    const referenceImageLabels: Array<{ tag: string; label: string }> = [];
    const unbuiltElementNames: string[] = [];
    const videoMode = args.generationMode === "video";
    const compactKling = args.promptAppendStyle === "gateway_kling";
    const hasStartFrame = args.hasStartFrame === true;
    let referenceImageIndex = Math.max(0, Math.floor(args.referenceImageStartIndex ?? 0));

    for (const elementId of args.elementIds) {
      const element = await ctx.db.get("elements", elementId);
      if (!element || element.ownerId !== args.userId || element.deletedAt) {
        throw new Error(`Element not found: ${elementId}`);
      }
      if (
        element.folderId &&
        !(await isFolderInSandbox(ctx, element.folderId, args.sandboxFolderId))
      ) {
        throw new Error(`Element not found: ${elementId}`);
      }
      const resolved = await resolveElementAssets(ctx, element);
      if (resolved.buildStatus !== "built" || !resolved.sheetAssetId) {
        unbuiltElementNames.push(element.name);
        continue;
      }
      const attachSheet =
        !videoMode || element.type === "prop" || element.type === "location";
      let imageTag: string | undefined;
      if (attachSheet) {
        referenceAssetIds.push(resolved.sheetAssetId);
        referenceImageIndex += 1;
        imageTag = `[Image ${referenceImageIndex}]`;
        referenceImageLabels.push({
          tag: imageTag,
          label: `${element.type} @${element.name}`,
        });
      } else {
        skippedCharacterSheetIds.push(elementId);
      }
      if (compactKling) {
        promptLines.push(
          compactElementPromptLine(
            {
              type: element.type,
              name: element.name,
              description: element.description,
              attachSheet,
              imageTag,
            },
            { hasStartFrame, isCharacter: element.type === "character" },
          ),
        );
      } else if (element.description?.trim()) {
        promptLines.push(
          `${element.type} @${element.name}:\n${element.description.trim()}`,
        );
      } else if (attachSheet) {
        promptLines.push(`${element.type} @${element.name} (built sheet attached)`);
      } else {
        promptLines.push(
          `${element.type} @${element.name} (identity via prompt — sheet not attached for video; Seedance real-person filter)`,
        );
      }
    }

    if (unbuiltElementNames.length) {
      throw new Error(
        `Elements must be built before use in generation (missing sheet): ${unbuiltElementNames.join(", ")}. Call generate-sheet first.`,
      );
    }

    return { referenceAssetIds, promptLines, skippedCharacterSheetIds, referenceImageLabels };
  },
});

export const getElementForApi = internalQuery({
  args: {
    userId: v.id("users"),
    sandboxFolderId: v.id("folders"),
    elementId: v.id("elements"),
    expiresUnix: v.number(),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const element = await ctx.db.get("elements", args.elementId);
    if (!element || element.ownerId !== args.userId || element.deletedAt) {
      throw new Error("Element not found");
    }
    if (element.folderId && !(await isFolderInSandbox(ctx, element.folderId, args.sandboxFolderId))) {
      throw new Error("Element not found");
    }
    return await formatElement(ctx, element, args.expiresUnix);
  },
});

export const createElementForApi = internalMutation({
  args: {
    userId: v.id("users"),
    sandboxFolderId: v.id("folders"),
    type: v.union(
      v.literal("character"),
      v.literal("prop"),
      v.literal("location"),
      v.literal("doc"),
      v.literal("style_sheet"),
    ),
    name: v.string(),
    description: v.optional(v.string()),
    folderId: v.optional(v.id("folders")),
    referenceAssetIds: v.optional(v.array(v.id("assets"))),
    sourceAssetIds: v.optional(v.array(v.id("assets"))),
    sourceDocumentId: v.optional(v.id("documents")),
    sourceMode: v.optional(v.union(v.literal("photographic"), v.literal("designed"))),
    sheetAssetId: v.optional(v.id("assets")),
    styleRules: v.optional(v.string()),
    renderMode: v.optional(
      v.union(
        v.literal("photoreal"),
        v.literal("illustrated_2d"),
        v.literal("illustrated_3d"),
        v.literal("mixed"),
      ),
    ),
  },
  returns: v.id("elements"),
  handler: async (ctx, args) => {
    if (args.folderId) {
      await requireFolderForUser(ctx, args.userId, args.folderId, args.sandboxFolderId);
    }
    const referenceAssetIds = referenceAssetIdsFromInput(args);
    assertReferenceCount(referenceAssetIds.length);
    for (const assetId of referenceAssetIds) {
      const asset = await ctx.db.get("assets", assetId);
      if (!asset || asset.ownerId !== args.userId || asset.deletedAt) {
        throw new Error("Asset not found");
      }
      if (!(await isFolderInSandbox(ctx, asset.folderId, args.sandboxFolderId))) {
        throw new Error("Asset not found");
      }
    }
    if (args.sheetAssetId) {
      const sheetAsset = await ctx.db.get("assets", args.sheetAssetId);
      if (
        !sheetAsset ||
        sheetAsset.ownerId !== args.userId ||
        sheetAsset.deletedAt ||
        sheetAsset.kind !== "image"
      ) {
        throw new Error("Sheet asset not found");
      }
      if (!(await isFolderInSandbox(ctx, sheetAsset.folderId, args.sandboxFolderId))) {
        throw new Error("Sheet asset not found");
      }
    }
    if (args.sourceDocumentId) {
      const doc = await ctx.db.get("documents", args.sourceDocumentId);
      if (!doc || doc.ownerId !== args.userId || doc.deletedAt) {
        throw new Error("Document not found");
      }
      if (!(await isFolderInSandbox(ctx, doc.folderId, args.sandboxFolderId))) {
        throw new Error("Document not found");
      }
    }
    const now = Date.now();
    const sourceMode: ElementSourceMode =
      args.sourceMode ??
      inferElementSourceMode({
        type: args.type,
        imageRefCount: referenceAssetIds.length,
      });
    return await ctx.db.insert("elements", {
      ownerId: args.userId,
      folderId: args.folderId,
      type: args.type,
      name: args.name.trim(),
      description: args.description?.trim(),
      sourceMode,
      sourceAssetIds: referenceAssetIds,
      referenceAssetIds,
      sourceDocumentId: args.sourceDocumentId,
      sheetAssetId: args.sheetAssetId,
      builtAt: args.sheetAssetId ? now : undefined,
      styleRules: args.type === "style_sheet" ? args.styleRules?.trim() : undefined,
      renderMode: args.type === "style_sheet" ? args.renderMode : undefined,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateElementForApi = internalMutation({
  args: {
    userId: v.id("users"),
    sandboxFolderId: v.id("folders"),
    elementId: v.id("elements"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    folderId: v.optional(v.id("folders")),
    referenceAssetIds: v.optional(v.array(v.id("assets"))),
    sourceAssetIds: v.optional(v.array(v.id("assets"))),
    sourceDocumentId: v.optional(v.id("documents")),
    styleRules: v.optional(v.string()),
    renderMode: v.optional(
      v.union(
        v.literal("photoreal"),
        v.literal("illustrated_2d"),
        v.literal("illustrated_3d"),
        v.literal("mixed"),
      ),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const element = await ctx.db.get("elements", args.elementId);
    if (!element || element.ownerId !== args.userId || element.deletedAt) {
      throw new Error("Element not found");
    }
    if (
      element.folderId &&
      !(await isFolderInSandbox(ctx, element.folderId, args.sandboxFolderId))
    ) {
      throw new Error("Element not found");
    }
    if (args.folderId !== undefined) {
      await requireFolderForUser(ctx, args.userId, args.folderId, args.sandboxFolderId);
    }
    const nextReferenceAssetIds =
      args.referenceAssetIds !== undefined
        ? args.referenceAssetIds
        : args.sourceAssetIds !== undefined
          ? args.sourceAssetIds
          : undefined;
    if (nextReferenceAssetIds !== undefined) {
      assertReferenceCount(nextReferenceAssetIds.length);
      for (const assetId of nextReferenceAssetIds) {
        const asset = await ctx.db.get("assets", assetId);
        if (!asset || asset.ownerId !== args.userId || asset.deletedAt) {
          throw new Error("Asset not found");
        }
        if (!(await isFolderInSandbox(ctx, asset.folderId, args.sandboxFolderId))) {
          throw new Error("Asset not found");
        }
        if (element.sheetAssetId && assetId === element.sheetAssetId) {
          throw new Error(
            "referenceAssetIds must be upload photos only — do not include the built sheet asset.",
          );
        }
      }
    }
    if (args.sourceDocumentId !== undefined) {
      const doc = await ctx.db.get("documents", args.sourceDocumentId);
      if (!doc || doc.ownerId !== args.userId || doc.deletedAt) {
        throw new Error("Document not found");
      }
      if (!(await isFolderInSandbox(ctx, doc.folderId, args.sandboxFolderId))) {
        throw new Error("Document not found");
      }
    }
    await ctx.db.patch(element._id, {
      ...(args.name !== undefined ? { name: args.name.trim() } : {}),
      ...(args.description !== undefined ? { description: args.description } : {}),
      ...(args.folderId !== undefined ? { folderId: args.folderId } : {}),
      ...(nextReferenceAssetIds !== undefined
        ? {
            referenceAssetIds: nextReferenceAssetIds,
            sourceAssetIds: nextReferenceAssetIds,
          }
        : {}),
      ...(args.sourceDocumentId !== undefined
        ? { sourceDocumentId: args.sourceDocumentId }
        : {}),
      ...(args.styleRules !== undefined ? { styleRules: args.styleRules } : {}),
      ...(args.renderMode !== undefined ? { renderMode: args.renderMode } : {}),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const countImageAssetsForApi = internalQuery({
  args: {
    userId: v.id("users"),
    sandboxFolderId: v.id("folders"),
    assetIds: v.array(v.id("assets")),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    let count = 0;
    for (const assetId of args.assetIds) {
      const asset = await ctx.db.get("assets", assetId);
      if (!asset || asset.ownerId !== args.userId || asset.deletedAt || asset.kind !== "image") {
        continue;
      }
      if (await isFolderInSandbox(ctx, asset.folderId, args.sandboxFolderId)) {
        count += 1;
      }
    }
    return count;
  },
});

export const chargeTextGenerationForApi = internalMutation({
  args: {
    userId: v.id("users"),
    sandboxFolderId: v.id("folders"),
    folderId: v.id("folders"),
    imageReferenceCount: v.optional(v.number()),
    videoReferenceCount: v.optional(v.number()),
    audioReferenceCount: v.optional(v.number()),
  },
  returns: v.object({
    transactionId: v.id("creditTransactions"),
    cost: v.number(),
  }),
  handler: async (ctx, args) => {
    await requireFolderForUser(ctx, args.userId, args.folderId, args.sandboxFolderId);
    const account = await ctx.db
      .query("billingAccounts")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
    const cost = textCreditCost(args);
    const now = Date.now();
    if (!account || account.creditBalance < cost) {
      throw new Error(`Generation needs ${cost} credits. Top up to continue.`);
    }
    const balanceAfter = account.creditBalance - cost;
    await ctx.db.patch(account._id, {
      creditBalance: balanceAfter,
      updatedAt: now,
    });
    const transactionId = await ctx.db.insert("creditTransactions", {
      userId: args.userId,
      billingAccountId: account._id,
      kind: "spent",
      amount: -cost,
      balanceAfter,
      reason: "Text generation (API)",
      createdAt: now,
    });
    return { transactionId, cost };
  },
});

export const prepareInlineAssetUpload = internalMutation({
  args: {
    userId: v.id("users"),
    sandboxFolderId: v.id("folders"),
    folderId: v.id("folders"),
    name: v.string(),
    kind: v.union(
      v.literal("image"),
      v.literal("video"),
      v.literal("audio"),
      v.literal("document"),
    ),
    mimeType: v.string(),
    byteSize: v.number(),
  },
  returns: v.object({
    assetId: v.id("assets"),
    bunnyPath: v.string(),
  }),
  handler: async (ctx, args) => {
    await requireFolderForUser(ctx, args.userId, args.folderId, args.sandboxFolderId);
    const now = Date.now();
    const assetId = await ctx.db.insert("assets", {
      ownerId: args.userId,
      folderId: args.folderId,
      name: args.name.trim(),
      kind: args.kind,
      mimeType: args.mimeType,
      byteSize: args.byteSize,
      createdAt: now,
      updatedAt: now,
    });
    const bunnyPath = buildAssetPath({
      userId: args.userId,
      folderId: args.folderId,
      assetId,
      filename: args.name,
    });
    await ctx.db.patch(assetId, { bunnyPath, updatedAt: now });
    return { assetId, bunnyPath };
  },
});

export const finalizeInlineAssetUpload = internalMutation({
  args: {
    userId: v.id("users"),
    sandboxFolderId: v.id("folders"),
    assetId: v.id("assets"),
    byteSize: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const asset = await ctx.db.get("assets", args.assetId);
    if (!asset || asset.ownerId !== args.userId || asset.deletedAt) {
      throw new Error("Asset not found");
    }
    if (!(await isFolderInSandbox(ctx, asset.folderId, args.sandboxFolderId))) {
      throw new Error("Asset not found");
    }
    await ctx.db.patch(asset._id, {
      byteSize: args.byteSize,
      updatedAt: Date.now(),
    });
    return null;
  },
});

const trashKind = v.union(
  v.literal("folder"),
  v.literal("asset"),
  v.literal("document"),
  v.literal("element"),
);

export const trashItemForApi = internalMutation({
  args: {
    userId: v.id("users"),
    sandboxFolderId: v.id("folders"),
    kind: trashKind,
    id: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    switch (args.kind) {
      case "folder": {
        const folderId = args.id as Id<"folders">;
        if (folderId === args.sandboxFolderId) {
          throw new Error("Cannot trash the API workspace root folder");
        }
        await requireFolderForUser(ctx, args.userId, folderId, args.sandboxFolderId);
        await ctx.db.patch(folderId, { deletedAt: now, updatedAt: now });
        return null;
      }
      case "asset": {
        const assetId = args.id as Id<"assets">;
        const asset = await ctx.db.get("assets", assetId);
        if (!asset || asset.ownerId !== args.userId || asset.deletedAt) {
          throw new Error("Asset not found");
        }
        if (!(await isFolderInSandbox(ctx, asset.folderId, args.sandboxFolderId))) {
          throw new Error("Asset not found");
        }
        await ctx.db.patch(asset._id, { deletedAt: now, updatedAt: now });
        return null;
      }
      case "document": {
        const documentId = args.id as Id<"documents">;
        const doc = await ctx.db.get("documents", documentId);
        if (!doc || doc.ownerId !== args.userId || doc.deletedAt) {
          throw new Error("Document not found");
        }
        if (!(await isFolderInSandbox(ctx, doc.folderId, args.sandboxFolderId))) {
          throw new Error("Document not found");
        }
        await ctx.db.patch(doc._id, { deletedAt: now, updatedAt: now });
        return null;
      }
      case "element": {
        const elementId = args.id as Id<"elements">;
        const element = await ctx.db.get("elements", elementId);
        if (!element || element.ownerId !== args.userId || element.deletedAt) {
          throw new Error("Element not found");
        }
        if (element.folderId && !(await isFolderInSandbox(ctx, element.folderId, args.sandboxFolderId))) {
          throw new Error("Element not found");
        }
        await ctx.db.patch(element._id, { deletedAt: now, updatedAt: now });
        return null;
      }
    }
  },
});

export const restoreItemForApi = internalMutation({
  args: {
    userId: v.id("users"),
    sandboxFolderId: v.id("folders"),
    kind: trashKind,
    id: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    switch (args.kind) {
      case "folder": {
        const folderId = args.id as Id<"folders">;
        await requireFolderForUser(ctx, args.userId, folderId, args.sandboxFolderId);
        await ctx.db.patch(folderId, { deletedAt: undefined, updatedAt: now });
        return null;
      }
      case "asset": {
        const assetId = args.id as Id<"assets">;
        const asset = await ctx.db.get("assets", assetId);
        if (!asset || asset.ownerId !== args.userId) {
          throw new Error("Asset not found");
        }
        if (!(await isFolderInSandbox(ctx, asset.folderId, args.sandboxFolderId))) {
          throw new Error("Asset not found");
        }
        await ctx.db.patch(asset._id, { deletedAt: undefined, updatedAt: now });
        return null;
      }
      case "document": {
        const documentId = args.id as Id<"documents">;
        const doc = await ctx.db.get("documents", documentId);
        if (!doc || doc.ownerId !== args.userId) {
          throw new Error("Document not found");
        }
        if (!(await isFolderInSandbox(ctx, doc.folderId, args.sandboxFolderId))) {
          throw new Error("Document not found");
        }
        await ctx.db.patch(doc._id, { deletedAt: undefined, updatedAt: now });
        return null;
      }
      case "element": {
        const elementId = args.id as Id<"elements">;
        const element = await ctx.db.get("elements", elementId);
        if (!element || element.ownerId !== args.userId) {
          throw new Error("Element not found");
        }
        if (element.folderId && !(await isFolderInSandbox(ctx, element.folderId, args.sandboxFolderId))) {
          throw new Error("Element not found");
        }
        await ctx.db.patch(element._id, { deletedAt: undefined, updatedAt: now });
        return null;
      }
    }
  },
});

export const listTrashForApi = internalQuery({
  args: {
    userId: v.id("users"),
    sandboxFolderId: v.id("folders"),
    kind: v.optional(trashKind),
    expiresUnix: v.number(),
  },
  returns: v.object({
    folders: v.array(v.any()),
    assets: v.array(v.any()),
    documents: v.array(v.any()),
    elements: v.array(v.any()),
  }),
  handler: async (ctx, args) => {
    const include = (kind: "folder" | "asset" | "document" | "element") =>
      !args.kind || args.kind === kind;

    const folders = include("folder")
      ? (
          await Promise.all(
            (await ctx.db
              .query("folders")
              .withIndex("by_owner", (q) => q.eq("ownerId", args.userId))
              .collect())
              .filter((f) => f.deletedAt && f._id !== args.sandboxFolderId)
              .map(async (f) =>
                (await isFolderInSandbox(ctx, f._id, args.sandboxFolderId))
                  ? {
                      id: f._id,
                      kind: "folder" as const,
                      name: f.name,
                      deletedAt: f.deletedAt,
                    }
                  : null,
              ),
          )
        ).filter(Boolean)
      : [];

    const assets = include("asset")
      ? (
          await Promise.all(
            (await ctx.db
              .query("assets")
              .withIndex("by_owner", (q) => q.eq("ownerId", args.userId))
              .collect())
              .filter((a) => a.deletedAt)
              .map(async (a) =>
                (await isFolderInSandbox(ctx, a.folderId, args.sandboxFolderId))
                  ? {
                      ...(await formatAsset(ctx, a, args.expiresUnix)),
                      kind: "asset" as const,
                      deletedAt: a.deletedAt,
                    }
                  : null,
              ),
          )
        ).filter(Boolean)
      : [];

    const documents = include("document")
      ? (
          await Promise.all(
            (await ctx.db
              .query("documents")
              .withIndex("by_owner", (q) => q.eq("ownerId", args.userId))
              .collect())
              .filter((d) => d.deletedAt)
              .map(async (d) =>
                (await isFolderInSandbox(ctx, d.folderId, args.sandboxFolderId))
                  ? {
                      id: d._id,
                      kind: "document" as const,
                      title: d.title,
                      folderId: d.folderId,
                      deletedAt: d.deletedAt,
                    }
                  : null,
              ),
          )
        ).filter(Boolean)
      : [];

    const elements = include("element")
      ? (
          await Promise.all(
            (await ctx.db
              .query("elements")
              .withIndex("by_owner", (q) => q.eq("ownerId", args.userId))
              .collect())
              .filter((e) => e.deletedAt)
              .map(async (e) =>
                !e.folderId || (await isFolderInSandbox(ctx, e.folderId, args.sandboxFolderId))
                  ? {
                      ...(await formatElement(ctx, e, args.expiresUnix)),
                      kind: "element" as const,
                      deletedAt: e.deletedAt,
                    }
                  : null,
              ),
          )
        ).filter(Boolean)
      : [];

    return { folders, assets, documents, elements };
  },
});

export const checkRateLimit = internalQuery({
  args: {
    apiKeyId: v.id("apiKeys"),
    routeKind: v.union(v.literal("read"), v.literal("write")),
  },
  returns: v.object({ allowed: v.boolean(), retryAfterSeconds: v.optional(v.number()) }),
  handler: async () => {
    // Rate limiting disabled — VPS agent batch ops (folder organize, cinema runs) need unrestricted API access.
    return { allowed: true };
  },
});

export const logApiRequest = internalMutation({
  args: {
    apiKeyId: v.id("apiKeys"),
    userId: v.id("users"),
    method: v.string(),
    route: v.string(),
    status: v.number(),
    latencyMs: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("apiRequestLog", {
      ...args,
      createdAt: Date.now(),
    });
    return null;
  },
});

export const countActiveApiGenerations = internalQuery({
  args: { apiKeyId: v.id("apiKeys") },
  returns: v.number(),
  handler: async (ctx, args) => {
    const jobs = await ctx.db
      .query("generationJobs")
      .filter((q) =>
        q.and(
          q.eq(q.field("apiKeyId"), args.apiKeyId),
          q.or(
            q.eq(q.field("stage"), "queued"),
            q.eq(q.field("stage"), "generating"),
            q.eq(q.field("stage"), "saving"),
          ),
        ),
      )
      .collect();
    return jobs.length;
  },
});

export const refundTextGenerationForApi = internalMutation({
  args: {
    userId: v.id("users"),
    transactionId: v.id("creditTransactions"),
    reason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const transaction = await ctx.db.get("creditTransactions", args.transactionId);
    if (!transaction || transaction.userId !== args.userId || transaction.amount >= 0) {
      return null;
    }
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
      reason: args.reason ?? "Text generation failed (API)",
      createdAt: now,
    });
    return null;
  },
});

function formatFolder(folder: Doc<"folders">) {
  return {
    id: folder._id,
    name: folder.name,
    icon: folder.icon,
    color: folder.color,
    parentId: folder.parentId,
    sortOrder: folder.sortOrder,
    createdAt: folder.createdAt,
    updatedAt: folder.updatedAt,
  };
}

async function formatAsset(
  ctx: QueryCtx,
  asset: Doc<"assets">,
  expiresUnix: number,
) {
  return {
    id: asset._id,
    folderId: asset.folderId,
    name: asset.name,
    kind: asset.kind,
    mimeType: asset.mimeType,
    byteSize: asset.byteSize,
    url: asset.bunnyPath ? await signBunnyFullUrl(asset.bunnyPath, expiresUnix, asset.kind) : undefined,
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
  };
}

async function requireFolderForUser(
  ctx: QueryCtx,
  userId: Id<"users">,
  folderId: Id<"folders">,
  sandboxFolderId?: Id<"folders">,
) {
  const folder = await ctx.db.get("folders", folderId);
  if (!folder || folder.ownerId !== userId || folder.deletedAt) {
    throw new Error("Folder not found");
  }
  if (sandboxFolderId && !(await isFolderInSandbox(ctx, folderId, sandboxFolderId))) {
    throw new Error("Folder not found");
  }
  return folder;
}

function isSupportedVideoDuration(durationSeconds?: number): boolean {
  const duration = Number(durationSeconds ?? 4);
  return Number.isFinite(duration) && duration >= 4 && duration <= 15;
}

async function hasActiveSubscriptionForUser(
  ctx: QueryCtx,
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

async function referenceFlagsForAssets(
  ctx: QueryCtx,
  userId: Id<"users">,
  assetIds: Id<"assets">[],
  mode: "image" | "video",
  sandboxFolderId: Id<"folders">,
): Promise<{
  hasReferenceInput: boolean;
  hasVideoReferenceInput: boolean;
  hasNonVideoReferenceInput: boolean;
}> {
  if (!assetIds.length) {
    return {
      hasReferenceInput: false,
      hasVideoReferenceInput: false,
      hasNonVideoReferenceInput: false,
    };
  }
  const kinds: Array<Doc<"assets">["kind"]> = [];
  for (const assetId of assetIds) {
    const asset = await ctx.db.get("assets", assetId);
    if (!asset || asset.ownerId !== userId || asset.deletedAt) {
      throw new Error(`Reference asset not found: ${assetId}`);
    }
    if (!(await isFolderInSandbox(ctx, asset.folderId, sandboxFolderId))) {
      throw new Error(`Reference asset not found: ${assetId}`);
    }
    kinds.push(asset.kind);
  }
  if (mode === "image") {
    return {
      hasReferenceInput: kinds.some((kind) => kind === "image"),
      hasVideoReferenceInput: false,
      hasNonVideoReferenceInput: false,
    };
  }
  return {
    hasReferenceInput: kinds.length > 0,
    hasVideoReferenceInput: kinds.some((kind) => kind === "video"),
    hasNonVideoReferenceInput: kinds.some(
      (kind) => kind === "image" || kind === "audio" || kind === "document",
    ),
  };
}

async function formatGenerationJob(
  ctx: QueryCtx,
  job: Doc<"generationJobs">,
  expiresUnix: number,
) {
  const outputs = await ctx.db
    .query("generationOutputs")
    .withIndex("by_job", (q) => q.eq("jobId", job._id))
    .collect();
  outputs.sort((a, b) => a.sortOrder - b.sortOrder);
  const assets = await Promise.all(
    outputs.map(async (output) => {
      const asset = await ctx.db.get("assets", output.assetId);
      if (!asset) {
        throw new Error("Output asset missing");
      }
      return await formatAsset(ctx, asset, expiresUnix);
    }),
  );
  const preset = await ctx.db.get("stylePresets", job.stylePresetId);
  let creditsSpent: number | undefined;
  const txId = job.spentCreditTransactionId ?? job.reservedCreditTransactionId;
  if (txId) {
    const tx = await ctx.db.get("creditTransactions", txId);
    if (tx && tx.amount < 0) {
      creditsSpent = Math.abs(tx.amount);
    }
  }
  return {
    id: job._id,
    threadId: job.threadId,
    status: job.stage,
    mode: job.mode,
    folderId: job.saveFolderId,
    prompt: job.userPrompt,
    error: job.error,
    source: job.source,
    stylePresetSlug: preset?.slug,
    resolvedModel: job.resolvedModel,
    creditsSpent,
    assets,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

async function formatElement(
  ctx: QueryCtx,
  element: Doc<"elements">,
  expiresUnix: number,
) {
  const resolved = await resolveElementAssets(ctx, element);
  const referenceAssets = await Promise.all(
    resolved.referenceAssetIds.map(async (assetId) => {
      const asset = await ctx.db.get("assets", assetId);
      if (!asset || asset.deletedAt) {
        return null;
      }
      return await formatAsset(ctx, asset, expiresUnix);
    }),
  );
  let sheetAsset = null;
  let sheetUrl: string | undefined;
  if (resolved.sheetAssetId) {
    const asset = await ctx.db.get("assets", resolved.sheetAssetId);
    if (asset && !asset.deletedAt) {
      sheetAsset = await formatAsset(ctx, asset, expiresUnix);
      sheetUrl = sheetAsset.url;
    }
  }
  return {
    id: element._id,
    type: element.type,
    name: element.name,
    description: element.description,
    sourceMode: element.sourceMode,
    folderId: element.folderId,
    buildStatus: resolved.buildStatus,
    builtAt: resolved.builtAt,
    referenceAssetIds: resolved.referenceAssetIds,
    referenceAssets: referenceAssets.filter(Boolean),
    sheetAssetId: resolved.sheetAssetId,
    sheetAsset,
    sheetUrl,
    /** @deprecated Upload refs only — use referenceAssetIds */
    sourceAssetIds: resolved.referenceAssetIds,
    /** @deprecated Use referenceAssets */
    sourceAssets: referenceAssets.filter(Boolean),
    sourceDocumentId: element.sourceDocumentId,
    styleRules: element.styleRules,
    renderMode: element.renderMode,
    createdAt: element.createdAt,
    updatedAt: element.updatedAt,
  };
}

async function loadReferenceKinds(
  ctx: QueryCtx,
  userId: Id<"users">,
  assetIds: Id<"assets">[],
  sandboxFolderId: Id<"folders">,
): Promise<Array<Doc<"assets">["kind"]>> {
  const kinds: Array<Doc<"assets">["kind"]> = [];
  for (const assetId of assetIds) {
    const asset = await ctx.db.get("assets", assetId);
    if (!asset || asset.ownerId !== userId || asset.deletedAt) {
      throw new Error(`Reference asset not found: ${assetId}`);
    }
    if (!(await isFolderInSandbox(ctx, asset.folderId, sandboxFolderId))) {
      throw new Error(`Reference asset not found: ${assetId}`);
    }
    kinds.push(asset.kind);
  }
  return kinds;
}
