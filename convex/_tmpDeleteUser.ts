import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * TEMPORARY one-off: hard-delete a phone-only Studio account and its rows.
 * Remove this file after running.
 */
export const purgePhoneUser = internalMutation({
  args: { phone: v.string() },
  returns: v.object({
    deleted: v.boolean(),
    userId: v.optional(v.string()),
    counts: v.record(v.string(), v.number()),
  }),
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phone", args.phone))
      .unique();
    if (!user) return { deleted: false, counts: {} };
    const uid = user._id;
    const counts: Record<string, number> = {};

    const del = async (id: any) => {
      await ctx.db.delete(id);
    };

    // billingAccounts (by_user)
    const billing = await ctx.db
      .query("billingAccounts")
      .withIndex("by_user", (q) => q.eq("userId", uid))
      .collect();
    for (const b of billing) await del(b._id);
    counts.billingAccounts = billing.length;

    // folders (by_owner)
    const folders = await ctx.db
      .query("folders")
      .withIndex("by_owner", (q) => q.eq("ownerId", uid))
      .collect();
    for (const f of folders) await del(f._id);
    counts.folders = folders.length;

    // whatsappAuthRequests (by phone)
    const waReqs = await ctx.db
      .query("whatsappAuthRequests")
      .withIndex("by_phone_and_created", (q) => q.eq("phone", args.phone))
      .collect();
    for (const r of waReqs) await del(r._id);
    counts.whatsappAuthRequests = waReqs.length;

    // Convex Auth sessions + their refresh tokens (no user index → scan)
    const sessions = (await ctx.db.query("authSessions").collect()).filter(
      (s: any) => s.userId === uid,
    );
    let refreshDeleted = 0;
    for (const s of sessions) {
      const tokens = (await ctx.db.query("authRefreshTokens").collect()).filter(
        (t: any) => t.sessionId === s._id,
      );
      for (const t of tokens) {
        await del(t._id);
        refreshDeleted += 1;
      }
      await del(s._id);
    }
    counts.authSessions = sessions.length;
    counts.authRefreshTokens = refreshDeleted;

    // Convex Auth accounts (if any)
    const accounts = (await ctx.db.query("authAccounts").collect()).filter(
      (a: any) => a.userId === uid,
    );
    for (const a of accounts) await del(a._id);
    counts.authAccounts = accounts.length;

    await del(uid);
    counts.users = 1;

    return { deleted: true, userId: uid, counts };
  },
});
