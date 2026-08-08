import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { purchaseCourseForUser } from "./lib/academyPurchase";
import type { MutationCtx } from "./_generated/server";
import { CN_CARD_TRANSFORM, signBunnyThumbUrl } from "./lib/bunny";
import {
  compareAtCoursePriceCredits,
  effectiveCoursePriceCredits,
  isCourseSaleActive,
} from "./lib/academyPricing";
import { hashMagicToken, MAGIC_LINK_TTL_MS } from "./magicLoginAuth";

const COVER_URL_TTL_SEC = 60 * 60 * 6;

async function courseCoverUrl(
  path: string | undefined,
): Promise<string | undefined> {
  if (!path) return undefined;
  const expires = Math.floor(Date.now() / 1000) + COVER_URL_TTL_SEC;
  try {
    return await signBunnyThumbUrl(path, expires, CN_CARD_TRANSFORM);
  } catch {
    return undefined;
  }
}

function blurbFromMarkdown(md: string, max = 160): string {
  const plain = String(md || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[[^\]]*]\([^)]*\)/g, "$1")
    .replace(/[#>*_~`-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= max) return plain;
  return `${plain.slice(0, max - 1).trimEnd()}…`;
}

function normalizePhone(raw: string): string {
  return String(raw || "").replace(/\D/g, "");
}

async function ensureBillingAccount(ctx: MutationCtx, userId: Id<"users">) {
  const existing = await ctx.db
    .query("billingAccounts")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  if (existing) return existing._id;
  const now = Date.now();
  return ctx.db.insert("billingAccounts", {
    userId,
    creditBalance: 0,
    reservedCredits: 0,
    createdAt: now,
    updatedAt: now,
  });
}

function normalizeEmail(raw: string): string {
  return String(raw || "").trim().toLowerCase();
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const internalFindUserByPhone = internalQuery({
  args: { phone: v.string() },
  returns: v.union(
    v.object({
      userId: v.id("users"),
      phone: v.string(),
      email: v.optional(v.string()),
      emailVerified: v.optional(v.boolean()),
      firstName: v.optional(v.string()),
      lastName: v.optional(v.string()),
      name: v.optional(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const phone = normalizePhone(args.phone);
    if (phone.length < 8) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phone", phone))
      .unique();
    if (!user) return null;
    return {
      userId: user._id,
      phone,
      email: user.email,
      emailVerified: user.emailVerified,
      firstName: user.firstName,
      lastName: user.lastName,
      name: user.name,
    };
  },
});

export const internalListPublishedCourses = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("academyCourses"),
      title: v.string(),
      slug: v.string(),
      blurb: v.string(),
      priceCredits: v.number(),
      compareAtCredits: v.optional(v.number()),
      onSale: v.boolean(),
      saleEndsAt: v.optional(v.number()),
      comingSoon: v.boolean(),
      coverUrl: v.optional(v.string()),
    }),
  ),
  handler: async (ctx) => {
    const published = await ctx.db
      .query("academyCourses")
      .withIndex("by_status_and_sort", (q) => q.eq("status", "published"))
      .collect();
    const soon = await ctx.db
      .query("academyCourses")
      .withIndex("by_status_and_sort", (q) => q.eq("status", "coming_soon"))
      .collect();
    const rows = [...published, ...soon];
    rows.sort((a, b) => a.sortOrder - b.sortOrder || b.updatedAt - a.updatedAt);
    const now = Date.now();
    const out = [];
    for (const c of rows) {
      const compareAt = compareAtCoursePriceCredits(c, now);
      const onSale = isCourseSaleActive(c, now);
      out.push({
        _id: c._id,
        title: c.title,
        slug: c.slug,
        blurb: blurbFromMarkdown(c.descriptionMarkdown),
        priceCredits: effectiveCoursePriceCredits(c, now),
        compareAtCredits: compareAt ?? undefined,
        onSale,
        saleEndsAt: onSale && c.saleEndsAt ? Number(c.saleEndsAt) : undefined,
        comingSoon: c.status === "coming_soon",
        coverUrl: await courseCoverUrl(c.coverBunnyPath),
      });
    }
    return out;
  },
});

