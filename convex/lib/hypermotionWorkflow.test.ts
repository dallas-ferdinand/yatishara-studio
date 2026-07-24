import { describe, expect, it } from "vitest";
import {
  applyQuestionAnswer,
  attachmentPresenceFromRoles,
  compileBriefPrompt,
  detectExplicitStyleConflict,
  evaluateBrief,
  extractContactFromText,
  formatNanpContactNumbers,
  stripHttpUrlQueryParams,
  mergeBriefPayload,
  normalizeAssistanceAspectRatio,
  normalizeBriefPatch,
  resolveWorkflow,
  transitionAssistedMode,
} from "./hypermotionWorkflow";
import { emptyBriefPayload } from "./guidedVideoTypes";

describe("hypermotion workflow", () => {
  it("formats compact NANP contact numbers for on-screen copy", () => {
    expect(formatNanpContactNumbers("18683034621")).toBe(
      "+1 (868) 303-4621",
    );
    expect(
      formatNanpContactNumbers("Call or WhatsApp 8683034621 for size and price"),
    ).toBe("Call or WhatsApp +1 (868) 303-4621 for size and price");
    expect(formatNanpContactNumbers("+44 20 7946 0958")).toBe(
      "+44 20 7946 0958",
    );
  });

  it("extracts WhatsApp / NANP contacts from free text", () => {
    expect(extractContactFromText("whatsapp 18683034621 please")).toBe(
      "WhatsApp +1 (868) 303-4621",
    );
    expect(extractContactFromText("call 868-303-4621")).toBe(
      "+1 (868) 303-4621",
    );
    expect(extractContactFromText("no number here")).toBeUndefined();
  });

  it("does not treat CDN expires= query params as a phone number", () => {
    const poisoned =
      "Use my logo\n\nReferences:\n- @logo.png | thumb: https://cdn.example/logo.png?token=abc&expires=1784871973&width=640";
    expect(stripHttpUrlQueryParams(poisoned)).not.toContain("expires=");
    expect(extractContactFromText(poisoned)).toBeUndefined();
    expect(
      extractContactFromText(
        `${poisoned}\nWhatsApp 868-303-4621`,
      ),
    ).toBe("WhatsApp +1 (868) 303-4621");
  });

  it("resolves hypermotion vs standard video workflows", () => {
    expect(resolveWorkflow("video", "hypermotion_ad").slug).toBe(
      "video_hypermotion_ad",
    );
    expect(resolveWorkflow("video", "standard").slug).toBe("video_standard");
    expect(resolveWorkflow("image").slug).toBe("image");
    expect(resolveWorkflow("image").compiler).toBe("generic_image");
    expect(resolveWorkflow("script").compiler).toBe("generic_script");
    expect(resolveWorkflow("element").compiler).toBe("generic_element");
    expect(resolveWorkflow("video", "standard").compiler).toBe("generic_video");
    expect(resolveWorkflow("video", "hypermotion_ad").compiler).toBe("hypermotion_ad");
  });

  it("asks for subject when hypermotion brief is empty", () => {
    const result = evaluateBrief({
      mode: "video",
      videoType: "hypermotion_ad",
      payload: emptyBriefPayload({ durationSeconds: 8, aspectRatio: "9:16", resolution: "1280x720" }),
      attachments: attachmentPresenceFromRoles([]),
      offeredOptionalIds: [],
      skippedOptionalIds: [],
      lockedFields: [],
    });
    expect(result.complete).toBe(false);
    expect(result.questions.some((q) => q.id === "hypermotion_subject")).toBe(
      true,
    );
  });

  it("requires product upload for exact fidelity without media", () => {
    const payload = emptyBriefPayload({
      durationSeconds: 8,
      aspectRatio: "9:16",
      resolution: "1280x720",
    });
    payload.subject = "Bottle";
    payload.objective = "Launch";
    payload.brand.productFidelity = "exact";
    payload.brand.logo = "omit";
    payload.brand.ctaMode = "omit";

    const result = evaluateBrief({
      mode: "video",
      videoType: "hypermotion_ad",
      payload,
      attachments: attachmentPresenceFromRoles([]),
      offeredOptionalIds: ["logo", "cta", "offer"],
      skippedOptionalIds: ["logo", "cta", "offer"],
      lockedFields: ["brand.logo", "brand.ctaMode"],
    });
    expect(result.complete).toBe(false);
    expect(result.questions.some((q) => q.uploadRole === "product")).toBe(true);
  });

  it("offers logo/cta once with leave-out and does not re-ask skipped", () => {
    const payload = emptyBriefPayload({
      durationSeconds: 8,
      aspectRatio: "9:16",
      resolution: "1280x720",
    });
    payload.subject = "Bottle";
    payload.objective = "Awareness";
    payload.brand.productFidelity = "conceptual";

    const first = evaluateBrief({
      mode: "video",
      videoType: "hypermotion_ad",
      payload,
      attachments: attachmentPresenceFromRoles(["product"]),
      offeredOptionalIds: [],
      skippedOptionalIds: [],
      lockedFields: [],
    });
    expect(first.questions.some((q) => q.id === "logo")).toBe(true);

    const second = evaluateBrief({
      mode: "video",
      videoType: "hypermotion_ad",
      payload: {
        ...payload,
        brand: { ...payload.brand, logo: "omit", ctaMode: "omit" },
      },
      attachments: attachmentPresenceFromRoles(["product"]),
      offeredOptionalIds: ["logo", "cta"],
      skippedOptionalIds: ["logo", "cta"],
      lockedFields: ["brand.logo", "brand.ctaMode"],
    });
    expect(second.questions.some((q) => q.id === "logo")).toBe(false);
    expect(second.complete).toBe(true);
  });

  it("caps questions at 3 per turn", () => {
    const result = evaluateBrief({
      mode: "video",
      videoType: "hypermotion_ad",
      payload: emptyBriefPayload(),
      attachments: attachmentPresenceFromRoles([]),
      offeredOptionalIds: [],
      skippedOptionalIds: [],
      lockedFields: [],
    });
    expect(result.questions.length).toBeLessThanOrEqual(3);
  });

  it("merges patches without overwriting locked fields", () => {
    const current = emptyBriefPayload();
    current.subject = "User Product";
    const { payload } = mergeBriefPayload({
      current,
      patch: { subject: "AI Guess", hook: "Snap zoom" },
      lockedFields: ["subject"],
    });
    expect(payload.subject).toBe("User Product");
    expect(payload.hook).toBe("Snap zoom");
  });

  it("allows forceUnlock on the current user turn", () => {
    const current = emptyBriefPayload();
    current.subject = "Old";
    const { payload } = mergeBriefPayload({
      current,
      patch: { subject: "New" },
      lockedFields: ["subject"],
      forceUnlock: ["subject"],
    });
    expect(payload.subject).toBe("New");
  });

  it("applies leave-out answers for logo and cta", () => {
    const base = emptyBriefPayload();
    const logo = applyQuestionAnswer({
      payload: base,
      questionId: "logo",
      leaveOut: true,
    });
    expect(logo.payload.brand.logo).toBe("omit");
    expect(logo.skippedOptionalIds).toContain("logo");

    const cta = applyQuestionAnswer({
      payload: logo.payload,
      questionId: "cta",
      value: "omit",
    });
    expect(cta.payload.brand.ctaMode).toBe("omit");
  });

  it("routes validated answers by offered field, not generated question id", () => {
    const result = applyQuestionAnswer({
      payload: emptyBriefPayload(),
      questionId: "model_generated_42",
      value: "Launch the summer line",
      question: {
        id: "model_generated_42",
        kind: "text",
        field: "objective",
        prompt: "What is the goal?",
        required: true,
      },
    });
    expect(result.accepted).toBe(true);
    expect(result.payload.objective).toBe("Launch the summer line");
    expect(result.lockedFields).toEqual(["objective"]);
  });

  it("supports validated multi answers and rejects unknown options", () => {
    const question = {
      id: "platforms",
      kind: "multi" as const,
      field: "platform",
      prompt: "Where will this run?",
      options: [
        { value: "TikTok", label: "TikTok" },
        { value: "Reels", label: "Reels" },
      ],
    };
    const valid = applyQuestionAnswer({
      payload: emptyBriefPayload(),
      questionId: question.id,
      values: ["TikTok", "Reels"],
      question,
    });
    expect(valid.accepted).toBe(true);
    expect(valid.payload.platform).toBe("TikTok, Reels");

    const invalid = applyQuestionAnswer({
      payload: emptyBriefPayload(),
      questionId: question.id,
      values: ["YouTube"],
      question,
    });
    expect(invalid.accepted).toBe(false);
    expect(invalid.payload.platform).toBeUndefined();
  });

  it("normalizes untrusted model patches field by field", () => {
    const patch = normalizeBriefPatch({
      subject: "  Bottle  ",
      rogue: "drop me",
      brand: { logo: "bogus", ctaMode: "omit", extra: true },
      production: { durationSeconds: "forever", aspectRatio: " 9:16 " },
      timedBeats: [
        { startSec: 0, endSec: 2, action: " Hook " },
        { startSec: 3, endSec: 1, action: "invalid" },
      ],
    });
    expect(patch).toEqual({
      subject: "Bottle",
      brand: { ctaMode: "omit" },
      production: { aspectRatio: "9:16" },
      timedBeats: [{ startSec: 0, endSec: 2, action: "Hook", camera: undefined }],
    });
  });

  it("canonicalizes supported aspect-ratio intent and drops invalid values", () => {
    expect(normalizeAssistanceAspectRatio(" vertical ")).toBe("9:16");
    expect(normalizeAssistanceAspectRatio("square")).toBe("1:1");
    expect(normalizeAssistanceAspectRatio("4 : 5")).toBe("4:5");
    expect(normalizeAssistanceAspectRatio("cinematic-ish")).toBeUndefined();
    expect(
      normalizeBriefPatch({ production: { aspectRatio: "cinematic-ish" } }),
    ).toBeUndefined();
  });

  it("detects explicit style conflicts in both directions", () => {
    expect(
      detectExplicitStyleConflict({
        userRequest: "Make this photorealistic",
        styleContext: ["Illustrated cel-shaded style board"],
      }).conflict,
    ).toBe("photoreal_requested_with_illustrated_context");
    expect(
      detectExplicitStyleConflict({
        userRequest: "Make it a cartoon illustration",
        currentVisualDirection: "Photographic live-action campaign",
      }).conflict,
    ).toBe("illustrated_requested_with_photoreal_context");
    expect(
      detectExplicitStyleConflict({
        userRequest: "Avoid photoreal output",
        styleContext: ["Cartoon style"],
      }).conflict,
    ).toBe("none");
  });

  it("resets incompatible state when mode or video type changes", () => {
    const payload = emptyBriefPayload();
    payload.timedBeats = [{ startSec: 0, endSec: 2, action: "Reveal" }];
    payload.brand.logo = "include";
    payload.production.scriptType = "commercial";
    const script = transitionAssistedMode({
      currentMode: "video",
      nextMode: "script",
      currentVideoType: "hypermotion_ad",
      payload,
      lockedFields: ["subject", "brand.logo", "production.scriptType"],
    });
    expect(script.videoType).toBeUndefined();
    expect(script.payload.timedBeats).toBeUndefined();
    expect(script.payload.brand.logo).toBe("undecided");
    expect(script.payload.production.scriptType).toBe("commercial");
    expect(script.lockedFields).toEqual(["subject", "production.scriptType"]);
  });

  it("clears image resolution tiers when switching into video mode", () => {
    const payload = emptyBriefPayload();
    payload.production.resolution = "2K";
    const next = transitionAssistedMode({
      currentMode: "image",
      nextMode: "video",
      nextVideoType: "hypermotion_ad",
      payload,
    });
    expect(next.payload.production.resolution).toBe("1280x720");
    expect(next.resetFields).toContain("production.resolution");
  });

  it("clears hypermotion beats but keeps brand when switching to standard video", () => {
    const payload = emptyBriefPayload();
    payload.timedBeats = [{ startSec: 0, endSec: 2, action: "Hook" }];
    payload.brand.logo = "include";
    payload.brand.ctaMode = "custom";
    payload.brand.ctaText = "Shop";
    payload.brand.contactValue = "+1 (868) 303-4621";
    const next = transitionAssistedMode({
      currentMode: "video",
      nextMode: "video",
      currentVideoType: "hypermotion_ad",
      nextVideoType: "standard",
      payload,
      lockedFields: ["videoType", "brand.logo", "production.durationSeconds"],
    });
    expect(next.videoType).toBe("standard");
    expect(next.payload.timedBeats).toBeUndefined();
    expect(next.payload.brand.logo).toBe("include");
    expect(next.payload.brand.ctaMode).toBe("custom");
    expect(next.payload.brand.ctaText).toBe("Shop");
    expect(next.payload.brand.contactValue).toBe("+1 (868) 303-4621");
    expect(next.lockedFields).toEqual(
      expect.arrayContaining([
        "videoType",
        "brand.logo",
        "production.durationSeconds",
      ]),
    );
  });

  it("compiles hypermotion prompt with audio include/none lines", () => {
    const payload = emptyBriefPayload({
      durationSeconds: 8,
      aspectRatio: "9:16",
      resolution: "1280x720",
    });
    payload.subject = "Graza bottle";
    payload.objective = "Launch";
    payload.brand.productFidelity = "exact";
    payload.brand.logo = "omit";
    payload.brand.ctaMode = "custom";
    payload.brand.ctaText = "Shop now";
    payload.audio = {
      voiceover: "none",
      sfx: "include",
      music: "include",
      musicMood: "fast electronic",
    };
    const prompt = compileBriefPrompt(
      "video",
      "hypermotion_ad",
      payload,
      attachmentPresenceFromRoles(["product"]),
    );
    expect(prompt).toContain("Hypermotion ad");
    expect(prompt).toContain("Voiceover: none");
    expect(prompt).toContain("SFX: include");
    expect(prompt).toContain("Music: include");
    expect(prompt).toContain('On-screen CTA: "Shop now"');
    expect(prompt).toMatch(/Timed beats/);
    expect(prompt).toMatch(/8s hypermotion/);
    expect(prompt).toMatch(/one-flow speed ramp/i);
    expect(prompt).toContain("elliptical action/graphic match");
    expect(prompt).toContain("ramp-to-cut");
    expect(prompt).toContain("stable hero/CTA lock");
    expect(prompt).toContain("vary velocity");
    expect(prompt).toContain("720p");
  });

  it("scales default hypermotion beats with duration", () => {
    const short = emptyBriefPayload({
      durationSeconds: 5,
      aspectRatio: "9:16",
      resolution: "1280x720",
    });
    short.subject = "Bottle";
    short.brand.productFidelity = "conceptual";
    short.brand.logo = "omit";
    short.brand.ctaMode = "omit";
    short.audio = { voiceover: "none", sfx: "include", music: "include" };
    const shortPrompt = compileBriefPrompt(
      "video",
      "hypermotion_ad",
      short,
      attachmentPresenceFromRoles(["product"]),
    );
    expect(shortPrompt).toMatch(/5s hypermotion · 3 beats/);
    expect(shortPrompt.match(/^\d+\. /gm)?.length).toBe(3);

    const long = emptyBriefPayload({
      durationSeconds: 15,
      aspectRatio: "9:16",
      resolution: "1280x720",
    });
    long.subject = "Bottle";
    long.brand.productFidelity = "conceptual";
    long.brand.logo = "omit";
    long.brand.ctaMode = "omit";
    long.audio = { voiceover: "none", sfx: "include", music: "include" };
    const longPrompt = compileBriefPrompt(
      "video",
      "hypermotion_ad",
      long,
      attachmentPresenceFromRoles(["product"]),
    );
    expect(longPrompt).toMatch(/15s hypermotion · 7 beats/);
    expect(longPrompt.match(/^\d+\. /gm)?.length).toBe(7);
  });

  it("requires the user to confirm a promotional layout format", () => {
    const payload = emptyBriefPayload({});
    delete payload.production.aspectRatio;
    payload.subject = "Surprise sushi plate promotional flyer";
    payload.offer = "Normally 250, only 100 on July 18";
    payload.visualDirection = "Modern white layout with fresh greens";
    const result = evaluateBrief({
      mode: "image",
      payload,
      attachments: attachmentPresenceFromRoles(["product"]),
      offeredOptionalIds: [],
      skippedOptionalIds: [],
      lockedFields: [],
    });
    expect(result.complete).toBe(false);
    expect(result.questions.find((question) => question.id === "promotional_format")).toMatchObject({
      field: "production.aspectRatio",
      required: true,
    });
  });

  it("does not re-ask format when aspect ratio is already set", () => {
    const payload = emptyBriefPayload({ aspectRatio: "9:16" });
    payload.subject = "Surprise sushi plate promotional flyer";
    payload.offer = "Normally 250, only 100 on July 18";
    payload.visualDirection = "Modern white layout with fresh greens";
    const result = evaluateBrief({
      mode: "image",
      payload,
      attachments: attachmentPresenceFromRoles(["product"]),
      offeredOptionalIds: [],
      skippedOptionalIds: [],
      lockedFields: ["production.aspectRatio"],
    });
    expect(result.questions.some((question) => question.id === "promotional_format")).toBe(
      false,
    );
  });

  it("compiles a flyer as designed promotional artwork with exact copy", () => {
    const payload = emptyBriefPayload({ aspectRatio: "9:16" });
    payload.subject = "Surprise Sushi Plate flyer";
    payload.objective = "Promote a one-day sushi special";
    payload.offer = "Normally 250, only 100 on July 18";
    payload.visualDirection = "Modern, vibrant white and fresh green design";
    const prompt = compileBriefPrompt(
      "image",
      undefined,
      payload,
      attachmentPresenceFromRoles(["product"]),
    );
    expect(prompt).toContain("promotional flyer layout, not a plain hero product photo");
    expect(prompt).toContain("Normally 250, only 100 on July 18");
    expect(prompt).toContain("Render all supplied headline, offer, date, price");
  });
});
