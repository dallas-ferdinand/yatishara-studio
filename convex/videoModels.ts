import { v } from "convex/values";
import { authedQuery } from "./lib/customFunctions";
import { listVideoModelsPublic, videoPricingModelFromGatewayId } from "./lib/videoModels";
import {
  KLING_VIDEO_BASE_CREDITS_PER_BLOCK,
  SEEDANCE_VIDEO_BASE_CREDITS_PER_BLOCK,
  VEO_VIDEO_BASE_CREDITS_PER_BLOCK,
  videoCreditCost,
} from "./lib/generationPricing";

export const list = authedQuery({
  args: {},
  returns: v.array(
    v.object({
      slug: v.union(
        v.literal("seedance-2.0"),
        v.literal("kling-3.0-i2v"),
        v.literal("veo-3.1"),
      ),
      label: v.string(),
      description: v.string(),
      requiresStartFrame: v.boolean(),
      supportsMultimodalRefs: v.boolean(),
      isDefault: v.boolean(),
      creditsPer5sBlock720p: v.number(),
      creditsPer5sBlock1080p: v.number(),
    }),
  ),
  handler: async () =>
    listVideoModelsPublic({ uiOnly: true }).map((model) => ({
      ...model,
      creditsPer5sBlock720p:
        model.slug === "kling-3.0-i2v"
          ? KLING_VIDEO_BASE_CREDITS_PER_BLOCK["1280x720"]
          : model.slug === "veo-3.1"
            ? VEO_VIDEO_BASE_CREDITS_PER_BLOCK["1280x720"]
            : SEEDANCE_VIDEO_BASE_CREDITS_PER_BLOCK["1280x720"],
      creditsPer5sBlock1080p:
        model.slug === "kling-3.0-i2v"
          ? KLING_VIDEO_BASE_CREDITS_PER_BLOCK["1920x1080"]
          : model.slug === "veo-3.1"
            ? VEO_VIDEO_BASE_CREDITS_PER_BLOCK["1920x1080"]
            : SEEDANCE_VIDEO_BASE_CREDITS_PER_BLOCK["1920x1080"],
    })),
});
