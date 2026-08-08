/**
 * Live Academy catalog — three courses. Seed via:
 *   npx convex run academy:internalSeedLiveCourses
 *
 * Prices are TTD → credits at TT$0.50 / credit.
 * Ad Side Hustle: TT$1500 list / TT$750 sale until 2026-09-01 00:00 AST.
 * Short films: TT$2500 coming soon.
 * Cinematic: TT$4000 coming soon.
 */
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { ttdToCredits } from "./lib/academyPricing";

/** 2026-09-01 00:00 America/Port_of_Spain (UTC-4). */
export const AD_SIDE_HUSTLE_SALE_ENDS_AT = Date.parse(
  "2026-09-01T04:00:00.000Z",
);

export const LIVE_COURSES = [
  {
    slug: "ad-side-hustle",
    title: "Ad Side Hustle Course",
    sortOrder: 10,
    status: "published" as const,
    /** Charge while sale active; also base fallback. */
    priceCredits: ttdToCredits(750),
    listPriceCredits: ttdToCredits(1500),
    salePriceCredits: ttdToCredits(750),
    saleEndsAt: AD_SIDE_HUSTLE_SALE_ENDS_AT,
    descriptionMarkdown: `## Ad Side Hustle Course

Turn Studio into a paid ads machine — hooks, product locks, and client-ready clips without looking like AI sludge.

### What you get
- Scroll-stopping hooks that hold gaze and product
- Prompt stacks you can reuse across SKUs
- Delivery patterns clients actually pay for

### Price
**TT$750** until **1 September 2026** (then TT$1,500). Lifetime Studio access once unlocked.

> Published catalog course. Attach intro + lessons in Admin → Academy when ready.
`,
  },
  {
    slug: "short-films-studio",
    title: "How to Create Short Films in Studio",
    sortOrder: 20,
    status: "coming_soon" as const,
    priceCredits: ttdToCredits(2500),
    listPriceCredits: ttdToCredits(2500),
    descriptionMarkdown: `## How to Create Short Films in Studio

End-to-end short film workflow inside Yatishara Studio — structure, shots, and export.

### Coming soon
Price locked at **TT$2,500**. Catalog card shows the price; the course does not open until we publish.
`,
  },
  {
    slug: "cinematic-film-mastery",
    title: "How to Master Cinematic Film Creation",
    sortOrder: 30,
    status: "coming_soon" as const,
    priceCredits: ttdToCredits(4000),
    listPriceCredits: ttdToCredits(4000),
    descriptionMarkdown: `## How to Master Cinematic Film Creation

Advanced video generation for cinematic looks — lenses, blocking, and grade-aware prompts.

### Coming soon
Price locked at **TT$4,000**. Catalog card shows the price; the course does not open until we publish.
`,
  },
] as const;

const DEMO_SLUGS = [
  "demo-seedance-hooks",
  "demo-studio-credits",
  "demo-creative-network",
  "demo-product-photoshoot",
  "demo-whatsapp-cs-voice",
] as const;

/**
 * Replace demo catalog with the three live courses. Idempotent by slug.
 * Unpublishes leftover demo rows (keeps purchases history intact).
 * Coming-soon courses may publish without lessons/intro.
 */
export const internalSeedLiveCourses = internalMutation({
  args: {},
  returns: v.object({
    created: v.number(),
    updated: v.number(),
    demosRetired: v.number(),
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
      throw new Error("No admin user found to own Academy courses");
    }

    const now = Date.now();
    let created = 0;
    let updated = 0;
    let demosRetired = 0;

    for (const slug of DEMO_SLUGS) {
      const demo = await ctx.db
        .query("academyCourses")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .unique();
      if (demo && demo.status !== "draft") {
        await ctx.db.patch(demo._id, { status: "draft", updatedAt: now });
        demosRetired += 1;
      }
    }

    for (const seed of LIVE_COURSES) {
      const existing = await ctx.db
        .query("academyCourses")
        .withIndex("by_slug", (q) => q.eq("slug", seed.slug))
        .unique();
      const hasSale = "salePriceCredits" in seed && seed.salePriceCredits != null;
      const patch = {
        title: seed.title,
        descriptionMarkdown: seed.descriptionMarkdown,
        priceCredits: seed.priceCredits,
        listPriceCredits: seed.listPriceCredits,
        salePriceCredits: hasSale ? seed.salePriceCredits : undefined,
        saleEndsAt: hasSale && "saleEndsAt" in seed ? seed.saleEndsAt : undefined,
        status: seed.status,
        sortOrder: seed.sortOrder,
        updatedAt: now,
      };
      if (existing) {
        await ctx.db.patch(existing._id, patch);
        updated += 1;
      } else {
        await ctx.db.insert("academyCourses", {
          slug: seed.slug,
          ...patch,
          purchaseCount: 0,
          commentCount: 0,
          createdByAdminId: admin._id,
          createdAt: now,
        });
        created += 1;
      }
    }

    return { created, updated, demosRetired };
  },
});
