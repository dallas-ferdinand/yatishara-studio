import { describe, expect, it } from "vitest";
import { composerAtQuery, filterMentionCandidates } from "./composerMentions";

describe("composerMentions", () => {
  it("reads a trailing @query", () => {
    expect(composerAtQuery("hold @product-sh")).toEqual({
      query: "product-sh",
      from: 5,
    });
    expect(composerAtQuery("@")).toEqual({ query: "", from: 0 });
    expect(composerAtQuery("email dallas@host")).toBeNull();
  });

  it("filters candidates by tag", () => {
    const items = [
      { id: "1", tag: "product-shot", kind: "element" as const, label: "product-shot" },
      { id: "2", tag: "baseball-shot.jpg", kind: "asset" as const, label: "baseball-shot.jpg" },
    ];
    expect(filterMentionCandidates(items, "base").map((item) => item.tag)).toEqual([
      "baseball-shot.jpg",
    ]);
  });
});
