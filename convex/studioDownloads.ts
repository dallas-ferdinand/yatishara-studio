import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { authedQuery, type StudioCtx } from "./lib/customFunctions";
import { signBunnyFullUrl } from "./lib/bunny";

const selection = v.union(
  v.object({ kind: v.literal("folder"), id: v.id("folders") }),
  v.object({ kind: v.literal("asset"), id: v.id("assets") }),
  v.object({ kind: v.literal("document"), id: v.id("documents") }),
  v.object({ kind: v.literal("videoEdit"), id: v.id("videoEditProjects") }),
  v.object({ kind: v.literal("element"), id: v.id("elements") }),
);

const manifestFile = v.object({
  path: v.string(),
  kind: v.union(v.literal("remote"), v.literal("text")),
  url: v.optional(v.string()),
  text: v.optional(v.string()),
  byteSize: v.optional(v.number()),
});

type DownloadCtx = QueryCtx & StudioCtx;
type ManifestFile = {
  path: string;
  kind: "remote" | "text";
  url?: string;
  text?: string;
  byteSize?: number;
};

function safeSegment(value: string, fallback: string): string {
  const clean = value
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return clean || fallback;
}

function withExtension(name: string, extension: string): string {
  return name.toLowerCase().endsWith(extension.toLowerCase())
    ? name
    : `${name}${extension}`;
}

function elementMarkdown(element: {
  name: string;
  type: string;
  description?: string;
  sourceMode?: string;
  styleRules?: string;
  renderMode?: string;
}): string {
  const lines = [
    `# ${element.name}`,
    "",
    `- Type: ${element.type}`,
    ...(element.sourceMode ? [`- Source: ${element.sourceMode}`] : []),
    ...(element.renderMode ? [`- Render mode: ${element.renderMode}`] : []),
  ];
  if (element.description) lines.push("", element.description);
  if (element.styleRules) lines.push("", "## Style rules", "", element.styleRules);
  return `${lines.join("\n")}\n`;
}

async function addFolder(
  ctx: DownloadCtx,
  folderId: Id<"folders">,
  parentPath: string,
  expiresUnix: number,
  files: ManifestFile[],
  visited: Set<string>,
  maxFiles: number,
): Promise<boolean> {
  if (files.length >= maxFiles || visited.has(folderId)) return files.length >= maxFiles;
  visited.add(folderId);
  const folder = await ctx.db.get("folders", folderId);
  if (!folder || folder.ownerId !== ctx.user._id || folder.deletedAt) return false;
  const folderPath = parentPath
    ? `${parentPath}/${safeSegment(folder.name, "Folder")}`
    : safeSegment(folder.name, "Folder");

  const [assets, documents, videoEdits, elements, children] = await Promise.all([
    ctx.db
      .query("assets")
      .withIndex("by_folder", (q) => q.eq("folderId", folderId))
      .collect(),
    ctx.db
      .query("documents")
      .withIndex("by_folder", (q) => q.eq("folderId", folderId))
      .collect(),
    ctx.db
      .query("videoEditProjects")
      .withIndex("by_folder", (q) => q.eq("folderId", folderId))
      .collect(),
    ctx.db
      .query("elements")
      .withIndex("by_folder", (q) => q.eq("folderId", folderId))
      .collect(),
    ctx.db
      .query("folders")
      .withIndex("by_owner_and_parent", (q) =>
        q.eq("ownerId", ctx.user._id).eq("parentId", folderId),
      )
      .collect(),
  ]);

  for (const asset of assets) {
    if (
      files.length >= maxFiles ||
      asset.ownerId !== ctx.user._id ||
      asset.deletedAt ||
      asset.purgedAt ||
      !asset.bunnyPath ||
      (asset.storageStatus !== undefined && asset.storageStatus !== "ready")
    ) {
      continue;
    }
    files.push({
      path: `${folderPath}/${safeSegment(asset.name, "asset")}`,
      kind: "remote",
      url: await signBunnyFullUrl(asset.bunnyPath, expiresUnix, asset.kind),
      byteSize: asset.byteSize,
    });
  }
  for (const document of documents) {
    if (files.length >= maxFiles || document.ownerId !== ctx.user._id || document.deletedAt) {
      continue;
    }
    files.push({
      path: `${folderPath}/${safeSegment(withExtension(document.title, ".md"), "Document.md")}`,
      kind: "text",
      text: document.contentMarkdown,
    });
  }
  for (const project of videoEdits) {
    if (files.length >= maxFiles || project.ownerId !== ctx.user._id || project.deletedAt) {
      continue;
    }
    files.push({
      path: `${folderPath}/${safeSegment(withExtension(project.name, ".edit.json"), "Video edit.edit.json")}`,
      kind: "text",
      text: project.projectJson,
    });
  }
  for (const element of elements) {
    if (files.length >= maxFiles || element.ownerId !== ctx.user._id || element.deletedAt) {
      continue;
    }
    files.push({
      path: `${folderPath}/${safeSegment(withExtension(element.name, ".element.md"), "Element.element.md")}`,
      kind: "text",
      text: elementMarkdown(element),
    });
  }
  for (const child of children) {
    if (files.length >= maxFiles) return true;
    if (!child.deletedAt) {
      const truncated = await addFolder(
        ctx,
        child._id,
        folderPath,
        expiresUnix,
        files,
        visited,
        maxFiles,
      );
      if (truncated) return true;
    }
  }
  return files.length >= maxFiles;
}

