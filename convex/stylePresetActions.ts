"use node";

import { v } from "convex/values";
import { makeFunctionReference, type FunctionReference } from "convex/server";
import type { Id } from "./_generated/dataModel";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { generateImage } from "./lib/aiGateway";
import { putObject } from "./lib/bunny";
import { presetThumbnailPrompt } from "./lib/presetThumbnails";

type PresetRow = {
  _id: Id<"stylePresets">;
  slug: string;
  name: string;
  tagline?: string;
  systemInstructions: string;
  thumbnailAssetId?: Id<"assets">;
};

type BootstrapTarget = {
  ownerId: Id<"users">;
  folderId: Id<"folders">;
};

const internalListAllRef = makeFunctionReference<
  "query",
  Record<string, never>,
  PresetRow[]
>("stylePresets:internalListAll") as unknown as FunctionReference<
  "query",
  "internal",
  Record<string, never>,
  PresetRow[]
>;

const internalBootstrapTargetRef = makeFunctionReference<
  "query",
  Record<string, never>,
  BootstrapTarget | null
>("stylePresets:internalBootstrapTarget") as unknown as FunctionReference<
  "query",
  "internal",
  Record<string, never>,
  BootstrapTarget | null
>;

const internalSavePresetThumbnailRef = makeFunctionReference<
  "mutation",
  {
    presetId: Id<"stylePresets">;
    mimeType: string;
    ownerId: Id<"users">;
    folderId: Id<"folders">;
  },
  { assetId: Id<"assets">; bunnyPath: string }
>("stylePresets:internalSavePresetThumbnail") as unknown as FunctionReference<
  "mutation",
  "internal",
  {
    presetId: Id<"stylePresets">;
    mimeType: string;
    ownerId: Id<"users">;
    folderId: Id<"folders">;
  },
  { assetId: Id<"assets">; bunnyPath: string }
>;

const currentUserRef = makeFunctionReference<
  "query",
  Record<string, never>,
  { role: "user" | "admin" | "super_admin" } | null
>("users:current") as FunctionReference<
  "query",
  "public",
  Record<string, never>,
  { role: "user" | "admin" | "super_admin" } | null
>;

async function generatePresetThumbnails(
  ctx: ActionCtx,
  args: {
    force?: boolean;
    slugs?: string[];
    ownerId: Id<"users">;
    folderId: Id<"folders">;
  },
): Promise<{ generated: number; skipped: number; errors: string[] }> {
  const presets = await ctx.runQuery(internalListAllRef, {});
  const targets = presets.filter((preset) => {
    if (args.slugs?.length && !args.slugs.includes(preset.slug)) return false;
    if (preset.thumbnailAssetId && !args.force) return false;
    return true;
  });

  let generated = 0;
  const skipped = presets.length - targets.length;
  const errors: string[] = [];

  for (const preset of targets) {
    try {
      const prompt = presetThumbnailPrompt(
        preset.slug,
        preset.tagline ?? preset.name,
        preset.systemInstructions,
      );
      const result = await generateImage({
        prompt,
        aspectRatio: "16:9",
        resolution: "1K",
        referenceUrls: [],
      });
      const image = result.images[0];
      if (!image) {
        errors.push(`${preset.slug}: no image returned`);
        continue;
      }

      const { bunnyPath } = await ctx.runMutation(internalSavePresetThumbnailRef, {
        presetId: preset._id,
        mimeType: image.mediaType || "image/png",
        ownerId: args.ownerId,
        folderId: args.folderId,
      });
      await putObject({
        path: bunnyPath,
        body: image.data,
        contentType: image.mediaType || "image/png",
      });
      generated += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      errors.push(`${preset.slug}: ${message}`);
    }
  }

  return { generated, skipped, errors };
}

export const adminGenerateThumbnails = action({
  args: {
    force: v.optional(v.boolean()),
    slugs: v.optional(v.array(v.string())),
  },
  returns: v.object({
    generated: v.number(),
    skipped: v.number(),
    errors: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    const currentUser = await ctx.runQuery(currentUserRef, {});
    if (!currentUser || (currentUser.role !== "admin" && currentUser.role !== "super_admin")) {
      throw new Error("Admin access required");
    }

    const bootstrap = await ctx.runQuery(internalBootstrapTargetRef, {});
    if (!bootstrap) {
      throw new Error("No admin user found to attach preset thumbnails");
    }

    return await generatePresetThumbnails(ctx, {
      force: args.force,
      slugs: args.slugs,
      ownerId: bootstrap.ownerId,
      folderId: bootstrap.folderId,
    });
  },
});

/** Deploy-key bootstrap — callable via `npx convex run stylePresetActions:internalGenerateThumbnails`. */
export const internalGenerateThumbnails = internalAction({
  args: {
    force: v.optional(v.boolean()),
    slugs: v.optional(v.array(v.string())),
  },
  returns: v.object({
    generated: v.number(),
    skipped: v.number(),
    errors: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    const bootstrap = await ctx.runQuery(internalBootstrapTargetRef, {});
    if (!bootstrap) {
      throw new Error("No admin user found to attach preset thumbnails");
    }
    return await generatePresetThumbnails(ctx, {
      force: args.force ?? true,
      slugs: args.slugs,
      ownerId: bootstrap.ownerId,
      folderId: bootstrap.folderId,
    });
  },
});
