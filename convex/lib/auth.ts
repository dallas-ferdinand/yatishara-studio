import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export type AuthedUser = Doc<"users"> & { _id: Id<"users"> };

export type ApprovedSeller = Doc<"marketplaceSellers"> & {
  _id: Id<"marketplaceSellers">;
};

export async function getCurrentUser(ctx: QueryCtx | MutationCtx): Promise<AuthedUser> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    throw new Error("Not authenticated");
  }
  const user = await ctx.db.get("users", userId);
  if (!user) {
    throw new Error("User not found");
  }
  return user;
}

/** Returns the signed-in user, or null when the request is anonymous. */
export async function getOptionalUser(
  ctx: QueryCtx | MutationCtx,
): Promise<AuthedUser | null> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) return null;
  const user = await ctx.db.get("users", userId);
  return user ?? null;
}

export async function requireAdmin(ctx: QueryCtx | MutationCtx): Promise<AuthedUser> {
  const user = await getCurrentUser(ctx);
  if (user.role !== "admin" && user.role !== "super_admin") {
    throw new Error("Admin access required");
  }
  return user;
}

export function isAdminRole(role: Doc<"users">["role"]): boolean {
  return role === "admin" || role === "super_admin";
}

export async function getMarketplaceSellerForUser(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<ApprovedSeller | null> {
  const seller = await ctx.db
    .query("marketplaceSellers")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  return seller ?? null;
}

export async function requireApprovedSeller(
  ctx: QueryCtx | MutationCtx,
): Promise<{ user: AuthedUser; seller: ApprovedSeller }> {
  const user = await getCurrentUser(ctx);
  const seller = await getMarketplaceSellerForUser(ctx, user._id);
  if (!seller || seller.status !== "approved") {
    throw new Error("Approved marketplace seller access required");
  }
  return { user, seller };
}

/** Same gate as requireApprovedSeller, but for API keys / ForApi (no session). */
export async function requireApprovedSellerForUser(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<{ user: AuthedUser; seller: ApprovedSeller }> {
  const user = await ctx.db.get("users", userId);
  if (!user) {
    throw new Error("User not found");
  }
  const seller = await getMarketplaceSellerForUser(ctx, userId);
  if (!seller || seller.status !== "approved") {
    throw new Error("Approved marketplace seller access required");
  }
  return { user: { ...user, _id: userId }, seller };
}
