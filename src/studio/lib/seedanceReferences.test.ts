import { describe, expect, it } from "vitest";
import {
  composerAssetTag,
  composerElementTag,
  elementFileName,
  elementStemFromDisplayName,
  normalizeOfficialSeedanceTags,
  orderKindsForSeedance,
  remapPromptToSeedanceSlots,
  seedanceSlotTag,
  uniqueElementStem,
} from "./seedanceReferences";

describe("seedanceReferences", () => {
  it("builds official @Image N / @Video N tags", () => {
    expect(seedanceSlotTag("image", 1)).toBe("@Image 1");
    expect(seedanceSlotTag("video", 2)).toBe("@Video 2");
  });

  it("keeps filename extensions in asset tags", () => {
    expect(composerAssetTag("BC Headphones.jpeg")).toBe("BC-Headphones.jpeg");
    expect(composerElementTag("@Product Shot")).toBe("product-shot");
    expect(elementStemFromDisplayName("untitled.element")).toBe("untitled");
    expect(elementStemFromDisplayName("@Foo Bar.element")).toBe("foo-bar");
    expect(elementFileName("Product Shot")).toBe("product-shot.element");
  });

  it("mints hyphen unique element ids", () => {
    expect(uniqueElementStem([])).toBe("untitled");
    expect(uniqueElementStem(["untitled.element", "@untitled"])).toBe("untitled-2");
    expect(uniqueElementStem(["untitled.element", "untitled-2.element"])).toBe(
      "untitled-3",
    );
  });

  it("normalizes compact official tags", () => {
    expect(normalizeOfficialSeedanceTags("use @image1 and @VIDEO2")).toBe(
      "use @Image 1 and @Video 2",
    );
  });

  it("remaps friendly chips to Seedance slots in image-then-video order", () => {
    const prompt =
      "@flyer @headphones Hypermotion product ad. Style from @flyer, form from @headphones.";
    const out = remapPromptToSeedanceSlots(prompt, [
      { kind: "image", aliases: ["headphones.jpeg", "headphones"] },
      { kind: "image", aliases: ["flyer", "Bold-flyer.png"] },
      { kind: "video", aliases: ["ref-clip.mp4"] },
    ]);
    expect(out).toContain("@Image 1");
    expect(out).toContain("@Image 2");
    expect(out).not.toMatch(/@flyer\b/i);
    expect(out).not.toMatch(/@headphones\b/i);
  });

  it("orders media images then videos then audio", () => {
    const ordered = orderKindsForSeedance([
      { kind: "video" },
      { kind: "audio" },
      { kind: "image" },
      { kind: "image" },
    ]);
    expect(ordered.map((item) => item.kind)).toEqual([
      "image",
      "image",
      "video",
      "audio",
    ]);
  });
});
