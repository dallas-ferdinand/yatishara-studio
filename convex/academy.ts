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
  CN_CARD_TRANSFORM,
  PEEK_TRANSFORM,
  PREVIEW_TRANSFORM,
  ACADEMY_COVER_TRANSFORM,
  signBunnyCdnUrls,
  signBunnyFullUrl,
  signBunnyThumbUrl,
  THUMB_TRANSFORM,
  type BunnyImageTransform,
} from "./lib/bunny";
import { purchaseCourseForUser } from "./lib/academyPurchase";
import { nextCreditBalanceHigh } from "./lib/creditBalanceHigh";
import {
  compareAtCoursePriceCredits,
  effectiveCoursePriceCredits,
  isCourseSaleActive,
} from "./lib/academyPricing";
import {
  commentSortFetchCap,
  normalizeCommentSort,
  sortCommentRows,
} from "./lib/commentSort";
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

/** Optimizer-sized covers — never full-res (matches CN / posts). */
async function coverUrlFor(
  path: string | undefined,
  transform: BunnyImageTransform = CN_CARD_TRANSFORM,
): Promise<string | undefined> {
  if (!path) return undefined;
  const expires = Math.floor(Date.now() / 1000) + COVER_URL_TTL_SEC;
  try {
    return await signBunnyThumbUrl(path, expires, transform);
  } catch {
    return undefined;
  }
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

const courseStatusValidator = v.union(
  v.literal("draft"),
  v.literal("published"),
  v.literal("coming_soon"),
);

const catalogCourseReturn = v.object({
  _id: v.id("academyCourses"),
  title: v.string(),
  slug: v.string(),
  blurb: v.string(),
  priceCredits: v.number(),
  compareAtCredits: v.optional(v.number()),
  saleEndsAt: v.optional(v.number()),
  onSale: v.boolean(),
  comingSoon: v.boolean(),
  status: courseStatusValidator,
  coverUrl: v.optional(v.string()),
  owned: v.boolean(),
  lessonCount: v.number(),
  sortOrder: v.number(),
  updatedAt: v.number(),
});

function pricingFieldsForCourse(course: Doc<"academyCourses">, now = Date.now()) {
  const priceCredits = effectiveCoursePriceCredits(course, now);
  const compareAt = compareAtCoursePriceCredits(course, now);
  return {
    priceCredits,
    compareAtCredits: compareAt ?? undefined,
    saleEndsAt: isCourseSaleActive(course, now)
      ? course.saleEndsAt
      : undefined,
    onSale: isCourseSaleActive(course, now),
    comingSoon: course.status === "coming_soon",
    status: course.status,
  };
}

async function listCatalogCourses(ctx: QueryCtx) {
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
  return rows;
}

const lessonSummaryReturn = v.object({
  _id: v.id("academyLessons"),
  title: v.string(),
  slug: v.string(),
  blurb: v.string(),
  descriptionMarkdown: v.string(),
  coverUrl: v.optional(v.string()),
  coverThumbUrl: v.optional(v.string()),
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
  compareAtCredits: v.optional(v.number()),
  saleEndsAt: v.optional(v.number()),
  onSale: v.boolean(),
  comingSoon: v.boolean(),
  coverUrl: v.optional(v.string()),
  owned: v.boolean(),
  hasIntroVideo: v.boolean(),
  lessonCount: v.number(),
  lessons: v.array(lessonSummaryReturn),
  commentCount: v.number(),
  status: courseStatusValidator,
  sortOrder: v.number(),
  updatedAt: v.number(),
});

export const listPublishedCourses = authedQuery({
  args: {},
  returns: v.array(catalogCourseReturn),
  handler: async (ctx) => {
    const rows = await listCatalogCourses(ctx);

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
        ...pricingFieldsForCourse(course),
        coverUrl: await coverUrlFor(course.coverBunnyPath, CN_CARD_TRANSFORM),
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
        ...pricingFieldsForCourse(course),
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
    // Learner entitlement = purchase only. Admins see the same unpaid lock UI
    // unless they buy / are granted the course (admin tools stay separate).
    const owned = Boolean(purchase);
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
        /** Player / hero — sharp Academy cover, not list thumb. */
        coverUrl: await coverUrlFor(
          lesson.coverBunnyPath,
          ACADEMY_COVER_TRANSFORM,
        ),
        /** Lesson rail circle — small Optimizer thumb. */
        coverThumbUrl: await coverUrlFor(lesson.coverBunnyPath, THUMB_TRANSFORM),
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
      ...pricingFieldsForCourse(course),
      coverUrl: await coverUrlFor(course.coverBunnyPath, ACADEMY_COVER_TRANSFORM),
      owned,
      hasIntroVideo: Boolean(courseIntroVideoId(course)),
      lessonCount: lessonDocs.filter((l) => l.status === "published").length,
      lessons,
      commentCount: course.commentCount ?? 0,
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
    const published =
      course.status === "published" && lesson.status === "published";
    if (!published) {
      // Draft/unpublished: admins may still preview via admin tooling path.
      if (!admin) return { allowed: false as const };
    } else {
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
    return await purchaseCourseForUser(ctx, ctx.user._id, args.courseId);
  },
});

/** After PayWise shortfall top-up: debit wallet and unlock the course. */
export const internalPurchaseCourseForUser = internalMutation({
  args: {
    userId: v.id("users"),
    courseId: v.id("academyCourses"),
  },
  returns: v.object({
    purchaseId: v.id("academyPurchases"),
    alreadyOwned: v.boolean(),
  }),
  handler: async (ctx, args) => {
    return await purchaseCourseForUser(ctx, args.userId, args.courseId);
  },
});

const adminCourseReturn = v.object({
  _id: v.id("academyCourses"),
  title: v.string(),
  slug: v.string(),
  descriptionMarkdown: v.string(),
  priceCredits: v.number(),
  listPriceCredits: v.optional(v.number()),
  salePriceCredits: v.optional(v.number()),
  saleEndsAt: v.optional(v.number()),
  coverBunnyPath: v.optional(v.string()),
  coverUrl: v.optional(v.string()),
  introBunnyStreamVideoId: v.optional(v.string()),
  bunnyStreamVideoId: v.optional(v.string()),
  lessonCount: v.number(),
  status: courseStatusValidator,
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
        listPriceCredits: course.listPriceCredits,
        salePriceCredits: course.salePriceCredits,
        saleEndsAt: course.saleEndsAt,
        coverBunnyPath: course.coverBunnyPath,
        coverUrl: await coverUrlFor(course.coverBunnyPath, THUMB_TRANSFORM),
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
        coverUrl: await coverUrlFor(lesson.coverBunnyPath, THUMB_TRANSFORM),
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
    listPriceCredits: v.optional(v.number()),
    salePriceCredits: v.optional(v.number()),
    saleEndsAt: v.optional(v.union(v.number(), v.null())),
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
    const listPriceCredits =
      args.listPriceCredits == null
        ? undefined
        : Math.floor(Number(args.listPriceCredits));
    if (
      listPriceCredits != null &&
      (!Number.isFinite(listPriceCredits) || listPriceCredits < 1)
    ) {
      throw new Error("List price must be at least 1 credit");
    }
    const salePriceCredits =
      args.salePriceCredits == null
        ? undefined
        : Math.floor(Number(args.salePriceCredits));
    if (
      salePriceCredits != null &&
      (!Number.isFinite(salePriceCredits) || salePriceCredits < 1)
    ) {
      throw new Error("Sale price must be at least 1 credit");
    }
    const saleEndsAt =
      args.saleEndsAt === null
        ? undefined
        : args.saleEndsAt == null
          ? undefined
          : Number(args.saleEndsAt);
    let slug = slugify(args.slug?.trim() || title);
    const now = Date.now();

    const clash = await ctx.db
      .query("academyCourses")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (clash && clash._id !== args.courseId) {
      slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
    }

    const pricePatch = {
      priceCredits,
      listPriceCredits: listPriceCredits ?? priceCredits,
      salePriceCredits,
      saleEndsAt,
    };

    if (args.courseId) {
      const existing = await ctx.db.get("academyCourses", args.courseId);
      if (!existing) throw new Error("Course not found");
      await ctx.db.patch(args.courseId, {
        title,
        slug,
        descriptionMarkdown: args.descriptionMarkdown,
        ...pricePatch,
        sortOrder: args.sortOrder ?? existing.sortOrder,
        updatedAt: now,
      });
      return args.courseId;
    }

    return await ctx.db.insert("academyCourses", {
      title,
      slug,
      descriptionMarkdown: args.descriptionMarkdown,
      ...pricePatch,
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
    status: courseStatusValidator,
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
    if (args.status === "coming_soon") {
      if (!course.title.trim() || course.priceCredits < 1) {
        throw new Error("Title and price are required for coming soon");
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

async function revokeCoursePurchaseWithRefund(
  ctx: MutationCtx,
  purchaseId: Id<"academyPurchases">,
  reason: string,
): Promise<{ refundedCredits: number } | null> {
  const purchase = await ctx.db.get("academyPurchases", purchaseId);
  if (!purchase) return null;

  let refundedCredits = 0;
  if (purchase.creditTransactionId) {
    const spend = await ctx.db.get(
      "creditTransactions",
      purchase.creditTransactionId,
    );
    if (spend && spend.amount < 0) {
      const existingRefund = await ctx.db
        .query("creditTransactions")
        .withIndex("by_reversed_transaction", (q) =>
          q.eq("reversesTransactionId", spend._id),
        )
        .unique();
      if (!existingRefund) {
        const account = await ctx.db.get(
          "billingAccounts",
          spend.billingAccountId,
        );
        if (account) {
          const now = Date.now();
          refundedCredits = Math.abs(spend.amount);
          const balanceAfter = account.creditBalance + refundedCredits;
          await ctx.db.patch(account._id, {
            creditBalance: balanceAfter,
            creditBalanceHigh: nextCreditBalanceHigh({
              previousHigh: account.creditBalanceHigh,
              balanceAfter,
              mode: "max",
            }),
            updatedAt: now,
          });
          await ctx.db.insert("creditTransactions", {
            userId: purchase.userId,
            billingAccountId: account._id,
            kind: "refunded",
            amount: refundedCredits,
            balanceAfter,
            reversesTransactionId: spend._id,
            coursePurchaseId: purchase._id,
            reason,
            createdAt: now,
          });
        }
      }
    }
  }

  const course = await ctx.db.get("academyCourses", purchase.courseId);
  await ctx.db.delete(purchaseId);
  if (course) {
    await ctx.db.patch(course._id, {
      purchaseCount: Math.max(0, course.purchaseCount - 1),
      updatedAt: Date.now(),
    });
  }
  return { refundedCredits };
}

export const adminRevokeCourse = adminMutation({
  args: { purchaseId: v.id("academyPurchases") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await revokeCoursePurchaseWithRefund(
      ctx,
      args.purchaseId,
      "Academy purchase revoked by admin",
    );
    return null;
  },
});

/** Ops: revoke a purchase and refund credits (CLI / recovery). */
export const internalRevokeCoursePurchase = internalMutation({
  args: {
    purchaseId: v.id("academyPurchases"),
    reason: v.optional(v.string()),
  },
  returns: v.union(
    v.object({ refundedCredits: v.number() }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    return await revokeCoursePurchaseWithRefund(
      ctx,
      args.purchaseId,
      args.reason ?? "Academy purchase revoked",
    );
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
      status: courseStatusValidator,
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

export {
  internalSeedLiveCourses,
  internalSeedLiveCourses as internalSeedDemoCourses,
} from "./academyLiveCatalog";
export {
  internalSeedAdSideHustleLessons,
  internalSetLessonCover,
  internalSetCourseCover,
} from "./academyAdSideHustleLessons";

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

async function requireCourseAccessForComments(
  ctx: QueryCtx | MutationCtx,
  courseId: Id<"academyCourses">,
  viewer: Doc<"users">,
): Promise<Doc<"academyCourses">> {
  const course = await requirePublishedCourseForUser(ctx, courseId, viewer);
  const purchase = await findPurchase(ctx, viewer._id, courseId);
  if (!purchase) {
    throw new Error("Purchase this course to join the discussion");
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
      PEEK_TRANSFORM,
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
    sort: v.optional(
      v.union(
        v.literal("newest"),
        v.literal("oldest"),
        v.literal("liked"),
        v.literal("replies"),
      ),
    ),
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
    const sort = normalizeCommentSort(args.sort);
    const limit = Math.min(Math.max(args.limit ?? 60, 1), 100);
    const expiresUnix =
      args.expiresUnix ?? Math.floor(Date.now() / 1000) + COMMENT_URL_TTL_SEC;
    const fetchCap = commentSortFetchCap(sort, limit);
    const order = sort === "oldest" ? "asc" : "desc";

    let rows: Doc<"academyComments">[];
    if (args.lessonId) {
      rows = await ctx.db
        .query("academyComments")
        .withIndex("by_lesson_and_created", (q) =>
          q.eq("lessonId", args.lessonId!),
        )
        .order(order)
        .take(fetchCap);
    } else {
      rows = await ctx.db
        .query("academyComments")
        .withIndex("by_course_and_created", (q) => q.eq("courseId", args.courseId))
        .order(order)
        .take(fetchCap);
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
      if (sort === "newest" || sort === "oldest") {
        if (topLevel.length >= limit) break;
      }
    }
    const sorted = sortCommentRows(topLevel, sort).slice(0, limit);
    return hydrateAcademyComments(
      ctx,
      sorted,
      course?.createdByAdminId,
      ctx.user._id,
      expiresUnix,
    );
  },
});

/** Search lesson/course comments and replies (body + author). Requires purchase. */
export const searchComments = authedQuery({
  args: {
    courseId: v.id("academyCourses"),
    lessonId: v.optional(v.id("academyLessons")),
    query: v.string(),
    expiresUnix: v.optional(v.number()),
    limit: v.optional(v.number()),
    sort: v.optional(
      v.union(
        v.literal("newest"),
        v.literal("oldest"),
        v.literal("liked"),
        v.literal("replies"),
      ),
    ),
  },
  returns: v.array(academyCommentReturn),
  handler: async (ctx, args) => {
    const needle = args.query.trim().toLowerCase();
    if (needle.length < 1) return [];
    try {
      await requireCourseAccessForComments(ctx, args.courseId, ctx.user);
    } catch {
      return [];
    }
    if (args.lessonId) {
      const lesson = await ctx.db.get("academyLessons", args.lessonId);
      if (!lesson || lesson.courseId !== args.courseId) return [];
    }
    const sort = normalizeCommentSort(args.sort);
    const limit = Math.min(Math.max(args.limit ?? 40, 1), 80);
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
        .take(500);
    } else {
      rows = await ctx.db
        .query("academyComments")
        .withIndex("by_course_and_created", (q) => q.eq("courseId", args.courseId))
        .order("desc")
        .take(500);
    }

    const candidates: Doc<"academyComments">[] = [];
    for (const row of rows) {
      if (row.deletedAt) continue;
      if (args.lessonId) {
        if (row.lessonId !== args.lessonId) continue;
      } else if (row.lessonId) {
        continue;
      }
      if (row.body.toLowerCase().includes(needle)) {
        candidates.push(row);
        if (candidates.length >= Math.max(limit * 4, 80)) break;
      }
    }

    const course = await ctx.db.get("academyCourses", args.courseId);
    const hydrated = await hydrateAcademyComments(
      ctx,
      candidates,
      course?.createdByAdminId,
      ctx.user._id,
      expiresUnix,
    );
    const matched = hydrated.filter((comment) => {
      const hay = `${comment.body} ${comment.displayName} ${comment.username ?? ""}`.toLowerCase();
      return hay.includes(needle);
    });
    return sortCommentRows(matched, sort).slice(0, limit);
  },
});

/** Public teaser: top engaged comments for locked / unpaid viewers. */
export const listPreviewComments = authedQuery({
  args: {
    courseId: v.id("academyCourses"),
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
    const limit = Math.min(Math.max(args.limit ?? 3, 1), 5);
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
        .take(120);
    } else {
      rows = await ctx.db
        .query("academyComments")
        .withIndex("by_course_and_created", (q) => q.eq("courseId", args.courseId))
        .order("desc")
        .take(120);
    }

    const topLevel: Doc<"academyComments">[] = [];
    for (const row of rows) {
      if (row.deletedAt || row.parentId) continue;
      if (args.lessonId) {
        if (row.lessonId !== args.lessonId) continue;
      } else if (row.lessonId) {
        continue;
      }
      topLevel.push(row);
    }

    topLevel.sort((a, b) => {
      const scoreA = (a.likeCount ?? 0) + (a.replyCount ?? 0) * 2;
      const scoreB = (b.likeCount ?? 0) + (b.replyCount ?? 0) * 2;
      if (scoreB !== scoreA) return scoreB - scoreA;
      return b.createdAt - a.createdAt;
    });

    const course = await ctx.db.get("academyCourses", args.courseId);
    return hydrateAcademyComments(
      ctx,
      topLevel.slice(0, limit),
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
    sort: v.optional(
      v.union(
        v.literal("newest"),
        v.literal("oldest"),
        v.literal("liked"),
        v.literal("replies"),
      ),
    ),
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
    const sort = normalizeCommentSort(args.sort);
    const limit = Math.min(Math.max(args.limit ?? 60, 1), 100);
    const expiresUnix =
      args.expiresUnix ?? Math.floor(Date.now() / 1000) + COMMENT_URL_TTL_SEC;
    const fetchCap = commentSortFetchCap(sort, limit);
    const rows = await ctx.db
      .query("academyComments")
      .withIndex("by_parent_and_created", (q) => q.eq("parentId", args.parentId))
      .order(sort === "oldest" ? "asc" : "desc")
      .take(fetchCap);
    const course = await ctx.db.get("academyCourses", parent.courseId);
    const alive = rows.filter((row) => !row.deletedAt);
    const sorted = sortCommentRows(alive, sort).slice(0, limit);
    return hydrateAcademyComments(
      ctx,
      sorted,
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
    const course = await requireCourseAccessForComments(
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
    await requireCourseAccessForComments(ctx, comment.courseId, ctx.user);
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
