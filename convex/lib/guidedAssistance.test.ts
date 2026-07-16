/**
 * Convex-facing Assistance invariants that do not need a live backend.
 */
import { describe, expect, it } from "vitest";
import {
  emptyAgentState,
  emptyBriefPayload,
  isGuidedVideoAssistanceEnabled,
  normalizeAssistedMode,
  normalizeVideoType,
} from "./guidedVideoTypes";
import {
  compileBriefPrompt,
  evaluateBrief,
  attachmentPresenceFromRoles,
} from "./hypermotionWorkflow";
import {
  formatAssistanceChatMessage,
  normalizeAssistantAnalysis,
  applyExplicitProceed,
  userExplicitlyProceeds,
} from "./assistedAnalysis";
import {
  buildAssistanceGenerationPlan,
  canReuseAssistanceMediaJob,
  parseAssistanceGenerationPlan,
} from "./assistanceGenerationPlan";

describe("Assistance defaults", () => {
  it("defaults Assistance feature flag to enabled", () => {
    const prev = process.env.GUIDED_VIDEO_ASSISTANCE_ENABLED;
    delete process.env.GUIDED_VIDEO_ASSISTANCE_ENABLED;
    expect(isGuidedVideoAssistanceEnabled()).toBe(true);
    process.env.GUIDED_VIDEO_ASSISTANCE_ENABLED = "0";
    expect(isGuidedVideoAssistanceEnabled()).toBe(false);
    if (prev === undefined) delete process.env.GUIDED_VIDEO_ASSISTANCE_ENABLED;
    else process.env.GUIDED_VIDEO_ASSISTANCE_ENABLED = prev;
  });

  it("normalizes modes and video types for injected context", () => {
    expect(normalizeAssistedMode("image")).toBe("image");
    expect(normalizeAssistedMode("weird")).toBe("video");
    expect(normalizeVideoType("hypermotion_ad")).toBe("hypermotion_ad");
    expect(normalizeVideoType("nope")).toBe("standard");
  });

  it("normalizes typed intent and proposal decisions", () => {
    const analysis = normalizeAssistantAnalysis({
      decision: "review_ready",
      message: "Ready",
      agentState: emptyAgentState({
        readyForReview: true,
        missingCritical: [],
        unresolvedDecisions: [],
        turnStrategy: "review",
      }),
      intent: {
        mode: "script",
        confidence: "high",
        reason: "The user asked for a voiceover script.",
      },
      proposedMode: {
        decision: "change",
        mode: "script",
        reason: "Current mode is video.",
      },
      proposedSetting: {
        decision: "ask",
        value: "Beach",
      },
      briefPatch: {
        subject: "  Sunscreen  ",
        production: { durationSeconds: "bad", scriptType: "voiceover" },
      },
    });
    expect(analysis.intent?.mode).toBe("script");
    expect(analysis.proposedMode?.decision).toBe("change");
    expect(analysis.proposedSetting?.value).toBe("Beach");
    expect(analysis.briefPatch).toEqual({
      subject: "Sunscreen",
      production: { scriptType: "voiceover" },
    });
    expect(analysis.agentState).toBeDefined();
    expect(
      analysis.agentState &&
        !("thinking" in (analysis.agentState as Record<string, unknown>)),
    ).toBe(true);
  });

  it("forces an ask when deterministic style context conflicts", () => {
    const analysis = normalizeAssistantAnalysis(
      {
        decision: "review_ready",
        message: "Ready",
        agentState: emptyAgentState({
          readyForReview: true,
          missingCritical: [],
          unresolvedDecisions: [],
          turnStrategy: "review",
        }),
      },
      {
        decision: "ask",
        value: "photoreal",
        conflict: "photoreal_requested_with_illustrated_context",
      },
    );
    expect(analysis.decision).toBe("ask");
    expect(analysis.proposedStyle?.conflict).toBe(
      "photoreal_requested_with_illustrated_context",
    );
    expect(analysis.questions?.[0]?.field).toBe("visualDirection");
  });

  it("keeps interviewing when the agent state still has critical gaps", () => {
    const analysis = normalizeAssistantAnalysis({
      decision: "review_ready",
      message: "Ready",
      agentState: emptyAgentState({
        missingCritical: ["Visual direction"],
        readyForReview: false,
        turnStrategy: "deepen",
      }),
    });
    expect(analysis.decision).toBe("ask");
    expect(analysis.agentState?.readyForReview).toBe(false);
    expect(analysis.agentState?.missingCritical).toContain("Visual direction");
  });

  it("formats follow-ups as chat copy, not form chrome", () => {
    expect(
      formatAssistanceChatMessage("Nice — sushi wraps deal.", [
        {
          id: "mood",
          kind: "text",
          prompt: "What mood should the flyer have?",
          required: true,
        },
      ]),
    ).toContain("What mood should the flyer have?");
    expect(userExplicitlyProceeds("just generate it")).toBe(true);
    expect(userExplicitlyProceeds("this is it")).toBe(true);
    expect(userExplicitlyProceeds("i am happy with this")).toBe(true);
    expect(userExplicitlyProceeds("it's 3 drag drolls for $100")).toBe(false);
    const forced = applyExplicitProceed(
      {
        decision: "ask",
        message: "Anything else?",
        agentState: emptyAgentState({
          readyForReview: false,
          missingCritical: ["Offer"],
          turnStrategy: "clarify",
        }),
        questions: [],
        assumptions: [],
        warnings: [],
        inferredFields: [],
      },
      "this is it",
    );
    expect(forced.decision).toBe("review_ready");
    expect(forced.agentState?.readyForReview).toBe(true);
    expect(forced.agentState?.missingCritical).toEqual([]);
  });

  it("requires creative direction before an image brief is complete", () => {
    const thin = emptyBriefPayload();
    thin.subject = "3 dragon rolls for $100 TTD";
    expect(
      evaluateBrief({
        mode: "image",
        payload: thin,
        attachments: attachmentPresenceFromRoles([]),
        offeredOptionalIds: [],
        skippedOptionalIds: [],
        lockedFields: [],
      }).complete,
    ).toBe(false);

    thin.visualDirection = "Bright modern food photography";
    thin.offer = "3 for $100 TTD";
    expect(
      evaluateBrief({
        mode: "image",
        payload: thin,
        attachments: attachmentPresenceFromRoles([]),
        offeredOptionalIds: [],
        skippedOptionalIds: [],
        lockedFields: [],
      }).complete,
    ).toBe(true);
  });
});

