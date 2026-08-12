import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { purchaseCourseForUser } from "./lib/academyPurchase";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { CN_CARD_TRANSFORM, signBunnyThumbUrl } from "./lib/bunny";
import {
  compareAtCoursePriceCredits,
  effectiveCoursePriceCredits,
  isCourseSaleActive,
} from "./lib/academyPricing";
import {
  amountDueCents,
  DEPOSIT_VALID_MS,
  defaultDepositCents,
  planIsExpired,
  planIsFullyPaid,
  snapshotCoursePricesAtDeposit,
  targetTotalCredits,
} from "./lib/academyPaymentPlan";
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

function isStaffRole(role: string | undefined): boolean {
  return role === "admin" || role === "super_admin";
}

/** Staff / real owner accounts — never purge from Sophie Ops Reset. */
function protectedPurgeEmails(): Set<string> {
  const out = new Set<string>([
    "dallas@yatishara.com",
    "tishara@yatishara.com",
  ]);
  for (const key of [
    "STUDIO_SUPER_ADMIN_EMAIL",
    "STUDIO_ADMIN_EMAIL",
  ]) {
    const v = normalizeEmail(String(process.env[key] || ""));
    if (v) out.add(v);
  }
  return out;
}

/** Customer emails Dallas uses when testing Sophie CS signup. */
function defaultCsTestPurgeEmails(): Set<string> {
  const out = new Set<string>(["bdallasferdinand@outlook.com"]);
  const raw = String(process.env.STUDIO_CS_TEST_PURGE_EMAILS || "");
  for (const part of raw.split(/[,;\s]+/)) {
    const e = normalizeEmail(part);
    if (e) out.add(e);
  }
  return out;
}

