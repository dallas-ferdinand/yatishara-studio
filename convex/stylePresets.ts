import { v } from "convex/values";
import { adminMutation, authedQuery } from "./lib/customFunctions";

const presetKind = v.union(v.literal("image"), v.literal("video"), v.literal("any"));

const presetReturn = v.object({
  _id: v.id("stylePresets"),
  _creationTime: v.number(),
  name: v.string(),
  slug: v.string(),
  kind: presetKind,
  systemInstructions: v.string(),
  negativePrompt: v.optional(v.string()),
  modelHints: v.optional(
    v.record(v.string(), v.union(v.string(), v.number(), v.boolean())),
  ),
  thumbnailAssetId: v.optional(v.id("assets")),
  enabled: v.boolean(),
  sortOrder: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
});

const defaults = [
  ["Realism", "realism", "Natural lighting, believable camera detail, grounded physical materials."],
  ["Anime", "anime", "High-quality anime styling, expressive poses, clean linework, vivid color design."],
  ["Hypermotion", "hypermotion", "Energetic movement, dynamic camera paths, speed, impact, kinetic framing."],
  ["Cinematic", "cinematic", "Film-grade composition, dramatic lighting, lens language, controlled color grade."],
  ["3D / CGI", "3d-cgi", "Premium 3D render aesthetics, polished materials, clean studio-grade geometry."],
  ["Product Studio", "product-studio", "Commercial product photography/video, clean backdrop, premium brand lighting."],
] as const;

export const listEnabled = authedQuery({
  args: {
    kind: v.optional(presetKind),
  },
  returns: v.array(presetReturn),
  handler: async (ctx, args) => {
    const presets = await ctx.db
      .query("stylePresets")
      .withIndex("by_enabled_and_sort", (q) => q.eq("enabled", true))
      .collect();
    return args.kind
      ? presets.filter((preset) => preset.kind === args.kind || preset.kind === "any")
      : presets;
  },
});

export const adminSeedDefaults = adminMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const now = Date.now();
    let created = 0;
    for (const [name, slug, systemInstructions] of defaults) {
      const existing = await ctx.db
        .query("stylePresets")
        .withIndex("by_slug", (q) => q.eq("slug", slug))
        .unique();
      if (existing) {
        continue;
      }
      await ctx.db.insert("stylePresets", {
        name,
        slug,
        kind: "any",
        systemInstructions,
        enabled: true,
        sortOrder: created,
        createdAt: now,
        updatedAt: now,
      });
      created += 1;
    }
    return created;
  },
});
