"use node";

import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import type { Id } from "./_generated/dataModel";
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { improveMessageDraft } from "./lib/aiGateway";
import { textCreditCost } from "./lib/generationPricing";

const MAX_IMPROVE_CHARS = 4000;

const chargeTextGenerationRef = makeFunctionReference<
  "mutation",
  {
    folderId: Id<"folders">;
    inputTokens: number;
    outputTokens: number;
  },
  Id<"creditTransactions">
>("generation:chargeTextGeneration");

/**
 * Polish a DM composer draft (instruction or spelling/grammar).
 * Charges from measured gateway tokens after the model returns.
 */
export const improveDraft = action({
  args: {
    text: v.string(),
  },
  returns: v.object({
    text: v.string(),
    creditsSpent: v.number(),
  }),
  handler: async (ctx, args) => {
    const draft = args.text.trim();
    if (!draft) {
      throw new Error("Type a message first");
    }
    if (draft.length > MAX_IMPROVE_CHARS) {
      throw new Error("Message is too long to improve");
    }

    const affordability = await ctx.runQuery(
      api.generation.assertTextGenerationAffordable,
      {},
    );
    if (!affordability.ok) {
      throw new Error("You need a small credit balance to improve text. Top up to continue.");
    }

    const folderId = await ctx.runMutation(
      api.folders.ensureMessagesFolderForMe,
      {},
    );
    const improved = await improveMessageDraft(draft);
    const creditsSpent = textCreditCost({
      inputTokens: improved.usage.inputTokens ?? 0,
      outputTokens: improved.usage.outputTokens ?? 0,
    });
    await ctx.runMutation(chargeTextGenerationRef, {
      folderId,
      inputTokens: improved.usage.inputTokens ?? 0,
      outputTokens: improved.usage.outputTokens ?? 0,
    });
    return { text: improved.text, creditsSpent };
  },
});