async function purgeOneCsTestUser(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<{ ok: true; email?: string; phone?: string } | { ok: false; reason: string }> {
  const user = await ctx.db.get(userId);
  if (!user) return { ok: false, reason: "not_found" };
  const email = user.email ? normalizeEmail(user.email) : "";
  if (isStaffRole(user.role)) {
    return { ok: false, reason: "protected_role" };
  }
  // Hard staff inboxes — never purge even if misconfigured in env allowlists.
  const neverPurge = new Set(["dallas@yatishara.com", "tishara@yatishara.com"]);
  if (email && neverPurge.has(email)) {
    return { ok: false, reason: "protected_email" };
  }
  const testEmails = defaultCsTestPurgeEmails();
  // Allowlisted CS test emails (e.g. outlook) always purgeable for role=user.
  if (
    email &&
    !testEmails.has(email) &&
    protectedPurgeEmails().has(email)
  ) {
    return { ok: false, reason: "protected_email" };
  }

  // Payments + PayWise callback events first.
  const payments = await ctx.db
    .query("payments")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  for (const pay of payments) {
    const events = await ctx.db
      .query("paywiseCallbackEvents")
      .withIndex("by_payment", (q) => q.eq("paymentId", pay._id))
      .collect();
    for (const ev of events) await ctx.db.delete(ev._id);
    const receipts = await ctx.db
      .query("paymentReceipts")
      .withIndex("by_payment", (q) => q.eq("paymentId", pay._id))
      .collect();
    for (const r of receipts) await ctx.db.delete(r._id);
    await ctx.db.delete(pay._id);
  }

  for (const row of await ctx.db
    .query("billingAccounts")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect()) {
    await ctx.db.delete(row._id);
  }
  for (const row of await ctx.db
    .query("storageBilling")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect()) {
    await ctx.db.delete(row._id);
  }
  for (const row of await ctx.db
    .query("creditTransactions")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect()) {
    await ctx.db.delete(row._id);
  }
  for (const row of await ctx.db
    .query("notifications")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect()) {
    await ctx.db.delete(row._id);
  }
  for (const row of await ctx.db
    .query("pushSubscriptions")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect()) {
    await ctx.db.delete(row._id);
  }
  for (const row of await ctx.db
    .query("subscriptions")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect()) {
    await ctx.db.delete(row._id);
  }
  for (const row of await ctx.db
    .query("academyPurchases")
    .withIndex("by_user_and_purchased", (q) => q.eq("userId", userId))
    .collect()) {
    await ctx.db.delete(row._id);
  }

  if (email) {
    const otps = await ctx.db
      .query("studioCsOtps")
      .withIndex("by_email", (q) => q.eq("email", email))
      .collect();
    for (const row of otps) await ctx.db.delete(row._id);
  }

  const magic = await ctx.db
    .query("magicLoginTokens")
    .withIndex("by_user_and_status", (q) =>
      q.eq("userId", userId).eq("status", "pending"),
    )
    .collect();
  for (const row of magic) await ctx.db.delete(row._id);
  const magicConsumed = await ctx.db
    .query("magicLoginTokens")
    .withIndex("by_user_and_status", (q) =>
      q.eq("userId", userId).eq("status", "consumed"),
    )
    .collect();
  for (const row of magicConsumed) await ctx.db.delete(row._id);
  const magicExpired = await ctx.db
    .query("magicLoginTokens")
    .withIndex("by_user_and_status", (q) =>
      q.eq("userId", userId).eq("status", "expired"),
    )
    .collect();
  for (const row of magicExpired) await ctx.db.delete(row._id);

  const phone = user.phone ? normalizePhone(user.phone) : "";
  if (phone) {
    const waAuth = await ctx.db
      .query("whatsappAuthRequests")
      .withIndex("by_phone_and_created", (q) => q.eq("phone", phone))
      .collect();
    for (const row of waAuth) await ctx.db.delete(row._id);
  }

  // Auth tables (no by_user index — small scan OK for test purge).
  const accounts = await ctx.db.query("authAccounts").collect();
  const accountIds = new Set<string>();
  for (const row of accounts) {
    if (String((row as { userId?: Id<"users"> }).userId) === String(userId)) {
      accountIds.add(String(row._id));
      await ctx.db.delete(row._id);
    }
  }
  const sessions = await ctx.db.query("authSessions").collect();
  const sessionIds = new Set<string>();
  for (const row of sessions) {
    if (String((row as { userId?: Id<"users"> }).userId) === String(userId)) {
      sessionIds.add(String(row._id));
      await ctx.db.delete(row._id);
    }
  }
  const refresh = await ctx.db.query("authRefreshTokens").collect();
  for (const row of refresh) {
    const sid = String((row as { sessionId?: string }).sessionId || "");
    if (sid && sessionIds.has(sid)) await ctx.db.delete(row._id);
  }

  const folders = await ctx.db
    .query("folders")
    .withIndex("by_owner", (q) => q.eq("ownerId", userId))
    .collect();
  for (const folder of folders) await ctx.db.delete(folder._id);

  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  if (profile) await ctx.db.delete(profile._id);

  await ctx.db.delete(userId);
  return { ok: true, email: email || undefined, phone: phone || undefined };
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
    // Never mutate staff / real owner accounts from Sophie CS signup.
    if (existing && !isStaffRole(existing.role)) {
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
      if (isStaffRole(byEmail.role) || protectedPurgeEmails().has(email)) {
        throw new Error(
          "That email belongs to a staff Studio account — use your test customer email (e.g. bdallasferdinand@outlook.com).",
        );
      }
      const now = Date.now();
      // If staff already owns this WA phone, keep the test user on a distinct digit key.
      const phoneTakenByStaff = existing && isStaffRole(existing.role);
      const linkPhone =
        phoneTakenByStaff && phone.length <= 14 ? `9${phone}` : phone;
      await ctx.db.patch(byEmail._id, {
        phone: linkPhone,
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
      return { userId: byEmail._id, phone: linkPhone, created: false };
    }
    // Staff owns this WA digits — create test customer on a non-colliding digit key.
    const insertPhone =
      existing && isStaffRole(existing.role) && phone.length <= 14
        ? `9${phone}`
        : phone;
    const now = Date.now();
    const name = [firstName, lastName].filter(Boolean).join(" ");
    const userId = await ctx.db.insert("users", {
      phone: insertPhone,
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
    return { userId, phone: insertPhone, created: true };
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

/**
 * Sophie Ops Reset — purge CS test Studio customers only.
 * Never deletes admin/super_admin or protected owner emails.
 */
export const internalPurgeCsTestUsers = internalMutation({
  args: {
    phones: v.optional(v.array(v.string())),
    emails: v.optional(v.array(v.string())),
    userIds: v.optional(v.array(v.string())),
  },
  returns: v.object({
    ok: v.boolean(),
    purged: v.array(
      v.object({
        userId: v.string(),
        email: v.optional(v.string()),
        phone: v.optional(v.string()),
      }),
    ),
    skipped: v.array(
      v.object({
        userId: v.optional(v.string()),
        reason: v.string(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const protectedEmails = protectedPurgeEmails();
    const testEmails = defaultCsTestPurgeEmails();
    const targets = new Map<string, Id<"users">>();

    for (const raw of args.userIds || []) {
      const id = String(raw || "").trim() as Id<"users">;
      if (id) targets.set(String(id), id);
    }
    for (const raw of args.phones || []) {
      const phone = normalizePhone(raw);
      if (phone.length < 8) continue;
      const byPhone = await ctx.db
        .query("users")
        .withIndex("by_phone", (q) => q.eq("phone", phone))
        .unique();
      if (byPhone) targets.set(String(byPhone._id), byPhone._id);
      // Digit-prefixed test phones created when WA digits belong to staff.
      if (phone.length <= 14) {
        const byAlt = await ctx.db
          .query("users")
          .withIndex("by_phone", (q) => q.eq("phone", `9${phone}`))
          .unique();
        if (byAlt) targets.set(String(byAlt._id), byAlt._id);
      }
    }
    const emails = new Set<string>([...testEmails]);
    for (const raw of args.emails || []) {
      const e = normalizeEmail(raw);
      if (e) emails.add(e);
    }
    for (const email of emails) {
      if (protectedEmails.has(email)) continue;
      const byEmail = await ctx.db
        .query("users")
        .withIndex("email", (q) => q.eq("email", email))
        .unique();
      if (byEmail) targets.set(String(byEmail._id), byEmail._id);
    }

    const purged: Array<{ userId: string; email?: string; phone?: string }> =
      [];
    const skipped: Array<{ userId?: string; reason: string }> = [];

    for (const [idStr, userId] of targets) {
      const result = await purgeOneCsTestUser(ctx, userId);
      if (result.ok) {
        purged.push({
          userId: idStr,
          email: result.email,
          phone: result.phone,
        });
      } else {
        skipped.push({ userId: idStr, reason: result.reason });
      }
    }

    return { ok: true, purged, skipped };
  },
});

async function findActivePlanForUserCourse(
  ctx: MutationCtx | QueryCtx,
  userId: Id<"users">,
  courseId: Id<"academyCourses">,
) {
  const rows = await ctx.db
    .query("academyCoursePaymentPlans")
    .withIndex("by_user_and_course", (q) =>
      q.eq("userId", userId).eq("courseId", courseId),
    )
    .collect();
  return rows.find((r) => r.status === "active") || null;
}

async function grantCoursePurchaseFromPlan(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    courseId: Id<"academyCourses">;
    priceCredits: number;
  },
): Promise<{ purchaseId: Id<"academyPurchases">; alreadyOwned: boolean }> {
  const existing = await ctx.db
    .query("academyPurchases")
    .withIndex("by_user_and_course", (q) =>
      q.eq("userId", args.userId).eq("courseId", args.courseId),
    )
    .unique();
  if (existing) {
    return { purchaseId: existing._id, alreadyOwned: true };
  }
  const course = await ctx.db.get("academyCourses", args.courseId);
  if (!course || course.status !== "published") {
    throw new Error("Course is not available");
  }
  const now = Date.now();
  const purchaseId = await ctx.db.insert("academyPurchases", {
    userId: args.userId,
    courseId: args.courseId,
    priceCredits: Math.max(1, Math.floor(args.priceCredits)),
    purchasedAt: now,
  });
  await ctx.db.patch(course._id, {
    purchaseCount: course.purchaseCount + 1,
    updatedAt: now,
  });
  return { purchaseId, alreadyOwned: false };
}

async function expirePlanIfNeeded(
  ctx: MutationCtx,
  plan: Doc<"academyCoursePaymentPlans">,
  now = Date.now(),
) {
  if (plan.status !== "active") return plan;
  if (!planIsExpired(plan, now)) return plan;
  await ctx.db.patch(plan._id, {
    status: "expired",
    expiredAt: now,
    updatedAt: now,
  });
  return (await ctx.db.get(plan._id))!;
}

/** Soft-accept first deposit — creates active plan; does not unlock course. */
export const internalStartCourseDepositPlan = internalMutation({
  args: {
    phone: v.string(),
    courseId: v.id("academyCourses"),
    amountCents: v.number(),
    notes: v.optional(v.string()),
  },
  returns: v.object({
    planId: v.id("academyCoursePaymentPlans"),
    status: v.string(),
    totalPaidCents: v.number(),
    amountDueCents: v.number(),
    depositCents: v.number(),
    expiresAt: v.number(),
    saleHoldEndsAt: v.optional(v.number()),
    defaultDepositCents: v.number(),
    alreadyOwned: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const phone = normalizePhone(args.phone);
    const user = await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phone", phone))
      .unique();
    if (!user) {
      throw new Error(
        "No Studio account for this phone. Finish signup + email verify first.",
      );
    }
    if (!user.emailVerified) {
      throw new Error("Email not verified. Verify OTP before taking a deposit.");
    }
    const course = await ctx.db.get("academyCourses", args.courseId);
    if (!course || course.status !== "published") {
      throw new Error("Course is not available");
    }
    const existingPurchase = await ctx.db
      .query("academyPurchases")
      .withIndex("by_user_and_course", (q) =>
        q.eq("userId", user._id).eq("courseId", args.courseId),
      )
      .unique();
    if (existingPurchase) {
      throw new Error("Course already owned — no deposit needed.");
    }

    const now = Date.now();
    let active = await findActivePlanForUserCourse(ctx, user._id, args.courseId);
    if (active) {
      active = await expirePlanIfNeeded(ctx, active, now);
      if (active.status === "active") {
        throw new Error(
          "An active deposit plan already exists. Soft-accept further payments as course_balance installments.",
        );
      }
    }

    const snap = snapshotCoursePricesAtDeposit(course, now);
    const suggested = defaultDepositCents(snap);
    const amount = Math.round(Number(args.amountCents) || 0);
    if (amount < 1) throw new Error("Deposit amount must be positive");

    await ensureBillingAccount(ctx, user._id);

    const planId = await ctx.db.insert("academyCoursePaymentPlans", {
      userId: user._id,
      courseId: args.courseId,
      status: "active",
      listPriceCredits: snap.listPriceCredits,
      lockedSalePriceCredits: snap.lockedSalePriceCredits ?? undefined,
      saleEndsAt: snap.saleEndsAt ?? undefined,
      saleHoldEndsAt: snap.saleHoldEndsAt ?? undefined,
      depositCents: amount,
      totalPaidCents: amount,
      depositAt: now,
      expiresAt: now + DEPOSIT_VALID_MS,
      phone,
      notes: args.notes,
      createdAt: now,
      updatedAt: now,
    });
    let plan = (await ctx.db.get(planId))!;
    if (planIsFullyPaid(plan, now)) {
      const granted = await grantCoursePurchaseFromPlan(ctx, {
        userId: user._id,
        courseId: args.courseId,
        priceCredits: targetTotalCredits(plan, now),
      });
      await ctx.db.patch(planId, {
        status: "completed",
        completedAt: now,
        purchaseId: granted.purchaseId,
        updatedAt: now,
      });
      plan = (await ctx.db.get(planId))!;
    }
    return {
      planId,
      status: plan.status,
      totalPaidCents: plan.totalPaidCents,
      amountDueCents: amountDueCents(plan, now),
      depositCents: plan.depositCents,
      expiresAt: plan.expiresAt,
      saleHoldEndsAt: plan.saleHoldEndsAt,
      defaultDepositCents: suggested,
      alreadyOwned: plan.status === "completed",
    };
  },
});

/** Soft-accept balance / installment on an active plan; unlocks when fully paid. */
export const internalApplyCoursePlanPayment = internalMutation({
  args: {
    phone: v.string(),
    courseId: v.id("academyCourses"),
    amountCents: v.number(),
    notes: v.optional(v.string()),
  },
  returns: v.object({
    planId: v.id("academyCoursePaymentPlans"),
    status: v.string(),
    totalPaidCents: v.number(),
    amountDueCents: v.number(),
    unlocked: v.boolean(),
    purchaseId: v.optional(v.id("academyPurchases")),
    expired: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const phone = normalizePhone(args.phone);
    const user = await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phone", phone))
      .unique();
    if (!user) throw new Error("No Studio account for this phone.");
    const now = Date.now();
    let plan = await findActivePlanForUserCourse(ctx, user._id, args.courseId);
    if (!plan) {
      throw new Error(
        "No active deposit plan. Start with a course_deposit soft-accept first.",
      );
    }
    plan = await expirePlanIfNeeded(ctx, plan, now);
    if (plan.status === "expired") {
      return {
        planId: plan._id,
        status: "expired",
        totalPaidCents: plan.totalPaidCents,
        amountDueCents: 0,
        unlocked: false,
        expired: true,
      };
    }

    const amount = Math.round(Number(args.amountCents) || 0);
    if (amount < 1) throw new Error("Payment amount must be positive");

    const totalPaidCents = Math.round(plan.totalPaidCents) + amount;
    const notes = [plan.notes, args.notes].filter(Boolean).join(" | ").slice(0, 500);
    await ctx.db.patch(plan._id, {
      totalPaidCents,
      notes: notes || plan.notes,
      updatedAt: now,
    });
    plan = (await ctx.db.get(plan._id))!;

    if (!planIsFullyPaid(plan, now)) {
      return {
        planId: plan._id,
        status: plan.status,
        totalPaidCents: plan.totalPaidCents,
        amountDueCents: amountDueCents(plan, now),
        unlocked: false,
        expired: false,
      };
    }

    const priceCredits = targetTotalCredits(plan, now);
    const granted = await grantCoursePurchaseFromPlan(ctx, {
      userId: user._id,
      courseId: args.courseId,
      priceCredits,
    });
    await ctx.db.patch(plan._id, {
      status: "completed",
      completedAt: now,
      purchaseId: granted.purchaseId,
      updatedAt: now,
      totalPaidCents,
    });
    return {
      planId: plan._id,
      status: "completed",
      totalPaidCents,
      amountDueCents: 0,
      unlocked: true,
      purchaseId: granted.purchaseId,
      expired: false,
    };
  },
});

/** Soft-accept deposit that already meets/exceeds target → unlock immediately. */
export const internalCompleteCoursePlanIfPaid = internalMutation({
  args: {
    phone: v.string(),
    courseId: v.id("academyCourses"),
  },
  returns: v.object({
    unlocked: v.boolean(),
    status: v.string(),
    amountDueCents: v.number(),
    purchaseId: v.optional(v.id("academyPurchases")),
  }),
  handler: async (ctx, args) => {
    const phone = normalizePhone(args.phone);
    const user = await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phone", phone))
      .unique();
    if (!user) throw new Error("No Studio account for this phone.");
    const now = Date.now();
    let plan = await findActivePlanForUserCourse(ctx, user._id, args.courseId);
    if (!plan) {
      return { unlocked: false, status: "missing", amountDueCents: 0 };
    }
    plan = await expirePlanIfNeeded(ctx, plan, now);
    if (plan.status !== "active") {
      return {
        unlocked: plan.status === "completed",
        status: plan.status,
        amountDueCents: 0,
        purchaseId: plan.purchaseId,
      };
    }
    if (!planIsFullyPaid(plan, now)) {
      return {
        unlocked: false,
        status: plan.status,
        amountDueCents: amountDueCents(plan, now),
      };
    }
    const granted = await grantCoursePurchaseFromPlan(ctx, {
      userId: user._id,
      courseId: args.courseId,
      priceCredits: targetTotalCredits(plan, now),
    });
    await ctx.db.patch(plan._id, {
      status: "completed",
      completedAt: now,
      purchaseId: granted.purchaseId,
      updatedAt: now,
    });
    return {
      unlocked: true,
      status: "completed",
      amountDueCents: 0,
      purchaseId: granted.purchaseId,
    };
  },
});

export const internalGetCoursePaymentPlan = internalQuery({
  args: {
    phone: v.string(),
    courseId: v.optional(v.id("academyCourses")),
  },
  returns: v.union(
    v.object({
      planId: v.id("academyCoursePaymentPlans"),
      courseId: v.id("academyCourses"),
      status: v.string(),
      totalPaidCents: v.number(),
      amountDueCents: v.number(),
      depositCents: v.number(),
      depositAt: v.number(),
      expiresAt: v.number(),
      saleHoldEndsAt: v.optional(v.number()),
      lockedSalePriceCredits: v.optional(v.number()),
      listPriceCredits: v.number(),
      defaultDepositCents: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const phone = normalizePhone(args.phone);
    const user = await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phone", phone))
      .unique();
    if (!user) return null;
    const now = Date.now();
    let plan: Doc<"academyCoursePaymentPlans"> | null = null;
    if (args.courseId) {
      const rows = await ctx.db
        .query("academyCoursePaymentPlans")
        .withIndex("by_user_and_course", (q) =>
          q.eq("userId", user._id).eq("courseId", args.courseId!),
        )
        .collect();
      plan =
        rows.find((r) => r.status === "active") ||
        rows.sort((a, b) => b.updatedAt - a.updatedAt)[0] ||
        null;
    } else {
      const active = await ctx.db
        .query("academyCoursePaymentPlans")
        .withIndex("by_user_and_status", (q) =>
          q.eq("userId", user._id).eq("status", "active"),
        )
        .collect();
      plan = active.sort((a, b) => b.updatedAt - a.updatedAt)[0] || null;
    }
    if (!plan) return null;
    const course = await ctx.db.get("academyCourses", plan.courseId);
    const snap = course
      ? snapshotCoursePricesAtDeposit(course, now)
      : {
          listPriceCredits: plan.listPriceCredits,
          lockedSalePriceCredits: plan.lockedSalePriceCredits ?? null,
          saleEndsAt: plan.saleEndsAt ?? null,
          saleHoldEndsAt: plan.saleHoldEndsAt ?? null,
        };
    const expired = planIsExpired(plan, now);
    return {
      planId: plan._id,
      courseId: plan.courseId,
      status: expired && plan.status === "active" ? "expired" : plan.status,
      totalPaidCents: plan.totalPaidCents,
      amountDueCents:
        plan.status === "active" && !expired ? amountDueCents(plan, now) : 0,
      depositCents: plan.depositCents,
      depositAt: plan.depositAt,
      expiresAt: plan.expiresAt,
      saleHoldEndsAt: plan.saleHoldEndsAt,
      lockedSalePriceCredits: plan.lockedSalePriceCredits,
      listPriceCredits: plan.listPriceCredits,
      defaultDepositCents: defaultDepositCents(snap),
    };
  },
});

export const internalExpireCoursePaymentPlans = internalMutation({
  args: { now: v.optional(v.number()) },
  returns: v.object({ expired: v.number() }),
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const due = await ctx.db
      .query("academyCoursePaymentPlans")
      .withIndex("by_status_and_expires", (q) =>
        q.eq("status", "active").lte("expiresAt", now),
      )
      .take(100);
    let expired = 0;
    for (const plan of due) {
      await ctx.db.patch(plan._id, {
        status: "expired",
        expiredAt: now,
        updatedAt: now,
      });
      expired += 1;
    }
    return { expired };
  },
});
