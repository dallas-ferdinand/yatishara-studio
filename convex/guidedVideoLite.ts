/**
 * Lightweight Assistance boot queries.
 *
 * Do NOT import guidedVideo.ts / hypermotionWorkflow here — those modules are
 * huge and cold-start past Convex's 1s query budget on self-hosted isolates.
 */
import { v } from "convex/values";
import { authedQuery } from "./lib/customFunctions";
import {
  isGuidedVideoAssistanceEnabled,
  listVideoTypesForUi,
  videoTypeValidator,
} from "./lib/guidedVideoTypes";

export const featureEnabled = authedQuery({
  args: {},
  returns: v.boolean(),
  handler: async () => isGuidedVideoAssistanceEnabled(),
});

export const listVideoTypes = authedQuery({
  args: {},
  returns: v.array(
    v.object({
      slug: videoTypeValidator,
      label: v.string(),
      description: v.string(),
    }),
  ),
  handler: async () => listVideoTypesForUi(),
});
