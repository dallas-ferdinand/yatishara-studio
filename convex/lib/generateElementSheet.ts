import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { generateImage } from "./aiGateway";
import { buildElementSheetImagePrompt } from "./elementSheets";
import { imageCreditCost } from "./generationPricing";
import { putObject } from "./bunny";

export const SHEET_IMAGE_ASPECT_RATIO = "16:9";

export type ElementSheetTarget = {
  _id: Id<"elements">;
  folderId: Id<"folders">;
  type: "character" | "prop" | "location" | "doc";
  name: string;
  description?: string;
  sourceMode?: "photographic" | "designed";
  referenceAssetIds: Id<"assets">[];
};

export type GenerateElementSheetImageResult = {
  assetId: Id<"assets">;
  creditsSpent: number;
};

type ChargeImage = (args: {
  folderId: Id<"folders">;
  resolution: string;
  hasReferenceInput: boolean;
}) => Promise<{ transactionId: Id<"creditTransactions">; creditsSpent: number }>;

type RefundCredit = (args: {
  transactionId: Id<"creditTransactions">;
  reason?: string;
}) => Promise<null>;

type CreateSheetAsset = (args: {
  elementId: Id<"elements">;
  name: string;
  mimeType: string;
}) => Promise<{ assetId: Id<"assets">; bunnyPath: string }>;

type SetBuiltSheet = (args: {
  elementId: Id<"elements">;
  sheetAssetId: Id<"assets">;
}) => Promise<void>;

/**
 * Generates the multi-angle reference sheet image (clean gray background,
 * no text) and attaches it as the element's sheet asset (built state).
 * Upload reference photos stay on referenceAssetIds — not used in generation.
 */
export async function generateElementSheetImage(
  ctx: ActionCtx,
  args: {
    element: ElementSheetTarget;
    referenceUrls: string[];
    resolution?: "1K" | "2K";
    chargeImage: ChargeImage;
    refundCredit: RefundCredit;
    createSheetAsset: CreateSheetAsset;
    setBuiltSheet: SetBuiltSheet;
  },
): Promise<GenerateElementSheetImageResult> {
  const resolution = args.resolution ?? "2K";
  const sourceMode = args.element.sourceMode ?? "photographic";
  const prompt = buildElementSheetImagePrompt({
    type: args.element.type,
    name: args.element.name,
    description: args.element.description,
    sourceMode,
  });
  if (!prompt) {
    throw new Error("Element type does not support sheet image generation.");
  }

  const { transactionId, creditsSpent } = await args.chargeImage({
    folderId: args.element.folderId,
    resolution,
    hasReferenceInput: args.referenceUrls.length > 0,
  });

  try {
    const result = await generateImage({
      prompt,
      aspectRatio: SHEET_IMAGE_ASPECT_RATIO,
      resolution,
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
    const created = await args.createSheetAsset({
      elementId: args.element._id,
      name: `${safeName}-sheet.${extension}`,
      mimeType: image.mediaType,
    });
    await putObject({
      path: created.bunnyPath,
      body: image.data,
      contentType: image.mediaType,
    });
    await args.setBuiltSheet({
      elementId: args.element._id,
      sheetAssetId: created.assetId,
    });
    return { assetId: created.assetId, creditsSpent };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sheet image generation failed";
    await args.refundCredit({ transactionId, reason: message });
    throw error;
  }
}

export function sheetImageCreditEstimate(args: {
  resolution?: "1K" | "2K";
  hasReferenceInput?: boolean;
}): number {
  return imageCreditCost({
    resolution: args.resolution ?? "2K",
    hasReferenceInput: args.hasReferenceInput,
  });
}
