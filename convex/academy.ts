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
import { getMarketplaceSellerForUser, isAdminRole } from "./lib/auth";
import {
  assetThumbnailPath,
  signBunnyCdnUrls,
  signBunnyFullUrl,
  THUMB_TRANSFORM,
} from "./lib/bunny";
import { getCreditPriceCents } from "./lib/marketplaceEscrow";
import {
  accountNameFromUser,
  resolvePublicDisplayName,
} from "./lib/profileEnsure";

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

function courseIntroVideoId(course: Doc<"academyCourses">): string | undefined {
  return (
    course.introBunnyStreamVideoId?.trim() ||
    course.bunnyStreamVideoId?.trim() ||
    undefined
  );
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

async function listLessonsForCourse(
  ctx: QueryCtx | MutationCtx,
  courseId: Id<"academyCourses">,
  opts?: { publishedOnly?: boolean },
): Promise<Doc<"academyLessons">[]> {
  const rows = await ctx.db
    .query("academyLessons")
    .withIndex("by_course_and_sort", (q) => q.eq("courseId", courseId))
    .collect();
  const filtered = opts?.publishedOnly
    ? rows.filter((row) => row.status === "published")
    : rows;
  filtered.sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt);
  return filtered;
}

const catalogCourseReturn = v.object({
  _id: v.id("academyCourses"),
  title: v.string(),
  slug: v.string(),
  blurb: v.string(),
  priceCredits: v.number(),
  coverUrl: v.optional(v.string()),
  owned: v.boolean(),
  lessonCount: v.number(),
  sortOrder: v.number(),
  updatedAt: v.number(),
});

const lessonSummaryReturn = v.object({
  _id: v.id("academyLessons"),
  title: v.string(),
  slug: v.string(),
  blurb: v.string(),
  descriptionMarkdown: v.string(),
  coverUrl: v.optional(v.string()),
  hasVideo: v.boolean(),
  sortOrder: v.number(),
  status: v.union(v.literal("draft"), v.literal("published")),
  commentCount: v.number(),
});

