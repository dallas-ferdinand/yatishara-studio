import { describe, expect, it } from "vitest";
import { previewTransitionWhilePlaying } from "./preview-transition-play";

describe("previewTransitionWhilePlaying", () => {
  it("keeps transitions when paused/scrubbing", () => {
    expect(previewTransitionWhilePlaying("blur", false)).toBe("blur");
    expect(previewTransitionWhilePlaying("zoomIn", false)).toBe("zoomIn");
    expect(previewTransitionWhilePlaying("wipeLeft", false)).toBe("wipeLeft");
  });

  it("approximates heavy GPU transitions during live play", () => {
    expect(previewTransitionWhilePlaying("blur", true)).toBe("crossfade");
    expect(previewTransitionWhilePlaying("zoomIn", true)).toBe("crossfade");
    expect(previewTransitionWhilePlaying("crossfade", true)).toBe("crossfade");
    expect(previewTransitionWhilePlaying("slideLeft", true)).toBe("slideLeft");
  });
});
