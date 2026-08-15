import { describe, expect, it } from "vitest";
import {
  audioFadeGainAtLocalTime,
  clampAudioFadePair,
  clampAudioFadeSec,
  clipOpacityAtLocalTime,
  resolveAudioFadePair,
  resolveTextMotion,
  textAnimationStyle,
  textMotionSummary,
} from "./editorEffects";

describe("clipOpacityAtLocalTime", () => {
  it("uses picture fadeIn/fadeOut only", () => {
    const effects = { fadeIn: 1, fadeOut: 1, audioFadeIn: 0, audioFadeOut: 0 };
    expect(clipOpacityAtLocalTime(effects, 4, 0)).toBeCloseTo(0);
    expect(clipOpacityAtLocalTime(effects, 4, 2)).toBeCloseTo(1);
    expect(clipOpacityAtLocalTime(effects, 4, 4)).toBeCloseTo(0);
  });

  it("ignores audioFade fields for picture opacity", () => {
    const effects = { audioFadeIn: 1, audioFadeOut: 1 };
    expect(clipOpacityAtLocalTime(effects, 4, 0)).toBeCloseTo(1);
    expect(clipOpacityAtLocalTime(effects, 4, 4)).toBeCloseTo(1);
  });

  it("multiplies static clip opacity with the fade envelope", () => {
    expect(clipOpacityAtLocalTime({ opacity: 0.5 }, 4, 2)).toBeCloseTo(0.5);
    expect(clipOpacityAtLocalTime({ opacity: 0.5, fadeIn: 1 }, 4, 0)).toBeCloseTo(0);
    expect(clipOpacityAtLocalTime({ opacity: 0 }, 4, 2)).toBeCloseTo(0);
  });
});

describe("audioFadeGainAtLocalTime", () => {
  it("returns 1 when no fades are set", () => {
    expect(audioFadeGainAtLocalTime(undefined, 4, 1)).toBe(1);
    expect(audioFadeGainAtLocalTime({}, 4, 1)).toBe(1);
  });

  it("uses dedicated audioFadeIn/Out on video clips", () => {
    const effects = { fadeIn: 2, fadeOut: 2, audioFadeIn: 1, audioFadeOut: 0 };
    expect(audioFadeGainAtLocalTime(effects, 4, 0, "video")).toBeCloseTo(0);
    expect(audioFadeGainAtLocalTime(effects, 4, 1, "video")).toBeCloseTo(1);
    // Picture fade must not drive video audio when audioFade* is set.
    expect(audioFadeGainAtLocalTime(effects, 4, 3.5, "video")).toBeCloseTo(1);
  });

  it("does not apply picture fadeIn to video audio when audioFade* unset", () => {
    const effects = { fadeIn: 1, fadeOut: 1 };
    expect(audioFadeGainAtLocalTime(effects, 4, 0, "video")).toBeCloseTo(1);
    expect(audioFadeGainAtLocalTime(effects, 4, 4, "video")).toBeCloseTo(1);
  });

  it("legacy audio beds still honor fadeIn/fadeOut", () => {
    const effects = { fadeIn: 1 };
    expect(audioFadeGainAtLocalTime(effects, 4, 0, "audio")).toBeCloseTo(0);
    expect(audioFadeGainAtLocalTime(effects, 4, 0.5, "audio")).toBeCloseTo(
      Math.sin(Math.PI / 4),
    );
    expect(audioFadeGainAtLocalTime(effects, 4, 1, "audio")).toBeCloseTo(1);
  });

  it("ramps dedicated audio fade-out", () => {
    const effects = { audioFadeOut: 1 };
    expect(audioFadeGainAtLocalTime(effects, 4, 2, "video")).toBeCloseTo(1);
    expect(audioFadeGainAtLocalTime(effects, 4, 3.5, "video")).toBeCloseTo(
      Math.sin(Math.PI / 4),
    );
    expect(audioFadeGainAtLocalTime(effects, 4, 4, "video")).toBeCloseTo(0);
  });

  it("does not multiply overlapping fades — pair is clamped first", () => {
    const effects = { audioFadeIn: 3, audioFadeOut: 3 };
    expect(audioFadeGainAtLocalTime(effects, 4, 2, "video")).toBeCloseTo(1);
  });

  it("rises faster than linear in the early part of a fade", () => {
    const effects = { audioFadeIn: 1 };
    const early = audioFadeGainAtLocalTime(effects, 4, 0.25, "video");
    expect(early).toBeGreaterThan(0.25);
    expect(early).toBeLessThan(1);
  });
});

