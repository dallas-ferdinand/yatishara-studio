import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, internalQuery } from "./_generated/server";
import { buildAssetPath, signBunnyCdnUrl } from "./lib/bunny";
import { presetStaticPreviewPath } from "./lib/presetThumbnails";
import { adminMutation, adminQuery, authedQuery } from "./lib/customFunctions";
import { isAdminRole } from "./lib/auth";

const presetKind = v.union(v.literal("image"), v.literal("video"), v.literal("any"));

const presetReturn = v.object({
  _id: v.id("stylePresets"),
  _creationTime: v.number(),
  name: v.string(),
  slug: v.string(),
  kind: presetKind,
  systemInstructions: v.string(),
  scriptInstructions: v.optional(v.string()),
  storytelling: v.optional(v.boolean()),
  tagline: v.optional(v.string()),
  negativePrompt: v.optional(v.string()),
  modelHints: v.optional(
    v.record(v.string(), v.union(v.string(), v.number(), v.boolean())),
  ),
  thumbnailAssetId: v.optional(v.id("assets")),
  enabled: v.boolean(),
  sortOrder: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
  previewImageUrl: v.optional(v.string()),
});

type PresetSeed = {
  name: string;
  slug: string;
  kind: "image" | "video" | "any";
  tagline: string;
  storytelling: boolean;
  systemInstructions: string;
  scriptInstructions: string;
};

const defaults: PresetSeed[] = [
  {
    name: "Raw",
    slug: "raw",
    kind: "any",
    tagline: "Direct model pass — no preset rewrite",
    storytelling: false,
    systemInstructions: "",
    scriptInstructions: "",
  },
  {
    name: "Story ad",
    slug: "story-ad",
    kind: "video",
    tagline: "Quiet, emotional ads people remember",
    storytelling: true,
    systemInstructions:
      "Patient observational filmmaking. Ordinary object as silent witness while human life happens around it. Natural light, hands, tables, doorways, worn surfaces. The camera observes; it never performs.",
    scriptInstructions:
      "Full Joe Elliott witness-object treatment. Run the decision engine before scenes: name witness object, invisible truth, behavior proof, time passage, closing revelation. Witness object introduced early. Minimal dialogue, silence where it hurts or heals. Narrator only near the end with one reflective human truth line. If brief needs character transformation (conversion), note Ernesto-style character turn instead.",
  },
  {
    name: "Cinematic",
    slug: "cinematic",
    kind: "video",
    tagline: "Movie-quality look and lighting",
    storytelling: true,
    systemInstructions:
      "Film-grade composition, dramatic motivated lighting, lens language, controlled color grade, shallow depth of field, deliberate camera moves.",
    scriptInstructions:
      "Director shot list with lens and lighting notes. Patient coverage, strong opening image, one human truth underneath the style.",
  },
  {
    name: "Realism",
    slug: "realism",
    kind: "any",
    tagline: "Looks like real life, shot on camera",
    storytelling: true,
    systemInstructions:
      "Natural lighting, believable camera detail, grounded physical materials, authentic textures, documentary-grade clarity.",
    scriptInstructions:
      "Grounded, believable scenes. Real environments, natural behavior, documentary patience.",
  },
  {
    name: "Product studio",
    slug: "product-studio",
    kind: "any",
    tagline: "Clean, premium product showcase",
    storytelling: false,
    systemInstructions:
      "Commercial product photography/video: clean backdrop, premium brand lighting, hero product clarity, controlled reflections, studio-grade polish.",
    scriptInstructions:
      "Product-forward. Hero shots, feature moments, clean CTA. Keep copy concrete and visual — no vague marketing adjectives.",
  },
  {
    name: "Social hook",
    slug: "social-hook",
    kind: "video",
    tagline: "Scroll-stopping clips for TikTok and Reels",
    storytelling: false,
    systemInstructions:
      "Scroll-stopping opening beat in the first 2 seconds, punchy vertical-friendly framing, bold subject isolation, rapid payoff, platform-native pacing.",
    scriptInstructions:
      "Open with a pattern interrupt built on recognizable human behavior, not a product claim. Short spoken-friendly lines, fast payoff.",
  },
  {
    name: "Hypermotion",
    slug: "hypermotion",
    kind: "video",
    tagline: "Fast, high-energy action",
    storytelling: false,
    systemInstructions:
      "Energetic movement, dynamic camera paths, speed, impact, kinetic framing, whip pans, crash zooms, motion blur accents.",
    scriptInstructions:
      "High-energy beats every 2-3 seconds, kinetic camera language, concrete visible action throughout.",
  },
  {
    name: "Anime",
    slug: "anime",
    kind: "any",
    tagline: "Japanese animation style",
    storytelling: false,
    systemInstructions:
      "High-quality anime styling, expressive poses, clean linework, vivid color design, dynamic framing, stylized lighting.",
    scriptInstructions:
      "Anime visual language: expressive character moments, stylized motion beats, vivid scene descriptions.",
  },
  {
    name: "3D / CGI",
    slug: "3d-cgi",
    kind: "any",
    tagline: "Polished 3D render look",
    storytelling: false,
    systemInstructions:
      "Premium 3D render aesthetics, polished materials, clean studio-grade geometry, soft global illumination, product-visualization quality.",
    scriptInstructions:
      "Describe scenes as if built in CGI: materials, lighting rigs, and camera moves suited to polished 3D renders.",
  },
  {
    name: "Footage VFX",
    slug: "footage-vfx",
    kind: "video",
    tagline: "Add effects to your own video",
    storytelling: false,
    systemInstructions:
      "Video-to-video VFX: lock subject and motion, preserve 90% of footage unchanged, name the exact frame the effect begins, timed world swaps and practical VFX integration.",
    scriptInstructions:
      "Structure around what stays locked vs what transforms, with a precise effect trigger time.",
  },
];

