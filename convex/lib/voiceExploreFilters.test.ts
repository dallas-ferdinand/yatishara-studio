import { describe, expect, it } from "vitest";
import {
  hasActiveVoiceAttributeFilters,
  voiceMatchesExploreFilters,
} from "./voiceExploreFilters";

describe("voiceMatchesExploreFilters", () => {
  const base = {
    name: "Matilda",
    description: "Knowledgeable",
    language: "English",
    accent: "american",
    gender: "female",
    age: "middle_aged",
    useCase: "narrative_story",
    category: "premade",
  };

  it("matches language codes against English labels", () => {
    expect(voiceMatchesExploreFilters(base, { language: "en" })).toBe(true);
    expect(voiceMatchesExploreFilters(base, { language: "es" })).toBe(false);
  });

  it("matches gender / accent / age", () => {
    expect(voiceMatchesExploreFilters(base, { gender: "female" })).toBe(true);
    expect(voiceMatchesExploreFilters(base, { gender: "male" })).toBe(false);
    expect(voiceMatchesExploreFilters(base, { accent: "american" })).toBe(true);
    expect(voiceMatchesExploreFilters(base, { age: "middle_aged" })).toBe(true);
  });

  it("does not treat female as matching male", () => {
    expect(
      voiceMatchesExploreFilters(
        { ...base, gender: "female" },
        { gender: "male" },
      ),
    ).toBe(false);
  });

  it("matches category chips to use_case", () => {
    expect(voiceMatchesExploreFilters(base, { category: "narration" })).toBe(true);
    expect(voiceMatchesExploreFilters(base, { category: "conversational" })).toBe(
      false,
    );
  });

  it("requires labels when a filter is set", () => {
    expect(
      voiceMatchesExploreFilters(
        { name: "Bare", category: "premade" },
        { gender: "female" },
      ),
    ).toBe(false);
  });

  it("filters by search", () => {
    expect(voiceMatchesExploreFilters(base, { search: "mat" })).toBe(true);
    expect(voiceMatchesExploreFilters(base, { search: "zzz" })).toBe(false);
  });
});

describe("hasActiveVoiceAttributeFilters", () => {
  it("detects attribute filters only", () => {
    expect(hasActiveVoiceAttributeFilters({ search: "x" })).toBe(false);
    expect(hasActiveVoiceAttributeFilters({ gender: "male" })).toBe(true);
  });
});
