"use node";

import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import type { Id } from "./_generated/dataModel";
import { action, type ActionCtx } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { generateElementSheet } from "./lib/aiGateway";
import { assertSheetGenerationReady, inferElementSourceMode } from "./lib/elementSheetGuides";
import {
  generateElementSheetImage,
  sheetImageCreditEstimate,
} from "./lib/generateElementSheet";
import { imageCreditCost } from "./lib/generationPricing";
import { referenceInputValidator } from "./lib/referenceInput";

const chargeTextGenerationRef = makeFunctionReference<
  "mutation",
  {
    folderId: Id<"folders">;
    imageReferenceCount?: number;
    videoReferenceCount?: number;
    audioReferenceCount?: number;
  },
  Id<"creditTransactions">
>("generation:chargeTextGeneration");

const chargeImageGenerationRef = makeFunctionReference<
  "mutation",
  {
    folderId: Id<"folders">;
    resolution?: string;
    hasReferenceInput?: boolean;
  },
  Id<"creditTransactions">
>("generation:chargeImageGeneration");

const refundTextGenerationRef = makeFunctionReference<
  "mutation",
  {
    transactionId: Id<"creditTransactions">;
    reason?: string;
  },
  null
>("generation:refundTextGeneration");

function uiSheetCallbacks(ctx: ActionCtx) {
  return {
    chargeImage: async (args: {
      folderId: Id<"folders">;
      resolution: string;
      hasReferenceInput: boolean;
    }) => {
      const transactionId = await ctx.runMutation(chargeImageGenerationRef, {
        folderId: args.folderId,
        resolution: args.resolution,
        hasReferenceInput: args.hasReferenceInput,
      });
      return {
        transactionId,
        creditsSpent: imageCreditCost({
          resolution: args.resolution,
          hasReferenceInput: args.hasReferenceInput,
        }),
      };
    },
    refundCredit: async (args: {
      transactionId: Id<"creditTransactions">;
      reason?: string;
    }) => ctx.runMutation(refundTextGenerationRef, args),
    createSheetAsset: async (args: {
      elementId: Id<"elements">;
      name: string;
      mimeType: string;
    }) => ctx.runMutation(api.elements.createSheetAsset, args),
    setBuiltSheet: async (args: {
      elementId: Id<"elements">;
      sheetAssetId: Id<"assets">;
    }) => {
      await ctx.runMutation(api.elements.setBuiltSheet, args);
    },
  };
}

function apiSheetCallbacks(ctx: ActionCtx, userId: Id<"users">) {
  return {
    chargeImage: async (args: {
      folderId: Id<"folders">;
      resolution: string;
      hasReferenceInput: boolean;
    }) =>
      ctx.runMutation(internal.generation.chargeImageForUser, {
        userId,
        folderId: args.folderId,
        resolution: args.resolution,
        hasReferenceInput: args.hasReferenceInput,
      }),
    refundCredit: async (args: {
      transactionId: Id<"creditTransactions">;
      reason?: string;
    }) =>
      ctx.runMutation(internal.generation.refundCreditTransactionForUser, {
        userId,
        transactionId: args.transactionId,
        reason: args.reason,
      }),
    createSheetAsset: async (args: {
      elementId: Id<"elements">;
      name: string;
      mimeType: string;
    }) =>
      ctx.runMutation(internal.elements.createSheetAssetForUser, {
        userId,
        ...args,
      }),
    setBuiltSheet: async (args: {
      elementId: Id<"elements">;
      sheetAssetId: Id<"assets">;
    }) => {
      await ctx.runMutation(internal.elements.setBuiltSheetForUser, {
        userId,
        ...args,
      });
    },
  };
}

async function generateElementTextSheetCore(
  ctx: ActionCtx,
  args: {
    elementId: Id<"elements">;
    referenceInputs: Array<{ kind: "image" | "video" | "audio"; url: string; mimeType?: string }>;
    existingNotes?: string;
  },
): Promise<string> {
  const element = await ctx.runQuery(api.elements.get, {
    elementId: args.elementId,
  });
  if (!element) {
    throw new Error("Element not found.");
  }
  if (!element.folderId) {
    throw new Error("Element must live in a folder before generating a sheet.");
  }
  const referenceInputs = args.referenceInputs.filter((input) =>
    /^https?:\/\//i.test(input.url),
  );
  const imageRefCount = referenceInputs.filter((input) => input.kind === "image").length;
  const sourceMode =
    element.sourceMode ??
    inferElementSourceMode({
      type: element.type,
      imageRefCount,
    });
  assertSheetGenerationReady({
    type: element.type,
    imageRefCount,
    sourceMode,
    description: args.existingNotes ?? element.description,
  });
  if (
    sourceMode === "photographic" &&
    !referenceInputs.length &&
    !args.existingNotes?.trim() &&
    !element.description?.trim() &&
    !element.name.trim()
  ) {
    throw new Error("Add reference media or notes before generating a sheet.");
  }

  const transactionId = await ctx.runMutation(chargeTextGenerationRef, {
    folderId: element.folderId,
    imageReferenceCount: referenceInputs.filter((input) => input.kind === "image").length,
    videoReferenceCount: referenceInputs.filter((input) => input.kind === "video").length,
    audioReferenceCount: referenceInputs.filter((input) => input.kind === "audio").length,
  });

  try {
    const description = await generateElementSheet({
      elementType: element.type,
      name: element.name,
      existingNotes: args.existingNotes ?? element.description,
      referenceInputs,
    });
    await ctx.runMutation(api.elements.update, {
      elementId: element._id,
      description,
    });
    return description;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sheet generation failed";
    await ctx.runMutation(refundTextGenerationRef, {
      transactionId,
      reason: message,
    });
    throw error;
  }
}

