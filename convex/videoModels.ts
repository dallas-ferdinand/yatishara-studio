import { v } from "convex/values";
import { authedQuery } from "./lib/customFunctions";
import { listVideoModelsPublic } from "./lib/videoModels";

export const list = authedQuery({
  args: {},
  returns: v.array(
    v.object({
      slug: v.union(v.literal("seedance-2.0"), v.literal("kling-3.0-i2v")),
      label: v.string(),
      description: v.string(),
      requiresStartFrame: v.boolean(),
      supportsMultimodalRefs: v.boolean(),
      isDefault: v.boolean(),
    }),
  ),
  handler: async () => listVideoModelsPublic(),
});
