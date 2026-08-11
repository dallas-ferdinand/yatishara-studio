"use node";

import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import type { Id } from "./_generated/dataModel";
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { enhanceComposerPrompt } from "./lib/composerEnhance";
import { textCreditCost } from "./lib/generationPricing";

const chargeTextGenerationRef = makeFunctionReference<
  "mutation",
  {
    folderId: Id<"folders">;
    inputTokens: number;
    outputTokens: number;
    textModel?: "turbo" | "pro" | "lite" | "mini";
  },
  Id<"creditTransactions">
>("generation:chargeTextGeneration");

const enhanceKind = v.union(
  v.literal("video"),
  v.literal("image"),
  v.literal("voiceover"),
  v.literal("sfx"),
  v.literal("music"),
);

/**
 * Charged in-composer Enhance. Rewrites prompt in place; never starts generation.
 */
export const enhanceComposerDraft = action({
  args: {
    kind: enhanceKind,
    text: v.string(),
    folderId: v.optional(v.id("folders")),
  },
  returns: v.object({
    text: v.string(),
    creditsSpent: v.number(),
  }),
  handler: async (ctx, args) => {
    const affordability = await ctx.runQuery(
      api.generation.assertTextGenerationAffordable,
      {},
    );
    if (!affordability.ok) {
      throw new Error(
        "You need a small credit balance to enhance prompts. Top up to continue.",
      );
    }

    const folderId =
      args.folderId ??
      (await ctx.runMutation(api.folders.ensureMessagesFolderForMe, {}));

    const enhanced = await enhanceComposerPrompt({
      kind: args.kind,
      text: args.text,
    });
    const creditsSpent = textCreditCost({
      inputTokens: enhanced.usage.inputTokens ?? 0,
      outputTokens: enhanced.usage.outputTokens ?? 0,
      textModel: "turbo",
    });
    await ctx.runMutation(chargeTextGenerationRef, {
      folderId,
      inputTokens: enhanced.usage.inputTokens ?? 0,
      outputTokens: enhanced.usage.outputTokens ?? 0,
      textModel: "turbo",
    });
    return { text: enhanced.text, creditsSpent };
  },
});