describe("resolveAudioFadePair", () => {
  it("prefers dedicated audio fields", () => {
    expect(
      resolveAudioFadePair({ fadeIn: 9, audioFadeIn: 0.5, audioFadeOut: 0.25 }, 4, "video"),
    ).toEqual({ fadeIn: 0.5, fadeOut: 0.25 });
  });
});

describe("clampAudioFadeSec", () => {
  it("clamps to clip duration and floors negatives", () => {
    expect(clampAudioFadeSec(-1, 4)).toBe(0);
    expect(clampAudioFadeSec(0, 4)).toBe(0);
    expect(clampAudioFadeSec(2, 4)).toBe(2);
    expect(clampAudioFadeSec(10, 4)).toBe(4);
  });

  it("reserves space so fades cannot pass each other", () => {
    expect(clampAudioFadeSec(3, 4, 2)).toBeCloseTo(2);
    expect(clampAudioFadeSec(10, 4, 1.5)).toBeCloseTo(2.5);
    expect(clampAudioFadeSec(1, 4, 3.5)).toBeCloseTo(0.5);
  });
});

describe("clampAudioFadePair", () => {
  it("leaves non-overlapping pairs alone", () => {
    expect(clampAudioFadePair(1, 1, 4)).toEqual({ fadeIn: 1, fadeOut: 1 });
  });

  it("scales overlapping pairs to fit the clip", () => {
    expect(clampAudioFadePair(3, 3, 4)).toEqual({ fadeIn: 2, fadeOut: 2 });
  });
});

describe("resolveTextMotion", () => {
  it("maps legacy fadeOut on animation to exit only", () => {
    expect(resolveTextMotion({ animation: "fadeOut", animationDuration: 0.5 })).toEqual({
      animationIn: "none",
      animationInDuration: 0,
      animationOut: "fadeOut",
      animationOutDuration: 0.5,
    });
  });

  it("keeps enter and exit independent when animationOut is set", () => {
    expect(
      resolveTextMotion({
        animation: "fadeIn",
        animationDuration: 0.5,
        animationOut: "fadeOut",
        animationOutDuration: 0.4,
      }),
    ).toEqual({
      animationIn: "fadeIn",
      animationInDuration: 0.5,
      animationOut: "fadeOut",
      animationOutDuration: 0.4,
    });
  });

  it("does not clear exit when enter is static", () => {
    expect(
      resolveTextMotion({
        animation: "none",
        animationDuration: 0,
        animationOut: "slideUp",
        animationOutDuration: 0.55,
      }),
    ).toEqual({
      animationIn: "none",
      animationInDuration: 0,
      animationOut: "slideUp",
      animationOutDuration: 0.55,
    });
  });
});

describe("textAnimationStyle", () => {
  it("legacy fadeOut stays full mid-clip and empty at the end", () => {
    expect(textAnimationStyle("fadeOut", 0.5, 2, 4).opacity).toBeCloseTo(1);
    expect(textAnimationStyle("fadeOut", 0.5, 4, 4).opacity).toBeCloseTo(0);
  });

  it("combines fade in and fade out on one clip", () => {
    const style = (t: number) =>
      textAnimationStyle("fadeIn", 0.5, t, 4, "fadeOut", 0.5);
    expect(style(0).opacity).toBeCloseTo(0);
    expect(style(2).opacity).toBeCloseTo(1);
    expect(style(4).opacity).toBeCloseTo(0);
  });
});

describe("textMotionSummary", () => {
  it("names both sides when they differ from static", () => {
    expect(
      textMotionSummary({
        animationIn: "fadeIn",
        animationInDuration: 0.5,
        animationOut: "fadeOut",
        animationOutDuration: 0.5,
      }),
    ).toBe("Fade in · Fade out");
  });
});
