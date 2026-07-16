"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { transcribeWithDeepgram } from "./lib/deepgram";

/** Max base64 payload (~3MB binary). Short voice notes stay well under this. */
const MAX_AUDIO_BASE64_CHARS = 4_200_000;

export const transcribe = action({
  args: {
    audioBase64: v.string(),
    mimetype: v.string(),
  },
  returns: v.object({
    text: v.string(),
    confidence: v.optional(v.number()),
  }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Sign in to use voice input");
    }

    if (!args.audioBase64 || args.audioBase64.length < 8) {
      throw new Error("No audio detected. Tap mic, speak, then tap again to stop.");
    }
    if (args.audioBase64.length > MAX_AUDIO_BASE64_CHARS) {
      throw new Error("That clip was too long. Try a shorter recording.");
    }

    return await transcribeWithDeepgram({
      audioBase64: args.audioBase64,
      mimetype: args.mimetype,
    });
  },
});
