import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  adminMutation,
  adminQuery,
  authedMutation,
  authedQuery,
} from "./lib/customFunctions";
import { isAdminRole } from "./lib/auth";
import { signBunnyFullUrl } from "./lib/bunny";
import { getCreditPriceCents } from "./lib/marketplaceEscrow";

const COVER_URL_TTL_SEC = 60 * 60 * 6;

function slugify(input: string): string {
  const base = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return base || "course";
}

function blurbFromMarkdown(md: string, max = 160): string {
  const plain = md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/[#>*_~\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= max) return plain;
  return `${plain.slice(0, max - 1).trimEnd()}…`;
}

async function coverUrlFor(
  path: string | undefined,
): Promise<string | undefined> {
  if (!path) return undefined;
  const expires = Math.floor(Date.now() / 1000) + COVER_URL_TTL_SEC;
  return signBunnyFullUrl(path, expires, "image", 80);
}

async function findPurchase(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  courseId: Id<"academyCourses">,
): Promise<Doc<"academyPurchases"> | null> {
  return (
    (await ctx.db
      .query("academyPurchases")
      .withIndex("by_user_and_course", (q) =>
        q.eq("userId", userId).eq("courseId", courseId),
      )
      .unique()) ?? null
  );
}

const catalogCourseReturn = v.object({
  _id: v.id("academyCourses"),
  title: v.string(),
  slug: v.string(),
  blurb: v.string(),
  priceCredits: v.number(),
  coverUrl: v.optional(v.string()),
  owned: v.boolean(),
  sortOrder: v.number(),
  updatedAt: v.number(),
});

const courseDetailReturn = v.object({
  _id: v.id("academyCourses"),
  title: v.string(),
  slug: v.string(),
  descriptionMarkdown: v.string(),
  priceCredits: v.number(),
  coverUrl: v.optional(v.string()),
  owned: v.boolean(),
  hasVideo: v.boolean(),
  status: v.union(v.literal("draft"), v.literal("published")),
  sortOrder: v.number(),
  updatedAt: v.number(),
});

export const listPublishedCourses = authedQuery({
  args: {},
  returns: v.array(catalogCourseReturn),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("academyCourses")
      .withIndex("by_status_and_sort", (q) => q.eq("status", "published"))
      .collect();
    rows.sort((a, b) => a.sortOrder - b.sortOrder || b.updatedAt - a.updatedAt);

    const out = [];
    for (const course of rows) {
      const purchase = await findPurchase(ctx, ctx.user._id, course._id);
      out.push({
        _id: course._id,
        title: course.title,
        slug: course.slug,
        blurb: blurbFromMarkdown(course.descriptionMarkdown),
        priceCredits: course.priceCredits,
        coverUrl: await coverUrlFor(course.coverBunnyPath),
        owned: Boolean(purchase),
        sortOrder: course.sortOrder,
        updatedAt: course.updatedAt,
      });
    }
    return out;
  },
});

export const listMyCourses = authedQuery({
  args: {},
  returns: v.array(catalogCourseReturn),
  handler: async (ctx) => {
    const purchases = await ctx.db
      .query("academyPurchases")
      .withIndex("by_user_and_purchased", (q) => q.eq("userId", ctx.user._id))
      .order("desc")
      .collect();

    const out = [];
    for (const purchase of purchases) {
      const course = await ctx.db.get("academyCourses", purchase.courseId);
      if (!course || course.status !== "published") continue;
      out.push({
        _id: course._id,
        title: course.title,
        slug: course.slug,
        blurb: blurbFromMarkdown(course.descriptionMarkdown),
        priceCredits: course.priceCredits,
        coverUrl: await coverUrlFor(course.coverBunnyPath),
        owned: true,
        sortOrder: course.sortOrder,
        updatedAt: course.updatedAt,
      });
    }
    return out;
  },
});

