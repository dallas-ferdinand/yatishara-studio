import { describe, expect, it } from "vitest";
import {
  elementReferenceIds,
  matchElementReferenceRow,
  prioritizeAssetIds,
  shouldSkipEmptyElementMediaPersist,
} from "./elementReferenceAssets";

describe("elementReferenceAssets", () => {
  it("keeps ids when the file is no longer in the open folder pool", () => {
    const entry = { referenceAssetIds: ["asset_moved"] };
    expect(elementReferenceIds(entry)).toEqual(["asset_moved"]);
    expect(
      matchElementReferenceRow("asset_moved", [{ _id: "other" }], [
        { studioId: "asset_moved", name: "face.jpg" },
      ]),
    ).toEqual({ studioId: "asset_moved", name: "face.jpg" });
  });

  it("prefers the live pool over nested rows so moved files refresh", () => {
    expect(
      matchElementReferenceRow(
        "asset_moved",
        [{ _id: "asset_moved", folderId: "other-folder" }],
        [{ studioId: "asset_moved", folderId: "old-folder" }],
      ),
    ).toEqual({ _id: "asset_moved", folderId: "other-folder" });
  });

  it("does not persist empty media over known ids unless the user cleared", () => {
    expect(shouldSkipEmptyElementMediaPersist([], ["asset_moved"], false)).toBe(true);
    expect(shouldSkipEmptyElementMediaPersist([], ["asset_moved"], true)).toBe(false);
    expect(shouldSkipEmptyElementMediaPersist(["asset_moved"], ["asset_moved"], false)).toBe(
      false,
    );
  });

  it("puts open-element ids first so the 48-cap fetch still hits them", () => {
    expect(prioritizeAssetIds(["open-ref"], ["a", "open-ref", "b"])).toEqual([
      "open-ref",
      "a",
      "b",
    ]);
  });
});
