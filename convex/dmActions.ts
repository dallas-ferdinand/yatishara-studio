"use node";

import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import type { Id } from "./_generated/dataModel";
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { improveMessageDraft } from "./lib/aiGateway";
import { textCreditCost } from "./lib/generationPricing";

const MAX_IMPROVE_CHARS = 4000;
const MAX_IMPROVE_IMAGES = 4;

const chargeTextGenerationRef = makeFunctionReference<
  "mutation",
  {
    folderId: Id<"folders">;
    inputTokens: number;
    outputTokens: number;
  },
  Id<"creditTransactions">
>("generation:chargeTextGeneration");

const replyContextValidator = v.object({
  kind: v.string(),
  body: v.string(),
  fromMe: v.boolean(),
  imageUrl: v.optional(v.string()),
});

/**
 * Polish a DM composer draft with intent/context awareness, or draft a reply
 * from reply-to / photo context when the composer is empty or tone-only.
 * Charges from measured gateway tokens after the model returns.
 */
export const improveDraft = action({
  args: {
    text: v.string(),
    replyContext: v.optional(replyContextValidator),
    imageUrls: v.optional(v.array(v.string())),
    attachedPhotoCount: v.optional(v.number()),
  },
  returns: v.object({
    text: v.string(),
    creditsSpent: v.number(),
  }),
  handler: async (ctx, args) => {
    const draft = args.text.trim();
    const reply = args.replyContext
      ? {
          kind: args.replyContext.kind.trim() || "text",
          body: args.replyContext.body,
          fromMe: args.replyContext.fromMe,
          imageUrl: args.replyContext.imageUrl?.trim() || undefined,
        }
      : undefined;
    const imageUrls = (args.imageUrls ?? [])
      .map((url) => url.trim())
      .filter((url) => /^https?:\/\//i.test(url))
      .filter((url, index, all) => all.indexOf(url) === index)
      .slice(0, MAX_IMPROVE_IMAGES);
    const attachedPhotoCount = Math.max(
      0,
      Math.min(20, Math.floor(args.attachedPhotoCount ?? 0)),
    );
    const hasContext = Boolean(
      reply || imageUrls.length > 0 || attachedPhotoCount > 0,
    );
    if (!draft && !hasContext) {
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
      throw new Error(
        "You need a small credit balance to improve text. Top up to continue.",
      );
    }

    const folderId = await ctx.runMutation(
      api.folders.ensureMessagesFolderForMe,
      {},
    );
    const improved = await improveMessageDraft({
      text: draft,
      replyContext: reply,
      imageUrls,
      attachedPhotoCount,
    });
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
