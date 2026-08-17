import { describe, expect, it } from "vitest";
import { toTwemojiCode, twemojiSrc } from "./twemoji";

describe("toTwemojiCode", () => {
  it("strips FE0F on simple emoji", () => {
    expect(toTwemojiCode("❤️")).toBe("2764");
    expect(toTwemojiCode("⭐")).toBe("2b50");
  });

  it("keeps supplementary-plane codepoints", () => {
    expect(toTwemojiCode("👍")).toBe("1f44d");
    expect(toTwemojiCode("😂")).toBe("1f602");
    expect(toTwemojiCode("🚀")).toBe("1f680");
  });

  it("maps to the local Twemoji svg path", () => {
    expect(twemojiSrc("🔥")).toBe("/emoji/twemoji/1f525.svg");
  });

  it("skips emojis we did not vendor", () => {
    expect(twemojiSrc("🏆")).toBe("");
  });
});