const courseDetailReturn = v.object({
  _id: v.id("academyCourses"),
  title: v.string(),
  slug: v.string(),
  descriptionMarkdown: v.string(),
  priceCredits: v.number(),
  coverUrl: v.optional(v.string()),
  owned: v.boolean(),
  hasIntroVideo: v.boolean(),
  lessonCount: v.number(),
  lessons: v.array(lessonSummaryReturn),
  commentCount: v.number(),
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
      const lessons = await listLessonsForCourse(ctx, course._id, {
        publishedOnly: true,
      });
      out.push({
        _id: course._id,
        title: course.title,
        slug: course.slug,
        blurb: blurbFromMarkdown(course.descriptionMarkdown),
        priceCredits: course.priceCredits,
        coverUrl: await coverUrlFor(course.coverBunnyPath),
        owned: Boolean(purchase),
        lessonCount: lessons.length,
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
      const lessons = await listLessonsForCourse(ctx, course._id, {
        publishedOnly: true,
      });
      out.push({
        _id: course._id,
        title: course.title,
        slug: course.slug,
        blurb: blurbFromMarkdown(course.descriptionMarkdown),
        priceCredits: course.priceCredits,
        coverUrl: await coverUrlFor(course.coverBunnyPath),
        owned: true,
        lessonCount: lessons.length,
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

    const lessonDocs = await listLessonsForCourse(ctx, course._id, {
      publishedOnly: !admin,
    });
    const lessons = [];
    for (const lesson of lessonDocs) {
      lessons.push({
        _id: lesson._id,
        title: lesson.title,
        slug: lesson.slug,
        blurb: blurbFromMarkdown(lesson.descriptionMarkdown),
        descriptionMarkdown: lesson.descriptionMarkdown,
        coverUrl: await coverUrlFor(lesson.coverBunnyPath),
        hasVideo: Boolean(lesson.bunnyStreamVideoId) && owned,
        sortOrder: lesson.sortOrder,
        status: lesson.status,
        commentCount: lesson.commentCount ?? 0,
      });
    }

    return {
      _id: course._id,
      title: course.title,
      slug: course.slug,
      descriptionMarkdown: course.descriptionMarkdown,
      priceCredits: course.priceCredits,
      coverUrl: await coverUrlFor(course.coverBunnyPath),
      owned: Boolean(purchase) || admin,
      hasIntroVideo: Boolean(courseIntroVideoId(course)),
      lessonCount: lessonDocs.filter((l) => l.status === "published").length,
      lessons,
      commentCount: course.commentCount ?? 0,
      status: course.status,
      sortOrder: course.sortOrder,
      updatedAt: course.updatedAt,
    };
  },
});

/** Free intro playback — published course, no purchase required. */
export const getIntroPlaybackAccess = authedQuery({
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
    if (!course) return { allowed: false as const };
    const videoId = courseIntroVideoId(course);
    if (!videoId) return { allowed: false as const };
    const admin = isAdminRole(ctx.user.role);
    if (!admin && course.status !== "published") {
      return { allowed: false as const };
    }
    return { allowed: true as const, bunnyStreamVideoId: videoId };
  },
});

/** Paid lesson playback — entitlement required. */
export const getLessonPlaybackAccess = authedQuery({
  args: { lessonId: v.id("academyLessons") },
  returns: v.union(
    v.object({
      allowed: v.literal(true),
      bunnyStreamVideoId: v.string(),
      courseId: v.id("academyCourses"),
    }),
    v.object({ allowed: v.literal(false) }),
  ),
  handler: async (ctx, args) => {
    const lesson = await ctx.db.get("academyLessons", args.lessonId);
    if (!lesson?.bunnyStreamVideoId) return { allowed: false as const };
    const course = await ctx.db.get("academyCourses", lesson.courseId);
    if (!course) return { allowed: false as const };
    const admin = isAdminRole(ctx.user.role);
    if (!admin) {
      if (course.status !== "published" || lesson.status !== "published") {
        return { allowed: false as const };
      }
      const purchase = await findPurchase(ctx, ctx.user._id, course._id);
      if (!purchase) return { allowed: false as const };
    }
    return {
      allowed: true as const,
      bunnyStreamVideoId: lesson.bunnyStreamVideoId,
      courseId: course._id,
    };
  },
});

/** @deprecated Use getIntroPlaybackAccess / getLessonPlaybackAccess. */
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
    if (!course) return { allowed: false as const };
    const videoId = courseIntroVideoId(course);
    if (!videoId) return { allowed: false as const };
    const admin = isAdminRole(ctx.user.role);
    if (!admin && course.status !== "published") {
      return { allowed: false as const };
    }
    return { allowed: true as const, bunnyStreamVideoId: videoId };
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
    const publishedLessons = await listLessonsForCourse(ctx, course._id, {
      publishedOnly: true,
    });
    if (publishedLessons.length < 1 && !courseIntroVideoId(course)) {
      throw new Error("Course content is not ready yet");
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
  introBunnyStreamVideoId: v.optional(v.string()),
  bunnyStreamVideoId: v.optional(v.string()),
  lessonCount: v.number(),
  status: v.union(v.literal("draft"), v.literal("published")),
  sortOrder: v.number(),
  purchaseCount: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

const adminLessonReturn = v.object({
  _id: v.id("academyLessons"),
  courseId: v.id("academyCourses"),
  title: v.string(),
  slug: v.string(),
  descriptionMarkdown: v.string(),
  coverBunnyPath: v.optional(v.string()),
  coverUrl: v.optional(v.string()),
  bunnyStreamVideoId: v.optional(v.string()),
  status: v.union(v.literal("draft"), v.literal("published")),
  sortOrder: v.number(),
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
      const lessons = await listLessonsForCourse(ctx, course._id);
      out.push({
        _id: course._id,
        title: course.title,
        slug: course.slug,
        descriptionMarkdown: course.descriptionMarkdown,
        priceCredits: course.priceCredits,
        coverBunnyPath: course.coverBunnyPath,
        coverUrl: await coverUrlFor(course.coverBunnyPath),
        introBunnyStreamVideoId: courseIntroVideoId(course),
        bunnyStreamVideoId: course.bunnyStreamVideoId,
        lessonCount: lessons.length,
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

export const adminListLessons = adminQuery({
  args: { courseId: v.id("academyCourses") },
  returns: v.array(adminLessonReturn),
  handler: async (ctx, args) => {
    const rows = await listLessonsForCourse(ctx, args.courseId);
    const out = [];
    for (const lesson of rows) {
      out.push({
        _id: lesson._id,
        courseId: lesson.courseId,
        title: lesson.title,
        slug: lesson.slug,
        descriptionMarkdown: lesson.descriptionMarkdown,
        coverBunnyPath: lesson.coverBunnyPath,
        coverUrl: await coverUrlFor(lesson.coverBunnyPath),
        bunnyStreamVideoId: lesson.bunnyStreamVideoId,
        status: lesson.status,
        sortOrder: lesson.sortOrder,
        createdAt: lesson.createdAt,
        updatedAt: lesson.updatedAt,
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
      commentCount: 0,
      createdByAdminId: ctx.user._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const adminUpsertLesson = adminMutation({
  args: {
    lessonId: v.optional(v.id("academyLessons")),
    courseId: v.id("academyCourses"),
    title: v.string(),
    slug: v.optional(v.string()),
    descriptionMarkdown: v.string(),
    sortOrder: v.optional(v.number()),
    status: v.optional(v.union(v.literal("draft"), v.literal("published"))),
  },
  returns: v.id("academyLessons"),
  handler: async (ctx, args) => {
    const course = await ctx.db.get("academyCourses", args.courseId);
    if (!course) throw new Error("Course not found");
    const title = args.title.trim();
    if (!title) throw new Error("Lesson title is required");
    let slug = slugify(args.slug?.trim() || title);
    const now = Date.now();

    const siblings = await listLessonsForCourse(ctx, args.courseId);
    const clash = siblings.find(
      (row) => row.slug === slug && row._id !== args.lessonId,
    );
    if (clash) {
      slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
    }

    if (args.lessonId) {
      const existing = await ctx.db.get("academyLessons", args.lessonId);
      if (!existing || existing.courseId !== args.courseId) {
        throw new Error("Lesson not found");
      }
      await ctx.db.patch(args.lessonId, {
        title,
        slug,
        descriptionMarkdown: args.descriptionMarkdown,
        sortOrder: args.sortOrder ?? existing.sortOrder,
        status: args.status ?? existing.status,
        updatedAt: now,
      });
      await ctx.db.patch(args.courseId, { updatedAt: now });
      return args.lessonId;
    }

    const maxSort = siblings.reduce((m, row) => Math.max(m, row.sortOrder), 0);
    const lessonId = await ctx.db.insert("academyLessons", {
      courseId: args.courseId,
      title,
      slug,
      descriptionMarkdown: args.descriptionMarkdown,
      status: args.status ?? "draft",
      sortOrder: args.sortOrder ?? maxSort + 10,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(args.courseId, { updatedAt: now });
    return lessonId;
  },
});

export const adminSetLessonStatus = adminMutation({
  args: {
    lessonId: v.id("academyLessons"),
    status: v.union(v.literal("draft"), v.literal("published")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const lesson = await ctx.db.get("academyLessons", args.lessonId);
    if (!lesson) throw new Error("Lesson not found");
    if (args.status === "published" && !lesson.bunnyStreamVideoId) {
      throw new Error("Attach a lesson video before publishing");
    }
    const now = Date.now();
    await ctx.db.patch(args.lessonId, { status: args.status, updatedAt: now });
    await ctx.db.patch(lesson.courseId, { updatedAt: now });
    return null;
  },
});

export const adminDeleteLesson = adminMutation({
  args: { lessonId: v.id("academyLessons") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const lesson = await ctx.db.get("academyLessons", args.lessonId);
    if (!lesson) return null;
    await ctx.db.delete(args.lessonId);
    await ctx.db.patch(lesson.courseId, { updatedAt: Date.now() });
    return null;
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
      if (!course.title.trim() || course.priceCredits < 1) {
        throw new Error("Title and price are required to publish");
      }
      const lessons = await listLessonsForCourse(ctx, course._id, {
        publishedOnly: true,
      });
      if (lessons.length < 1 && !courseIntroVideoId(course)) {
        throw new Error("Add an intro video or at least one published lesson");
      }
    }
    await ctx.db.patch(args.courseId, {
      status: args.status,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const adminAttachIntroStreamVideo = adminMutation({
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
      introBunnyStreamVideoId: videoId,
      updatedAt: Date.now(),
    });
    return null;
  },
});

/** @deprecated Prefer adminAttachIntroStreamVideo. */
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
      introBunnyStreamVideoId: videoId,
      bunnyStreamVideoId: videoId,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const adminAttachLessonStreamVideo = adminMutation({
  args: {
    lessonId: v.id("academyLessons"),
    bunnyStreamVideoId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const lesson = await ctx.db.get("academyLessons", args.lessonId);
    if (!lesson) throw new Error("Lesson not found");
    const videoId = args.bunnyStreamVideoId.trim();
    if (!videoId) throw new Error("Video id required");
    const now = Date.now();
    await ctx.db.patch(args.lessonId, {
      bunnyStreamVideoId: videoId,
      updatedAt: now,
    });
    await ctx.db.patch(lesson.courseId, { updatedAt: now });
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

export const adminSetLessonCover = adminMutation({
  args: {
    lessonId: v.id("academyLessons"),
    coverBunnyPath: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const lesson = await ctx.db.get("academyLessons", args.lessonId);
    if (!lesson) throw new Error("Lesson not found");
    const now = Date.now();
    await ctx.db.patch(args.lessonId, {
      coverBunnyPath: args.coverBunnyPath,
      updatedAt: now,
    });
    await ctx.db.patch(lesson.courseId, { updatedAt: now });
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

export const adminGetCourseInternal = adminQuery({
  args: { courseId: v.id("academyCourses") },
  returns: v.union(
    v.object({
      _id: v.id("academyCourses"),
      title: v.string(),
      introBunnyStreamVideoId: v.optional(v.string()),
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
      introBunnyStreamVideoId: courseIntroVideoId(course),
      bunnyStreamVideoId: course.bunnyStreamVideoId,
      status: course.status,
    };
  },
});

export const adminGetLessonInternal = adminQuery({
  args: { lessonId: v.id("academyLessons") },
  returns: v.union(
    v.object({
      _id: v.id("academyLessons"),
      courseId: v.id("academyCourses"),
      title: v.string(),
      bunnyStreamVideoId: v.optional(v.string()),
      status: v.union(v.literal("draft"), v.literal("published")),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const lesson = await ctx.db.get("academyLessons", args.lessonId);
    if (!lesson) return null;
    return {
      _id: lesson._id,
      courseId: lesson.courseId,
      title: lesson.title,
      bunnyStreamVideoId: lesson.bunnyStreamVideoId,
      status: lesson.status,
    };
  },
});

export const internalGetCourse = internalQuery({
  args: { courseId: v.id("academyCourses") },
  returns: v.union(
    v.object({
      _id: v.id("academyCourses"),
      title: v.string(),
      introBunnyStreamVideoId: v.optional(v.string()),
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
      introBunnyStreamVideoId: courseIntroVideoId(course),
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
      introBunnyStreamVideoId: args.bunnyStreamVideoId,
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
    priceCredits: 20,
    sortOrder: 10,
    descriptionMarkdown: `## What you'll learn

Build **3-second hooks** that stop the scroll — without looking like AI sludge.

You will lock gaze and props, choose when to cut vs hold, and reuse three opening-beat formulas across ad formats.

> Demo course for layout. Replace the intro and lessons in Admin → Academy.
`,
    lessons: [
      {
        slug: "gaze-anchors",
        title: "Gaze and prop anchors",
        sortOrder: 10,
        descriptionMarkdown: `## Gaze and prop anchors

Seedance drifts when the face or hero prop is soft in the first frame. This lesson locks both so the model stays on the sell.

### What you lock
- **Eyes** — clear catchlight, looking where the viewer should look next
- **Prop / product** — one hero object in a fixed screen quadrant
- **Hands** — if hands enter, they stay on the prop (no wandering)

### Drill
1. Pick one still with a hard face + product read.
2. Write a one-line gaze lock (“eyes on product, product lower-right”).
3. Generate a 3–4s hold. Reject anything that loses the face or product.

### Done when
A stranger can say what the product is and who is selling it in the first second.
`,
      },
      {
        slug: "cut-vs-hold",
        title: "When to cut vs hold",
        sortOrder: 20,
        descriptionMarkdown: `## When to cut vs hold

Hooks convert when tension and payoff are timed. Holding sells emotion; cutting sells the product.

### Hold when
- Face reaction is the story
- Prop reveal needs one continuous motion
- Sound / silence is doing the work

### Cut when
- You need a product insert or pack shot
- The beat has already paid off and you are looping
- AI mush starts (blur, morph, duplicate limbs)

### Pattern
**0.0–1.2s hold** → **hard cut to product** → **0.5–1.0s pack / CTA**.

### Done when
You can explain, for one ad, why each cut exists — not “because it looked cool.”
`,
      },
      {
        slug: "hook-formulas",
        title: "Opening beat formulas",
        sortOrder: 30,
        descriptionMarkdown: `## Opening beat formulas

Three reusable openings for Seedance ads. Swap product, keep structure.

### 1. Problem stare
Face registers pain → prop enters as fix → hold on relief.

### 2. Product first
Hero object fills frame → hands / face arrive late → cut to use.

### 3. Motion interrupt
Unexpected move in first 8 frames → settle on brand lock → CTA.

### How to practice
Run each formula once on the same SKU. Keep prompts short. Compare which stops the scroll for *your* niche.

### Done when
You have three saved prompt templates with locked gaze, prop, and cut points.
`,
      },
    ],
  },
  {
    slug: "demo-studio-credits",
    title: "Studio Credits & Cost Control",
    priceCredits: 80,
    sortOrder: 20,
    descriptionMarkdown: `## Keep generation spend sane

How Yatishara Studio credits map to image, video, and audio runs.

*Demo content — safe to delete after you publish real courses.*
`,
    lessons: [
      {
        slug: "price-map",
        title: "Credit price vs TTD top-ups",
        sortOrder: 10,
        descriptionMarkdown: `## Credit price vs TTD top-ups

Studio spends **credits**. The wallet shows TTD so you can top up without doing mental math.

### Mental model
- 1 credit ≈ your configured TTD credit price (default TT$0.50)
- Image / video / audio burns depend on model, resolution, and duration
- Top-up tiers buy a credit balance, not a single render

### Operator habit
Before a batch, estimate credits for one good take × retries. Leave headroom for Assistance if you use it.

### Done when
You can glance at balance and know whether a 15s Seedance pass plus two retries fits.
`,
      },
      {
        slug: "assistance-burn",
        title: "When Assistance burns balance",
        sortOrder: 20,
        descriptionMarkdown: `## When Assistance burns balance

Assistance is not free chat — tool calls that generate or edit media spend credits like you would.

### What costs
- Image / video / audio generation tools
- Heavy edit / export paths that re-render
- Retries when the agent re-runs a failed job

### What is cheaper
- Brief edits, folder moves, and planning without generate
- Confirming model + resolution once before a batch

### Done when
You know which Assistance asks will touch the wallet — and you approve those on purpose.
`,
      },
    ],
  },
  {
    slug: "demo-creative-network",
    title: "Creative Network Seller Playbook",
    priceCredits: 200,
    sortOrder: 30,
    descriptionMarkdown: `## Get hired on Creative Network

From KYC to first delivered job — the operator path we use in Studio.
`,
    lessons: [
      {
        slug: "seller-apply",
        title: "Seller application",
        sortOrder: 10,
        descriptionMarkdown: `## Seller application

Admins approve sellers before offers go live. Your application is a trust packet, not a bio.

### What to show
- Clear samples that match the services you will sell
- Honest delivery windows
- KYC / payout details ready when asked

### What kills trust
- Stock-only portfolios with no process
- Vague “I do everything” copy
- Pricing that does not match your sample quality

### Done when
Your seller profile reads like a bookable operator, not a wishlist.
`,
      },
      {
        slug: "offer-packages",
        title: "Offer packages that convert",
        sortOrder: 20,
        descriptionMarkdown: `## Offer packages that convert

Buyers scan packages first. Three clear tiers beat a wall of options.

### Package spine
- **Basic** — one clear deliverable, short revisions
- **Standard** — the job most buyers should pick
- **Premium** — speed, extras, or commercial rights

### Copy rules
Lead with outcome, then delivery days, then revisions. No fluff paragraphs above the price.

### Done when
A stranger can pick Standard in under ten seconds without messaging you.
`,
      },
      {
        slug: "escrow-handoff",
        title: "Escrow handoff without drama",
        sortOrder: 30,
        descriptionMarkdown: `## Escrow handoff without drama

Delivery and release is where reputation sticks. Keep a clean trail.

### Flow
1. Confirm scope in the job thread
2. Deliver in-app with the files named clearly
3. Invite revision once if the package includes it
4. Ask for accept / release when scope is met

### Avoid
Silent uploads with no note, scope creep in DMs only, and arguing before documenting the brief.

### Done when
Buyer can accept without hunting files — and you get paid without a support ticket.
`,
      },
    ],
  },
  {
    slug: "demo-product-photoshoot",
    title: "Product Photoshoot Prompts",
    priceCredits: 150,
    sortOrder: 40,
    descriptionMarkdown: `## Brand-ready stills from one SKU photo

Prompt stacks for hero, lifestyle, and marketplace cards.
`,
    lessons: [
      {
        slug: "lighting-locks",
        title: "Lighting locks",
        sortOrder: 10,
        descriptionMarkdown: `## Lighting locks

One SKU across a set only works if lighting language stays fixed.

### Lock language
- Soft key / hard key
- Shadow direction (left / right / overhead)
- Background value (light plate vs dark plate)

### Prompt habit
Write the light lock once. Paste it into every shot in the set. Change only angle and crop.

### Done when
Hero and lifestyle frames look like the same shoot day.
`,
      },
      {
        slug: "marketplace-cards",
        title: "Marketplace card angles",
        sortOrder: 20,
        descriptionMarkdown: `## Marketplace card angles

Listings need a main hero plus supporting crops — not five random pretty shots.

### Set order
1. **Main** — product fills frame, label readable
2. **Secondary** — 3/4 or lifestyle context
3. **Detail** — texture, seal, or feature callout

### Prompt habit
Same lighting lock; change camera distance and crop intent only.

### Done when
You can drop the set into a listing template without re-cropping for readability.
`,
      },
    ],
  },
  {
    slug: "demo-whatsapp-cs-voice",
    title: "WhatsApp CS Voice (Sasha)",
    priceCredits: 100,
    sortOrder: 50,
    descriptionMarkdown: `## Soft-accept without sounding robotic

Tone, pacing, and follow-up patterns for Yatishara CS on WhatsApp.
`,
    lessons: [
      {
        slug: "soft-accept",
        title: "Soft-accept examples",
        sortOrder: 10,
        descriptionMarkdown: `## Soft-accept examples

Warm interest without locking a quote before you have the brief.

### Pattern
Acknowledge → one clarifying ask → soft next step. No price dump on message one.

### Voice
Short, human, Caribbean-friendly. No corporate paragraphs. Name yourself once when the SOP says to.

### Done when
You can soft-accept three different lead types without sounding like a script bot.
`,
      },
      {
        slug: "deposit-nudges",
        title: "Deposit nudges",
        sortOrder: 20,
        descriptionMarkdown: `## Deposit nudges

Move chat to deposit without pressure or endless follow-ups.

### Pattern
Confirm scope → send clear deposit ask + bank block → one polite bump if silent.

### Avoid
Stacking three nudges in an hour, shaming, or changing the number mid-thread.

### Done when
A warm lead knows the amount, where to pay, and what happens after — in one clean thread.
`,
      },
    ],
  },
] as const;

/**
 * Deploy-key bootstrap — `npx convex run academy:internalSeedDemoCourses`
 * Idempotent by course/lesson slug. Published with placeholder Stream ids.
 */
export const internalSeedDemoCourses = internalMutation({
  args: {},
  returns: v.object({
    created: v.number(),
    updated: v.number(),
    lessonsCreated: v.number(),
    lessonsUpdated: v.number(),
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
    let lessonsCreated = 0;
    let lessonsUpdated = 0;

    for (const seed of DEMO_COURSES) {
      const existing = await ctx.db
        .query("academyCourses")
        .withIndex("by_slug", (q) => q.eq("slug", seed.slug))
        .unique();

      const introId = `demo-intro-${seed.slug}`;
      const fields = {
        title: seed.title,
        slug: seed.slug,
        descriptionMarkdown: seed.descriptionMarkdown,
        priceCredits: seed.priceCredits,
        introBunnyStreamVideoId: introId,
        bunnyStreamVideoId: introId,
        status: "published" as const,
        sortOrder: seed.sortOrder,
        updatedAt: now,
      };

      let courseId: Id<"academyCourses">;
      if (existing) {
        await ctx.db.patch(existing._id, fields);
        courseId = existing._id;
        updated += 1;
      } else {
        courseId = await ctx.db.insert("academyCourses", {
          ...fields,
          purchaseCount: 0,
          commentCount: 0,
          createdByAdminId: admin._id,
          createdAt: now,
        });
        created += 1;
      }

      for (const lessonSeed of seed.lessons) {
        const siblings = await ctx.db
          .query("academyLessons")
          .withIndex("by_course_and_slug", (q) =>
            q.eq("courseId", courseId).eq("slug", lessonSeed.slug),
          )
          .unique();
        const lessonFields = {
          title: lessonSeed.title,
          slug: lessonSeed.slug,
          descriptionMarkdown: lessonSeed.descriptionMarkdown,
          bunnyStreamVideoId: `demo-lesson-${seed.slug}-${lessonSeed.slug}`,
          status: "published" as const,
          sortOrder: lessonSeed.sortOrder,
          updatedAt: now,
        };
        if (siblings) {
          await ctx.db.patch(siblings._id, lessonFields);
          lessonsUpdated += 1;
        } else {
          await ctx.db.insert("academyLessons", {
            courseId,
            ...lessonFields,
            createdAt: now,
          });
          lessonsCreated += 1;
        }
      }
    }

    return { created, updated, lessonsCreated, lessonsUpdated };
  },
});

// ---------------------------------------------------------------------------
// Course comments (same capabilities as feed post comments)
// ---------------------------------------------------------------------------

const COMMENT_URL_TTL_SEC = 60 * 60;
const MAX_COMMENT_LEN = 500;

function sanitizeCommentBody(
  raw: string,
  { allowEmpty }: { allowEmpty: boolean },
): string {
  const body = raw.replace(/\s+/g, " ").trim();
  if (!body) {
    if (allowEmpty) return "";
    throw new Error("Comment cannot be empty");
  }
  if (body.length > MAX_COMMENT_LEN) {
    throw new Error(`Comment must be ${MAX_COMMENT_LEN} characters or fewer`);
  }
  return body;
}

async function requirePublishedCourseForUser(
  ctx: QueryCtx | MutationCtx,
  courseId: Id<"academyCourses">,
  viewer: Doc<"users">,
): Promise<Doc<"academyCourses">> {
  const course = await ctx.db.get("academyCourses", courseId);
  if (!course) throw new Error("Course not found");
  if (course.status !== "published" && !isAdminRole(viewer.role)) {
    throw new Error("Course not found");
  }
  return course;
}

const academyCommentReturn = v.object({
  _id: v.id("academyComments"),
  body: v.string(),
  createdAt: v.number(),
  userId: v.id("users"),
  displayName: v.string(),
  username: v.optional(v.string()),
  avatarUrl: v.optional(v.string()),
  isOwner: v.boolean(),
  isMine: v.boolean(),
  parentId: v.optional(v.id("academyComments")),
  likeCount: v.number(),
  replyCount: v.number(),
  likedByMe: v.boolean(),
  imageUrl: v.optional(v.string()),
});

async function signCommentAvatarUrl(
  asset: Doc<"assets"> | null,
  expiresUnix: number,
): Promise<string | undefined> {
  if (!asset || asset.deletedAt || !asset.bunnyPath) return undefined;
  const thumbPath = assetThumbnailPath(asset) ?? asset.bunnyPath;
  if (!thumbPath) return undefined;
  try {
    const signed = await signBunnyCdnUrls(
      [thumbPath],
      expiresUnix,
      THUMB_TRANSFORM,
    );
    return signed.get(thumbPath);
  } catch {
    return undefined;
  }
}

async function hydrateAcademyComments(
  ctx: QueryCtx,
  rows: Doc<"academyComments">[],
  courseOwnerId: Id<"users"> | undefined,
  viewerId: Id<"users">,
  expiresUnix: number,
) {
  const prepared: Array<{
    _id: Id<"academyComments">;
    body: string;
    createdAt: number;
    userId: Id<"users">;
    displayName: string;
    username?: string;
    isOwner: boolean;
    isMine: boolean;
    parentId?: Id<"academyComments">;
    likeCount: number;
    replyCount: number;
    likedByMe: boolean;
    avatarAssetId?: Id<"assets">;
    imageAssetId?: Id<"assets">;
  }> = [];

  for (const row of rows) {
    if (row.deletedAt) continue;
    const user = await ctx.db.get("users", row.userId);
    if (!user) continue;
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", row.userId))
      .unique();
    const seller = await getMarketplaceSellerForUser(ctx, row.userId);
    const displayName = profile
      ? resolvePublicDisplayName({
          username: profile.username,
          useSellerDisplayName: profile.useSellerDisplayName,
          user,
          seller,
        })
      : accountNameFromUser(user) || "User";
    const like = await ctx.db
      .query("academyCommentLikes")
      .withIndex("by_user_and_comment", (q) =>
        q.eq("userId", viewerId).eq("commentId", row._id),
      )
      .unique();
    prepared.push({
      _id: row._id,
      body: row.body,
      createdAt: row.createdAt,
      userId: row.userId,
      displayName,
      username: profile?.username,
      isOwner: courseOwnerId ? row.userId === courseOwnerId : false,
      isMine: viewerId === row.userId,
      parentId: row.parentId,
      likeCount: row.likeCount ?? 0,
      replyCount: row.replyCount ?? 0,
      likedByMe: Boolean(like),
      avatarAssetId: profile?.avatarAssetId,
      imageAssetId: row.imageAssetId,
    });
  }

  const avatarAssets = await Promise.all(
    prepared.map((c) =>
      c.avatarAssetId ? ctx.db.get("assets", c.avatarAssetId) : null,
    ),
  );
  const avatarUrls = await Promise.all(
    avatarAssets.map((asset) => signCommentAvatarUrl(asset, expiresUnix)),
  );
  const imageAssets = await Promise.all(
    prepared.map((c) =>
      c.imageAssetId ? ctx.db.get("assets", c.imageAssetId) : null,
    ),
  );
  const imageUrls = await Promise.all(
    imageAssets.map(async (asset) => {
      if (!asset || asset.deletedAt || !asset.bunnyPath || asset.kind !== "image") {
        return undefined;
      }
      return signBunnyFullUrl(asset.bunnyPath, expiresUnix);
    }),
  );

  return prepared.map((comment, index) => ({
    _id: comment._id,
    body: comment.body,
    createdAt: comment.createdAt,
    userId: comment.userId,
    displayName: comment.displayName,
    username: comment.username,
    avatarUrl: avatarUrls[index],
    isOwner: comment.isOwner,
    isMine: comment.isMine,
    parentId: comment.parentId,
    likeCount: comment.likeCount,
    replyCount: comment.replyCount,
    likedByMe: comment.likedByMe,
    imageUrl: imageUrls[index],
  }));
}

export const listComments = authedQuery({
  args: {
    courseId: v.id("academyCourses"),
    /** When set, load that lesson’s thread; otherwise course-overview comments only. */
    lessonId: v.optional(v.id("academyLessons")),
    expiresUnix: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  returns: v.array(academyCommentReturn),
  handler: async (ctx, args) => {
    try {
      await requirePublishedCourseForUser(ctx, args.courseId, ctx.user);
    } catch {
      return [];
    }
    if (args.lessonId) {
      const lesson = await ctx.db.get("academyLessons", args.lessonId);
      if (!lesson || lesson.courseId !== args.courseId) return [];
    }
    const limit = Math.min(Math.max(args.limit ?? 60, 1), 100);
    const expiresUnix =
      args.expiresUnix ?? Math.floor(Date.now() / 1000) + COMMENT_URL_TTL_SEC;

    let rows: Doc<"academyComments">[];
    if (args.lessonId) {
      rows = await ctx.db
        .query("academyComments")
        .withIndex("by_lesson_and_created", (q) =>
          q.eq("lessonId", args.lessonId!),
        )
        .order("desc")
        .take(limit * 3 + 40);
    } else {
      rows = await ctx.db
        .query("academyComments")
        .withIndex("by_course_and_created", (q) => q.eq("courseId", args.courseId))
        .order("desc")
        .take(limit * 3 + 40);
    }

    const course = await ctx.db.get("academyCourses", args.courseId);
    const topLevel: Doc<"academyComments">[] = [];
    for (const row of rows) {
      if (row.deletedAt || row.parentId) continue;
      if (args.lessonId) {
        if (row.lessonId !== args.lessonId) continue;
      } else if (row.lessonId) {
        continue;
      }
      topLevel.push(row);
      if (topLevel.length >= limit) break;
    }
    topLevel.reverse();
    return hydrateAcademyComments(
      ctx,
      topLevel,
      course?.createdByAdminId,
      ctx.user._id,
      expiresUnix,
    );
  },
});

export const listCommentReplies = authedQuery({
  args: {
    parentId: v.id("academyComments"),
    expiresUnix: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  returns: v.array(academyCommentReturn),
  handler: async (ctx, args) => {
    const parent = await ctx.db.get("academyComments", args.parentId);
    if (!parent || parent.deletedAt) return [];
    try {
      await requirePublishedCourseForUser(ctx, parent.courseId, ctx.user);
    } catch {
      return [];
    }
    const limit = Math.min(Math.max(args.limit ?? 60, 1), 100);
    const expiresUnix =
      args.expiresUnix ?? Math.floor(Date.now() / 1000) + COMMENT_URL_TTL_SEC;
    const rows = await ctx.db
      .query("academyComments")
      .withIndex("by_parent_and_created", (q) => q.eq("parentId", args.parentId))
      .order("asc")
      .take(limit + 20);
    const course = await ctx.db.get("academyCourses", parent.courseId);
    const alive = rows.filter((row) => !row.deletedAt).slice(0, limit);
    return hydrateAcademyComments(
      ctx,
      alive,
      course?.createdByAdminId,
      ctx.user._id,
      expiresUnix,
    );
  },
});

export const addComment = authedMutation({
  args: {
    courseId: v.id("academyCourses"),
    lessonId: v.optional(v.id("academyLessons")),
    body: v.string(),
    parentId: v.optional(v.id("academyComments")),
    imageAssetId: v.optional(v.id("assets")),
  },
  returns: v.object({
    commentId: v.id("academyComments"),
    commentCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const course = await requirePublishedCourseForUser(
      ctx,
      args.courseId,
      ctx.user,
    );
    let lesson: Doc<"academyLessons"> | null = null;
    if (args.lessonId) {
      lesson = await ctx.db.get("academyLessons", args.lessonId);
      if (!lesson || lesson.courseId !== args.courseId) {
        throw new Error("Lesson not found");
      }
    }
    const body = sanitizeCommentBody(args.body, {
      allowEmpty: Boolean(args.imageAssetId),
    });
    let imageAssetId: Id<"assets"> | undefined;
    if (args.imageAssetId) {
      const asset = await ctx.db.get("assets", args.imageAssetId);
      if (
        !asset ||
        asset.ownerId !== ctx.user._id ||
        asset.deletedAt ||
        asset.kind !== "image" ||
        !asset.bunnyPath
      ) {
        throw new Error("Image not found");
      }
      imageAssetId = asset._id;
    }
    if (!body && !imageAssetId) {
      throw new Error("Comment cannot be empty");
    }
    let parent: Doc<"academyComments"> | null = null;
    if (args.parentId) {
      parent = await ctx.db.get("academyComments", args.parentId);
      if (!parent || parent.deletedAt || parent.courseId !== args.courseId) {
        throw new Error("Comment not found");
      }
      const parentLesson = parent.lessonId ?? undefined;
      const argLesson = args.lessonId ?? undefined;
      if (parentLesson !== argLesson) {
        throw new Error("Comment not found");
      }
    }
    const commentId = await ctx.db.insert("academyComments", {
      courseId: args.courseId,
      lessonId: lesson?._id,
      userId: ctx.user._id,
      body,
      createdAt: Date.now(),
      parentId: parent?._id,
      likeCount: 0,
      replyCount: 0,
      imageAssetId,
    });
    if (parent) {
      await ctx.db.patch(parent._id, {
        replyCount: (parent.replyCount ?? 0) + 1,
      });
    }
    if (lesson) {
      const commentCount = (lesson.commentCount ?? 0) + 1;
      await ctx.db.patch(lesson._id, { commentCount });
      return { commentId, commentCount };
    }
    const commentCount = (course.commentCount ?? 0) + 1;
    await ctx.db.patch(course._id, { commentCount });
    return { commentId, commentCount };
  },
});

export const toggleCommentLike = authedMutation({
  args: { commentId: v.id("academyComments") },
  returns: v.object({
    liked: v.boolean(),
    likeCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const comment = await ctx.db.get("academyComments", args.commentId);
    if (!comment || comment.deletedAt) {
      throw new Error("Comment not found");
    }
    await requirePublishedCourseForUser(ctx, comment.courseId, ctx.user);
    const existing = await ctx.db
      .query("academyCommentLikes")
      .withIndex("by_user_and_comment", (q) =>
        q.eq("userId", ctx.user._id).eq("commentId", comment._id),
      )
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
      const likeCount = Math.max(0, (comment.likeCount ?? 1) - 1);
      await ctx.db.patch(comment._id, { likeCount });
      return { liked: false, likeCount };
    }
    await ctx.db.insert("academyCommentLikes", {
      userId: ctx.user._id,
      commentId: comment._id,
      createdAt: Date.now(),
    });
    const likeCount = (comment.likeCount ?? 0) + 1;
    await ctx.db.patch(comment._id, { likeCount });
    return { liked: true, likeCount };
  },
});

export const deleteComment = authedMutation({
  args: { commentId: v.id("academyComments") },
  returns: v.object({
    commentCount: v.number(),
  }),
  handler: async (ctx, args) => {
    const comment = await ctx.db.get("academyComments", args.commentId);
    if (!comment || comment.deletedAt) {
      return { commentCount: 0 };
    }
    const course = await ctx.db.get("academyCourses", comment.courseId);
    const isAuthor = comment.userId === ctx.user._id;
    const isCourseAdmin =
      course?.createdByAdminId === ctx.user._id || isAdminRole(ctx.user.role);
    if (!isAuthor && !isCourseAdmin) {
      throw new Error("You cannot delete this comment");
    }
    await ctx.db.patch(comment._id, { deletedAt: Date.now() });
    if (comment.parentId) {
      const parent = await ctx.db.get("academyComments", comment.parentId);
      if (parent && !parent.deletedAt) {
        await ctx.db.patch(parent._id, {
          replyCount: Math.max(0, (parent.replyCount ?? 1) - 1),
        });
      }
    }
    if (comment.lessonId) {
      const lesson = await ctx.db.get("academyLessons", comment.lessonId);
      if (!lesson) return { commentCount: 0 };
      const commentCount = Math.max(0, (lesson.commentCount ?? 1) - 1);
      await ctx.db.patch(lesson._id, { commentCount });
      return { commentCount };
    }
    if (!course) return { commentCount: 0 };
    const commentCount = Math.max(0, (course.commentCount ?? 1) - 1);
    await ctx.db.patch(course._id, { commentCount });
    return { commentCount };
  },
});
