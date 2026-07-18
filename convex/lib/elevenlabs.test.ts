import { describe, expect, it } from "vitest";
import {
  isAccountVoiceOwnerId,
  libraryVoicesAvailable,
  mapCategoryToUseCase,
  mapVoiceSort,
  normalizeVoicePageSize,
  parseElevenLabsError,
  sliceVoicePage,
  VOICE_UNAVAILABLE_USER_MESSAGE,
  voiceUsableOnCurrentPlan,
} from "./elevenlabs";

describe("mapVoiceSort", () => {
  it("maps UI sort labels to ElevenLabs shared-voices sort", () => {
    expect(mapVoiceSort("trending")).toBe("trending");
    expect(mapVoiceSort("latest")).toBe("created_date");
    expect(mapVoiceSort("most_users")).toBe("cloned_by_count");
    expect(mapVoiceSort("character_usage")).toBe("usage_character_count_1y");
    expect(mapVoiceSort(undefined)).toBe("trending");
  });
});

describe("mapCategoryToUseCase", () => {
  it("maps UI category chips to ElevenLabs use_cases", () => {
    expect(mapCategoryToUseCase("Narration")).toBe("narrative_story");
    expect(mapCategoryToUseCase("conversational")).toBe("conversational");
    expect(mapCategoryToUseCase("characters")).toBe("characters_animation");
    expect(mapCategoryToUseCase("social media")).toBe("social_media");
    expect(mapCategoryToUseCase("educational")).toBe("informative_educational");
    expect(mapCategoryToUseCase(undefined)).toBeUndefined();
  });
});

describe("isAccountVoiceOwnerId", () => {
  it("treats empty / account / elevenlabs as local account voices", () => {
    expect(isAccountVoiceOwnerId("")).toBe(true);
    expect(isAccountVoiceOwnerId("account")).toBe(true);
    expect(isAccountVoiceOwnerId("elevenlabs")).toBe(true);
    expect(isAccountVoiceOwnerId("abc123owner")).toBe(false);
  });
});

describe("libraryVoicesAvailable", () => {
  it("defaults to false unless env enables library voices", () => {
    const prev = process.env.ELEVENLABS_LIBRARY_VOICES_ENABLED;
    delete process.env.ELEVENLABS_LIBRARY_VOICES_ENABLED;
    expect(libraryVoicesAvailable()).toBe(false);
    process.env.ELEVENLABS_LIBRARY_VOICES_ENABLED = "true";
    expect(libraryVoicesAvailable()).toBe(true);
    if (prev === undefined) delete process.env.ELEVENLABS_LIBRARY_VOICES_ENABLED;
    else process.env.ELEVENLABS_LIBRARY_VOICES_ENABLED = prev;
  });
});

describe("voiceUsableOnCurrentPlan", () => {
  it("allows only premade voices when library access is off", () => {
    const prev = process.env.ELEVENLABS_LIBRARY_VOICES_ENABLED;
    delete process.env.ELEVENLABS_LIBRARY_VOICES_ENABLED;
    expect(voiceUsableOnCurrentPlan("premade")).toBe(true);
    expect(voiceUsableOnCurrentPlan("professional")).toBe(false);
    expect(voiceUsableOnCurrentPlan(undefined)).toBe(false);
    process.env.ELEVENLABS_LIBRARY_VOICES_ENABLED = "true";
    expect(voiceUsableOnCurrentPlan("professional")).toBe(true);
    if (prev === undefined) delete process.env.ELEVENLABS_LIBRARY_VOICES_ENABLED;
    else process.env.ELEVENLABS_LIBRARY_VOICES_ENABLED = prev;
  });
});

describe("sliceVoicePage", () => {
  it("paginates and clamps pageSize", () => {
    const items = Array.from({ length: 21 }, (_, i) => i);
    expect(normalizeVoicePageSize(undefined)).toBe(30);
    expect(normalizeVoicePageSize(3)).toBe(3);
    expect(normalizeVoicePageSize(0)).toBe(1);
    expect(normalizeVoicePageSize(500)).toBe(100);

    const page0 = sliceVoicePage(items, 0, 3);
    expect(page0.voices).toEqual([0, 1, 2]);
    expect(page0.hasMore).toBe(true);
    expect(page0.totalCount).toBe(21);

    const pageLast = sliceVoicePage(items, 6, 3);
    expect(pageLast.voices).toEqual([18, 19, 20]);
    expect(pageLast.hasMore).toBe(false);

    const oversized = sliceVoicePage(items, 0, 24);
    expect(oversized.voices).toHaveLength(21);
    expect(oversized.hasMore).toBe(false);
  });
});

describe("parseElevenLabsError", () => {
  it("maps library paid-plan errors to vague product copy", () => {
    const detail = JSON.stringify({
      detail: {
        status: "payment_required",
        message: "Free users cannot use library voices via the API.",
        code: "paid_plan_required",
      },
    });
    expect(parseElevenLabsError(402, detail)).toBe(VOICE_UNAVAILABLE_USER_MESSAGE);
  });

  it("surfaces validation messages", () => {
    const detail = JSON.stringify({
      detail: [{ loc: ["body", "new_name"], msg: "Field required", type: "missing" }],
    });
    expect(parseElevenLabsError(422, detail)).toMatch(/Field required/i);
  });
});
