import { describe, expect, it } from "vitest";

import { StillResidency } from "./still-residency";

describe("StillResidency", () => {
  it("keeps asking for pixels while the bitmap is still decoding", () => {
    const stills = new StillResidency();

    // Play never awaits image decode, so the first paints have no bitmap.
    expect(stills.needsPixels("image:a", false)).toBe(false);
    stills.markSent([]);

    // Decode lands. The lane must still be offered its pixels.
    expect(stills.needsPixels("image:a", true)).toBe(true);
  });

  it("never marks a key resident from a paint that carried no pixels", () => {
    const stills = new StillResidency();

    // The regression: a bare key was sent, then recorded as resident anyway,
    // so the worker was never given anything to bind and the lane vanished.
    stills.needsPixels("image:a", false);
    stills.markSent([]);

    expect(stills.needsPixels("image:a", true)).toBe(true);
  });

  it("stops re-sending pixels once a paint delivered them", () => {
    const stills = new StillResidency();

    expect(stills.needsPixels("image:a", true)).toBe(true);
    stills.markSent(["image:a"]);

    expect(stills.needsPixels("image:a", true)).toBe(false);
  });

  it("re-sends pixels for keys the worker reports it could not bind", () => {
    const stills = new StillResidency();
    stills.markSent(["image:a", "image:b"]);

    // GPU cache evicted one of them.
    stills.forget(["image:b"]);

    expect(stills.needsPixels("image:a", true)).toBe(false);
    expect(stills.needsPixels("image:b", true)).toBe(true);
  });

  it("tracks every stacked still independently", () => {
    const stills = new StillResidency();

    // Three image lanes; only the one with a decoded bitmap ships pixels.
    expect(stills.needsPixels("image:top", true)).toBe(true);
    expect(stills.needsPixels("image:middle", false)).toBe(false);
    expect(stills.needsPixels("image:bottom", true)).toBe(true);
    stills.markSent(["image:top", "image:bottom"]);

    expect(stills.needsPixels("image:top", true)).toBe(false);
    expect(stills.needsPixels("image:middle", true)).toBe(true);
    expect(stills.needsPixels("image:bottom", true)).toBe(false);
  });

  it("re-uploads everything after a quality change drops the bitmaps", () => {
    const stills = new StillResidency();
    stills.markSent(["image:a"]);

    stills.clear();

    expect(stills.needsPixels("image:a", true)).toBe(true);
  });
});
