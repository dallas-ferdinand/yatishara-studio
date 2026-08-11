"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { encryptAgentApiKey, keyHint } from "./lib/agentCrypto";

const provider = v.union(
  v.literal("openai"),
  v.literal("anthropic"),
  v.literal("zai"),
  v.literal("openrouter"),
);

/** Store BYOK — encryption in Node action. */
export const saveMine = action({
  args: {
    provider,
    apiKey: v.string(),
  },
  returns: v.object({ ok: v.literal(true), keyHint: v.string() }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Sign in required");
    const key = args.apiKey.trim();
    if (key.length < 12) throw new Error("API key looks too short");
    const { encryptedKey, iv } = encryptAgentApiKey(key);
    const hint = keyHint(key);
    await ctx.runMutation(api.userAgentKeysInternal.upsertEncrypted, {
      provider: args.provider,
      encryptedKey,
      iv,
      keyHint: hint,
    });
    return { ok: true as const, keyHint: hint };
  },
});
