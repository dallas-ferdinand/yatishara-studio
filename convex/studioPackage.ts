import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalQuery, type QueryCtx } from "./_generated/server";
import { authedQuery, type StudioCtx } from "./lib/customFunctions";
import { signBunnyFullUrl } from "./lib/bunny";
import { parseEditorProject } from "./lib/editorProjectOps";
import { isFolderInSandbox } from "./lib/studioApi/folderScope";
import {
  STUDIO_PACKAGE_FORMAT,
  STUDIO_PACKAGE_FORMAT_VERSION,
  STUDIO_PACKAGE_ICON_SVG,
  collectClipAssetIds,
  mediaExtForAsset,
  packageDirName,
  packageKeyForAssetId,
  rewriteProjectToPackageRefs,
  safePackageSegment,
  type StudioPackageManifest,
  type StudioPackageMediaKind,
} from "./lib/studioPackageFormat";

export type PackageManifestFile = {
  path: string;
  kind: "remote" | "text";
  url?: string;
  text?: string;
  byteSize?: number;
};

type PackageCtx = QueryCtx & StudioCtx;

async function buildVideoEditPackageFiles(
  ctx: QueryCtx,
  ownerId: Id<"users">,
  projectId: Id<"videoEditProjects">,
  expiresUnix: number,
  pathPrefix = "",
): Promise<{ packageName: string; files: PackageManifestFile[] } | null> {
  const project = await ctx.db.get("videoEditProjects", projectId);
  if (!project || project.ownerId !== ownerId || project.deletedAt) {
    return null;
  }

  let parsed;
  try {
    parsed = parseEditorProject(JSON.parse(project.projectJson));
  } catch {
    parsed = parseEditorProject({
      name: project.name,
      folderId: project.folderId,
      duration: 30,
      tracks: [],
      clips: [],
    });
  }

  const assetIds = collectClipAssetIds(parsed as { clips?: Array<{ assetId?: string }>; sourceAssetId?: string });
  const idToKey = new Map<string, string>();
  const media: StudioPackageManifest["media"] = [];
  const missing: NonNullable<StudioPackageManifest["missing"]> = [];
  const files: PackageManifestFile[] = [];
  const prefix = pathPrefix ? pathPrefix.replace(/\/$/, "") : "";
  const join = (rel: string) => (prefix ? `${prefix}/${rel}` : rel);

  let index = 0;
  for (const assetId of assetIds) {
    const asset = await ctx.db.get("assets", assetId as Id<"assets">);
    if (
      !asset ||
      asset.ownerId !== ownerId ||
      asset.deletedAt ||
      asset.purgedAt ||
      !asset.bunnyPath ||
      (asset.storageStatus !== undefined && asset.storageStatus !== "ready")
    ) {
      missing.push({
        assetId,
        reason: !asset
          ? "missing"
          : asset.deletedAt || asset.purgedAt
            ? "deleted"
            : !asset.bunnyPath
              ? "no_storage"
              : "not_ready",
      });
      continue;
    }
    const kind = (asset.kind ?? "document") as StudioPackageMediaKind;
    const key = packageKeyForAssetId(assetId, index);
    index += 1;
    idToKey.set(assetId, key);
    const ext = mediaExtForAsset({
      name: asset.name,
      kind,
      mimeType: asset.mimeType,
    });
    const mediaPath = `media/${key}${ext}`;
    media.push({
      key,
      path: mediaPath,
      originalName: asset.name || `${key}${ext}`,
      mime: asset.mimeType || "application/octet-stream",
      kind,
    });
    files.push({
      path: join(mediaPath),
      kind: "remote",
      url: await signBunnyFullUrl(asset.bunnyPath, expiresUnix, asset.kind),
      byteSize: asset.byteSize,
    });
  }

  const rewritten = rewriteProjectToPackageRefs(parsed as Record<string, unknown>, idToKey);
  rewritten.name = project.name;

  const manifest: StudioPackageManifest = {
    format: STUDIO_PACKAGE_FORMAT,
    formatVersion: STUDIO_PACKAGE_FORMAT_VERSION,
    kind: "videoEdit",
    name: project.name,
    exportedAt: new Date().toISOString(),
    icon: "icon.svg",
    media,
    ...(missing.length ? { missing } : {}),
  };

  files.unshift(
    {
      path: join("manifest.json"),
      kind: "text",
      text: `${JSON.stringify(manifest, null, 2)}\n`,
    },
    {
      path: join("project.json"),
      kind: "text",
      text: `${JSON.stringify(rewritten, null, 2)}\n`,
    },
    {
      path: join("icon.svg"),
      kind: "text",
      text: STUDIO_PACKAGE_ICON_SVG,
    },
  );

  const packageName = `${safePackageSegment(project.name, "Video edit")}.studio`;
  return { packageName, files };
}

