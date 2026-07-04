import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

export type ElementBuildStatus = "unbuilt" | "built";

export const MAX_ELEMENT_REFERENCE_ASSETS = 10;
export const MAX_GENERATION_REFERENCE_ASSETS = 10;

export function isSheetAssetFilename(name: string): boolean {
  return /-sheet\.(png|jpe?g|webp|gif|avif)$/i.test(name.trim());
}

export type ResolvedElementAssets = {
  referenceAssetIds: Id<"assets">[];
  sheetAssetId?: Id<"assets">;
  buildStatus: ElementBuildStatus;
  builtAt?: number;
};

/** Resolve reference photos vs built sheet from new fields or legacy sourceAssetIds. */
export async function resolveElementAssets(
  ctx: QueryCtx,
  element: Doc<"elements">,
): Promise<ResolvedElementAssets> {
  if (element.referenceAssetIds !== undefined || element.sheetAssetId !== undefined) {
    return {
      referenceAssetIds: element.referenceAssetIds ?? [],
      sheetAssetId: element.sheetAssetId,
      buildStatus: element.sheetAssetId ? "built" : "unbuilt",
      builtAt: element.builtAt,
    };
  }

  const legacyIds = element.sourceAssetIds ?? [];
  if (!legacyIds.length) {
    return { referenceAssetIds: [], buildStatus: "unbuilt" };
  }

  const first = await ctx.db.get("assets", legacyIds[0]!);
  if (first && isSheetAssetFilename(first.name)) {
    return {
      referenceAssetIds: legacyIds.slice(1),
      sheetAssetId: legacyIds[0],
      buildStatus: "built",
      builtAt: element.builtAt ?? element.updatedAt,
    };
  }

  return {
    referenceAssetIds: legacyIds,
    buildStatus: "unbuilt",
  };
}

export function referenceAssetIdsFromInput(args: {
  referenceAssetIds?: Id<"assets">[];
  sourceAssetIds?: Id<"assets">[];
}): Id<"assets">[] {
  return args.referenceAssetIds ?? args.sourceAssetIds ?? [];
}

export function assertReferenceCount(count: number, max = MAX_ELEMENT_REFERENCE_ASSETS): void {
  if (count > max) {
    throw new Error(`At most ${max} reference assets allowed; got ${count}.`);
  }
}