export const getCourse = authedQuery({
  args: {
    courseId: v.optional(v.id("academyCourses")),
    slug: v.optional(v.string()),
  },
  returns: v.union(courseDetailReturn, v.null()),
  handler: async (ctx, args) => {
    let course: Doc<"academyCourses"> | null = null;
    if (args.courseId) {
      course = await ctx.db.get("academyCourses", args.courseId);
    } else if (args.slug?.trim()) {
      course = await ctx.db
        .query("academyCourses")
        .withIndex("by_slug", (q) => q.eq("slug", args.slug!.trim().toLowerCase()))
        .unique();
    }
    if (!course) return null;

    const admin = isAdminRole(ctx.user.role);
    const purchase = await findPurchase(ctx, ctx.user._id, course._id);
    const owned = Boolean(purchase) || admin;
    if (course.status !== "published" && !admin) return null;

    return {
      _id: course._id,
      title: course.title,
      slug: course.slug,
      descriptionMarkdown: course.descriptionMarkdown,
      priceCredits: course.priceCredits,
      coverUrl: await coverUrlFor(course.coverBunnyPath),
      owned: Boolean(purchase) || admin,
      hasVideo: Boolean(course.bunnyStreamVideoId) && owned,
      status: course.status,
      sortOrder: course.sortOrder,
      updatedAt: course.updatedAt,
    };
  },
});

/** Used by playback action — never returns stream id to unauthorized callers. */
export const getCoursePlaybackAccess = authedQuery({
  args: { courseId: v.id("academyCourses") },
  returns: v.union(
    v.object({
      allowed: v.literal(true),
      bunnyStreamVideoId: v.string(),
    }),
    v.object({ allowed: v.literal(false) }),
  ),
  handler: async (ctx, args) => {
    const course = await ctx.db.get("academyCourses", args.courseId);
    if (!course?.bunnyStreamVideoId) return { allowed: false as const };
    const admin = isAdminRole(ctx.user.role);
    if (!admin) {
      const purchase = await findPurchase(ctx, ctx.user._id, course._id);
      if (!purchase) return { allowed: false as const };
      if (course.status !== "published") return { allowed: false as const };
    }
    return {
      allowed: true as const,
      bunnyStreamVideoId: course.bunnyStreamVideoId,
    };
  },
});

