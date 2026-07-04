import type { Doc, Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";

export async function isFolderInSandbox(
  ctx: QueryCtx,
  folderId: Id<"folders">,
  sandboxFolderId: Id<"folders">,
): Promise<boolean> {
  let current: Id<"folders"> | undefined = folderId;
  while (current) {
    if (current === sandboxFolderId) {
      return true;
    }
    const folder: Doc<"folders"> | null = await ctx.db.get("folders", current);
    if (!folder) {
      return false;
    }
    current = folder.parentId;
  }
  return false;
}

export async function isFolderDescendantOf(
  ctx: QueryCtx,
  folderId: Id<"folders">,
  ancestorId: Id<"folders">,
): Promise<boolean> {
  let current: Id<"folders"> | undefined = folderId;
  while (current) {
    if (current === ancestorId) {
      return true;
    }
    const folder: Doc<"folders"> | null = await ctx.db.get("folders", current);
    if (!folder) {
      return false;
    }
    current = folder.parentId;
  }
  return false;
}
