import { getAuthUserId, modifyAccountCredentials, retrieveAccount } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import {
  action,
  internalMutation,
  internalQuery,
  query,
  type QueryCtx,
} from "./_generated/server";
import { hashPassword } from "./lib/passwordCrypto";
import { normalizePhone, PHONE_PASSWORD_PROVIDER } from "./phonePasswordAuth";

export const EMAIL_PASSWORD_PROVIDER = "password";

export const signInOptions = query({
  args: {
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
  },
  returns: v.object({
    hasPassword: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const email = normalizeEmail(args.email);
    if (email) {
      return {
        hasPassword: await hasPasswordForAccount(ctx, EMAIL_PASSWORD_PROVIDER, email),
      };
    }

    const phone = args.phone ? normalizePhone(args.phone) : null;
    if (phone) {
      return {
        hasPassword: await hasPasswordForAccount(ctx, PHONE_PASSWORD_PROVIDER, phone),
      };
    }

    return { hasPassword: false };
  },
});

export const setPassword = action({
  args: {
    newPassword: v.string(),
    currentPassword: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("Not authenticated");
    }

    const password = args.newPassword.trim();
    if (password.length < 8) {
      throw new Error("Password must be at least 8 characters");
    }

    const user = await ctx.runQuery(internal.passwordAuth.getUserById, { userId });
    const login = resolvePasswordLogin(user);
    if (!login) {
      throw new Error("Add an email or phone to your account before setting a password");
    }

    const existing = await ctx.runQuery(internal.passwordAuth.getPasswordAccount, {
      provider: login.provider,
      accountId: login.accountId,
    });

    if (existing?.secret) {
      const currentPassword = args.currentPassword?.trim();
      if (!currentPassword) {
        throw new Error("Enter your current password");
      }
      try {
        await retrieveAccount(ctx, {
          provider: login.provider,
          account: { id: login.accountId, secret: currentPassword },
        });
      } catch {
        throw new Error("Current password is wrong");
      }
      await modifyAccountCredentials(ctx, {
        provider: login.provider,
        account: { id: login.accountId, secret: password },
      });
      return null;
    }

    const secretHash = await hashPassword(password);
    await ctx.runMutation(internal.passwordAuth.upsertPasswordAccount, {
      userId,
      provider: login.provider,
      accountId: login.accountId,
      secretHash,
    });
    return null;
  },
});

export const getUserById = internalQuery({
  args: {
    userId: v.id("users"),
  },
  returns: v.object({
    _id: v.id("users"),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) {
      throw new Error("User not found");
    }
    return {
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
    };
  },
});

export const getPasswordAccount = internalQuery({
  args: {
    provider: v.string(),
    accountId: v.string(),
  },
  returns: v.union(
    v.object({
      _id: v.id("authAccounts"),
      userId: v.id("users"),
      secret: v.optional(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const account = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) =>
        q.eq("provider", args.provider).eq("providerAccountId", args.accountId),
      )
      .unique();
    if (!account) {
      return null;
    }
    return {
      _id: account._id,
      userId: account.userId,
      secret: account.secret,
    };
  },
});

export const upsertPasswordAccount = internalMutation({
  args: {
    userId: v.id("users"),
    provider: v.string(),
    accountId: v.string(),
    secretHash: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) =>
        q.eq("provider", args.provider).eq("providerAccountId", args.accountId),
      )
      .unique();

    if (existing) {
      if (existing.userId !== args.userId) {
        throw new Error("That login is already linked to another account");
      }
      await ctx.db.patch(existing._id, { secret: args.secretHash });
      return null;
    }

    await ctx.db.insert("authAccounts", {
      userId: args.userId,
      provider: args.provider,
      providerAccountId: args.accountId,
      secret: args.secretHash,
    });
    return null;
  },
});

export async function userHasPassword(
  ctx: QueryCtx,
  user: Pick<Doc<"users">, "email" | "phone">,
): Promise<boolean> {
  const login = resolvePasswordLogin(user);
  if (!login) {
    return false;
  }
  return await hasPasswordForAccount(ctx, login.provider, login.accountId);
}

function resolvePasswordLogin(
  user: Pick<Doc<"users">, "email" | "phone">,
): { provider: string; accountId: string } | null {
  const email = normalizeEmail(user.email);
  if (email) {
    return { provider: EMAIL_PASSWORD_PROVIDER, accountId: email };
  }
  const phone = user.phone ? normalizePhone(user.phone) : null;
  if (phone) {
    return { provider: PHONE_PASSWORD_PROVIDER, accountId: phone };
  }
  return null;
}

async function hasPasswordForAccount(
  ctx: QueryCtx,
  provider: string,
  accountId: string,
): Promise<boolean> {
  const account = await ctx.db
    .query("authAccounts")
    .withIndex("providerAndAccountId", (q) =>
      q.eq("provider", provider).eq("providerAccountId", accountId),
    )
    .unique();
  return Boolean(account?.secret);
}

function normalizeEmail(value: string | undefined): string | undefined {
  const trimmed = value?.trim().toLowerCase();
  return trimmed ? trimmed : undefined;
}
