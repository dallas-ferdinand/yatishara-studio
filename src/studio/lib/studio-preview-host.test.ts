import { describe, expect, it } from "vitest";
import {
  isStudioLiveProductionHost,
  isStudioPreviewHost,
  normalizeStudioHostname,
} from "./studio-preview-host";
import { shouldShowStudioUpdatingOverlay } from "./studio-live-updating";

describe("studio host helpers", () => {
  it("treats preview and loopback as preview hosts", () => {
    expect(isStudioPreviewHost("preview.studio.yatishara.com")).toBe(true);
    expect(isStudioPreviewHost("localhost")).toBe(true);
    expect(isStudioPreviewHost("127.0.0.1:3000")).toBe(true);
    expect(isStudioPreviewHost("studio.yatishara.com")).toBe(false);
  });

  it("only treats the public production host as live", () => {
    expect(isStudioLiveProductionHost("studio.yatishara.com")).toBe(true);
    expect(isStudioLiveProductionHost("www.studio.yatishara.com")).toBe(true);
    expect(isStudioLiveProductionHost("studio.yatishara.com:443")).toBe(true);
    expect(isStudioLiveProductionHost("preview.studio.yatishara.com")).toBe(false);
    expect(isStudioLiveProductionHost("localhost")).toBe(false);
    expect(normalizeStudioHostname("www.studio.yatishara.com, studio.yatishara.com")).toBe(
      "studio.yatishara.com",
    );
  });

  it("locks the editor overlay on live only", () => {
    expect(shouldShowStudioUpdatingOverlay("studio.yatishara.com")).toBe(true);
    expect(shouldShowStudioUpdatingOverlay("preview.studio.yatishara.com")).toBe(false);
    expect(shouldShowStudioUpdatingOverlay("localhost")).toBe(false);
  });
});
