import { describe, expect, it } from "vitest";
import {
  assessFinalPromptForReview,
  seedancePromptCraftGuidance,
} from "./seedancePromptCraft";

describe("seedancePromptCraft", () => {
  it("rejects thin or vibe-only video prompts", () => {
    expect(
      assessFinalPromptForReview({
        mode: "video",
        finalPrompt: "cinematic epic beautiful product video",
      }).ok,
    ).toBe(false);

    const noCraft = assessFinalPromptForReview({
      mode: "video",
      finalPrompt:
        "A thoughtful woman in a quiet kitchen, premium mood, soft atmosphere, luxury brand feeling, elegant stillness, high-end commercial tone throughout the entire clip with no clear plan for what happens on screen.",
    });
    expect(noCraft.ok).toBe(false);
    expect(noCraft.error).toMatch(/final_prompt_missing_/);
  });

  it("accepts a shot-shaped Seedance brief", () => {
    const prompt = [
      "8s clip. Subject: ceramic honey jar on a worn maple counter, soft morning window light.",
      "Shot 1: medium shot, jar and steam rising slowly from a nearby mug; locked-off camera.",
      "Shot 2: slow dolly forward toward the jar as a hand gently places a wooden spoon beside it.",
      "Natural diegetic kitchen ambience. Subtitle-free, no logo, no morphing.",
    ].join(" ");
    const result = assessFinalPromptForReview({ mode: "video", finalPrompt: prompt });
    expect(result).toMatchObject({ ok: true });
  });

  it("rejects I2V prompts that redescribe the start frame at length", () => {
    const prompt = [
      "The woman wearing a red dress with brown hair and detailed facial features stands in the room.",
      "She is dressed in elegant wardrobe with a stylish outfit that looks like a fashion editorial.",
      "Camera slowly dollies in while she gently turns her head and raises her hand.",
      "Preserve composition. No subtitles.",
    ].join(" ");
    const result = assessFinalPromptForReview({
      mode: "video",
      finalPrompt: prompt,
      hasStartFrame: true,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("final_prompt_redescribes_start_frame");
  });

  it("keeps image thinness floor", () => {
    expect(
      assessFinalPromptForReview({ mode: "image", finalPrompt: "hero sushi" }).ok,
    ).toBe(false);
  });

  it("exposes I2V-aware craft guidance", () => {
    const withFrame = seedancePromptCraftGuidance({ hasStartFrame: true });
    expect(withFrame).toMatch(/do NOT redescribe/i);
    expect(withFrame).toMatch(/60–100 words/);
    const t2v = seedancePromptCraftGuidance({ hasStartFrame: false });
    expect(t2v).toMatch(/No start frame/i);
  });

  it("teaches Hypermotion speed-ramp and match-cut planning", () => {
    const guidance = seedancePromptCraftGuidance({
      hasStartFrame: true,
      videoType: "hypermotion_ad",
    });
    expect(guidance).toMatch(/full timed multi-beat edit/i);
    expect(guidance).toMatch(/One-flow speed ramp/);
    expect(guidance).toMatch(/Ramp-to-cut/);
    expect(guidance).toMatch(/Elliptical action\/graphic match/);
    expect(guidance).toMatch(/Impact ramp/);
    expect(guidance).toMatch(/Detail hold/);
    expect(guidance).toMatch(/1\.5–2s hero\/CTA lock/);
    expect(guidance).toMatch(/does not force a single continuous shot/i);
  });
});