describe("approval gate (no credits before review)", () => {
  it("blocks hypermotion approval until brand decisions resolve", () => {
    const payload = emptyBriefPayload({ durationSeconds: 8 });
    payload.subject = "Cold brew cans";
    const policy = evaluateBrief({
      mode: "video",
      videoType: "hypermotion_ad",
      payload,
      attachments: attachmentPresenceFromRoles(["product"]),
      offeredOptionalIds: [],
      skippedOptionalIds: [],
      lockedFields: [],
    });
    expect(policy.complete).toBe(false);
    expect(
      policy.questions.some(
        (q) =>
          q.kind === "upload" ||
          q.id.includes("logo") ||
          q.prompt.toLowerCase().includes("logo"),
      ),
    ).toBe(true);
  });

  it("compiles a Seedance-ready prompt once complete", () => {
    const payload = emptyBriefPayload({
      durationSeconds: 8,
      aspectRatio: "9:16",
      resolution: "1280x720",
    });
    payload.subject = "Cold brew";
    payload.keyMessage = "Stay cool";
    payload.hook = "Ice crack macro";
    payload.brand.productFidelity = "conceptual";
    payload.brand.logo = "omit";
    payload.brand.ctaMode = "omit";
    payload.audio.voiceover = "none";
    payload.audio.sfx = "none";
    payload.audio.music = "none";
    const presence = attachmentPresenceFromRoles(["product"]);
    const policy = evaluateBrief({
      mode: "video",
      videoType: "hypermotion_ad",
      payload,
      attachments: presence,
      offeredOptionalIds: ["logo", "cta", "offer"],
      skippedOptionalIds: ["logo", "cta", "offer"],
      lockedFields: ["brand.productFidelity"],
    });
    expect(policy.complete).toBe(true);
    const compiled = compileBriefPrompt(
      "video",
      "hypermotion_ad",
      payload,
      presence,
    );
    expect(compiled.toLowerCase()).toContain("cold brew");
  });
});

describe("generation plan helpers", () => {
  it("parses and fingerprints plans", () => {
    const payload = emptyBriefPayload({
      aspectRatio: "1:1",
      resolution: "1024x1024",
      quality: "medium",
    });
    payload.subject = "A hero still";
    const plan = buildAssistanceGenerationPlan({
      mode: "image",
      payload,
      compiledPrompt: "A hero still",
      references: [],
      warnings: [],
      resolvedModel: "openai/gpt-image-2",
      stylePresetId: "preset_1",
    });
    expect(plan.fingerprint).toBeTruthy();
    expect(parseAssistanceGenerationPlan(JSON.stringify(plan))?.fingerprint).toBe(
      plan.fingerprint,
    );
  });

  it("reuses non-failed media jobs", () => {
    expect(canReuseAssistanceMediaJob("queued")).toBe(true);
    expect(canReuseAssistanceMediaJob("generating")).toBe(true);
    expect(canReuseAssistanceMediaJob("done")).toBe(true);
    expect(canReuseAssistanceMediaJob("failed")).toBe(false);
  });
});
