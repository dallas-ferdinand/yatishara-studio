import {
  convexAuth,
  type AuthProviderMaterializedConfig,
} from "@convex-dev/auth/server";
import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import { makeFunctionReference, type FunctionReference } from "convex/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { Password } from "@convex-dev/auth/providers/Password";
import { PhonePassword } from "./phonePasswordAuth";
import { ResendOTP } from "./ResendOTP";

type ConsumeWhatsAppArgs = {
  requestId: Id<"whatsappAuthRequests">;
  phone: string;
};

type ConsumeWhatsAppReturn = {
  userId: Id<"users">;
} | null;

const consumeVerifiedWhatsAppRef = makeFunctionReference<
  "mutation",
  ConsumeWhatsAppArgs,
  ConsumeWhatsAppReturn
>("whatsappAuth:consumeVerifiedForSignIn") as unknown as FunctionReference<
  "mutation",
  "internal",
  ConsumeWhatsAppArgs,
  ConsumeWhatsAppReturn
>;

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
      ...profileFields(args.profile),
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
        ...profileFields(args.profile),
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
    emailVerified: typeof args.profile.emailVerified === "boolean" ? args.profile.emailVerified : undefined,
    image: typeof args.profile.image === "string" ? args.profile.image : undefined,
    role,
    createdAt: now,
    updatedAt: now,
    lastSeenAt: now,
  });
}

function profileFields(profile: {
  name?: string;
  image?: string;
  emailVerified?: boolean;
}): {
  name?: string;
  image?: string;
  emailVerified?: boolean;
} {
  return {
    name: typeof profile.name === "string" ? profile.name : undefined,
    image: typeof profile.image === "string" ? profile.image : undefined,
    emailVerified: typeof profile.emailVerified === "boolean" ? profile.emailVerified : undefined,
  };
}

function normalizeEmail(email: unknown): string | undefined {
  if (typeof email !== "string") {
    return undefined;
  }
  const normalized = email.trim().toLowerCase();
  return normalized.length > 0 ? normalized : undefined;
}

const WhatsAppOTP = ConvexCredentials({
  id: "whatsapp-otp",
  authorize: async (credentials, ctx) => {
    if (typeof credentials.requestId !== "string" || typeof credentials.phone !== "string") {
      return null;
    }

    return await ctx.runMutation(consumeVerifiedWhatsAppRef, {
      requestId: credentials.requestId as Id<"whatsappAuthRequests">,
      phone: credentials.phone,
    });
  },
});

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [ResendOTP, WhatsAppOTP, Password, PhonePassword],
  callbacks: {
    createOrUpdateUser,
  },
});
