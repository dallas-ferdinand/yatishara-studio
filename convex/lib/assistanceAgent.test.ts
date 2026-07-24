import { describe, expect, it } from "vitest";
import {
  applyAssistanceBootstrap,
  salvageReviewAfterReviseExhaustion,
  salvageReviewWhenBriefComplete,
  synthesizeForcedTerminalAsk,
  tryReemitReadyReview,
  userPromptHasMaterialDeltas,
} from "./assistanceAgent";
import type { AssistanceAgentSession } from "./assistanceTools";
import { emptyAgentState, emptyBriefPayload } from "./guidedVideoTypes";
import type { Id } from "../_generated/dataModel";

function makeSession(
  overrides?: Partial<AssistanceAgentSession>,
): AssistanceAgentSession {
  return {
    ownerId: "users_1" as Id<"users">,
    turnId: "turns_1" as Id<"assistanceTurns">,
    briefId: "briefs_1" as Id<"guidedBriefs">,
    threadId: "threads_1" as Id<"generationThreads">,
    folderId: "folders_1" as Id<"folders">,
    mode: "video",
    videoType: "hypermotion_ad",
    draft: emptyBriefPayload({ aspectRatio: "9:16", durationSeconds: 8 }),
    lockedFields: [],
    inferredFields: [],
    agentState: emptyAgentState({ goal: "Make a video" }),
    assumptions: [],
    warnings: [],
    attachmentSummaries: [],
    mediaInspectionNotes: [],
    offeredOptionalIds: [],
    skippedOptionalIds: [],
    prepareReviewFailedThisTurn: false,
    recoveryMode: false,
    criticCallsThisTurn: 0,
    references: [],
    conversationContext: [],
    toolTrace: [],
    pendingApprovals: [],
    expiresUnix: Math.floor(Date.now() / 1000) + 3600,
    runQuery: async () => {
      throw new Error("unexpected query");
    },
    runMutation: async () => {
      throw new Error("unexpected mutation");
    },
    inspectMedia: async () => ({
      description: "",
      usage: { inputTokens: 0, outputTokens: 0 },
    }),
    critiqueCreativeReadiness: async () => ({
      decision: "ready",
      rationale: "ok",
      criticalGaps: [],
      revisionInstructions: [],
      assumptions: [],
    }),
    ...overrides,
  };
}

