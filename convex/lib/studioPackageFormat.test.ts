import { describe, expect, it } from "vitest";
import {
  STUDIO_PACKAGE_FORMAT,
  collectClipAssetIds,
  isStudioPackageManifest,
  mediaExtForAsset,
  packageAssetRef,
  packageDirName,
  parsePackageAssetRef,
  remapPackageRefsToAssetIds,
  rewriteProjectToPackageRefs,
} from "./studioPackageFormat";

describe("studioPackageFormat", () => {
  it("rewrites clip asset ids to pkg refs and drops missing", () => {
    const project = {
      name: "Demo",
      folderId: "folder_1",
      tracks: [],
      clips: [
        { id: "c1", assetId: "asset_a", trackId: "v1", startTime: 0, trimIn: 0, trimOut: 1 },
        { id: "c2", assetId: "asset_missing", trackId: "v1", startTime: 1, trimIn: 0, trimOut: 1 },
        { id: "c3", trackId: "t1", startTime: 0, trimIn: 0, trimOut: 2, kind: "text" },
      ],
      sourceAssetId: "asset_a",
    };
    const idToKey = new Map([["asset_a", "m0_a"]]);
    const rewritten = rewriteProjectToPackageRefs(project, idToKey);
    expect(rewritten.folderId).toBeUndefined();
    expect(rewritten.clips?.[0]?.assetId).toBe(packageAssetRef("m0_a"));
    expect(rewritten.clips?.[1]?.assetId).toBeUndefined();
    expect(rewritten.sourceAssetId).toBe(packageAssetRef("m0_a"));
  });

  it("remaps pkg refs back to asset ids", () => {
    const project = {
      name: "Demo",
      tracks: [],
      clips: [
        { id: "c1", assetId: "pkg:m0_a", trackId: "v1", startTime: 0, trimIn: 0, trimOut: 1 },
        { id: "c2", assetId: "foreign_id", trackId: "v1", startTime: 1, trimIn: 0, trimOut: 1 },
      ],
    };
    const keyToAssetId = new Map([["m0_a", "asset_new"]]);
    const { project: remapped, unresolvedClips } = remapPackageRefsToAssetIds(
      project,
      keyToAssetId,
    );
    expect(remapped.clips?.[0]?.assetId).toBe("asset_new");
    expect(remapped.clips?.[1]?.assetId).toBeUndefined();
    expect(unresolvedClips).toBe(1);
  });

  it("collects unique clip and source asset ids", () => {
    expect(
      collectClipAssetIds({
        sourceAssetId: "a1",
        clips: [{ assetId: "a1" }, { assetId: "a2" }, { assetId: "a1" }, {}],
      }),
    ).toEqual(["a1", "a2"]);
  });

  it("validates package manifests", () => {
    expect(
      isStudioPackageManifest({
        format: STUDIO_PACKAGE_FORMAT,
        formatVersion: 1,
        kind: "videoEdit",
        name: "X",
        exportedAt: "2026-08-04T00:00:00.000Z",
        media: [],
      }),
    ).toBe(true);
    expect(isStudioPackageManifest({ format: "other", media: [] })).toBe(false);
    expect(parsePackageAssetRef("pkg:m1")).toBe("m1");
    expect(parsePackageAssetRef("asset_x")).toBeNull();
    expect(packageDirName("My Edit.studio")).toBe("My Edit.studio");
    expect(mediaExtForAsset({ name: "clip.MP4", kind: "video" })).toBe(".mp4");
    expect(mediaExtForAsset({ kind: "audio", mimeType: "audio/mp4" })).toBe(".m4a");
  });
});
