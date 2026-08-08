import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { getCreditPriceCents } from "./marketplaceEscrow";
import {
  courseIsBuyable,
  effectiveCoursePriceCredits,
} from "./academyPricing";

function courseIntroVideoId(course: Doc<"academyCourses">): string | undefined {
  return course.introBunnyStreamVideoId || course.bunnyStreamVideoId;
}

async function listPublishedLessons(
  ctx: MutationCtx,
  courseId: Id<"academyCourses">,
) {
  const rows = await ctx.db
    .query("academyLessons")
    .withIndex("by_course_and_sort", (q) => q.eq("courseId", courseId))
    .collect();
  return rows
    .filter((row) => row.status === "published")
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt);
}

/**
 * Lifetime course purchase for a specific user (wallet debit).
 * Used by learner checkout and PayWise shortfall auto-buy.
 */
export async function purchaseCourseForUser(
  ctx: MutationCtx,
  userId: Id<"users">,
  courseId: Id<"academyCourses">,
): Promise<{ purchaseId: Id<"academyPurchases">; alreadyOwned: boolean }> {
  const course = await ctx.db.get("academyCourses", courseId);
  if (!course || course.status !== "published") {
    throw new Error("Course is not available");
  }
  const publishedLessons = await listPublishedLessons(ctx, course._id);
  if (publishedLessons.length < 1 && !courseIntroVideoId(course)) {
    throw new Error("Course content is not ready yet");
  }

  const existing = await ctx.db
    .query("academyPurchases")
    .withIndex("by_user_and_course", (q) =>
      q.eq("userId", userId).eq("courseId", course._id),
    )
    .unique();
  if (existing) {
    return { purchaseId: existing._id, alreadyOwned: true };
  }

  const account = await ctx.db
    .query("billingAccounts")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  if (!account) throw new Error("Billing account not found");

  const priceCredits = effectiveCoursePriceCredits(course);
  if (!Number.isFinite(priceCredits) || priceCredits < 1) {
    throw new Error("Invalid course price");
  }
  if (!courseIsBuyable(course)) {
    throw new Error("Course is not available for purchase yet");
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
    userId,
    billingAccountId: account._id,
    kind: "course_purchase",
    amount: -priceCredits,
    balanceAfter,
    reason: `Academy: ${course.title.slice(0, 80)}`,
    createdAt: now,
  });

  const purchaseId = await ctx.db.insert("academyPurchases", {
    userId,
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
}
