import { v } from "convex/values";
import { authedQuery } from "./lib/customFunctions";
import { listVideoModelsPublic, videoPricingModelFromGatewayId } from "./lib/videoModels";
import {
  videoCreditCost,
} from "./lib/generationPricing";

export const list = authedQuery({
  args: {},
  returns: v.array(
    v.object({
      slug: v.union(
        v.literal("seedance-2.0"),
        v.literal("google-omni-flash"),
        v.literal("kling-3.0-i2v"),
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
      creditsPer5sBlock720p: videoCreditCost({
        resolution: "1280x720",
        durationSeconds: 5,
        videoModel: model.slug,
        audioEnabled: false,
      }),
      creditsPer5sBlock1080p: videoCreditCost({
        resolution: "1920x1080",
        durationSeconds: 5,
        videoModel: model.slug,
        audioEnabled: false,
      }),
    })),
});
