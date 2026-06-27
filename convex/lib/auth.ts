import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export type AuthedUser = Doc<"users"> & { _id: Id<"users"> };

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