export const purchaseCourse = authedMutation({
  args: { courseId: v.id("academyCourses") },
  returns: v.object({
    purchaseId: v.id("academyPurchases"),
    alreadyOwned: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const course = await ctx.db.get("academyCourses", args.courseId);
    if (!course || course.status !== "published") {
      throw new Error("Course is not available");
    }
    if (!course.bunnyStreamVideoId) {
      throw new Error("Course video is not ready yet");
    }

    const existing = await findPurchase(ctx, ctx.user._id, course._id);
    if (existing) {
      return { purchaseId: existing._id, alreadyOwned: true };
    }

    const account = await ctx.db
      .query("billingAccounts")
      .withIndex("by_user", (q) => q.eq("userId", ctx.user._id))
      .unique();
    if (!account) throw new Error("Billing account not found");

    const priceCredits = course.priceCredits;
    if (!Number.isFinite(priceCredits) || priceCredits < 1) {
      throw new Error("Invalid course price");
    }
    if (account.creditBalance < priceCredits) {
      const creditPriceCents = await getCreditPriceCents(ctx);
      const needCents = Math.round(priceCredits * creditPriceCents);
      const needTtd = (needCents / 100).toLocaleString(undefined, {
        minimumFractionDigits: Number.isInteger(needCents / 100) ? 0 : 2,
        maximumFractionDigits: 2,
      });
      throw new Error(
        `Not enough balance. Top up at least $${needTtd} TTD to buy this course.`,
      );
    }

    const now = Date.now();
    const balanceAfter = account.creditBalance - priceCredits;
    await ctx.db.patch(account._id, {
      creditBalance: balanceAfter,
      updatedAt: now,
    });

    const creditTransactionId = await ctx.db.insert("creditTransactions", {
      userId: ctx.user._id,
      billingAccountId: account._id,
      kind: "course_purchase",
      amount: -priceCredits,
      balanceAfter,
      reason: `Academy: ${course.title.slice(0, 80)}`,
      createdAt: now,
    });

    const purchaseId = await ctx.db.insert("academyPurchases", {
      userId: ctx.user._id,
      courseId: course._id,
      priceCredits,
      creditTransactionId,
      purchasedAt: now,
    });

    await ctx.db.patch(creditTransactionId, { coursePurchaseId: purchaseId });
    await ctx.db.patch(course._id, {
      purchaseCount: course.purchaseCount + 1,
      updatedAt: now,
    });

    return { purchaseId, alreadyOwned: false };
  },
});

const adminCourseReturn = v.object({
  _id: v.id("academyCourses"),
  title: v.string(),
  slug: v.string(),
  descriptionMarkdown: v.string(),
  priceCredits: v.number(),
  coverBunnyPath: v.optional(v.string()),
  coverUrl: v.optional(v.string()),
  bunnyStreamVideoId: v.optional(v.string()),
  status: v.union(v.literal("draft"), v.literal("published")),
  sortOrder: v.number(),
  purchaseCount: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

export const adminListCourses = adminQuery({
  args: {},
  returns: v.array(adminCourseReturn),
  handler: async (ctx) => {
    const rows = await ctx.db.query("academyCourses").withIndex("by_updated").order("desc").collect();
    const out = [];
    for (const course of rows) {
      out.push({
        _id: course._id,
        title: course.title,
        slug: course.slug,
        descriptionMarkdown: course.descriptionMarkdown,
        priceCredits: course.priceCredits,
        coverBunnyPath: course.coverBunnyPath,
        coverUrl: await coverUrlFor(course.coverBunnyPath),
        bunnyStreamVideoId: course.bunnyStreamVideoId,
        status: course.status,
        sortOrder: course.sortOrder,
        purchaseCount: course.purchaseCount,
        createdAt: course.createdAt,
        updatedAt: course.updatedAt,
      });
    }
    return out;
  },
});

export const adminUpsertCourse = adminMutation({
  args: {
    courseId: v.optional(v.id("academyCourses")),
    title: v.string(),
    slug: v.optional(v.string()),
    descriptionMarkdown: v.string(),
    priceCredits: v.number(),
    sortOrder: v.optional(v.number()),
  },
  returns: v.id("academyCourses"),
  handler: async (ctx, args) => {
    const title = args.title.trim();
    if (!title) throw new Error("Title is required");
    const priceCredits = Math.floor(Number(args.priceCredits));
    if (!Number.isFinite(priceCredits) || priceCredits < 1) {
      throw new Error("Price must be at least 1 credit");
    }
    let slug = slugify(args.slug?.trim() || title);
    const now = Date.now();

    const clash = await ctx.db
      .query("academyCourses")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (clash && clash._id !== args.courseId) {
      slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
    }

    if (args.courseId) {
      const existing = await ctx.db.get("academyCourses", args.courseId);
      if (!existing) throw new Error("Course not found");
      await ctx.db.patch(args.courseId, {
        title,
        slug,
        descriptionMarkdown: args.descriptionMarkdown,
        priceCredits,
        sortOrder: args.sortOrder ?? existing.sortOrder,
        updatedAt: now,
      });
      return args.courseId;
    }

    return await ctx.db.insert("academyCourses", {
      title,
      slug,
      descriptionMarkdown: args.descriptionMarkdown,
      priceCredits,
      status: "draft",
      sortOrder: args.sortOrder ?? 100,
      purchaseCount: 0,
      createdByAdminId: ctx.user._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const adminSetCourseStatus = adminMutation({
  args: {
    courseId: v.id("academyCourses"),
    status: v.union(v.literal("draft"), v.literal("published")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const course = await ctx.db.get("academyCourses", args.courseId);
    if (!course) throw new Error("Course not found");
    if (args.status === "published") {
      if (!course.bunnyStreamVideoId) {
        throw new Error("Attach a course video before publishing");
      }
      if (!course.title.trim() || course.priceCredits < 1) {
        throw new Error("Title and price are required to publish");
      }
    }
    await ctx.db.patch(args.courseId, {
      status: args.status,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const adminAttachStreamVideo = adminMutation({
  args: {
    courseId: v.id("academyCourses"),
    bunnyStreamVideoId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const course = await ctx.db.get("academyCourses", args.courseId);
    if (!course) throw new Error("Course not found");
    const videoId = args.bunnyStreamVideoId.trim();
    if (!videoId) throw new Error("Video id required");
    await ctx.db.patch(args.courseId, {
      bunnyStreamVideoId: videoId,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const adminSetCourseCover = adminMutation({
  args: {
    courseId: v.id("academyCourses"),
    coverBunnyPath: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const course = await ctx.db.get("academyCourses", args.courseId);
    if (!course) throw new Error("Course not found");
    await ctx.db.patch(args.courseId, {
      coverBunnyPath: args.coverBunnyPath,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const adminPrepareCoverUpload = adminMutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const adminListCoursePurchases = adminQuery({
  args: { courseId: v.id("academyCourses") },
  returns: v.array(
    v.object({
      _id: v.id("academyPurchases"),
      userId: v.id("users"),
      userLabel: v.string(),
      priceCredits: v.number(),
      purchasedAt: v.number(),
      granted: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("academyPurchases")
      .withIndex("by_course", (q) => q.eq("courseId", args.courseId))
      .collect();
    rows.sort((a, b) => b.purchasedAt - a.purchasedAt);
    const out = [];
    for (const row of rows) {
      const user = await ctx.db.get("users", row.userId);
      const userLabel =
        user?.email ||
        user?.phone ||
        user?.name ||
        String(row.userId).slice(0, 12);
      out.push({
        _id: row._id,
        userId: row.userId,
        userLabel,
        priceCredits: row.priceCredits,
        purchasedAt: row.purchasedAt,
        granted: Boolean(row.grantedByAdminId),
      });
    }
    return out;
  },
});

export const adminGrantCourse = adminMutation({
  args: {
    courseId: v.id("academyCourses"),
    userId: v.id("users"),
  },
  returns: v.id("academyPurchases"),
  handler: async (ctx, args) => {
    const course = await ctx.db.get("academyCourses", args.courseId);
    if (!course) throw new Error("Course not found");
    const user = await ctx.db.get("users", args.userId);
    if (!user) throw new Error("User not found");
    const existing = await findPurchase(ctx, args.userId, args.courseId);
    if (existing) return existing._id;
    const now = Date.now();
    const purchaseId = await ctx.db.insert("academyPurchases", {
      userId: args.userId,
      courseId: args.courseId,
      priceCredits: 0,
      grantedByAdminId: ctx.user._id,
      purchasedAt: now,
    });
    await ctx.db.patch(args.courseId, {
      purchaseCount: course.purchaseCount + 1,
      updatedAt: now,
    });
    return purchaseId;
  },
});

export const adminRevokeCourse = adminMutation({
  args: { purchaseId: v.id("academyPurchases") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const purchase = await ctx.db.get("academyPurchases", args.purchaseId);
    if (!purchase) return null;
    const course = await ctx.db.get("academyCourses", purchase.courseId);
    await ctx.db.delete(args.purchaseId);
    if (course) {
      await ctx.db.patch(course._id, {
        purchaseCount: Math.max(0, course.purchaseCount - 1),
        updatedAt: Date.now(),
      });
    }
    return null;
  },
});

/** Internal lookup for actions (pre-codegen-safe via api after deploy). */
export const adminGetCourseInternal = adminQuery({
  args: { courseId: v.id("academyCourses") },
  returns: v.union(
    v.object({
      _id: v.id("academyCourses"),
      title: v.string(),
      bunnyStreamVideoId: v.optional(v.string()),
      status: v.union(v.literal("draft"), v.literal("published")),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const course = await ctx.db.get("academyCourses", args.courseId);
    if (!course) return null;
    return {
      _id: course._id,
      title: course.title,
      bunnyStreamVideoId: course.bunnyStreamVideoId,
      status: course.status,
    };
  },
});

export const internalGetCourse = internalQuery({
  args: { courseId: v.id("academyCourses") },
  returns: v.union(
    v.object({
      _id: v.id("academyCourses"),
      title: v.string(),
      bunnyStreamVideoId: v.optional(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const course = await ctx.db.get("academyCourses", args.courseId);
    if (!course) return null;
    return {
      _id: course._id,
      title: course.title,
      bunnyStreamVideoId: course.bunnyStreamVideoId,
    };
  },
});

export const internalAttachStreamVideo = internalMutation({
  args: {
    courseId: v.id("academyCourses"),
    bunnyStreamVideoId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.courseId, {
      bunnyStreamVideoId: args.bunnyStreamVideoId,
      updatedAt: Date.now(),
    });
    return null;
  },
});

const DEMO_COURSES = [
  {
    slug: "demo-seedance-hooks",
    title: "Seedance Hooks That Sell",
    priceCredits: 120,
    sortOrder: 10,
    descriptionMarkdown: `## What you'll learn

Build **3-second hooks** that stop the scroll — without looking like AI sludge.

### Inside
- Opening beat formulas for ads
- Gaze + prop anchors that keep the face locked
- When to cut vs hold

> Demo course for layout. Replace the video in Admin → Academy.
`,
  },
  {
    slug: "demo-studio-credits",
    title: "Studio Credits & Cost Control",
    priceCredits: 80,
    sortOrder: 20,
    descriptionMarkdown: `## Keep generation spend sane

How Yatishara Studio credits map to image, video, and audio runs.

### Topics
- Credit price vs TTD top-ups
- When Assistance burns balance
- Batch vs one-shot generation

*Demo content — safe to delete after you publish real courses.*
`,
  },
  {
    slug: "demo-creative-network",
    title: "Creative Network Seller Playbook",
    priceCredits: 200,
    sortOrder: 30,
    descriptionMarkdown: `## Get hired on Creative Network

From KYC to first delivered job — the operator path we use in Studio.

1. Seller application
2. Offer packages that convert
3. Escrow handoff without drama

Markdown rich description demo for the Academy detail pane.
`,
  },
  {
    slug: "demo-product-photoshoot",
    title: "Product Photoshoot Prompts",
    priceCredits: 150,
    sortOrder: 40,
    descriptionMarkdown: `## Brand-ready stills from one SKU photo

Prompt stacks for hero, lifestyle, and marketplace cards.

- Lighting locks
- Angle consistency
- Text cleanup without mush

Demo course — attach a real Bunny Stream video when ready.
`,
  },
  {
    slug: "demo-whatsapp-cs-voice",
    title: "WhatsApp CS Voice (Sasha)",
    priceCredits: 100,
    sortOrder: 50,
    descriptionMarkdown: `## Soft-accept without sounding robotic

Tone, pacing, and follow-up patterns for Yatishara CS on WhatsApp.

### Includes
- Soft-accept examples
- Deposit nudges
- When to escalate to Jake

Placeholder for Academy UI review.
`,
  },
] as const;

/**
 * Deploy-key bootstrap — `npx convex run academy:internalSeedDemoCourses`
 * Idempotent by slug. Published with placeholder Stream ids (catalog/layout only).
 */
export const internalSeedDemoCourses = internalMutation({
  args: {},
  returns: v.object({
    created: v.number(),
    updated: v.number(),
  }),
  handler: async (ctx) => {
    const admin =
      (await ctx.db
        .query("users")
        .withIndex("by_role", (q) => q.eq("role", "super_admin"))
        .first()) ||
      (await ctx.db
        .query("users")
        .withIndex("by_role", (q) => q.eq("role", "admin"))
        .first());
    if (!admin) {
      throw new Error("No admin user found to own demo courses");
    }

    const now = Date.now();
    let created = 0;
    let updated = 0;

    for (const seed of DEMO_COURSES) {
      const existing = await ctx.db
        .query("academyCourses")
        .withIndex("by_slug", (q) => q.eq("slug", seed.slug))
        .unique();

      const fields = {
        title: seed.title,
        slug: seed.slug,
        descriptionMarkdown: seed.descriptionMarkdown,
        priceCredits: seed.priceCredits,
        bunnyStreamVideoId: `demo-placeholder-${seed.slug}`,
        status: "published" as const,
        sortOrder: seed.sortOrder,
        updatedAt: now,
      };

      if (existing) {
        await ctx.db.patch(existing._id, fields);
        updated += 1;
      } else {
        await ctx.db.insert("academyCourses", {
          ...fields,
          purchaseCount: 0,
          createdByAdminId: admin._id,
          createdAt: now,
        });
        created += 1;
      }
    }

    return { created, updated };
  },
});
