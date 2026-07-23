import { describe, expect, it } from "vitest";
import { labelsForSplit } from "./clipNaming";

describe("labelsForSplit", () => {
  it("appends a/b for a plain name", () => {
    expect(labelsForSplit("clip")).toEqual(["clip a", "clip b"]);
    expect(labelsForSplit("Open")).toEqual(["Open a", "Open b"]);
  });

  it("appends 1/2 when the name already ends with a letter take", () => {
    expect(labelsForSplit("clip b")).toEqual(["clip b 1", "clip b 2"]);
    expect(labelsForSplit("Take A")).toEqual(["Take A 1", "Take A 2"]);
  });

  it("appends a/b again after a numbered take", () => {
    expect(labelsForSplit("clip b 1")).toEqual(["clip b 1 a", "clip b 1 b"]);
  });

  it("falls back when the label is blank", () => {
    expect(labelsForSplit("  ")).toEqual(["Clip a", "Clip b"]);
  });
});
