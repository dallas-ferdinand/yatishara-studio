import { describe, expect, it } from "vitest";
import {
  shortStudioBuildLabel,
  studioUpdateBannerLabel,
} from "./studio-web-update";

describe("studio update banner labels", () => {
  it("shortens fast-deploy build ids to the git sha", () => {
    expect(
      shortStudioBuildLabel("fast-c220b7104a9f-20260816014505"),
    ).toBe("c220b7104a9f");
    expect(shortStudioBuildLabel("fast-abc1234")).toBe("abc1234");
  });

  it("formats from → to for the banner", () => {
    expect(
      studioUpdateBannerLabel({
        localBuildId: "fast-aaaaaaa11111-20260816010000",
        buildId: "fast-bbbbbbb22222-20260816020000",
        versionName: "0.1.0",
      }),
    ).toBe("aaaaaaa11111 → bbbbbbb22222");
  });
});
