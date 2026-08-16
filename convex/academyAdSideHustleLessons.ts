/**
 * Ad Side Hustle lessons — seed via:
 *   npx convex run academyAdSideHustleLessons:internalSeedAdSideHustleLessons
 *
 * Course overview row in the rail = Intro (course description / intro video).
 * "The Ad Flywheel" was retired 2026-08-11 — not a separate lesson.
 */
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

export const AD_SIDE_HUSTLE_SLUG = "ad-side-hustle";

/** Retired lesson slugs — deleted on seed so they cannot reappear. */
const RETIRED_LESSON_SLUGS = ["the-ad-flywheel"] as const;

/** Locked titles 2026-08-11 (Dallas). Updated: no Flywheel lesson — Intro covers that. */
export const AD_SIDE_HUSTLE_LESSONS = [
  {
    slug: "getting-started-with-studio",
    title: "Getting Started with Studio",
    sortOrder: 10,
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
    sortOrder: 20,
    descriptionMarkdown: `Walk one real flyer end-to-end. Clicks over theory.

### You leave knowing
- Flyer workflow inside Studio
- How to lock a brand look before video
- When the flyer is “good enough” to move on
`,
  },
  {
    // Slug kept for stable URLs; title matches master 04 (Video Editing).
    // Agent prompting is covered inside Flyer + Generate lessons.
    slug: "prompt-with-agent",
    title: "Edit Your Video",
    sortOrder: 45,
    descriptionMarkdown: `Create a video edit, set 9:16, then split/cut AI errors and dead space.

### In this lesson
- Create a video edit project
- Set 9:16 export frame
- Split/cut AI errors and dead space
- Rearrange scenes when you need a new flow
`,
  },
  {
    slug: "generate-the-video",
    title: "Generate the Video",
    sortOrder: 40,
    descriptionMarkdown: `Use Agent + your flyer to write the video prompt, then generate 9:16 clips.

### In this lesson
- Agent helps write the video prompt from your flyer
- Seedance settings (9:16, 15s)
- Generate the clips you’ll edit next
`,
  },
  {
    slug: "create-the-audio-in-studio",
    title: "Create the Audio in Studio",
    sortOrder: 50,
    descriptionMarkdown: `Export the edit for context, ask Agent for a VO script, then generate voiceover.

### In this lesson
- Export the edit for Agent context
- Ask Agent for a VO script
- Generate audio in Create → Voiceover
`,
  },
  {
    slug: "edit-voiceover-in-studio",
    title: "Edit the Voiceover",
    sortOrder: 55,
    descriptionMarkdown: `Drop VO on the timeline, speed/trim to fit, and balance voice vs music volume.

### In this lesson
- Place the voiceover on the edit
- Speed up or shorten audio to fit the cut
- Lower music so the voice stays clear
`,
  },
  {
    slug: "edit-watermark-export",
    title: "Edit & Watermark Export",
    sortOrder: 60,
    descriptionMarkdown: `Add a draft watermark, then export the 9:16 delivery cut for the client.

### In this lesson
- Add draft watermark text
- Protect unpaid delivery
- Export 9:16 MP4 for the client
`,
  },
  {
    slug: "post-on-tiktok-winning-format",
    title: "Post on TikTok (The Winning Format)",
    sortOrder: 70,
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
    sortOrder: 80,
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
    sortOrder: 90,
    descriptionMarkdown: `Ops overview: TikTok ad → DMs → WhatsApp. Same Extra Tips master as the next three sales lessons.

### In this lesson
- How the side-hustle funnel runs
- Move serious buyers onto WhatsApp
`,
  },
  {
    slug: "close-on-whatsapp-packages",
    title: "Close on WhatsApp (Info, Price, Packages)",
    sortOrder: 100,
    descriptionMarkdown: `Packages, pricing, and closing context from the Extra Tips ops overview.

### In this lesson
- What to charge / package shape
- Convert WhatsApp chats into paying clients
`,
  },
  {
    slug: "tags-followups-retention-sales",
    title: "Tags, Follow-ups, Retention, Quick Sales",
    sortOrder: 110,
    descriptionMarkdown: `Retention and follow-through from the Extra Tips ops overview.

### In this lesson
- Keep clients after the first job
- Habits that support repeat sales
`,
  },
  {
    slug: "the-10-usd-loop",
    title: "The $10 USD Loop",
    sortOrder: 120,
    descriptionMarkdown: `Reinvest a cut of each win back into ads — the Extra Tips loop.

### In this lesson
- Take profit and put a portion back into ads
- Keep the acquisition engine running
`,
  },
  {
    slug: "bonus-usd-payment-hacks",
    title: "Bonus (USD & Payment Hacks)",
    sortOrder: 130,
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
 * Deletes retired slugs (e.g. the-ad-flywheel).
 * Does not publish (video still required for admin publish gate).
 */
export const internalSeedAdSideHustleLessons = internalMutation({
  args: {},
  returns: v.object({
    courseId: v.id("academyCourses"),
    created: v.number(),
    updated: v.number(),
    deleted: v.number(),
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
    let deleted = 0;
    const lessons: Array<{
      lessonId: Id<"academyLessons">;
      slug: string;
      title: string;
      created: boolean;
    }> = [];

    for (const retired of RETIRED_LESSON_SLUGS) {
      const row = bySlug.get(retired);
      if (!row) continue;
      const comments = await ctx.db
        .query("academyComments")
        .withIndex("by_lesson_and_created", (q) => q.eq("lessonId", row._id))
        .collect();
      for (const comment of comments) {
        await ctx.db.delete(comment._id);
      }
      await ctx.db.delete(row._id);
      bySlug.delete(retired);
      deleted += 1;
    }

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
    return { courseId: course._id, created, updated, deleted, lessons };
  },
});

/**
 * Ops: publish every draft lesson on Ad Side Hustle so learners see the rail.
 * Videos can attach later — UI shows cover + play; playback stays locked until Stream id exists.
 */
export const internalPublishAllLessons = internalMutation({
  args: {
    allowWithoutVideo: v.optional(v.boolean()),
  },
  returns: v.object({
    courseId: v.id("academyCourses"),
    published: v.number(),
    skipped: v.number(),
    lessonIds: v.array(v.id("academyLessons")),
  }),
  handler: async (ctx, args) => {
    const allowWithoutVideo = args.allowWithoutVideo !== false;
    const course = await ctx.db
      .query("academyCourses")
      .withIndex("by_slug", (q) => q.eq("slug", AD_SIDE_HUSTLE_SLUG))
      .unique();
    if (!course) {
      throw new Error(`Course slug ${AD_SIDE_HUSTLE_SLUG} not found`);
    }
    const rows = await ctx.db
      .query("academyLessons")
      .withIndex("by_course_and_sort", (q) => q.eq("courseId", course._id))
      .collect();
    const now = Date.now();
    let published = 0;
    let skipped = 0;
    const lessonIds: Array<Id<"academyLessons">> = [];
    for (const row of rows) {
      if (row.status === "published") {
        skipped += 1;
        continue;
      }
      if (!row.bunnyStreamVideoId && !allowWithoutVideo) {
        skipped += 1;
        continue;
      }
      await ctx.db.patch(row._id, { status: "published", updatedAt: now });
      published += 1;
      lessonIds.push(row._id);
    }
    await ctx.db.patch(course._id, { updatedAt: now });
    return { courseId: course._id, published, skipped, lessonIds };
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