/** Flat file list for a single `.studio` package (client zips + saves as .studio). */
export const packageManifest = authedQuery({
  args: {
    projectId: v.id("videoEditProjects"),
    expiresUnix: v.number(),
  },
  returns: v.object({
    packageName: v.string(),
    files: v.array(
      v.object({
        path: v.string(),
        kind: v.union(v.literal("remote"), v.literal("text")),
        url: v.optional(v.string()),
        text: v.optional(v.string()),
        byteSize: v.optional(v.number()),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const built = await buildVideoEditPackageFiles(
      ctx,
      ctx.user._id,
      args.projectId,
      args.expiresUnix,
      "",
    );
    if (!built) throw new Error("Video edit not found");
    return built;
  },
});

/** API/MCP: portable `.studio` package manifest (signed media URLs + project JSON). */
export const packageManifestForApi = internalQuery({
  args: {
    userId: v.id("users"),
    sandboxFolderId: v.id("folders"),
    projectId: v.id("videoEditProjects"),
    expiresUnix: v.optional(v.number()),
  },
  returns: v.union(
    v.null(),
    v.object({
      packageName: v.string(),
      files: v.array(
        v.object({
          path: v.string(),
          kind: v.union(v.literal("remote"), v.literal("text")),
          url: v.optional(v.string()),
          text: v.optional(v.string()),
          byteSize: v.optional(v.number()),
        }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const project = await ctx.db.get("videoEditProjects", args.projectId);
    if (!project || project.ownerId !== args.userId || project.deletedAt) {
      return null;
    }
    if (!(await isFolderInSandbox(ctx, project.folderId, args.sandboxFolderId))) {
      return null;
    }
    const expiresUnix =
      args.expiresUnix && Number.isFinite(args.expiresUnix)
        ? Math.floor(args.expiresUnix)
        : Math.floor(Date.now() / 1000) + 60 * 60;
    return await buildVideoEditPackageFiles(
      ctx,
      args.userId,
      args.projectId,
      expiresUnix,
      "",
    );
  },
});

/** Expand a video edit into package tree paths under an optional folder prefix. */
export async function expandVideoEditPackageIntoFiles(
  ctx: PackageCtx,
  projectId: Id<"videoEditProjects">,
  expiresUnix: number,
  parentPath: string,
  files: PackageManifestFile[],
  maxFiles: number,
): Promise<boolean> {
  if (files.length >= maxFiles) return true;
  const project = await ctx.db.get("videoEditProjects", projectId);
  if (!project || project.ownerId !== ctx.user._id || project.deletedAt) return false;
  const prefix = parentPath
    ? `${parentPath}/${packageDirName(project.name)}`
    : packageDirName(project.name);
  const built = await buildVideoEditPackageFiles(
    ctx,
    ctx.user._id,
    projectId,
    expiresUnix,
    prefix,
  );
  if (!built) return false;
  for (const file of built.files) {
    if (files.length >= maxFiles) return true;
    files.push(file);
  }
  return files.length >= maxFiles;
}

export { buildVideoEditPackageFiles, packageDirName };