export const generateSheet = action({
  args: {
    elementId: v.id("elements"),
    referenceInputs: v.array(referenceInputValidator),
    existingNotes: v.optional(v.string()),
  },
  returns: v.object({
    description: v.string(),
    sheetAssetId: v.optional(v.id("assets")),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ description: string; sheetAssetId?: Id<"assets"> }> => {
    const element = await ctx.runQuery(api.elements.get, {
      elementId: args.elementId,
    });
    if (!element) {
      throw new Error("Element not found.");
    }
    if (!element.folderId) {
      throw new Error("Element must live in a folder before generating a sheet.");
    }

    const description = await generateElementTextSheetCore(ctx, {
      elementId: args.elementId,
      referenceInputs: args.referenceInputs,
      existingNotes: args.existingNotes,
    });

    // Notes (doc) elements are text-only — no sheet image to build.
    if (element.type === "doc") {
      return { description };
    }

    const resolved = await ctx.runQuery(internal.studioApiInternal.resolveElementAssetsForUser, {
      userId: element.ownerId,
      elementId: element._id,
    });

    const callbacks = uiSheetCallbacks(ctx);
    const sheetResult = await generateElementSheetImage(ctx, {
      element: {
        _id: element._id,
        folderId: element.folderId,
        type: element.type,
        name: element.name,
        referenceAssetIds: resolved.referenceAssetIds,
      },
      referenceUrls: args.referenceInputs
        .filter((input) => input.kind === "image")
        .map((input) => input.url),
      ...callbacks,
    });

    return { description, sheetAssetId: sheetResult.assetId };
  },
});

export const generateElementTextSheetForApi = action({
  args: {
    userId: v.id("users"),
    sandboxFolderId: v.id("folders"),
    elementId: v.id("elements"),
    referenceAssetIds: v.optional(v.array(v.id("assets"))),
    expiresUnix: v.number(),
  },
  returns: v.object({
    elementId: v.id("elements"),
    description: v.string(),
  }),
  handler: async (ctx, args) => {
    const element = await ctx.runQuery(internal.studioApiInternal.getElementForApi, {
      userId: args.userId,
      sandboxFolderId: args.sandboxFolderId,
      elementId: args.elementId,
      expiresUnix: args.expiresUnix,
    });
    if (element.type === "doc") {
      throw new Error("Doc elements do not support text sheet generation.");
    }
    if (!element.folderId) {
      throw new Error("Element must live in a folder before generating a sheet.");
    }

    const referenceAssetIds = (args.referenceAssetIds ??
      element.referenceAssetIds) as Id<"assets">[];
    const imageRefCount = await ctx.runQuery(
      internal.studioApiInternal.countImageAssetsForApi,
      {
        userId: args.userId,
        sandboxFolderId: args.sandboxFolderId,
        assetIds: referenceAssetIds,
      },
    );
    assertSheetGenerationReady({
      type: element.type,
      imageRefCount,
      sourceMode:
        element.sourceMode ??
        inferElementSourceMode({
          type: element.type,
          imageRefCount,
        }),
      description: element.description,
    });

    const refs = referenceAssetIds.length
      ? await ctx.runQuery(internal.studioApiInternal.getAssetReferenceUrls, {
          userId: args.userId,
          sandboxFolderId: args.sandboxFolderId,
          assetIds: referenceAssetIds,
          expiresUnix: args.expiresUnix,
        })
      : [];

    const referenceInputs = refs
      .filter((ref: { kind: string; url: string }) => /^https?:\/\//i.test(ref.url))
      .map((ref: { kind: string; url: string; mimeType: string }) => ({
        kind: ref.kind as "image" | "video" | "audio",
        url: ref.url,
        mimeType: ref.mimeType,
      }));

    if (
      !referenceInputs.length &&
      !element.description?.trim() &&
      !element.name.trim()
    ) {
      throw new Error("Add reference media or notes before generating a sheet.");
    }

    const { transactionId } = await ctx.runMutation(
      internal.studioApiInternal.chargeTextGenerationForApi,
      {
        userId: args.userId,
        sandboxFolderId: args.sandboxFolderId,
        folderId: element.folderId as Id<"folders">,
        imageReferenceCount: referenceInputs.filter((input) => input.kind === "image").length,
        videoReferenceCount: referenceInputs.filter((input) => input.kind === "video").length,
        audioReferenceCount: referenceInputs.filter((input) => input.kind === "audio").length,
      },
    );

    let description: string;
    try {
      description = await generateElementSheet({
        elementType: element.type,
        name: element.name,
        existingNotes: element.description,
        referenceInputs,
      });
      await ctx.runMutation(internal.studioApiInternal.updateElementForApi, {
        userId: args.userId,
        sandboxFolderId: args.sandboxFolderId,
        elementId: args.elementId,
        description,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Text sheet generation failed";
      await ctx.runMutation(internal.generation.refundCreditTransactionForUser, {
        userId: args.userId,
        transactionId,
        reason: message,
      });
      throw error;
    }

    return {
      elementId: args.elementId,
      description,
    };
  },
});

export const generateElementSheetForApi = action({
  args: {
    userId: v.id("users"),
    sandboxFolderId: v.id("folders"),
    elementId: v.id("elements"),
    referenceAssetIds: v.optional(v.array(v.id("assets"))),
    referenceElementIds: v.optional(v.array(v.id("elements"))),
    sourceMode: v.optional(v.union(v.literal("photographic"), v.literal("designed"))),
    resolution: v.optional(v.union(v.literal("1K"), v.literal("2K"))),
    expiresUnix: v.number(),
  },
  returns: v.object({
    assetId: v.id("assets"),
    elementId: v.id("elements"),
    sheetUrl: v.string(),
    creditsSpent: v.number(),
    buildStatus: v.union(v.literal("unbuilt"), v.literal("built")),
  }),
  handler: async (ctx, args): Promise<{
    assetId: Id<"assets">;
    elementId: Id<"elements">;
    sheetUrl: string;
    creditsSpent: number;
    buildStatus: "unbuilt" | "built";
  }> => {
    const element = await ctx.runQuery(internal.studioApiInternal.getElementForApi, {
      userId: args.userId,
      sandboxFolderId: args.sandboxFolderId,
      elementId: args.elementId,
      expiresUnix: args.expiresUnix,
    });
    if (element.type === "doc") {
      throw new Error("Doc elements do not support sheet image generation.");
    }
    if (!element.folderId) {
      throw new Error("Element must live in a folder before generating a sheet.");
    }

    const referenceAssetIds = (args.referenceAssetIds ??
      element.referenceAssetIds) as Id<"assets">[];
    const imageRefCount = await ctx.runQuery(
      internal.studioApiInternal.countImageAssetsForApi,
      {
        userId: args.userId,
        sandboxFolderId: args.sandboxFolderId,
        assetIds: referenceAssetIds,
      },
    );
    const sourceMode =
      args.sourceMode ??
      element.sourceMode ??
      inferElementSourceMode({
        type: element.type,
        imageRefCount,
      });
    assertSheetGenerationReady({
      type: element.type,
      imageRefCount,
      sourceMode,
      description: element.description,
    });

    const refs = referenceAssetIds.length
      ? await ctx.runQuery(internal.studioApiInternal.getAssetReferenceUrls, {
          userId: args.userId,
          sandboxFolderId: args.sandboxFolderId,
          assetIds: referenceAssetIds,
          expiresUnix: args.expiresUnix,
        })
      : [];
    let referenceUrls = refs
      .filter((ref: { kind: string; url: string }) => ref.kind === "image")
      .map((ref: { url: string }) => ref.url);

    if (args.referenceElementIds?.length) {
      const composed = await ctx.runQuery(
        internal.studioApiInternal.resolveReferenceElementIds,
        {
          userId: args.userId,
          sandboxFolderId: args.sandboxFolderId,
          elementIds: args.referenceElementIds,
        },
      );
      const elementSheetUrls = await ctx.runQuery(
        internal.studioApiInternal.getAssetReferenceUrls,
        {
          userId: args.userId,
          sandboxFolderId: args.sandboxFolderId,
          assetIds: composed.referenceAssetIds,
          expiresUnix: args.expiresUnix,
        },
      );
      referenceUrls = [
        ...referenceUrls,
        ...elementSheetUrls
          .filter((ref: { kind: string; url: string }) => ref.kind === "image")
          .map((ref: { url: string }) => ref.url),
      ];
    }

    const callbacks = apiSheetCallbacks(ctx, args.userId);
    const result = await generateElementSheetImage(ctx, {
      element: {
        _id: args.elementId,
        folderId: element.folderId as Id<"folders">,
        type: element.type,
        name: element.name,
        description: element.description,
        sourceMode,
        referenceAssetIds,
      },
      referenceUrls,
      resolution: args.resolution,
      ...callbacks,
    });

    const asset = await ctx.runQuery(internal.studioApiInternal.getAsset, {
      userId: args.userId,
      sandboxFolderId: args.sandboxFolderId,
      assetId: result.assetId,
      expiresUnix: args.expiresUnix,
    });
    if (!asset?.url) {
      throw new Error("Sheet asset URL unavailable.");
    }

    return {
      assetId: result.assetId,
      elementId: args.elementId,
      sheetUrl: asset.url,
      creditsSpent: result.creditsSpent,
      buildStatus: "built",
    };
  },
});

export { sheetImageCreditEstimate };