export const get = authedQuery({
  args: {
    presetId: v.id("stylePresets"),
  },
  returns: v.union(v.null(), presetReturn),
  handler: async (ctx, args) => {
    const preset = await ctx.db.get("stylePresets", args.presetId);
    if (!preset?.enabled) return null;
    return preset;
  },
});

export const listEnabled = authedQuery({
  args: {
    kind: v.optional(presetKind),
    expiresUnix: v.optional(v.number()),
  },
  returns: v.array(presetReturn),
  handler: async (ctx, args) => {
    const presets = await ctx.db
      .query("stylePresets")
      .withIndex("by_enabled_and_sort", (q) => q.eq("enabled", true))
      .collect();
    const filtered = args.kind
      ? presets.filter((preset) => preset.kind === args.kind || preset.kind === "any")
      : presets;
    filtered.sort((a, b) => a.sortOrder - b.sortOrder);
    return Promise.all(
      filtered.map(async (preset) => ({
        ...preset,
        previewImageUrl: await resolvePresetPreviewUrl(ctx, preset, args.expiresUnix),
      })),
    );
  },
});

async function resolvePresetPreviewUrl(
  ctx: QueryCtx,
  preset: { slug: string; thumbnailAssetId?: Id<"assets"> },
  expiresUnix?: number,
): Promise<string> {
  if (preset.thumbnailAssetId && expiresUnix !== undefined) {
    const asset = await ctx.db.get("assets", preset.thumbnailAssetId);
    if (asset?.bunnyPath) {
      return await signBunnyCdnUrl(asset.bunnyPath, expiresUnix);
    }
  }
  return presetStaticPreviewPath(preset.slug);
}

export const adminListAll = adminQuery({
  args: {},
  returns: v.array(presetReturn),
  handler: async (ctx) => listAllPresets(ctx),
});

export const internalListAll = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("stylePresets"),
      slug: v.string(),
      name: v.string(),
      tagline: v.optional(v.string()),
      systemInstructions: v.string(),
      thumbnailAssetId: v.optional(v.id("assets")),
    }),
  ),
  handler: async (ctx) => {
    const presets = await ctx.db.query("stylePresets").collect();
    presets.sort((a, b) => a.sortOrder - b.sortOrder);
    return presets.map((preset) => ({
      _id: preset._id,
      slug: preset.slug,
      name: preset.name,
      tagline: preset.tagline,
      systemInstructions: preset.systemInstructions,
      thumbnailAssetId: preset.thumbnailAssetId,
    }));
  },
});

async function listAllPresets(ctx: QueryCtx) {
  const presets = await ctx.db.query("stylePresets").collect();
  presets.sort((a, b) => a.sortOrder - b.sortOrder);
  return presets.map((preset) => ({
    ...preset,
    previewImageUrl: presetStaticPreviewPath(preset.slug),
  }));
}

export const adminSeedDefaults = adminMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => seedPresetDefaults(ctx.db),
});

/** Deploy-key bootstrap — callable via `npx convex run stylePresets:internalSeedDefaults`. */
export const internalSeedDefaults = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => seedPresetDefaults(ctx.db),
});

