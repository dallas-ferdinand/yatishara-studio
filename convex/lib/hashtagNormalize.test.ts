import { describe, expect, it } from "vitest";
import {
  creatorConsistencyScore,
  extractHashtagsFromCaption,
  extractKeywordsFromCaption,
  extractMentionsFromCaption,
  normalizeHashtag,
  normalizeHashtagList,
  normalizeKeyword,
  normalizeKeywordList,
} from "./hashtagNormalize";

describe("normalizeHashtag", () => {
  it("strips hash and lowercases", () => {
    expect(normalizeHashtag("#Cinema")).toBe("cinema");
    expect(normalizeHashtag("  Foo_Bar  ")).toBe("foo_bar");
  });

  it("rejects invalid tags", () => {
    expect(normalizeHashtag("a")).toBeNull();
    expect(normalizeHashtag("bad-tag")).toBeNull();
    expect(normalizeHashtag("has space")).toBeNull();
  });

  it("dedupes and caps lists", () => {
    expect(normalizeHashtagList(["#Cinema", "cinema", "#Noir", "!!!"])).toEqual([
      "cinema",
      "noir",
    ]);
  });
});

describe("normalizeKeyword", () => {
  it("normalizes keywords", () => {
    expect(normalizeKeyword(" Neo-Noir ")).toBe("neo-noir");
    expect(normalizeKeyword("x")).toBeNull();
    expect(normalizeKeyword("the")).toBeNull();
  });

  it("dedupes keyword lists", () => {
    expect(normalizeKeywordList(["Film", "film", "look"])).toEqual(["film", "look"]);
  });
});

describe("caption extraction", () => {
  it("pulls hashtags, mentions, and keywords from description", () => {
    const caption = "Moody night with @dallas and #Cinema vibes in Tokyo streets";
    expect(extractHashtagsFromCaption(caption)).toEqual(["cinema"]);
    expect(extractMentionsFromCaption(caption)).toEqual(["dallas"]);
    expect(extractKeywordsFromCaption(caption)).toEqual([
      "moody",
      "night",
      "vibes",
      "tokyo",
      "streets",
    ]);
  });
});

describe("creatorConsistencyScore", () => {
  it("grows with repeated posts", () => {
    const now = Date.UTC(2026, 6, 23);
    const one = creatorConsistencyScore(1, now, now);
    const eight = creatorConsistencyScore(8, now, now);
    expect(eight).toBeGreaterThan(one);
  });
});
