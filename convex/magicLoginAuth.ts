/**
 * One-time Studio login links — 5 min TTL, consume on first successful sign-in.
 */
import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import { makeFunctionReference, type FunctionReference } from "convex/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";

export const MAGIC_LINK_PROVIDER = "magic-link";
export const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;

type ConsumeArgs = { token: string };
type ConsumeReturn = { userId: Id<"users"> } | null;

const consumeMagicLoginTokenRef = makeFunctionReference<
  "mutation",
  ConsumeArgs,
  ConsumeReturn
>("magicLoginAuth:consumeMagicLoginToken") as unknown as FunctionReference<
  "mutation",
  "internal",
  ConsumeArgs,
  ConsumeReturn
>;

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashMagicToken(raw: string): Promise<string> {
  return sha256Hex(`magic:${String(raw || "").trim()}`);
}

/**
 * Mark pending token consumed and return userId for Convex Auth session.
 * Expires unused tokens; rejects already-used links.
 */
export const consumeMagicLoginToken = internalMutation({
  args: { token: v.string() },
  returns: v.union(v.object({ userId: v.id("users") }), v.null()),
  handler: async (ctx, args) => {
    const raw = String(args.token || "").trim();
    if (!raw || raw.length < 32) return null;
    const tokenHash = await hashMagicToken(raw);
    const row = await ctx.db
      .query("magicLoginTokens")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", tokenHash))
      .unique();
    const now = Date.now();
    if (!row) return null;
    if (row.status !== "pending") return null;
    if (row.expiresAt <= now) {
      await ctx.db.patch(row._id, { status: "expired" });
      return null;
    }
    const user = await ctx.db.get(row.userId);
    if (!user) {
      await ctx.db.patch(row._id, { status: "expired", consumedAt: now });
      return null;
    }
    // Single-use: consume before session is issued.
    await ctx.db.patch(row._id, { status: "consumed", consumedAt: now });
    return { userId: row.userId as Id<"users"> };
  },
});

export const MagicLink = ConvexCredentials({
  id: MAGIC_LINK_PROVIDER,
  authorize: async (credentials, ctx) => {
    if (typeof credentials.token !== "string") return null;
    return await ctx.runMutation(consumeMagicLoginTokenRef, {
      token: credentials.token,
    });
  },
});
