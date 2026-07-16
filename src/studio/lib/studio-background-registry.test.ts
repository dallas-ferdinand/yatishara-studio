import { describe, expect, it } from "vitest";
import {
  studioBackgroundPath,
  studioBackgroundTransformParams,
  STUDIO_AUTH_BACKGROUND_PATHS,
} from "./studio-background-registry";

describe("studio background delivery", () => {
  it("requests viewport-sized wallpaper transforms instead of 8K", () => {
    const params = studioBackgroundTransformParams({ width: 390, dpr: 2.75, quality: 88 });
    expect(params).toContain("width=1073");
    expect(params).toContain("quality=88");
    expect(params).not.toContain("8192");
    expect(params).not.toContain("quality=100");
  });

  it("caps desktop wallpaper decode size at 3840 with high glass-ready quality", () => {
    const params = studioBackgroundTransformParams({ width: 2560, dpr: 2 });
    expect(params).toContain("width=3840");
    expect(params).toContain("quality=92");
  });

  it("builds CDN paths with transform query when CDN is configured", () => {
    const prev = process.env.NEXT_PUBLIC_STUDIO_BG_CDN;
    process.env.NEXT_PUBLIC_STUDIO_BG_CDN = "https://cdn.example/wallpapers";
    try {
      const path = studioBackgroundPath("animated", "agent", "dark", {
        width: 1280,
        dpr: 1,
      });
      expect(path.startsWith("https://cdn.example/wallpapers/")).toBe(true);
      expect(path).toContain("width=1280");
      expect(path).not.toContain("quality=100");
    } finally {
      if (prev === undefined) delete process.env.NEXT_PUBLIC_STUDIO_BG_CDN;
      else process.env.NEXT_PUBLIC_STUDIO_BG_CDN = prev;
    }
  });

  it("does not preload both light and dark for every auth carousel tile", () => {
    expect(STUDIO_AUTH_BACKGROUND_PATHS.length).toBeLessThanOrEqual(32);
    expect(
      STUDIO_AUTH_BACKGROUND_PATHS.every((path) => !path.includes("-light-")),
    ).toBe(true);
  });
});
