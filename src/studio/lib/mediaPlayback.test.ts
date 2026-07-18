import { describe, expect, it, vi } from "vitest";
import {
  clampMediaTime,
  commitMediaSeek,
  createSeekHandlers,
  formatMediaTime,
  isVideoFileUrl,
  playableMediaUrl,
} from "./mediaPlayback";

describe("formatMediaTime", () => {
  it("formats minutes and hours", () => {
    expect(formatMediaTime(65)).toBe("1:05");
    expect(formatMediaTime(3661)).toBe("1:01:01");
    expect(formatMediaTime(Number.NaN)).toBe("0:00");
  });
});

describe("playableMediaUrl", () => {
  it("rejects image posters and prefers playable URLs", () => {
    expect(
      playableMediaUrl(
        "https://cdn.example.com/poster.jpg?token=1",
        "https://cdn.example.com/clip.mp4?token=2",
      ),
    ).toBe("https://cdn.example.com/clip.mp4?token=2");
  });

  it("accepts extensionless signed CDN paths", () => {
    expect(playableMediaUrl("https://cdn.example.com/users/a/video?token=1")).toBe(
      "https://cdn.example.com/users/a/video?token=1",
    );
  });
});

describe("isVideoFileUrl", () => {
  it("detects common video extensions", () => {
    expect(isVideoFileUrl("https://x/a.mp4")).toBe(true);
    expect(isVideoFileUrl("https://x/a.webm?token=1")).toBe(true);
    expect(isVideoFileUrl("https://x/a.jpg")).toBe(false);
  });
});

describe("commitMediaSeek / createSeekHandlers", () => {
  it("clamps and commits currentTime", () => {
    const media = { duration: 10, currentTime: 0 } as HTMLMediaElement;
    expect(commitMediaSeek(media, 12)).toBe(10);
    expect(media.currentTime).toBe(10);
    expect(clampMediaTime(-2, 10)).toBe(0);
  });

  it("commits immediately for keyboard changes without pointerdown", () => {
    const media = { duration: 20, currentTime: 0 } as HTMLMediaElement;
    const pointerSeekingRef = { current: false };
    const setSeekValue = vi.fn();
    const setSeeking = vi.fn();
    const setCurrent = vi.fn();
    const handlers = createSeekHandlers({
      getMedia: () => media,
      setSeekValue,
      setSeeking,
      setCurrent,
      pointerSeekingRef,
    });

    handlers.onChange({ target: { value: "4.5" } as HTMLInputElement });
    expect(media.currentTime).toBe(4.5);
    expect(setCurrent).toHaveBeenCalledWith(4.5);
    expect(pointerSeekingRef.current).toBe(false);
  });

  it("defers commit while pointer-seeking until pointerup", () => {
    const media = { duration: 20, currentTime: 0 } as HTMLMediaElement;
    const pointerSeekingRef = { current: false };
    const setSeekValue = vi.fn();
    const setSeeking = vi.fn();
    const handlers = createSeekHandlers({
      getMedia: () => media,
      setSeekValue,
      setSeeking,
      pointerSeekingRef,
    });

    handlers.onPointerDown();
    expect(pointerSeekingRef.current).toBe(true);
    handlers.onChange({ target: { value: "8" } as HTMLInputElement });
    expect(media.currentTime).toBe(0);
    handlers.onPointerUp({ currentTarget: { value: "8" } as HTMLInputElement });
    expect(media.currentTime).toBe(8);
  });
});