export const internalCreateUserFromWa = internalMutation({
  args: {
    phone: v.string(),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    email: v.optional(v.string()),
  },
  returns: v.object({
    userId: v.id("users"),
    phone: v.string(),
    created: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const phone = normalizePhone(args.phone);
    if (phone.length < 8 || phone.length > 15) {
      throw new Error("Invalid phone");
    }
    const firstName = String(args.firstName || "").trim();
    const lastName = String(args.lastName || "").trim();
    const email = args.email ? normalizeEmail(args.email) : "";
    if (!firstName) {
      throw new Error("firstName required — collect name before creating a Studio account");
    }
    if (!lastName) {
      throw new Error("lastName required — collect full name before creating a Studio account");
    }
    if (!email || !email.includes("@")) {
      throw new Error("email required — collect email before creating a Studio account");
    }

    const existing = await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phone", phone))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        firstName: firstName || existing.firstName,
        lastName: lastName || existing.lastName,
        name: [firstName || existing.firstName, lastName || existing.lastName]
          .filter(Boolean)
          .join(" "),
        email: email || existing.email,
        // Keep prior verification; new email clears verify.
        emailVerified:
          email && email !== existing.email ? false : existing.emailVerified,
        updatedAt: Date.now(),
      });
      await ensureBillingAccount(ctx, existing._id);
      return { userId: existing._id, phone, created: false };
    }
    const byEmail = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .unique();
    if (byEmail) {
      const now = Date.now();
      await ctx.db.patch(byEmail._id, {
        phone,
        phoneVerifiedAt: now,
        firstName: firstName || byEmail.firstName,
        lastName: lastName || byEmail.lastName,
        name:
          [firstName || byEmail.firstName, lastName || byEmail.lastName]
            .filter(Boolean)
            .join(" ") || byEmail.name,
        updatedAt: now,
      });
      await ensureBillingAccount(ctx, byEmail._id);
      return { userId: byEmail._id, phone, created: false };
    }
    const now = Date.now();
    const name = [firstName, lastName].filter(Boolean).join(" ");
    const userId = await ctx.db.insert("users", {
      phone,
      phoneVerifiedAt: now,
      email,
      emailVerified: false,
      firstName,
      lastName,
      name,
      role: "user",
      createdAt: now,
      updatedAt: now,
    });
    await ensureBillingAccount(ctx, userId);
    return { userId, phone, created: true };
  },
});

