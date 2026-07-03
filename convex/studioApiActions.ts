"use node";

import { v } from "convex/values";
import { makeFunctionReference, type FunctionReference } from "convex/server";
import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
import { putObject } from "./lib/bunny";

const prepareInlineAssetUploadRef = makeFunctionReference<
  "mutation",
  {
    userId: Id<"users">;
    sandboxFolderId: Id<"folders">;
    folderId: Id<"folders">;
    name: string;
    kind: "image" | "video" | "audio" | "document";
    mimeType: string;
    byteSize: number;
  },
  { assetId: Id<"assets">; bunnyPath: string }
>("studioApiInternal:prepareInlineAssetUpload");

const finalizeInlineAssetUploadRef = makeFunctionReference<
  "mutation",
  {
    userId: Id<"users">;
    sandboxFolderId: Id<"folders">;
    assetId: Id<"assets">;
    byteSize: number;
  },
  null
>("studioApiInternal:finalizeInlineAssetUpload");

export const uploadAssetInline = internalAction({
  args: {
    userId: v.id("users"),
    sandboxFolderId: v.id("folders"),
    folderId: v.id("folders"),
    name: v.string(),
    kind: v.union(
      v.literal("image"),
      v.literal("video"),
      v.literal("audio"),
      v.literal("document"),
    ),
    mimeType: v.string(),
    dataBase64: v.string(),
  },
  returns: v.object({
    assetId: v.id("assets"),
  }),
  handler: async (ctx, args): Promise<{ assetId: Id<"assets"> }> => {
    const bytes = Buffer.from(args.dataBase64, "base64");
    if (!bytes.length) {
      throw new Error("Empty file data");
    }
    const maxBytes = 50 * 1024 * 1024;
    if (bytes.length > maxBytes) {
      throw new Error("File exceeds 50 MB inline upload limit");
    }

    const prepared = await ctx.runMutation(
      prepareInlineAssetUploadRef as unknown as FunctionReference<
        "mutation",
        "internal",
        {
          userId: Id<"users">;
          sandboxFolderId: Id<"folders">;
          folderId: Id<"folders">;
          name: string;
          kind: "image" | "video" | "audio" | "document";
          mimeType: string;
          byteSize: number;
        },
        { assetId: Id<"assets">; bunnyPath: string }
      >,
      {
        userId: args.userId,
        sandboxFolderId: args.sandboxFolderId,
        folderId: args.folderId,
        name: args.name,
        kind: args.kind,
        mimeType: args.mimeType,
        byteSize: bytes.length,
      },
    );

    await putObject({
      path: prepared.bunnyPath,
      body: bytes,
      contentType: args.mimeType,
    });

    await ctx.runMutation(
      finalizeInlineAssetUploadRef as unknown as FunctionReference<
        "mutation",
        "internal",
        {
          userId: Id<"users">;
          sandboxFolderId: Id<"folders">;
          assetId: Id<"assets">;
          byteSize: number;
        },
        null
      >,
      {
        userId: args.userId,
        sandboxFolderId: args.sandboxFolderId,
        assetId: prepared.assetId,
        byteSize: bytes.length,
      },
    );

    return { assetId: prepared.assetId };
  },
});
