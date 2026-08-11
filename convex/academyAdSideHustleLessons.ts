/**
 * Ad Side Hustle lessons — seed via:
 *   npx convex run academy:internalSeedAdSideHustleLessons
 *
 * Lessons stay draft until Stream video is attached (publish gate).
 * Lesson 0 (The Ad Flywheel) has no cover — UI falls back to the course banner.
 */
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

export const AD_SIDE_HUSTLE_SLUG = "ad-side-hustle";

/** Locked titles 2026-08-11 (Dallas). */
export const AD_SIDE_HUSTLE_LESSONS = [
  {
    slug: "the-ad-flywheel",
    title: "The Ad Flywheel",
    sortOrder: 10,
    descriptionMarkdown: `Map the full side-hustle flywheel once so nothing feels random.

### You leave knowing
- The end state: ad running → WhatsApp sales
- How each later lesson fits the flywheel
- What to build first vs what to sell later
`,
  },
  {
    slug: "getting-started-with-studio",
    title: "Getting Started with Studio",
    sortOrder: 20,
    descriptionMarkdown: `Create your Studio account, verify email, and learn where everything lives.

### You leave knowing
- Signup + verify path
- Projects, Agent, edit, and export locations
- How to get ready before making an ad
`,
  },
  {
    slug: "make-your-first-flyer-in-studio",
    title: "Make Your First Flyer in Studio",
    sortOrder: 30,
    descriptionMarkdown: `Walk one real flyer end-to-end. Clicks over theory.

### You leave knowing
- Flyer workflow inside Studio
- How to lock a brand look before video
- When the flyer is “good enough” to move on
`,
  },
  {
    slug: "prompt-with-agent",
    title: "Prompt with Agent",
    sortOrder: 40,
    descriptionMarkdown: `Brief Agent so prompts match the flyer and brand. See good vs weak prompts.

### You leave knowing
- How to brief Agent clearly
- Prompt habits that hold the brand
- What to reject before you spend a generate
`,
  },
  {
    slug: "generate-the-video",
    title: "Generate the Video",
    sortOrder: 50,
    descriptionMarkdown: `Take those prompts into generation. Pick the cut. Keep it practical.

### You leave knowing
- How to run generation from locked prompts
- How to pick a usable cut
- When to regenerate vs when to move on
`,
  },
  {
    slug: "create-the-audio-in-studio",
    title: "Create the Audio in Studio",
    sortOrder: 60,
    descriptionMarkdown: `Music and voiceover inside Studio for this ad.

### You leave knowing
- Where audio lives in Studio
- How to score the picture you already made
- A clean audio bed ready for edit
`,
  },
  {
    slug: "edit-watermark-export",
    title: "Edit & Watermark Export",
    sortOrder: 70,
    descriptionMarkdown: `Assemble video + audio in the Studio editor. Export the watermarked delivery cut.

### You leave knowing
- How to lay VO on the picture
- Export settings for delivery
- Why the watermarked cut is the course standard
`,
  },
  {
    slug: "post-on-tiktok-winning-format",
    title: "Post on TikTok (The Winning Format)",
    sortOrder: 80,
    descriptionMarkdown: `Build and post the short format: ~4s hook → 15s ad → ~4s CTA.

### Format
1. **Front (~4s)** — “check out this ad we just did”
2. **Middle (15s)** — the ad itself
3. **End (~4s)** — “DM us / we’ll do one for you”

### You leave knowing
- Exact wrapper recipe
- Short on-camera lines that fit 4 seconds
- How to upload the finished post
`,
  },
  {
    slug: "boost-for-tiktok-dms",
    title: "Boost for TikTok DMs",
    sortOrder: 90,
    descriptionMarkdown: `Boost / run paid on that TikTok post. Aim for DMs, not vanity views.

### You leave knowing
- How to put spend behind the post
- Why DMs beat empty views
- Light spend habits that don’t burn cash
`,
  },
  {
    slug: "funnel-tiktok-dms-to-whatsapp",
    title: "Funnel TikTok DMs to WhatsApp",
    sortOrder: 100,
    descriptionMarkdown: `Cut noise. Ask for WhatsApp. Only move people who will convert.

### You leave knowing
- Tire-kickers vs serious buyers
- The WhatsApp ask
- How to keep the DM inbox usable
`,
  },
  {
    slug: "close-on-whatsapp-packages",
    title: "Close on WhatsApp (Info, Price, Packages)",
    sortOrder: 110,
    descriptionMarkdown: `What to ask, how much to charge, packages, soft close, and deposit path.

### You leave knowing
- Intake questions that unlock a quote
- Package shape to sell
- Soft close + deposit without hard-sell dump
`,
  },
  {
    slug: "tags-followups-retention-sales",
    title: "Tags, Follow-ups, Retention, Quick Sales",
    sortOrder: 120,
    descriptionMarkdown: `Manage chats with tags. Follow up. Keep clients coming back. Every ~2 weeks, run a quick sale to pull ad spend back.

### You leave knowing
- Tag habits that keep the book clean
- Follow-up cadence
- Retention + biweekly quick-sale idea to recover ad spend
`,
  },
  {
    slug: "the-10-usd-loop",
    title: "The $10 USD Loop",
    sortOrder: 130,
    descriptionMarkdown: `Reviews + client care. Put the same video back up as an ad at ~$10 USD/day and run the flywheel again.

### You leave knowing
- How to ask for reviews without being awkward
- Relationship habits that get repurchase
- The $10 USD/day loop on the same creative
`,
  },
  {
    slug: "bonus-usd-payment-hacks",
    title: "Bonus (USD & Payment Hacks)",
    sortOrder: 140,
    descriptionMarkdown: `Practical ways to access USD and get payments moving so you can fund ads without getting stuck.

### Tips covered
- Guap ATM
- Giftcard City
- Wapp / crypto exchanges

### You leave knowing
- Options to get USD for ad spend
- That you do not need a perfect banking path to start
`,
  },
] as const;

