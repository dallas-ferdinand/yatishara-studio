import {
  convexAuth,
  type AuthProviderMaterializedConfig,
} from "@convex-dev/auth/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { ResendOTP } from "./ResendOTP";

async function createOrUpdateUser(
  ctx: MutationCtx,
  args: {
    existingUserId: Id<"users"> | null;
    type: "oauth" | "credentials" | "email" | "phone" | "verification";
    provider: AuthProviderMaterializedConfig;
    profile: Record<string, unknown> & {
      email?: string;
      name?: string;
      image?: string;
      emailVerified?: boolean;
    };
  },
): Promise<Id<"users">> {
  const now = Date.now();
  const email = normalizeEmail(args.profile.email);

  if (args.existingUserId !== null) {
    await ctx.db.patch(args.existingUserId, {
      ...args.profile,
      email,
      updatedAt: now,
      lastSeenAt: now,
    });
    return args.existingUserId;
  }

  if (email) {
    const byEmail = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .unique();
    if (byEmail) {
      await ctx.db.patch(byEmail._id, {
        ...args.profile,
        email,
        updatedAt: now,
        lastSeenAt: now,
      });
      return byEmail._id;
    }
  }

  const superAdminEmail = normalizeEmail(process.env.STUDIO_SUPER_ADMIN_EMAIL);
  const role = email && email === superAdminEmail ? "super_admin" : "user";

  return await ctx.db.insert("users", {
    name: typeof args.profile.name === "string" ? args.profile.name : undefined,
    email,
    image: typeof args.profile.image === "string" ? args.profile.image : undefined,
    role,
    createdAt: now,
    updatedAt: now,
    lastSeenAt: now,
  });
}

function normalizeEmail(email: unknown): string | undefined {
  if (typeof email !== "string") {
    return undefined;
  }
  const normalized = email.trim().toLowerCase();
  return normalized.length > 0 ? normalized : undefined;
}

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [ResendOTP],
  callbacks: {
    createOrUpdateUser,
  },
});
