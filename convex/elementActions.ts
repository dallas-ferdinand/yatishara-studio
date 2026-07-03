"use node";

import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import type { Id } from "./_generated/dataModel";
import { action, type ActionCtx } from "./_generated/server";
import { api } from "./_generated/api";
import { generateElementSheet, generateImage } from "./lib/aiGateway";
import { buildElementSheetImagePrompt } from "./lib/elementSheets";
import { putObject } from "./lib/bunny";

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

const referenceInput = v.object({
  kind: v.union(v.literal("image"), v.literal("video"), v.literal("audio")),
  url: v.string(),
});

const SHEET_IMAGE_RESOLUTION = "2K";
const SHEET_IMAGE_ASPECT_RATIO = "16:9";

export const generateSheet = action({
  args: {
    elementId: v.id("elements"),
    referenceInputs: v.array(referenceInput),
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
    const referenceInputs = args.referenceInputs.filter((input) =>
      /^https?:\/\//i.test(input.url),
    );
    if (!referenceInputs.length && !args.existingNotes?.trim() && !element.description?.trim() && !element.name.trim()) {
      throw new Error("Add reference media or notes before generating a sheet.");
    }

    const transactionId = await ctx.runMutation(chargeTextGenerationRef, {
      folderId: element.folderId,
      imageReferenceCount: referenceInputs.filter((input) => input.kind === "image").length,
      videoReferenceCount: referenceInputs.filter((input) => input.kind === "video").length,
      audioReferenceCount: referenceInputs.filter((input) => input.kind === "audio").length,
    });

    let description: string;
    try {
      description = await generateElementSheet({
        elementType: element.type,
        name: element.name,
        existingNotes: args.existingNotes ?? element.description,
        referenceInputs,
      });
      await ctx.runMutation(api.elements.update, {
        elementId: element._id,
        description,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sheet generation failed";
      await ctx.runMutation(refundTextGenerationRef, {
        transactionId,
        reason: message,
      });
      throw error;
    }

    const sheetAssetId = await generateSheetImage(ctx, {
      element: {
        _id: element._id,
        folderId: element.folderId,
        type: element.type,
        name: element.name,
        sourceAssetIds: element.sourceAssetIds,
      },
      referenceUrls: referenceInputs
        .filter((input) => input.kind === "image")
        .map((input) => input.url),
    });

    return { description, sheetAssetId };
  },
});

/**
 * Generates the multi-angle reference sheet image (clean gray background,
 * no text, one visible face) and attaches it as the element's primary
 * source asset. Notes elements skip this — they are text-only.
 */
async function generateSheetImage(
  ctx: ActionCtx,
  args: {
    element: {
      _id: Id<"elements">;
      folderId: Id<"folders">;
      type: "character" | "prop" | "location" | "doc";
      name: string;
      sourceAssetIds: Id<"assets">[];
    };
    referenceUrls: string[];
  },
): Promise<Id<"assets"> | undefined> {
  const prompt = buildElementSheetImagePrompt({
    type: args.element.type,
    name: args.element.name,
  });
  if (!prompt) return undefined;

  const imageTransactionId = await ctx.runMutation(chargeImageGenerationRef, {
    folderId: args.element.folderId,
    resolution: SHEET_IMAGE_RESOLUTION,
    hasReferenceInput: args.referenceUrls.length > 0,
  });

  try {
    const result = await generateImage({
      prompt,
      aspectRatio: SHEET_IMAGE_ASPECT_RATIO,
      resolution: SHEET_IMAGE_RESOLUTION,
      referenceUrls: args.referenceUrls,
    });
    const image = result.images[0];
    if (!image) {
      throw new Error("Sheet image generation returned no image.");
    }
    const extension = image.mediaType.includes("jpeg")
      ? "jpg"
      : image.mediaType.includes("webp")
        ? "webp"
        : "png";
    const safeName = args.element.name.trim().replace(/[^a-zA-Z0-9._-]/g, "_") || "element";
    const created: { assetId: Id<"assets">; bunnyPath: string } = await ctx.runMutation(
      api.elements.createSheetAsset,
      {
        elementId: args.element._id,
        name: `${safeName}-sheet.${extension}`,
        mimeType: image.mediaType,
      },
    );
    await putObject({
      path: created.bunnyPath,
      body: image.data,
      contentType: image.mediaType,
    });
    await ctx.runMutation(api.elements.update, {
      elementId: args.element._id,
      sourceAssetIds: [created.assetId, ...args.element.sourceAssetIds],
    });
    return created.assetId;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sheet image generation failed";
    await ctx.runMutation(refundTextGenerationRef, {
      transactionId: imageTransactionId,
      reason: message,
    });
    throw error;
  }
}