export const internalSendEmailOtp = internalMutation({
  args: {
    email: v.string(),
    phone: v.optional(v.string()),
  },
  returns: v.object({ sent: v.boolean(), email: v.string() }),
  handler: async (ctx, args) => {
    const email = normalizeEmail(args.email);
    if (!email.includes("@")) throw new Error("Invalid email");
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = await sha256Hex(`${email}:${code}`);
    const now = Date.now();
    const existing = await ctx.db
      .query("studioCsOtps")
      .withIndex("by_email", (q) => q.eq("email", email))
      .collect();
    for (const row of existing) {
      await ctx.db.delete(row._id);
    }
    await ctx.db.insert("studioCsOtps", {
      email,
      codeHash,
      phone: args.phone ? normalizePhone(args.phone) : undefined,
      expiresAt: now + 15 * 60 * 1000,
      createdAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.studioCsActions.sendOtpEmail, {
      email,
      code,
    });
    return { sent: true, email };
  },
});

export const internalVerifyEmailOtp = internalMutation({
  args: {
    email: v.string(),
    code: v.string(),
    phone: v.optional(v.string()),
  },
  returns: v.object({
    ok: v.boolean(),
    userId: v.optional(v.id("users")),
    reason: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const email = normalizeEmail(args.email);
    const code = String(args.code || "").replace(/\D/g, "");
    if (code.length !== 6) {
      return { ok: false, reason: "invalid_code" };
    }
    const row = await ctx.db
      .query("studioCsOtps")
      .withIndex("by_email", (q) => q.eq("email", email))
      .order("desc")
      .first();
    if (!row || row.expiresAt < Date.now()) {
      return { ok: false, reason: "expired" };
    }
    const hash = await sha256Hex(`${email}:${code}`);
    if (hash !== row.codeHash) {
      return { ok: false, reason: "mismatch" };
    }
    await ctx.db.delete(row._id);
    const phone = normalizePhone(args.phone || row.phone || "");
    let user = phone
      ? await ctx.db
          .query("users")
          .withIndex("by_phone", (q) => q.eq("phone", phone))
          .unique()
      : null;
    if (!user) {
      user = await ctx.db
        .query("users")
        .withIndex("email", (q) => q.eq("email", email))
        .unique();
    }
    if (!user) {
      return {
        ok: false,
        reason: "signup_first",
      };
    }
    const now = Date.now();
    await ctx.db.patch(user._id, {
      email,
      emailVerified: true,
      phone: phone || user.phone,
      phoneVerifiedAt: phone ? now : user.phoneVerifiedAt,
      updatedAt: now,
    });
    await ensureBillingAccount(ctx, user._id);
    return { ok: true, userId: user._id };
  },
});

export const internalUnlockCourseForPhone = internalMutation({
  args: {
    phone: v.string(),
    courseId: v.id("academyCourses"),
  },
  returns: v.object({
    purchaseId: v.id("academyPurchases"),
    alreadyOwned: v.boolean(),
    userId: v.id("users"),
  }),
  handler: async (ctx, args) => {
    const phone = normalizePhone(args.phone);
    const user = await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phone", phone))
      .unique();
    if (!user) {
      throw new Error(
        "No Studio account for this phone. Finish signup + email verify before unlock.",
      );
    }
    if (!user.emailVerified) {
      throw new Error(
        "Email not verified. Verify OTP before unlocking a course.",
      );
    }
    await ensureBillingAccount(ctx, user._id);
    const result = await purchaseCourseForUser(
      ctx,
      user._id,
      args.courseId as Id<"academyCourses">,
    );
    return {
      purchaseId: result.purchaseId,
      alreadyOwned: result.alreadyOwned,
      userId: user._id,
    };
  },
});

export const internalGetPayment = internalQuery({
  args: { paymentId: v.id("payments") },
  returns: v.union(
    v.object({
      _id: v.id("payments"),
      status: v.string(),
      externalPaymentId: v.optional(v.string()),
      providerStatus: v.optional(v.string()),
      amountCents: v.number(),
      creditsGranted: v.optional(v.number()),
      academyCourseId: v.optional(v.id("academyCourses")),
      userId: v.id("users"),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const payment = await ctx.db.get(args.paymentId);
    if (!payment) return null;
    return {
      _id: payment._id,
      status: payment.status,
      externalPaymentId: payment.externalPaymentId,
      providerStatus: payment.providerStatus,
      amountCents: payment.amountCents,
      creditsGranted: payment.creditsGranted,
      academyCourseId: payment.academyCourseId,
      userId: payment.userId,
    };
  },
});

export const internalCompleteProfile = internalMutation({
  args: {
    phone: v.string(),
    firstName: v.string(),
    lastName: v.string(),
  },
  returns: v.object({ userId: v.id("users") }),
  handler: async (ctx, args) => {
    const phone = normalizePhone(args.phone);
    const user = await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phone", phone))
      .unique();
    if (!user) throw new Error("User not found");
    const firstName = args.firstName.trim();
    const lastName = args.lastName.trim();
    await ctx.db.patch(user._id, {
      firstName,
      lastName,
      name: `${firstName} ${lastName}`.trim(),
      updatedAt: Date.now(),
    });
    return { userId: user._id };
  },
});

/** Sophie CS — create a one-time Studio login URL (5 min, single-use). */
export const internalCreateMagicLoginLink = internalMutation({
  args: {
    phone: v.string(),
    source: v.optional(v.string()),
  },
  returns: v.object({
    url: v.string(),
    expiresAt: v.number(),
    expiresInSec: v.number(),
    userId: v.id("users"),
  }),
  handler: async (ctx, args) => {
    const phone = normalizePhone(args.phone);
    if (phone.length < 8) throw new Error("Invalid phone");
    const user = await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phone", phone))
      .unique();
    if (!user) throw new Error("No Studio account for this phone — create user first");

    const pending = await ctx.db
      .query("magicLoginTokens")
      .withIndex("by_user_and_status", (q) =>
        q.eq("userId", user._id).eq("status", "pending"),
      )
      .collect();
    const now = Date.now();
    for (const row of pending) {
      await ctx.db.patch(row._id, { status: "expired" });
    }

    const rawBytes = new Uint8Array(32);
    crypto.getRandomValues(rawBytes);
    const raw = [...rawBytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    const tokenHash = await hashMagicToken(raw);
    const expiresAt = now + MAGIC_LINK_TTL_MS;
    await ctx.db.insert("magicLoginTokens", {
      userId: user._id,
      phone,
      tokenHash,
      status: "pending",
      expiresAt,
      createdAt: now,
      source: args.source ?? "sophie_cs",
    });

    const site = String(process.env.SITE_URL || "https://studio.yatishara.com").replace(
      /\/$/,
      "",
    );
    return {
      url: `${site}/auth/magic?token=${raw}`,
      expiresAt,
      expiresInSec: Math.floor(MAGIC_LINK_TTL_MS / 1000),
      userId: user._id,
    };
  },
});
