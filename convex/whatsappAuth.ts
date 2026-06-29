import { makeFunctionReference, type FunctionReference } from "convex/server";
import { v } from "convex/values";
import { action, internalMutation, mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

const DEFAULT_STUDIO_WHATSAPP_NUMBER = "18683034621";
const DEFAULT_ADMIN_PHONE = "18683377338";
const CODE_TTL_MS = 2 * 60 * 1000;
const MAX_ATTEMPTS = 5;

type CheckLatestReturn = {
  status: "verified" | "wrong_code" | "expired" | "not_found" | "too_many_attempts";
  message: string;
};

type MarkCheckedArgs = {
  requestId: Id<"whatsappAuthRequests">;
  phone: string;
  matched: boolean;
  latestText?: string;
};

type MarkCheckedReturn = CheckLatestReturn;

const markLatestCheckRef = makeFunctionReference<"mutation", MarkCheckedArgs, MarkCheckedReturn>(
  "whatsappAuth:markLatestCheck",
) as unknown as FunctionReference<"mutation", "internal", MarkCheckedArgs, MarkCheckedReturn>;

export const start = mutation({
  args: {
    phone: v.string(),
  },
  returns: v.object({
    requestId: v.id("whatsappAuthRequests"),
    phone: v.string(),
    code: v.string(),
    whatsappNumber: v.string(),
    whatsappUrl: v.string(),
    expiresAt: v.number(),
  }),
  handler: async (ctx, args) => {
    const phone = normalizePhone(args.phone);
    if (!phone) {
      throw new Error("Enter a valid WhatsApp number");
    }

    const now = Date.now();
    const code = generateCode();
    const expiresAt = now + CODE_TTL_MS;
    const requestId = await ctx.db.insert("whatsappAuthRequests", {
      phone,
      code,
      status: "pending",
      attempts: 0,
      createdAt: now,
      expiresAt,
    });

    return {
      requestId,
      phone,
      code,
      whatsappNumber: getStudioWhatsAppNumber(),
      whatsappUrl: buildWhatsAppUrl(code),
      expiresAt,
    };
  },
});

export const checkLatest = action({
  args: {
    requestId: v.id("whatsappAuthRequests"),
    phone: v.string(),
  },
  returns: v.object({
    status: v.union(
      v.literal("verified"),
      v.literal("wrong_code"),
      v.literal("expired"),
      v.literal("not_found"),
      v.literal("too_many_attempts"),
    ),
    message: v.string(),
  }),
  handler: async (ctx, args): Promise<CheckLatestReturn> => {
    const phone = normalizePhone(args.phone);
    if (!phone) {
      return { status: "not_found", message: "Enter a valid WhatsApp number." };
    }

    const latestText = await getLatestInboundMessageText(phone);
    return await ctx.runMutation(markLatestCheckRef, {
      requestId: args.requestId,
      phone,
      matched: latestText !== null,
      latestText: latestText ?? undefined,
    });
  },
});

export const markLatestCheck = internalMutation({
  args: {
    requestId: v.id("whatsappAuthRequests"),
    phone: v.string(),
    matched: v.boolean(),
    latestText: v.optional(v.string()),
  },
  returns: v.object({
    status: v.union(
      v.literal("verified"),
      v.literal("wrong_code"),
      v.literal("expired"),
      v.literal("not_found"),
      v.literal("too_many_attempts"),
    ),
    message: v.string(),
  }),
  handler: async (ctx, args): Promise<MarkCheckedReturn> => {
    const request = await ctx.db.get(args.requestId);
    if (!request || request.phone !== args.phone) {
      return { status: "not_found", message: "Request not found. Request a new code." };
    }

    const now = Date.now();
    if (request.expiresAt <= now) {
      await ctx.db.patch(request._id, {
        status: "expired",
        lastError: "Code expired",
      });
      return { status: "expired", message: "Code expired. Request a new code." };
    }

    if (request.attempts >= MAX_ATTEMPTS) {
      await ctx.db.patch(request._id, {
        lastError: "Too many attempts",
      });
      return {
        status: "too_many_attempts",
        message: "Too many checks. Request a new code.",
      };
    }

    const nextAttempts = request.attempts + 1;
    const latest = args.latestText?.trim() ?? "";
    if (args.matched && latest.includes(request.code)) {
      await ctx.db.patch(request._id, {
        status: "verified",
        attempts: nextAttempts,
        verifiedAt: now,
        lastError: undefined,
      });
      return { status: "verified", message: "WhatsApp code verified." };
    }

    await ctx.db.patch(request._id, {
      attempts: nextAttempts,
      lastError: latest ? "Wrong code in latest message" : "No message from requested number",
    });
    return {
      status: "wrong_code",
      message: latest
        ? "Latest WhatsApp message had the wrong code. Request a new code if needed."
        : "No WhatsApp message found from that number yet.",
    };
  },
});

export const consumeVerifiedForSignIn = internalMutation({
  args: {
    requestId: v.id("whatsappAuthRequests"),
    phone: v.string(),
  },
  returns: v.union(
    v.object({
      userId: v.id("users"),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const phone = normalizePhone(args.phone);
    if (!phone) {
      return null;
    }

    const request = await ctx.db.get(args.requestId);
    const now = Date.now();
    if (
      !request ||
      request.phone !== phone ||
      request.status !== "verified" ||
      request.expiresAt <= now
    ) {
      return null;
    }

    const userId = await getOrCreateUserByPhone(ctx, phone, now);
    await ctx.db.patch(request._id, {
      status: "consumed",
      consumedAt: now,
    });
    return { userId };
  },
});

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function normalizePhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) {
    return null;
  }
  return digits;
}

function buildWhatsAppUrl(code: string): string {
  const studioNumber = getStudioWhatsAppNumber();
  const text = encodeURIComponent(code);
  return `https://wa.me/${studioNumber}?text=${text}`;
}

function getStudioWhatsAppNumber(): string {
  return (
    normalizePhone(process.env.STUDIO_WHATSAPP_NUMBER ?? DEFAULT_STUDIO_WHATSAPP_NUMBER) ??
    DEFAULT_STUDIO_WHATSAPP_NUMBER
  );
}

async function getOrCreateUserByPhone(
  ctx: MutationCtx,
  phone: string,
  now: number,
): Promise<Id<"users">> {
  const existingByPhone = await ctx.db
    .query("users")
    .withIndex("by_phone", (q) => q.eq("phone", phone))
    .unique();
  if (existingByPhone) {
    await ctx.db.patch(existingByPhone._id, {
      phone,
      phoneVerifiedAt: now,
      updatedAt: now,
      lastSeenAt: now,
    });
    return existingByPhone._id;
  }

  const superAdminPhone = normalizePhone(process.env.STUDIO_SUPER_ADMIN_PHONE ?? DEFAULT_ADMIN_PHONE);
  const superAdminEmail = normalizeEmail(process.env.STUDIO_SUPER_ADMIN_EMAIL);
  if (phone === superAdminPhone && superAdminEmail) {
    const adminByEmail = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", superAdminEmail))
      .unique();
    if (adminByEmail) {
      await ctx.db.patch(adminByEmail._id, {
        phone,
        phoneVerifiedAt: now,
        updatedAt: now,
        lastSeenAt: now,
      });
      return adminByEmail._id;
    }
  }

  const role = phone === superAdminPhone ? "super_admin" : "user";
  return await ctx.db.insert("users", {
    phone,
    phoneVerifiedAt: now,
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

async function getLatestInboundMessageText(phone: string): Promise<string | null> {
  const apiUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE ?? "yatishara";
  if (!apiUrl || !apiKey) {
    throw new Error("Evolution API is not configured");
  }

  const candidates = [
    await findLatestMessageForJid({
      apiUrl,
      apiKey,
      instance,
      jidField: "remoteJid",
      jid: `${phone}@s.whatsapp.net`,
    }),
    await findLatestMessageForJid({
      apiUrl,
      apiKey,
      instance,
      jidField: "remoteJidAlt",
      jid: `${phone}@s.whatsapp.net`,
    }),
  ].filter((message): message is EvolutionMessage => message !== null);

  const allowSelfMessage = phone === getStudioWhatsAppNumber();
  const inbound = candidates
    .filter((message) => allowSelfMessage || message.key.fromMe === false)
    .sort((a, b) => b.messageTimestamp - a.messageTimestamp)[0];

  return inbound ? getMessageText(inbound) : null;
}

type EvolutionMessage = {
  key: {
    fromMe: boolean;
  };
  messageTimestamp: number;
  message?: {
    conversation?: string;
    extendedTextMessage?: {
      text?: string;
    };
  };
};

async function findLatestMessageForJid({
  apiUrl,
  apiKey,
  instance,
  jidField,
  jid,
}: {
  apiUrl: string;
  apiKey: string;
  instance: string;
  jidField: "remoteJid" | "remoteJidAlt";
  jid: string;
}): Promise<EvolutionMessage | null> {
  const response = await fetch(
    `${apiUrl.replace(/\/+$/, "")}/chat/findMessages/${encodeURIComponent(instance)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: apiKey,
      },
      body: JSON.stringify({
        where: {
          key: {
            [jidField]: jid,
          },
        },
        limit: 1,
      }),
    },
  );

  if (!response.ok) {
    throw new Error("Could not check WhatsApp messages");
  }

  const payload = (await response.json()) as {
    messages?: {
      records?: EvolutionMessage[];
    };
  };
  return payload.messages?.records?.[0] ?? null;
}

function getMessageText(message: EvolutionMessage): string {
  return message.message?.conversation ?? message.message?.extendedTextMessage?.text ?? "";
}