async function seedPresetDefaults(db: MutationCtx["db"]): Promise<number> {
  const now = Date.now();
  let changed = 0;
  for (const [sortOrder, seed] of defaults.entries()) {
    const existing = await db
      .query("stylePresets")
      .withIndex("by_slug", (q) => q.eq("slug", seed.slug))
      .unique();
    if (existing) {
      await db.patch(existing._id, {
        name: seed.name,
        kind: seed.kind,
        tagline: seed.tagline,
        storytelling: seed.storytelling,
        systemInstructions: seed.systemInstructions,
        scriptInstructions: seed.scriptInstructions,
        sortOrder,
        updatedAt: now,
      });
      changed += 1;
      continue;
    }
    await db.insert("stylePresets", {
      name: seed.name,
      slug: seed.slug,
      kind: seed.kind,
      tagline: seed.tagline,
      storytelling: seed.storytelling,
      systemInstructions: seed.systemInstructions,
      scriptInstructions: seed.scriptInstructions,
      enabled: true,
      sortOrder,
      createdAt: now,
      updatedAt: now,
    });
    changed += 1;
  }
  return changed;
}

export const adminSavePresetThumbnail = adminMutation({
  args: {
    presetId: v.id("stylePresets"),
    mimeType: v.string(),
  },
  returns: v.object({
    assetId: v.id("assets"),
    bunnyPath: v.string(),
  }),
  handler: async (ctx, args) => {
    const rootFolder = await ctx.db
      .query("folders")
      .withIndex("by_owner_and_parent", (q) =>
        q.eq("ownerId", ctx.user._id).eq("parentId", undefined),
      )
      .first();
    if (!rootFolder) {
      throw new Error("Root folder not found. Open the studio once before generating preset previews.");
    }
    return await savePresetThumbnailAsset(ctx.db, {
      presetId: args.presetId,
      mimeType: args.mimeType,
      ownerId: ctx.user._id,
      folderId: rootFolder._id,
    });
  },
});

export const internalBootstrapTarget = internalQuery({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      ownerId: v.id("users"),
      folderId: v.id("folders"),
    }),
  ),
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    const admin = users.find((user) => isAdminRole(user.role));
    if (!admin) return null;

    const rootFolder = await ctx.db
      .query("folders")
      .withIndex("by_owner_and_parent", (q) =>
        q.eq("ownerId", admin._id).eq("parentId", undefined),
      )
      .first();
    if (!rootFolder) return null;

    return { ownerId: admin._id, folderId: rootFolder._id };
  },
});

export const internalSavePresetThumbnail = internalMutation({
  args: {
    presetId: v.id("stylePresets"),
    mimeType: v.string(),
    ownerId: v.id("users"),
    folderId: v.id("folders"),
  },
  returns: v.object({
    assetId: v.id("assets"),
    bunnyPath: v.string(),
  }),
  handler: async (ctx, args) =>
    await savePresetThumbnailAsset(ctx.db, {
      presetId: args.presetId,
      mimeType: args.mimeType,
      ownerId: args.ownerId,
      folderId: args.folderId,
    }),
});

async function savePresetThumbnailAsset(
  db: MutationCtx["db"],
  args: {
    presetId: Id<"stylePresets">;
    mimeType: string;
    ownerId: Id<"users">;
    folderId: Id<"folders">;
  },
): Promise<{ assetId: Id<"assets">; bunnyPath: string }> {
  const preset = await db.get("stylePresets", args.presetId);
  if (!preset) {
    throw new Error("Preset not found");
  }

  const ext = args.mimeType.includes("webp")
    ? "webp"
    : args.mimeType.includes("jpeg")
      ? "jpg"
      : "png";
  const now = Date.now();
  const filename = `preset-${preset.slug}.${ext}`;
  const assetId = await db.insert("assets", {
    ownerId: args.ownerId,
    folderId: args.folderId,
    name: filename,
    kind: "image",
    mimeType: args.mimeType,
    createdAt: now,
    updatedAt: now,
  });
  const bunnyPath = buildAssetPath({
    userId: args.ownerId,
    folderId: args.folderId,
    assetId,
    filename,
  });
  await db.patch(assetId, { bunnyPath, updatedAt: now });

  if (preset.thumbnailAssetId) {
    await db.patch(preset.thumbnailAssetId, { deletedAt: now, updatedAt: now });
  }

  await db.patch(preset._id, {
    thumbnailAssetId: assetId,
    updatedAt: now,
  });
  return { assetId, bunnyPath };
}
