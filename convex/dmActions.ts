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
    imageReferenceCount?: number;
    videoReferenceCount?: number;
    audioReferenceCount?: number;
  },
  Id<"creditTransactions">
>("generation:chargeTextGeneration");

const refundTextGenerationRef = makeFunctionReference<
  "mutation",
  {
    transactionId: Id<"creditTransactions">;
    reason?: string;
  },
  null
>("generation:refundTextGeneration");

/**
 * Polish a DM composer draft (instruction or spelling/grammar).
 * Charges the same text-generation floor as other Studio text work.
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

    const folderId = await ctx.runMutation(
      api.folders.ensureMessagesFolderForMe,
      {},
    );
    const creditsSpent = textCreditCost({});
    const transactionId = await ctx.runMutation(chargeTextGenerationRef, {
      folderId,
    });
    try {
      const text = await improveMessageDraft(draft);
      return { text, creditsSpent };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not improve that text";
      await ctx.runMutation(refundTextGenerationRef, {
        transactionId,
        reason: message,
      });
      throw new Error(message);
    }
  },
});