function slugify(input: string): string {
  const base = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return base || "lesson";
}

/**
 * Idempotent by lesson slug under Ad Side Hustle.
 * Creates missing lessons; updates title/description/sort on existing.
 * Does not publish (video still required).
 */
export const internalSeedAdSideHustleLessons = internalMutation({
  args: {},
  returns: v.object({
    courseId: v.id("academyCourses"),
    created: v.number(),
    updated: v.number(),
    lessons: v.array(
      v.object({
        lessonId: v.id("academyLessons"),
        slug: v.string(),
        title: v.string(),
        created: v.boolean(),
      }),
    ),
  }),
  handler: async (ctx) => {
    const course = await ctx.db
      .query("academyCourses")
      .withIndex("by_slug", (q) => q.eq("slug", AD_SIDE_HUSTLE_SLUG))
      .unique();
    if (!course) {
      throw new Error(
        `Course slug ${AD_SIDE_HUSTLE_SLUG} not found — run academy:internalSeedLiveCourses first`,
      );
    }

    const existing = await ctx.db
      .query("academyLessons")
      .withIndex("by_course_and_sort", (q) => q.eq("courseId", course._id))
      .collect();
    const bySlug = new Map(existing.map((row) => [row.slug, row]));
    const now = Date.now();
    let created = 0;
    let updated = 0;
    const lessons: Array<{
      lessonId: Id<"academyLessons">;
      slug: string;
      title: string;
      created: boolean;
    }> = [];

    for (const seed of AD_SIDE_HUSTLE_LESSONS) {
      const slug = slugify(seed.slug);
      const row = bySlug.get(slug);
      if (row) {
        await ctx.db.patch(row._id, {
          title: seed.title,
          descriptionMarkdown: seed.descriptionMarkdown,
          sortOrder: seed.sortOrder,
          updatedAt: now,
        });
        updated += 1;
        lessons.push({
          lessonId: row._id,
          slug,
          title: seed.title,
          created: false,
        });
      } else {
        const lessonId = await ctx.db.insert("academyLessons", {
          courseId: course._id,
          title: seed.title,
          slug,
          descriptionMarkdown: seed.descriptionMarkdown,
          status: "draft",
          sortOrder: seed.sortOrder,
          createdAt: now,
          updatedAt: now,
        });
        created += 1;
        lessons.push({
          lessonId,
          slug,
          title: seed.title,
          created: true,
        });
      }
    }

    await ctx.db.patch(course._id, { updatedAt: now });
    return { courseId: course._id, created, updated, lessons };
  },
});

/** Deploy-key / ops path to attach a Bunny cover after upload. */
export const internalSetLessonCover = internalMutation({
  args: {
    lessonId: v.id("academyLessons"),
    coverBunnyPath: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const lesson = await ctx.db.get("academyLessons", args.lessonId);
    if (!lesson) throw new Error("Lesson not found");
    const path = args.coverBunnyPath.trim();
    if (!path) throw new Error("coverBunnyPath required");
    const now = Date.now();
    await ctx.db.patch(args.lessonId, {
      coverBunnyPath: path,
      updatedAt: now,
    });
    await ctx.db.patch(lesson.courseId, { updatedAt: now });
    return null;
  },
});

/** Deploy-key / ops path to attach a course cover after upload. */
export const internalSetCourseCover = internalMutation({
  args: {
    courseId: v.id("academyCourses"),
    coverBunnyPath: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const course = await ctx.db.get("academyCourses", args.courseId);
    if (!course) throw new Error("Course not found");
    const path = args.coverBunnyPath.trim();
    if (!path) throw new Error("coverBunnyPath required");
    await ctx.db.patch(args.courseId, {
      coverBunnyPath: path,
      updatedAt: Date.now(),
    });
    return null;
  },
});