describe("assistance bootstrap + forced terminal", () => {
  it("prefills contact CTA from WhatsApp in the user message", () => {
    const session = makeSession();
    applyAssistanceBootstrap(session, {
      userPrompt: "they can whatsapp 18683034621 with zen music",
    });
    expect(session.draft.brand.ctaMode).toBe("contact");
    expect(session.draft.brand.contactValue).toContain("+1 (868) 303-4621");
    expect(session.lockedFields).toEqual(
      expect.arrayContaining(["brand.ctaMode", "brand.contactValue"]),
    );
    expect(session.offeredOptionalIds).toContain("cta");
  });

  it("defaults hypermotion productFidelity without asking", () => {
    const session = makeSession({
      references: [
        {
          assetId: "assets_flyer" as Id<"assets">,
          role: "reference",
          mediaKind: "image",
          label: "assisted-image-1.png",
          sortOrder: 0,
        },
      ],
      conversationContext: ["User: animate this flyer"],
      mediaInspectionNotes: [
        {
          description: "Promotional flyer with ONLY $21 offer",
        },
      ],
    });
    applyAssistanceBootstrap(session, { userPrompt: "make the ad" });
    expect(session.draft.brand.productFidelity).toBe("conceptual");
    expect(session.lockedFields).toContain("brand.productFidelity");
  });

  it("forced terminal never leaks critic polish or prioritize fluff", () => {
    const session = makeSession({
      draft: {
        ...emptyBriefPayload({ aspectRatio: "9:16", durationSeconds: 8 }),
        subject: "Sushi ad",
        objective: "Drive WhatsApp bookings",
        brand: {
          productFidelity: "conceptual",
          logo: "omit",
          ctaMode: "contact",
          contactValue: "WhatsApp +1 (868) 303-4621",
        },
      },
      lockedFields: ["brand.ctaMode", "brand.contactValue"],
      offeredOptionalIds: ["cta", "logo"],
      lastReadinessCritique: {
        decision: "revise",
        rationale: "Price looks invented",
        criticalGaps: ["Remove the hallucinated '$21' price constraint."],
        revisionInstructions: ["Remove the hallucinated '$21' price constraint."],
        suggestedQuestion:
          "Add a call to action? Custom text, contact number, or leave it out.",
        assumptions: [],
      },
    });
    const forced = synthesizeForcedTerminalAsk(session);
    expect(forced.message).not.toMatch(/prioritize/i);
    expect(forced.message).not.toMatch(/\$21/);
    expect(forced.message).not.toMatch(/hallucin/i);
    expect(forced.message).not.toMatch(/still missing/i);
    expect(forced.questions[0]?.prompt).not.toMatch(/call to action/i);
  });

  it("salvages a review when step budget dies on critic revise polish", () => {
    const session = makeSession({
      draft: {
        ...emptyBriefPayload({ aspectRatio: "9:16", durationSeconds: 8 }),
        subject: "Sushi ad",
        objective: "Drive WhatsApp bookings",
        keyMessage: "Order sushi wraps today",
        visualDirection: "Fast flyer hypermotion",
        brand: {
          productFidelity: "conceptual",
          logo: "omit",
          ctaMode: "contact",
          contactValue: "WhatsApp +1 (868) 303-4621",
          ctaText: "Order now",
        },
        audio: {
          music: "include",
          sfx: "include",
          voiceover: "include",
          voiceoverCopy: "Order sushi wraps now",
          musicMood: "high energy",
        },
        production: {
          ...emptyBriefPayload({ aspectRatio: "9:16", durationSeconds: 8 })
            .production,
          aspectRatio: "9:16",
          durationSeconds: 8,
          referenceIntent: "auto",
          skipPromptEnhancement: true,
        },
      },
      lockedFields: [
        "brand.ctaMode",
        "brand.contactValue",
        "brand.productFidelity",
        "subject",
        "objective",
        "audio.voiceover",
        "audio.music",
        "audio.sfx",
      ],
      offeredOptionalIds: ["cta", "logo"],
      lastReadinessCritique: {
        decision: "revise",
        rationale: "Need sharper flyer animation beats",
        criticalGaps: [],
        revisionInstructions: [
          "Rewrite the scene description to animate the flyer",
        ],
        assumptions: [],
      },
      toolTrace: [
        {
          name: "prepare_review",
          input: {
            message: "your sushi hypermotion is ready",
            finalPrompt:
              "0.0-2.0s: flyer slam-in with parallax. 2.0-4.0s: text layers fly. 4.0-6.0s: product pop. 6.0-8.0s: CTA end card.",
          },
          output: {
            ok: false,
            error: "review_candidate_needs_revision",
          },
        },
      ],
    });
    const salvaged = salvageReviewAfterReviseExhaustion(session);
    expect(salvaged?.kind).toBe("review");
    expect(salvaged?.finalPrompt).toMatch(/flyer slam-in/i);
    expect(session.terminal?.kind).toBe("review");
  });

  it("salvages a review when the brief is complete instead of asking ready", () => {
    const session = makeSession({
      draft: {
        ...emptyBriefPayload({ aspectRatio: "9:16", durationSeconds: 8 }),
        subject: "Sushi flyer",
        objective: "Drive WhatsApp bookings",
        keyMessage: "Order sushi wraps today",
        visualDirection: "Clean flyer layout",
        brand: {
          productFidelity: "conceptual",
          logo: "omit",
          ctaMode: "contact",
          contactValue: "WhatsApp +1 (868) 303-4621",
          ctaText: "Order now",
        },
        production: {
          ...emptyBriefPayload({ aspectRatio: "1:1" }).production,
          aspectRatio: "1:1",
          referenceIntent: "auto",
          skipPromptEnhancement: true,
        },
      },
      mode: "image",
      videoType: undefined,
      lockedFields: [
        "brand.ctaMode",
        "brand.contactValue",
        "subject",
        "objective",
      ],
      offeredOptionalIds: ["cta", "logo"],
      lastReadinessCritique: {
        decision: "ready",
        rationale: "Brief is complete",
        criticalGaps: [],
        revisionInstructions: [],
        assumptions: [],
      },
      toolTrace: [
        {
          name: "prepare_review",
          input: {
            message: "your flyer is ready",
            finalPrompt: "Clean sushi flyer with offer hierarchy and CTA.",
          },
          output: {
            ok: false,
            error: "review_not_ready",
          },
        },
      ],
    });
    const salvaged = salvageReviewWhenBriefComplete(session);
    expect(salvaged?.kind).toBe("review");
    expect(salvaged?.finalPrompt).toMatch(/sushi flyer/i);
    expect(session.terminal?.kind).toBe("review");
  });

  it("forced terminal no longer asks ready when nothing is missing", () => {
    const session = makeSession({
      draft: {
        ...emptyBriefPayload({ aspectRatio: "1:1" }),
        subject: "Sushi flyer",
        objective: "Drive WhatsApp bookings",
        brand: {
          productFidelity: "conceptual",
          logo: "omit",
          ctaMode: "contact",
          contactValue: "WhatsApp +1 (868) 303-4621",
        },
      },
      mode: "image",
      videoType: undefined,
      lockedFields: ["brand.ctaMode", "brand.contactValue", "subject"],
      offeredOptionalIds: ["cta", "logo"],
    });
    const forced = synthesizeForcedTerminalAsk(session);
    expect(forced.message).not.toMatch(/say go/i);
    expect(forced.questions[0]?.id).not.toBe("forced_resume_review");
  });

  it("re-emits review when user proceeds without material deltas", () => {
    const reemit = tryReemitReadyReview({
      userPrompt: "looks good, go ahead",
      priorStatus: "review_ready",
      priorCompiledPrompt: "A".repeat(100),
      priorReadyForReview: true,
    });
    expect(reemit?.finalPrompt.length).toBeGreaterThanOrEqual(80);
    expect(reemit?.message).toMatch(/generate/i);
  });

  it("does not re-emit review when proceed includes revise deltas", () => {
    expect(
      userPromptHasMaterialDeltas(
        "Yes this is perfect, just make the mini video look animated",
      ),
    ).toBe(true);
    expect(
      tryReemitReadyReview({
        userPrompt:
          "Yes this is perfect, just make the mini video look animated",
        priorStatus: "review_ready",
        priorCompiledPrompt: "A".repeat(100),
        priorReadyForReview: true,
      }),
    ).toBeNull();
  });
});