export const manifest = authedQuery({
  args: {
    selections: v.array(selection),
    expiresUnix: v.number(),
    maxFiles: v.optional(v.number()),
  },
  returns: v.object({
    archiveName: v.string(),
    files: v.array(manifestFile),
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    if (args.selections.length === 0) {
      throw new Error("Select at least one file or folder");
    }
    if (args.selections.length > 100) {
      throw new Error("Select at most 100 items");
    }
    const maxFiles = Math.min(Math.max(args.maxFiles ?? 500, 1), 750);
    const files: ManifestFile[] = [];
    const visitedFolders = new Set<string>();
    const seenFiles = new Set<string>();
    let truncated = false;
    let firstName = "Studio files";

    const pushUnique = (file: ManifestFile) => {
      if (files.length >= maxFiles || seenFiles.has(file.path)) return;
      seenFiles.add(file.path);
      files.push(file);
    };

    for (const item of args.selections) {
      if (files.length >= maxFiles) {
        truncated = true;
        break;
      }
      if (item.kind === "folder") {
        const folder = await ctx.db.get("folders", item.id);
        if (folder && folder.ownerId === ctx.user._id && !folder.deletedAt) {
          if (args.selections.length === 1) firstName = folder.name;
          truncated =
            (await addFolder(
              ctx,
              folder._id,
              "",
              args.expiresUnix,
              files,
              visitedFolders,
              maxFiles,
            )) || truncated;
        }
        continue;
      }
      if (item.kind === "asset") {
        const asset = await ctx.db.get("assets", item.id);
        if (
          asset &&
          asset.ownerId === ctx.user._id &&
          !asset.deletedAt &&
          !asset.purgedAt &&
          asset.bunnyPath &&
          (asset.storageStatus === undefined || asset.storageStatus === "ready")
        ) {
          if (args.selections.length === 1) firstName = asset.name;
          pushUnique({
            path: safeSegment(asset.name, "asset"),
            kind: "remote",
            url: await signBunnyFullUrl(asset.bunnyPath, args.expiresUnix, asset.kind),
            byteSize: asset.byteSize,
          });
        }
        continue;
      }
      if (item.kind === "document") {
        const document = await ctx.db.get("documents", item.id);
        if (document && document.ownerId === ctx.user._id && !document.deletedAt) {
          if (args.selections.length === 1) firstName = document.title;
          pushUnique({
            path: safeSegment(withExtension(document.title, ".md"), "Document.md"),
            kind: "text",
            text: document.contentMarkdown,
          });
        }
        continue;
      }
      if (item.kind === "videoEdit") {
        const project = await ctx.db.get("videoEditProjects", item.id);
        if (project && project.ownerId === ctx.user._id && !project.deletedAt) {
          if (args.selections.length === 1) firstName = project.name;
          pushUnique({
            path: safeSegment(withExtension(project.name, ".edit.json"), "Video edit.edit.json"),
            kind: "text",
            text: project.projectJson,
          });
        }
        continue;
      }
      const element = await ctx.db.get("elements", item.id);
      if (element && element.ownerId === ctx.user._id && !element.deletedAt) {
        if (args.selections.length === 1) firstName = element.name;
        pushUnique({
          path: safeSegment(withExtension(element.name, ".element.md"), "Element.element.md"),
          kind: "text",
          text: elementMarkdown(element),
        });
      }
    }

    const archiveBase =
      args.selections.length === 1
        ? safeSegment(firstName.replace(/\.[^.]+$/, ""), "Studio files")
        : `Studio selection (${args.selections.length})`;
    return {
      archiveName: `${archiveBase}.zip`,
      files,
      truncated,
    };
  },
});
