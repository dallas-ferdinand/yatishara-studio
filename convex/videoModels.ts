import { v } from "convex/values";
import { authedQuery } from "./lib/customFunctions";
import { listVideoModelsPublic } from "./lib/videoModels";
import { videoCreditCost } from "./lib/generationPricing";

const resolutionOption = v.object({
  value: v.string(),
  label: v.string(),
  meta: v.string(),
  gatewayLabel: v.union(
    v.literal("480p"),
    v.literal("720p"),
    v.literal("1080p"),
    v.literal("4k"),
  ),
});

export const list = authedQuery({
  args: {},
  returns: v.array(
    v.object({
      slug: v.union(
        v.literal("seedance-2.5"),
        v.literal("seedance-2.0"),
        v.literal("google-omni-flash"),
        v.literal("kling-3.0-i2v"),
      ),
      label: v.string(),
      description: v.string(),
      requiresStartFrame: v.boolean(),
      supportsMultimodalRefs: v.boolean(),
      maxDurationSeconds: v.number(),
      isDefault: v.boolean(),
      resolutionOptions: v.array(resolutionOption),
      durationPresets: v.array(v.number()),
      creditsPer5sBlock480p: v.number(),
      creditsPer5sBlock720p: v.number(),
      creditsPer5sBlock1080p: v.number(),
      creditsPer5sBlock4k: v.number(),
    }),
  ),
  handler: async () =>
    listVideoModelsPublic({ uiOnly: true }).map((model) => ({
      slug: model.slug,
      label: model.label,
      description: model.description,
      requiresStartFrame: model.requiresStartFrame,
      supportsMultimodalRefs: model.supportsMultimodalRefs,
      maxDurationSeconds: model.maxDurationSeconds,
      isDefault: model.isDefault,
      resolutionOptions: model.resolutionOptions,
      durationPresets: model.durationPresets,
      creditsPer5sBlock480p: videoCreditCost({
        resolution: "854x480",
        durationSeconds: 5,
        videoModel: model.slug,
        audioEnabled: false,
      }),
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
      creditsPer5sBlock4k: videoCreditCost({
        resolution: "3840x2160",
        durationSeconds: 5,
        videoModel: model.slug,
        audioEnabled: false,
      }),
    })),
});
