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
  enabled?: boolean;
};

const CARTOON_ENABLED_SLUGS = new Set([
  "toon-prime",
  "toon-adult",
  "toon-surreal",
  "toon-family",
  "toon-cgi",
  "toon-neon-idol",
]);

const defaults: PresetSeed[] = [
  {
    name: "Prime 2D",
    slug: "toon-prime",
    kind: "any",
    tagline: "Thick outline, flat cel, sitcom readability — default cartoon",
    storytelling: true,
    enabled: true,
    systemInstructions:
      "Traditional 2D cel animation. Consistent medium line weight, flat two-tone shading, limited warm domestic palette, high sitcom expression readability. Witness object staging in stylized domestic interiors. Emotional realism through readable poses and held beats — not photoreal skin or film grain.",
    scriptInstructions:
      "Joe Elliott witness-object treatment in an animated domestic world. Run the decision engine: witness object, invisible truth, behavior proof, time passage, closing revelation. Readable expression and held poses instead of documentary observation. Minimal dialogue. Serious animated tone — adult proportions, restrained palette.",
  },
  {
    name: "Adult 2D",
    slug: "toon-adult",
    kind: "any",
    tagline: "Sharper deformation, snappier motion, edgier palette",
    storytelling: true,
    enabled: true,
    systemInstructions:
      "Adult-oriented 2D cel animation. Sharper line weight, saturated ironic palette, snappy staccato timing, exaggerated expression on reaction beats. Satire and conversion-friendly — still stylized, never photoreal.",
    scriptInstructions:
      "Witness-object or character-arc beats with snappy editorial rhythm. Observable behavior via squash-and-return poses. Edgy palette allowed; no live-action or documentary language.",
  },
  {
    name: "Surreal 2D",
    slug: "toon-surreal",
    kind: "any",
    tagline: "Thin-limbed adults, deadpan faces — suburban meets cosmic",
    storytelling: true,
    enabled: true,
    systemInstructions:
      "Adult surreal 2D animation focused on CHARACTER DESIGN and ENVIRONMENT CONTRAST — original characters only, never trademark names or IP. Characters: bold uniform black outlines, thin noodle limbs, slightly large heads, flat muted skin and wardrobe colors, white-circle eyes with small scribble or starburst pupils, simple unibrow or brow line, minimal nose, W-shaped or line mouths, deadpan cynical or manic open-mouth adult expressions. Environments: mundane suburban domestic first — beige walls, wooden beams, entryway, kitchen, ordinary furniture — then surreal rupture in the same frame: impossible scale (giant figure over miniature landscape), cosmic aurora skies, starfields, neon horizon bands bleeding through windows or open doors. The joke is boring real life colliding with insane physics. Flat cel shading, minimal gradients. Never photoreal.",
    scriptInstructions:
      "Stage adult characters in ordinary domestic spaces where the environment quietly breaks reality — scale shifts, cosmic skies, miniature worlds at their feet. Lead with readable character pose and expression; surreal backdrop supports the character beat. Deadpan or manic behavior proof, not emotion labels. Observable ironic adult tone. Keep characters flat and muted; surrealism lives in the world around them.",
  },
  {
    name: "Family soft",
    slug: "toon-family",
    kind: "any",
    tagline: "Rounded forms, gentle color, warm domestic",
    storytelling: true,
    enabled: true,
    systemInstructions:
      "Soft family 2D animation. Rounded forms, pastel warm palette, gentle legato motion, clear gentle expressions. Warm domestic staging for brand affinity spots.",
    scriptInstructions:
      "Warm witness-object stories with gentle holds and soft motion. Rounded silhouettes, low contrast flat shading. Behavior visible through kind, readable poses.",
  },
  {
    name: "Stylized 3D",
    slug: "toon-cgi",
    kind: "any",
    tagline: "Non-photoreal CG cartoon look",
    storytelling: true,
    enabled: true,
    systemInstructions:
      "Stylized 3D cartoon render. Matte toon shader, soft sculpted forms, rim-lit silhouettes, no PBR photoreal skin or materials. Emotional readability at TV scale.",
    scriptInstructions:
      "Describe scenes as stylized 3D cartoon staging: matte materials, toon rim lighting, held poses. Witness-object grammar applies in CG domestic worlds.",
  },
  {
    name: "Neon Idol 3D",
    slug: "toon-neon-idol",
    kind: "any",
    tagline: "Polished CG, neon urban fantasy, idol-action staging",
    storytelling: true,
    enabled: true,
    systemInstructions:
      "Polished stylized 3D CGI animation. High-energy K-pop-idol-meets-urban-fantasy aesthetic — original characters only, never trademark names or IP. Saturated neon palette: hot pink, electric blue, deep purple, vibrant orange. Trendy idol-stage streetwear with tactical combat details — metallic fabrics, harnesses, cargo layers, stylish boots. Stylized hair in vivid unnatural colors. Dynamic group poses, glowing translucent energy weapons, neon-lit city nights, dramatic backlighting and rim glow. Cinematic music-video glamour crossed with supernatural action. Non-photoreal skin; no live-action.",
    scriptInstructions:
      "High-energy animated spots in neon urban fantasy worlds. Coordinated group staging like a promo shoot — confident idol poses with supernatural hunter action beats. Glowing energy blades or bows optional. Observable combat-adjacent behavior, not emotion labels. Bold saturated color; environments glow more than faces.",
  },
  {
    name: "Unstyled",
    slug: "unstyled",
    kind: "any",
    tagline: "Direct model pass — no preset rewrite (MCP/API handoff)",
    storytelling: false,
    enabled: true,
    systemInstructions: "",
    scriptInstructions: "",
  },
  {
    name: "Raw",
    slug: "raw",
    kind: "any",
    tagline: "Alias for unstyled — deprecated slug",
    storytelling: false,
    enabled: false,
    systemInstructions: "",
    scriptInstructions: "",
  },
  {
    name: "Story ad",
    slug: "story-ad",
    kind: "video",
    tagline: "Deprecated — use Prime 2D",
    storytelling: true,
    enabled: false,
    systemInstructions:
      "Deprecated photoreal preset. Migrate to toon-prime.",
    scriptInstructions: "Deprecated. Use toon-prime.",
  },
  {
    name: "Cinematic",
    slug: "cinematic",
    kind: "video",
    tagline: "Deprecated — use Prime 2D",
    storytelling: true,
    enabled: false,
    systemInstructions: "Deprecated photoreal preset. Migrate to toon-prime.",
    scriptInstructions: "Deprecated. Use toon-prime.",
  },
  {
    name: "Realism",
    slug: "realism",
    kind: "any",
    tagline: "Deprecated — use Prime 2D",
    storytelling: true,
    enabled: false,
    systemInstructions: "Deprecated photoreal preset. Migrate to toon-prime.",
    scriptInstructions: "Deprecated. Use toon-prime.",
  },
  {
    name: "Product studio",
    slug: "product-studio",
    kind: "any",
    tagline: "Deprecated — use Prime 2D",
    storytelling: false,
    enabled: false,
    systemInstructions: "Deprecated photoreal preset. Migrate to toon-prime.",
    scriptInstructions: "Deprecated. Use toon-prime.",
  },
  {
    name: "Social hook",
    slug: "social-hook",
    kind: "video",
    tagline: "Deprecated",
    storytelling: false,
    enabled: false,
    systemInstructions: "Deprecated preset.",
    scriptInstructions: "Deprecated.",
  },
  {
    name: "Hypermotion",
    slug: "hypermotion",
    kind: "video",
    tagline: "Deprecated",
    storytelling: false,
    enabled: false,
    systemInstructions: "Deprecated preset.",
    scriptInstructions: "Deprecated.",
  },
  {
    name: "Anime",
    slug: "anime",
    kind: "any",
    tagline: "Deprecated — not in cartoon taxonomy",
    storytelling: false,
    enabled: false,
    systemInstructions: "Deprecated. Studio is cartoon-only; anime excluded.",
    scriptInstructions: "Deprecated.",
  },
  {
    name: "3D / CGI",
    slug: "3d-cgi",
    kind: "any",
    tagline: "Deprecated — use Stylized 3D",
    storytelling: false,
    enabled: false,
    systemInstructions: "Deprecated photoreal CGI. Migrate to toon-cgi.",
    scriptInstructions: "Deprecated. Use toon-cgi.",
  },
  {
    name: "Footage VFX",
    slug: "footage-vfx",
    kind: "video",
    tagline: "Deprecated",
    storytelling: false,
    enabled: false,
    systemInstructions: "Deprecated preset.",
    scriptInstructions: "Deprecated.",
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
    const uiPresets = presets.filter(
      (preset) => preset.slug !== "unstyled" && preset.slug !== "raw",
    );
    const filtered = args.kind
      ? uiPresets.filter((preset) => preset.kind === args.kind || preset.kind === "any")
      : uiPresets;
    filtered.sort((a, b) => a.sortOrder - b.sortOrder);
    return Promise.all(
      filtered.map(async (preset) => ({
        ...preset,
        previewImageUrl: await resolvePresetPreviewUrl(ctx, preset, args.expiresUnix),
      })),
    );
  },
});

/** Composer UI presets — cartoon styles plus Direct (unstyled) for verbatim handoff. */
export const listComposerPresets = authedQuery({
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
    const composerPresets = presets
      .filter((preset) => preset.slug !== "raw")
      .map((preset) =>
        preset.slug === "unstyled"
          ? {
              ...preset,
              name: "Direct",
              tagline: preset.tagline ?? "No style rewrite — prompt goes straight to the model",
            }
          : preset,
      );
    const filtered = args.kind
      ? composerPresets.filter((preset) => preset.kind === args.kind || preset.kind === "any")
      : composerPresets;
    filtered.sort((a, b) => {
      if (a.slug === "unstyled") return -1;
      if (b.slug === "unstyled") return 1;
      return a.sortOrder - b.sortOrder;
    });
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
    const enabled = seed.enabled ?? CARTOON_ENABLED_SLUGS.has(seed.slug);
    if (existing) {
      await db.patch(existing._id, {
        name: seed.name,
        kind: seed.kind,
        tagline: seed.tagline,
        storytelling: seed.storytelling,
        systemInstructions: seed.systemInstructions,
        scriptInstructions: seed.scriptInstructions,
        enabled,
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
      enabled,
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
