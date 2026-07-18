import { describe, expect, it, vi } from "vitest";
import {
  countTimedBeatRanges,
  createAssistanceTools,
  type AssistanceAgentSession,
} from "./assistanceTools";
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
    mode: "image",
    draft: emptyBriefPayload({ aspectRatio: "16:9" }),
    lockedFields: [],
    inferredFields: [],
    agentState: emptyAgentState({ goal: "Make a flyer" }),
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
    conversationContext: ["User: make a flyer"],
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
      description: "inspected",
      usage: { inputTokens: 0, outputTokens: 0 },
    }),
    critiqueCreativeReadiness: async () => ({
      decision: "ready",
      rationale: "Test critic accepts the candidate.",
      criticalGaps: [],
      revisionInstructions: [],
      assumptions: [],
    }),
    ...overrides,
  };
}

function readyFor(intendedOutcome: string) {
  return {
    intendedOutcome,
    successCriteria: [
      "The main idea is immediately clear to the intended audience",
      "The output contains enough concrete direction to be production-ready",
    ],
    criticalUnknowns: [],
    safeAssumptions: ["Studio may choose supporting composition details"],
    rationale:
      "The material facts are resolved and the remaining choices are safe creative decisions.",
  };
}

describe("Assistance tools", () => {
  it("persists production settings through tools, not prose", async () => {
    const session = makeSession();
    const tools = createAssistanceTools(session);
    const result = await tools.set_production_settings.execute!(
      { aspectRatio: "9:16", resolution: "2K" },
      { toolCallId: "t1", messages: [] } as never,
    );
    expect(result).toMatchObject({ ok: true });
    expect(session.draft.production.aspectRatio).toBe("9:16");
    expect(session.lockedFields).toContain("production.aspectRatio");
  });

  it("locks exact brand and audio requirements from the user", async () => {
    const session = makeSession();
    const tools = createAssistanceTools(session);
    await tools.set_brand_requirements.execute!(
      {
        source: "user_explicit",
        offerText: "ONLY $100 — JULY 18",
        ctaMode: "contact",
        contactValue: "WhatsApp 1-868-555-0100",
      },
      { toolCallId: "brand_1", messages: [] } as never,
    );
    await tools.set_audio_plan.execute!(
      {
        source: "user_explicit",
        voiceover: "none",
        sfx: "none",
        music: "include",
        musicMood: "Bright tropical pop",
      },
      { toolCallId: "audio_1", messages: [] } as never,
    );
    expect(session.draft.brand.offerText).toBe("ONLY $100 — JULY 18");
    expect(session.draft.brand.contactValue).toBe(
      "WhatsApp +1 (868) 555-0100",
    );
    expect(session.draft.audio.voiceover).toBe("none");
    expect(session.draft.audio.sfx).toBe("none");
    expect(session.draft.audio.music).toBe("include");
    expect(session.draft.audio.musicMood).toBe("Bright tropical pop");
    expect(session.lockedFields).toEqual(
      expect.arrayContaining([
        "brand.offerText",
        "brand.contactValue",
        "audio.musicMood",
      ]),
    );
  });

  it("rejects unsupported aspect ratios", async () => {
    const session = makeSession();
    const tools = createAssistanceTools(session);
    const result = await tools.set_production_settings.execute!(
      { aspectRatio: "cinematic-ish" },
      { toolCallId: "t1", messages: [] } as never,
    );
    expect(result).toMatchObject({ ok: false, error: "unsupported_aspect_ratio" });
  });

  it("requires a detailed final prompt for review", async () => {
    const session = makeSession({
      draft: {
        ...emptyBriefPayload({ aspectRatio: "9:16" }),
        subject: "Surprise Sushi Plate flyer",
        objective: "Promote the July 18 sale",
        keyMessage: "Normally 250, only 100 on July 18",
        visualDirection: "Modern white and fresh green flyer",
      },
    });
    const tools = createAssistanceTools(session);
    const thin = await tools.prepare_review.execute!(
      {
        message: "Ready",
        finalPrompt: "hero sushi",
        readiness: readyFor("Promote the sushi sale with a clear social flyer"),
      },
      { toolCallId: "t1", messages: [] } as never,
    );
    expect(thin).toMatchObject({ ok: false, error: "final_prompt_too_thin" });

    const richPrompt = [
      "Create a finished 9:16 promotional flyer for Oh Sushi.",
      "Exact product fidelity to the attached sushi plate photo.",
      "Headline Surprise Sushi Plate, date July 18, price from 250 to 100.",
      "White and fresh green modern layout with clear hierarchy and readable promo copy.",
    ].join(" ");
    const ready = await tools.prepare_review.execute!(
      {
        message: "Ready to generate",
        finalPrompt: richPrompt,
        readiness: readyFor("Drive orders for the dated sushi promotion"),
      },
      { toolCallId: "t2", messages: [] } as never,
    );
    expect(ready).toMatchObject({ ok: true, terminal: "review" });
    expect(session.terminal?.kind).toBe("review");
  });

  it("requires Seedance craft signals in video final prompts", async () => {
    const session = makeSession({
      mode: "video",
      videoType: "standard",
      draft: {
        ...emptyBriefPayload({ aspectRatio: "9:16", durationSeconds: 8 }),
        subject: "honey jar on a maple counter",
        objective: "Quiet morning product moment",
        keyMessage: "Slow, readable motion",
        visualDirection: "Soft window light, natural kitchen",
      },
    });
    const tools = createAssistanceTools(session);
    const vibeOnly = await tools.prepare_review.execute!(
      {
        message: "ready",
        finalPrompt:
          "Make a cinematic epic beautiful premium honey jar video with stunning luxury vibes and professional aesthetic energy throughout.",
        readiness: readyFor("Create a clear eight-second honey product moment"),
      },
      { toolCallId: "v1", messages: [] } as never,
    );
    expect(vibeOnly).toMatchObject({ ok: false });

    const crafted = [
      "8s clip. Ceramic honey jar on worn maple, soft window key.",
      "Shot 1: medium shot, steam rising from a mug beside the jar; locked-off camera.",
      "Shot 2: slow dolly forward as a hand gently places a wooden spoon beside the jar.",
      "Diegetic kitchen ambience. Subtitle-free, no logo.",
    ].join(" ");
    const ready = await tools.prepare_review.execute!(
      {
        message: "locked in",
        finalPrompt: crafted,
        readiness: readyFor("Create a clear eight-second honey product moment"),
      },
      { toolCallId: "v2", messages: [] } as never,
    );
    expect(ready).toMatchObject({ ok: true, terminal: "review" });
  });

  it("preserves the creative director prompt and merges exact timed audio", async () => {
    const session = makeSession({
      mode: "video",
      videoType: "standard",
      draft: {
        ...emptyBriefPayload({ aspectRatio: "9:16", durationSeconds: 8 }),
        subject: "Oh So Sushi three-roll promotion",
        objective: "Drive WhatsApp reservations",
        visualDirection: "Fast macro food ad ending on the flyer",
        audio: {
          voiceover: "include",
          voiceoverCopy:
            "[warm female voice] Three rolls on sale at Oh So Sushi this July 21st. WhatsApp now to reserve.",
          music: "include",
          musicMood: "upbeat zen Japanese music",
          sfx: "include",
          sfxNotes: "cinematic whooshes and crisp transition hits",
        },
      },
    });
    const tools = createAssistanceTools(session);
    const creativePrompt = [
      "8s hypermotion food ad in a bright bamboo setting.",
      "0–2s: extreme macro salmon glistens as the camera snap-pushes through steam.",
      "2–5s: three kinetic sushi texture cuts, each with one orbit or whip-pan.",
      "5–8s: settle into the supplied promotional flyer as a readable final lock-up.",
      "Preserve appetizing product continuity and premium studio lighting.",
    ].join(" ");

    const result = await tools.prepare_review.execute!(
      {
        message: "your sushi ad is ready 🍣",
        finalPrompt: creativePrompt,
        readiness: readyFor("Drive WhatsApp reservations with an eight-second sushi ad"),
      },
      { toolCallId: "video_audio_merge", messages: [] } as never,
    );

    expect(result).toMatchObject({ ok: true, terminal: "review" });
    expect(session.terminal).toMatchObject({ kind: "review" });
    if (session.terminal?.kind !== "review") {
      throw new Error("Expected review terminal");
    }
    const finalPrompt = session.terminal.finalPrompt;
    expect(finalPrompt).toContain(creativePrompt);
    expect(finalPrompt).toContain("Voiceover performance: warm female voice");
    expect(finalPrompt).toContain(
      "Exact spoken voiceover script (15 words; speak verbatim)",
    );
    expect(finalPrompt).toContain(
      "Three rolls on sale at Oh So Sushi this July 21st. WhatsApp now to reserve.",
    );
    expect(finalPrompt).toContain("upbeat zen Japanese music");
    expect(finalPrompt).toContain("cinematic whooshes and crisp transition hits");
    expect(finalPrompt).toContain("deliver naturally within 8s");
  });

  it("preserves uploaded flyer text instead of instructing Seedance to redraw it", async () => {
    const session = makeSession({
      mode: "video",
      videoType: "standard",
      references: [
        {
          assetId: "assets_flyer" as Id<"assets">,
          role: "reference",
          mediaKind: "image",
          label: "Oh So Sushi flyer",
          sortOrder: 0,
        },
      ],
      draft: {
        ...emptyBriefPayload({ aspectRatio: "9:16", durationSeconds: 8 }),
        subject: "Animate the uploaded sushi flyer",
        objective: "Drive WhatsApp reservations",
        brand: {
          productFidelity: "exact",
          logo: "omit",
          ctaMode: "contact",
          ctaText: "WhatsApp to reserve",
          contactValue: "+1 (868) 303-4621",
          offerText: "3 rolls sale",
        },
        audio: {
          voiceover: "include",
          voiceoverCopy:
            "[warm female voice] Oh So Sushi sale July 21st! WhatsApp us to reserve your seat.",
          music: "include",
          musicMood: "upbeat zen",
          sfx: "include",
          sfxNotes: "gentle whooshes",
        },
      },
    });
    const tools = createAssistanceTools(session);
    const result = await tools.prepare_review.execute!(
      {
        message: "your animated flyer is ready",
        finalPrompt:
          "8s flyer animation. 0-4s: subtle highlights glide across the sushi while bamboo leaves drift; slow camera push-in. 4-8s: motion settles on the original layout; locked camera, preserve every existing text pixel without morphing.",
        readiness: readyFor("Animate the uploaded flyer while preserving its design"),
      },
      { toolCallId: "flyer_text_fidelity", messages: [] } as never,
    );

    expect(result).toMatchObject({ ok: true, terminal: "review" });
    if (session.terminal?.kind !== "review") {
      throw new Error("Expected review terminal");
    }
    const finalPrompt = session.terminal.finalPrompt;
    expect(finalPrompt).toContain(
      "UPLOADED ARTWORK REFERENCE FIDELITY — treat the supplied flyer/poster as finished artwork",
    );
    expect(finalPrompt).toContain(
      "preserve the contact text already baked into the uploaded flyer and do not redraw it",
    );
    expect(finalPrompt).toContain(
      "Spoken voiceover may express the CTA without reading a long phone number",
    );
    expect(finalPrompt).not.toContain("Exact on-screen contact copy");
    expect(finalPrompt).not.toContain("Exact CTA text");
    expect(finalPrompt).not.toContain("Exact offer text");
    expect(finalPrompt).not.toContain("start-frame pixels");
  });

  it("blocks video review when requested voiceover is missing or too long", async () => {
    const session = makeSession({
      mode: "video",
      videoType: "standard",
      draft: {
        ...emptyBriefPayload({ aspectRatio: "9:16", durationSeconds: 8 }),
        subject: "A vertical restaurant promotion",
        audio: {
          voiceover: "include",
          music: "include",
          sfx: "include",
        },
      },
    });
    const tools = createAssistanceTools(session);
    const reviewInput = {
      message: "ready",
      finalPrompt:
        "8s clip. Shot 1: macro food reveal with a slow push-in. Shot 2: camera settles on a readable restaurant end card under clean studio light.",
      readiness: readyFor("Create a useful eight-second restaurant promotion"),
    };

    const missing = await tools.prepare_review.execute!(
      reviewInput,
      { toolCallId: "voiceover_missing", messages: [] } as never,
    );
    expect(missing).toMatchObject({
      ok: false,
      error: "voiceover_script_missing",
    });

    session.draft.audio.voiceoverCopy =
      "This deliberately overcrowded voiceover contains far too many spoken words for a short eight second advertisement and leaves absolutely no room for natural pacing breathing emphasis or a clean memorable ending call to action.";
    const tooLong = await tools.prepare_review.execute!(
      reviewInput,
      { toolCallId: "voiceover_long", messages: [] } as never,
    );
    expect(tooLong).toMatchObject({
      ok: false,
      error: "voiceover_script_too_long",
    });
  });

  it("rejects single-shot or untimed prompts for Hypermotion, then accepts timed beats", async () => {
    const session = makeSession({
      mode: "video",
      videoType: "hypermotion_ad",
      draft: {
        ...emptyBriefPayload({
          aspectRatio: "9:16",
          durationSeconds: 8,
          resolution: "1280x720",
        }),
        subject: "Three sushi rolls",
        objective: "Drive reservations for the sushi promotion",
        visualDirection: "Fresh bamboo food-ad styling",
        brand: {
          productFidelity: "conceptual",
          logo: "omit",
          ctaMode: "omit",
        },
      },
    });
    const tools = createAssistanceTools(session);
    const readiness = readyFor("Create a fast eight-second sushi promotion");

    const singleShot = await tools.prepare_review.execute!(
      {
        message: "ready",
        finalPrompt:
          "8s vertical food ad. Single continuous shot of three sushi rolls as the camera slowly pushes through fresh bamboo leaves under crisp studio lighting.",
        readiness,
      },
      { toolCallId: "hyper_single", messages: [] } as never,
    );
    expect(singleShot).toMatchObject({
      ok: false,
      error: "video_structure_conflict",
    });

    const onlyTwoBeats = await tools.prepare_review.execute!(
      {
        message: "ready",
        finalPrompt:
          "8s vertical food ad. 0-4s: macro sushi reveal with a snap push-in. 4-8s: final platter lock-up with a smooth orbit. Fresh bamboo and crisp studio light.",
        readiness,
      },
      { toolCallId: "hyper_two", messages: [] } as never,
    );
    expect(onlyTwoBeats).toMatchObject({
      ok: false,
      error: "video_timed_beats_missing",
    });

    const timedPrompt = [
      "8s vertical Hypermotion sushi ad.",
      "0-1.5s: salmon texture hook, snap push-in.",
      "1.5-3s: avocado roll reveal, orbit left.",
      "3-4.5s: crisp topping detail, whip-pan right.",
      "4.5-6s: all three rolls align, tracking glide.",
      "6-8s: appetizing platter lock-up, camera settles.",
      "Fresh bamboo environment with crisp studio lighting and product continuity.",
    ].join(" ");
    const ready = await tools.prepare_review.execute!(
      {
        message: "ready",
        finalPrompt: timedPrompt,
        readiness,
      },
      { toolCallId: "hyper_timed", messages: [] } as never,
    );
    expect(ready).toMatchObject({ ok: true, terminal: "review" });
    if (session.terminal?.kind !== "review") {
      throw new Error("Expected review terminal");
    }
    expect(session.terminal.finalPrompt).toContain(timedPrompt);
    expect(session.terminal.finalPrompt).toContain(
      "Output resolution: 720p quality; aspect ratio controls orientation",
    );
    expect(session.terminal.finalPrompt).not.toContain(
      "Output resolution: 1280x720",
    );
  });

  it.each(["image", "video", "script", "element"] as const)(
    "blocks premature %s review when the adaptive assessment finds a material unknown",
    async (mode) => {
      const session = makeSession({
        mode,
        videoType: mode === "video" ? "standard" : undefined,
        draft: {
          ...emptyBriefPayload({
            aspectRatio: "9:16",
            durationSeconds: mode === "video" ? 8 : undefined,
          }),
          subject: "Chuck's Chicken honey wings promotion",
          objective: "Promote the Friday special",
          keyMessage: "Honey wings special next Friday",
          visualDirection: "Modern red and white",
        },
      });
      const tools = createAssistanceTools(session);
      const result = await tools.prepare_review.execute!(
        {
          message: "ready",
          finalPrompt:
            "Create a complete polished production with a clear hierarchy, concrete subject treatment, audience-focused message, intentional composition, and professional finishing details.",
          readiness: {
            intendedOutcome: `Create a useful ${mode} that accomplishes the user's goal`,
            successCriteria: [
              "The audience understands the main message",
              "The central factual claim is accurate and actionable",
            ],
            criticalUnknowns: [
              "The central offer is described only as a special",
            ],
            safeAssumptions: ["Studio can choose supporting visual details"],
            rationale:
              "The creative direction is usable, but the central claim is still materially ambiguous.",
          },
        },
        { toolCallId: `blocked_${mode}`, messages: [] } as never,
      );

      expect(result).toMatchObject({
        ok: false,
        error: "outcome_not_ready",
      });
      expect((result as { blockers: string[] }).blockers).toEqual(
        expect.arrayContaining([
          "The central offer is described only as a special",
        ]),
      );
      expect(session.terminal).toBeUndefined();
    },
  );

  it("records safe creative assumptions when review is genuinely ready", async () => {
    const session = makeSession({
      draft: {
        ...emptyBriefPayload({ aspectRatio: "9:16" }),
        subject: "Chuck's Chicken honey wings flyer",
        objective: "Promote the Friday honey wings offer",
        keyMessage: "Honey wings are $8 on Friday, July 24, from 8am to 6pm",
        visualDirection: "Modern red and white food promotion",
      },
    });
    const tools = createAssistanceTools(session);
    const result = await tools.prepare_review.execute!(
      {
        message: "your honey wings flyer is ready 🔥",
        finalPrompt: [
          "Create a polished 9:16 promotional flyer for Chuck's Chicken.",
          "Use the exact headline Honey Wings Friday Special and exact offer $8 on Friday, July 24, 8am–6pm.",
          "Build a modern red-and-white hierarchy around an appetizing honey wings hero image.",
          "Keep all promotional copy highly legible with a clean bottom information band.",
        ].join(" "),
        readiness: {
          ...readyFor("Drive visits for Chuck's Chicken's dated honey wings offer"),
          safeAssumptions: [
            "Use a bold condensed headline",
            "Create the food hero without requiring a reference upload",
          ],
        },
      },
      { toolCallId: "flyer_ready", messages: [] } as never,
    );

    expect(result).toMatchObject({ ok: true, terminal: "review" });
    expect(session.assumptions).toEqual(
      expect.arrayContaining([
        "Use a bold condensed headline",
        "Create the food hero without requiring a reference upload",
      ]),
    );
  });

  it("cannot bypass an independent critic that still needs the user", async () => {
    const session = makeSession({
      agentState: emptyAgentState({
        goal: "Make a flyer",
        readyForReview: true,
        missingCritical: [],
      }),
      draft: {
        ...emptyBriefPayload({ aspectRatio: "9:16" }),
        subject: "Chuck's Chicken flyer",
        objective: "Promote honey wings",
        keyMessage: "Honey wings special next Friday",
        visualDirection: "Modern red and white",
      },
      critiqueCreativeReadiness: async () => ({
        decision: "ask",
        rationale: "The special is still undefined.",
        criticalGaps: ["What is the actual honey wings deal?"],
        revisionInstructions: [],
        suggestedQuestion: "what's the honey wings deal exactly?",
        assumptions: [],
      }),
    });
    const tools = createAssistanceTools(session);
    const result = await tools.prepare_review.execute!(
      {
        message: "ready",
        finalPrompt:
          "Create a finished promotional flyer with clear hierarchy, red and white branding, and readable offer copy for Chuck's Chicken honey wings.",
        readiness: readyFor("Promote Chuck's Chicken honey wings"),
      },
      { toolCallId: "critic_ask", messages: [] } as never,
    );

    expect(result).toMatchObject({
      ok: false,
      error: "brief_needs_user_input",
      blockers: ["What is the actual honey wings deal?"],
    });
    expect(session.terminal).toBeUndefined();
    expect(session.agentState.missingCritical).toEqual([
      "What is the actual honey wings deal?",
    ]);
  });

  it("asks the agent to revise instead of interrogating for optional polish", async () => {
    const session = makeSession({
      critiqueCreativeReadiness: async () => ({
        decision: "revise",
        rationale: "Prompt is too thin on hierarchy and exact on-image copy.",
        criticalGaps: [],
        revisionInstructions: [
          "Specify exact headline and offer text placement",
        ],
        assumptions: [],
      }),
    });
    session.draft = {
      ...emptyBriefPayload({ aspectRatio: "9:16" }),
      subject: "Chuck's Chicken flyer",
      objective: "Promote honey wings",
      keyMessage: "Honey wings $8 Friday July 24 8am-6pm",
      visualDirection: "Modern red and white",
    };
    const tools = createAssistanceTools(session);
    const result = await tools.prepare_review.execute!(
      {
        message: "ready",
        finalPrompt:
          "Create a finished promotional flyer with clear hierarchy, red and white branding, and readable offer copy for Chuck's Chicken honey wings.",
        readiness: readyFor("Promote Chuck's Chicken honey wings"),
      },
      { toolCallId: "critic_revise", messages: [] } as never,
    );

    expect(result).toMatchObject({
      ok: false,
      error: "review_candidate_needs_revision",
    });
    expect(session.terminal).toBeUndefined();
  });

  it("accepts a rewritten candidate after one critic revise pass", async () => {
    let criticCalls = 0;
    const session = makeSession({
      critiqueCreativeReadiness: async () => {
        criticCalls += 1;
        return {
          decision: "revise" as const,
          rationale: "Need sharper hierarchy.",
          criticalGaps: [],
          revisionInstructions: [
            "Specify exact headline and offer text placement",
          ],
          assumptions: [],
        };
      },
    });
    session.draft = {
      ...emptyBriefPayload({ aspectRatio: "9:16" }),
      subject: "Chuck's Chicken flyer",
      objective: "Promote honey wings",
      keyMessage: "Honey wings $8 Friday July 24 8am-6pm",
      visualDirection: "Modern red and white",
    };
    const tools = createAssistanceTools(session);
    const first = await tools.prepare_review.execute!(
      {
        message: "ready",
        finalPrompt:
          "Create a finished promotional flyer with clear hierarchy, red and white branding, and readable offer copy for Chuck's Chicken honey wings.",
        readiness: readyFor("Promote Chuck's Chicken honey wings"),
      },
      { toolCallId: "critic_revise_1", messages: [] } as never,
    );
    expect(first).toMatchObject({
      ok: false,
      error: "review_candidate_needs_revision",
    });

    const second = await tools.prepare_review.execute!(
      {
        message: "your honey wings flyer is ready",
        finalPrompt: [
          "Create a polished 9:16 promotional flyer for Chuck's Chicken.",
          "Use the exact headline Honey Wings Friday Special and exact offer $8 on Friday, July 24, 8am–6pm.",
          "Build a modern red-and-white hierarchy around an appetizing honey wings hero image.",
          "Keep all promotional copy highly legible with a clean bottom information band.",
        ].join(" "),
        readiness: readyFor("Promote Chuck's Chicken honey wings"),
      },
      { toolCallId: "critic_revise_2", messages: [] } as never,
    );

    expect(second).toMatchObject({ ok: true, terminal: "review" });
    expect(criticCalls).toBe(1);
    expect(session.terminal?.kind).toBe("review");
  });

  it("keeps critic ask sticky when the budget is already spent", async () => {
    const session = makeSession({
      critiqueCreativeReadiness: async () => ({
        decision: "ask",
        rationale: "Deal still missing.",
        criticalGaps: ["What is the actual honey wings deal?"],
        revisionInstructions: [],
        suggestedQuestion: "what's the honey wings deal exactly?",
        assumptions: [],
      }),
    });
    session.draft = {
      ...emptyBriefPayload({ aspectRatio: "9:16" }),
      subject: "Chuck's Chicken flyer",
      objective: "Promote honey wings",
      keyMessage: "Honey wings special next Friday",
      visualDirection: "Modern red and white",
    };
    const tools = createAssistanceTools(session);
    await tools.prepare_review.execute!(
      {
        message: "ready",
        finalPrompt:
          "Create a finished promotional flyer with clear hierarchy, red and white branding, and readable offer copy for Chuck's Chicken honey wings.",
        readiness: readyFor("Promote Chuck's Chicken honey wings"),
      },
      { toolCallId: "ask_1", messages: [] } as never,
    );
    const second = await tools.prepare_review.execute!(
      {
        message: "ready again",
        finalPrompt:
          "Create a finished promotional flyer with clear hierarchy, red and white branding, and a stronger hero for Chuck's Chicken honey wings.",
        readiness: readyFor("Promote Chuck's Chicken honey wings"),
      },
      { toolCallId: "ask_2", messages: [] } as never,
    );
    expect(second).toMatchObject({
      ok: false,
      error: "brief_needs_user_input",
      blockers: ["What is the actual honey wings deal?"],
    });
    expect(session.terminal).toBeUndefined();
  });

  it("fails closed when the independent critic throws", async () => {
    const session = makeSession({
      draft: {
        ...emptyBriefPayload({ aspectRatio: "9:16" }),
        subject: "Chuck's Chicken flyer",
        objective: "Promote honey wings",
        keyMessage: "Honey wings $8 Friday July 24",
        visualDirection: "Modern red and white",
      },
      critiqueCreativeReadiness: async () => {
        throw new Error("gateway down");
      },
    });
    const tools = createAssistanceTools(session);
    const result = await tools.prepare_review.execute!(
      {
        message: "ready",
        finalPrompt:
          "Create a finished promotional flyer with clear hierarchy, red and white branding, and readable offer copy for Chuck's Chicken honey wings.",
        readiness: readyFor("Promote Chuck's Chicken honey wings"),
      },
      { toolCallId: "critic_fail", messages: [] } as never,
    );

    expect(result).toMatchObject({
      ok: false,
      error: "readiness_critic_failed",
    });
    expect(session.terminal).toBeUndefined();
  });

  it("does not ask for aspect ratio again once set", async () => {
    const session = makeSession({
      lockedFields: ["production.aspectRatio"],
    });
    session.draft.production.aspectRatio = "9:16";
    const tools = createAssistanceTools(session);
    const result = await tools.ask_user.execute!(
      {
        message: "Need one more detail",
        questions: [
          {
            id: "promotional_format",
            kind: "choice",
            field: "production.aspectRatio",
            prompt: "What format?",
            required: true,
            options: [{ value: "9:16", label: "9:16" }],
          },
        ],
      },
      { toolCallId: "t1", messages: [] } as never,
    );
    expect(result).toMatchObject({ ok: false, error: "no_unanswered_question" });
    expect(session.terminal).toBeUndefined();
  });

  it("can ask about audio defaults that the user has not chosen", async () => {
    const session = makeSession({ mode: "video" });
    const tools = createAssistanceTools(session);
    const result = await tools.ask_user.execute!(
      {
        message: "What should it sound like?",
        questions: [
          {
            id: "ad_audio",
            kind: "choice",
            field: "audio.voiceover",
            prompt: "Voiceover, music only, or silent?",
            required: true,
            options: [
              { value: "include", label: "Voiceover" },
              { value: "none", label: "No voiceover" },
            ],
          },
        ],
      },
      { toolCallId: "audio_question", messages: [] } as never,
    );

    expect(result).toMatchObject({ ok: true, terminal: "ask" });
    expect(session.terminal).toMatchObject({ kind: "ask" });
  });

  it("blocks immediate review from the image-to-video entry point", async () => {
    const session = makeSession({
      mode: "video",
      entryPoint: "image_to_video",
    });
    const tools = createAssistanceTools(session);
    const result = await tools.prepare_review.execute!(
      {
        message: "ready",
        finalPrompt:
          "Create an eight-second vertical product video with clear shot beats, warm lighting, controlled camera movement, and a readable promotional end card.",
        readiness: readyFor("Turn the attached promotion into a useful short video ad"),
      },
      { toolCallId: "conversion_review", messages: [] } as never,
    );

    expect(result).toMatchObject({
      ok: false,
      error: "image_to_video_discovery_required",
    });
    expect(session.terminal).toBeUndefined();
  });

  it("normalizes legacy start-frame requests into video references", async () => {
    const session = makeSession({
      mode: "video",
      runQuery: async () =>
        ({
          name: "uploaded-flyer.png",
          kind: "image",
        }) as never,
    });
    const tools = createAssistanceTools(session);
    const result = await tools.set_references.execute!(
      {
        references: [
          {
            assetId: "assets_flyer",
            role: "start_frame",
            label: "Uploaded flyer",
          },
        ],
      },
      { toolCallId: "legacy_start_frame", messages: [] } as never,
    );

    expect(result).toMatchObject({ ok: true });
    expect(session.references).toHaveLength(1);
    expect(session.references[0]?.role).toBe("reference");
  });

  it("keeps multiple visual references and assigns distinct roles", async () => {
    const session = makeSession({
      runQuery: async (_name, args) =>
        ({
          name:
            String((args as { assetId?: string }).assetId).endsWith("1")
              ? "previous-flyer.png"
              : "new-platter.png",
          kind: "image",
        }) as never,
    });
    const tools = createAssistanceTools(session);
    const result = await tools.set_references.execute!(
      {
        references: [
          {
            assetId: "assets_1",
            role: "style",
            label: "Previous flyer layout",
          },
          {
            assetId: "assets_2",
            role: "product",
            label: "Replacement sushi platter",
          },
        ],
      },
      { toolCallId: "refs", messages: [] } as never,
    );
    expect(result).toMatchObject({ ok: true });
    expect(session.references).toHaveLength(2);
    expect(session.references.map((reference) => reference.role)).toEqual([
      "style",
      "product",
    ]);
  });

  it("stages destructive work for approval without executing it", async () => {
    const session = makeSession({
      runQuery: async () => ({ ok: true, label: "Old flyer" }) as never,
    });
    const tools = createAssistanceTools(session);
    const result = await tools.request_approval.execute!(
      {
        action: "trash",
        title: "Trash old flyer",
        summary: "Move the outdated flyer asset to trash.",
        kind: "asset",
        id: "assets_old",
      },
      { toolCallId: "approval_1", messages: [] } as never,
    );
    expect(result).toMatchObject({ ok: true, terminal: "approval" });
    expect(session.pendingApprovals).toEqual([
      expect.objectContaining({
        toolCallId: "approval_1",
        action: "trash",
      }),
    ]);
    expect(session.terminal?.kind).toBe("approval");
  });

  it("executes safe writes through the idempotent mutation wrapper", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const session = makeSession({
      runMutation: async (name, args) => {
        calls.push({ name, args });
        return {
          idempotent: false,
          resultJson: JSON.stringify({ ok: true, folderId: "folders_new" }),
        } as never;
      },
    });
    const tools = createAssistanceTools(session);
    const result = await tools.create_folder.execute!(
      { name: "Campaigns" },
      { toolCallId: "safe_1", messages: [] } as never,
    );
    expect(result).toMatchObject({ ok: true, folderId: "folders_new" });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      name: "assistanceWorkspace:performSafeWorkspaceToolCall",
      args: {
        toolCallId: "safe_1",
        operation: "create_folder",
      },
    });
  });

  it("sends owned media to the multimodal inspector", async () => {
    const inspected: unknown[] = [];
    const session = makeSession({
      runQuery: async () =>
        ({
          name: "flyer.png",
          kind: "image",
          mimeType: "image/png",
          url: "https://signed.example/flyer.png",
        }) as never,
      inspectMedia: async (reference) => {
        inspected.push(reference);
        return {
          description: "Green and white flyer with a sushi platter.",
          usage: { inputTokens: 120, outputTokens: 40 },
        };
      },
    });
    const tools = createAssistanceTools(session);
    const result = await tools.inspect_media.execute!(
      { assetId: "assets_flyer" },
      { toolCallId: "inspect_1", messages: [] } as never,
    );
    expect(result).toMatchObject({
      ok: true,
      description: "Green and white flyer with a sushi platter.",
    });
    expect(inspected).toHaveLength(1);
    expect(session.mediaInspectionNotes).toEqual([
      {
        assetId: "assets_flyer",
        name: "flyer.png",
        kind: "image",
        description: "Green and white flyer with a sushi platter.",
      },
    ]);
  });

  it("treats generic-named flyer uploads as artwork when conversation/inspection says flyer", async () => {
    const session = makeSession({
      mode: "video",
      videoType: "standard",
      conversationContext: [
        "User: I want to generate a video with this flyer",
      ],
      references: [
        {
          assetId: "assets_flyer" as Id<"assets">,
          role: "reference",
          mediaKind: "image",
          label: "assisted-image-1.png",
          sortOrder: 0,
        },
      ],
      mediaInspectionNotes: [
        {
          assetId: "assets_flyer" as Id<"assets">,
          name: "assisted-image-1.png",
          kind: "image",
          description:
            "Promotional flyer for Oh So Sushi. Visible price ONLY $21, date 21st July, WhatsApp 18683034621.",
        },
      ],
      draft: {
        ...emptyBriefPayload({ aspectRatio: "9:16", durationSeconds: 8 }),
        subject: "Animate the uploaded sushi flyer",
        objective: "Drive WhatsApp reservations",
        brand: {
          productFidelity: "exact",
          logo: "omit",
          ctaMode: "contact",
          ctaText: "WhatsApp to reserve",
          contactValue: "+1 (868) 303-4621",
          offerText: "ONLY $21",
        },
        audio: {
          voiceover: "include",
          voiceoverCopy:
            "[warm female voice] Oh So Sushi sale July 21st! WhatsApp us to reserve your seat.",
          music: "include",
          musicMood: "upbeat zen",
          sfx: "include",
          sfxNotes: "gentle whooshes",
        },
      },
    });
    const tools = createAssistanceTools(session);
    const result = await tools.prepare_review.execute!(
      {
        message: "your animated flyer is ready",
        finalPrompt:
          "8s flyer animation. 0-4s: subtle highlights glide across the sushi while bamboo leaves drift; slow camera push-in. 4-8s: motion settles on the original layout; locked camera, preserve baked-in ONLY $21 and contact without morphing.",
        readiness: readyFor("Animate the uploaded flyer while preserving its design"),
      },
      { toolCallId: "flyer_generic_name", messages: [] } as never,
    );

    expect(result).toMatchObject({ ok: true, terminal: "review" });
    if (session.terminal?.kind !== "review") {
      throw new Error("Expected review terminal");
    }
    expect(session.terminal.finalPrompt).toContain(
      "UPLOADED ARTWORK REFERENCE FIDELITY",
    );
    expect(session.terminal.finalPrompt).toContain("ONLY $21");
  });

  it("switches Standard ↔ Hypermotion via set_video_type", async () => {
    const session = makeSession({
      mode: "video",
      videoType: "standard",
      draft: {
        ...emptyBriefPayload({ aspectRatio: "9:16", durationSeconds: 8 }),
        subject: "Banana bread promo",
        timedBeats: [{ startSec: 0, endSec: 2, action: "Reveal loaf" }],
        brand: {
          productFidelity: "exact",
          logo: "include",
          ctaMode: "contact",
          contactValue: "+1 (868) 555-0100",
        },
      },
    });
    const tools = createAssistanceTools(session);
    const toHyper = await tools.set_video_type.execute!(
      { source: "user_explicit", videoType: "hypermotion_ad" },
      { toolCallId: "vt_1", messages: [] } as never,
    );
    expect(toHyper).toMatchObject({ ok: true, videoType: "hypermotion_ad" });
    expect(session.videoType).toBe("hypermotion_ad");
    expect(session.lockedFields).toContain("videoType");
    expect(session.inferredFields).not.toContain("videoType");

    const toStandard = await tools.set_video_type.execute!(
      { source: "user_explicit", videoType: "standard" },
      { toolCallId: "vt_2", messages: [] } as never,
    );
    expect(toStandard).toMatchObject({ ok: true, videoType: "standard" });
    expect(session.videoType).toBe("standard");
    expect(session.draft.timedBeats).toBeUndefined();
    expect(session.draft.brand.logo).toBe("include");
    expect(session.draft.brand.ctaMode).toBe("contact");
  });

  it("rejects inferred video-type changes once locked", async () => {
    const session = makeSession({
      mode: "video",
      videoType: "standard",
      lockedFields: ["videoType"],
    });
    const tools = createAssistanceTools(session);
    const result = await tools.set_video_type.execute!(
      { source: "inferred", videoType: "hypermotion_ad" },
      { toolCallId: "vt_locked", messages: [] } as never,
    );
    expect(result).toMatchObject({
      ok: false,
      error: "video_type_locked",
      videoType: "standard",
    });
    expect(session.videoType).toBe("standard");
  });

  it("rejects set_video_type outside video mode", async () => {
    const session = makeSession({ mode: "image" });
    const tools = createAssistanceTools(session);
    const result = await tools.set_video_type.execute!(
      { source: "user_explicit", videoType: "hypermotion_ad" },
      { toolCallId: "vt_image", messages: [] } as never,
    );
    expect(result).toMatchObject({ ok: false, error: "video_mode_required" });
  });

  it("counts broader timed-beat formats", () => {
    expect(
      countTimedBeatRanges(
        "0:00-0:02 hook. Shot 1 (0-1.5s) push. 1.5 to 3s orbit. 3–4.5s whip. 4.5-8s lock.",
      ),
    ).toBeGreaterThanOrEqual(4);
  });

  it("collapses structure + policy blockers into one prepare_review failure", async () => {
    const session = makeSession({
      mode: "video",
      videoType: "hypermotion_ad",
      draft: {
        ...emptyBriefPayload({
          aspectRatio: "9:16",
          durationSeconds: 8,
          resolution: "1280x720",
        }),
        subject: "Sushi rolls",
        objective: "Drive reservations",
        // missing productFidelity on purpose
      },
    });
    const tools = createAssistanceTools(session);
    const result = await tools.prepare_review.execute!(
      {
        message: "ready",
        finalPrompt:
          "8s ad. 0-4s: macro sushi reveal with snap push-in. 4-8s: platter lock-up with orbit.",
        readiness: readyFor("Create a fast eight-second sushi promotion"),
      },
      { toolCallId: "collapsed", messages: [] } as never,
    );
    expect(result).toMatchObject({
      ok: false,
      reviewError: "review_not_ready",
    });
    const blockers = (result as { blockers?: string[] }).blockers ?? [];
    expect(blockers.some((line) => /timed beats|beat/i.test(line))).toBe(true);
    expect(blockers.some((line) => /fidelity/i.test(line))).toBe(true);
    expect(session.prepareReviewFailedThisTurn).toBe(true);
  });

  it("calls the readiness critic at most once per turn for the same candidate", async () => {
    const critique = vi.fn(async () => ({
      decision: "ready" as const,
      rationale: "Ready.",
      criticalGaps: [],
      revisionInstructions: [],
      assumptions: [],
    }));
    const session = makeSession({
      mode: "video",
      videoType: "hypermotion_ad",
      critiqueCreativeReadiness: critique,
      draft: {
        ...emptyBriefPayload({
          aspectRatio: "9:16",
          durationSeconds: 8,
          resolution: "1280x720",
        }),
        subject: "Three sushi rolls",
        objective: "Drive reservations for the sushi promotion",
        visualDirection: "Fresh bamboo food-ad styling",
        brand: {
          productFidelity: "conceptual",
          logo: "omit",
          ctaMode: "omit",
        },
      },
    });
    const tools = createAssistanceTools(session);
    const timedPrompt = [
      "8s vertical Hypermotion sushi ad.",
      "0-1.5s: salmon texture hook, snap push-in.",
      "1.5-3s: avocado roll reveal, orbit left.",
      "3-4.5s: crisp topping detail, whip-pan right.",
      "4.5-6s: all three rolls align, tracking glide.",
      "6-8s: appetizing platter lock-up, camera settles.",
      "Fresh bamboo environment with crisp studio lighting and product continuity.",
    ].join(" ");
    const first = await tools.prepare_review.execute!(
      {
        message: "ready",
        finalPrompt: timedPrompt,
        readiness: readyFor("Create a fast eight-second sushi promotion"),
      },
      { toolCallId: "critic_once_1", messages: [] } as never,
    );
    expect(first).toMatchObject({ ok: true });
    session.terminal = undefined;
    session.agentState.readyForReview = false;
    const second = await tools.prepare_review.execute!(
      {
        message: "ready",
        finalPrompt: timedPrompt,
        readiness: readyFor("Create a fast eight-second sushi promotion"),
      },
      { toolCallId: "critic_once_2", messages: [] } as never,
    );
    expect(second).toMatchObject({ ok: true });
    expect(critique).toHaveBeenCalledTimes(1);
  });

  it("does not re-offer skipped CTA in evaluate_brief / prepare_review policy", async () => {
    const session = makeSession({
      mode: "video",
      videoType: "hypermotion_ad",
      offeredOptionalIds: ["cta", "logo", "offer"],
      skippedOptionalIds: ["cta", "logo", "offer"],
      draft: {
        ...emptyBriefPayload({
          aspectRatio: "9:16",
          durationSeconds: 8,
          resolution: "1280x720",
        }),
        subject: "Sushi",
        objective: "Awareness",
        brand: {
          productFidelity: "conceptual",
          logo: "undecided",
          ctaMode: "undecided",
        },
      },
    });
    const tools = createAssistanceTools(session);
    const evaluated = await tools.evaluate_brief.execute!(
      {},
      { toolCallId: "eval_optional", messages: [] } as never,
    );
    const questions =
      (evaluated as { questions?: Array<{ id?: string }> }).questions ?? [];
    expect(questions.some((question) => question.id === "cta")).toBe(false);
    expect(questions.some((question) => question.id === "logo")).toBe(false);
  });

  it("suppresses ask_user when contact is already set without a lock", async () => {
    const session = makeSession({
      mode: "video",
      draft: {
        ...emptyBriefPayload({ aspectRatio: "9:16", durationSeconds: 8 }),
        brand: {
          productFidelity: "conceptual",
          logo: "omit",
          ctaMode: "contact",
          contactValue: "WhatsApp +1 (868) 303-4621",
        },
      },
    });
    const tools = createAssistanceTools(session);
    const result = await tools.ask_user.execute!(
      {
        message: "what CTA?",
        questions: [
          {
            id: "cta",
            kind: "choice",
            field: "brand.ctaMode",
            prompt: "Add a call to action?",
            required: false,
          },
        ],
      },
      { toolCallId: "cta_suppress", messages: [] } as never,
    );
    expect(result).toMatchObject({ ok: false, error: "no_unanswered_question" });
  });

  it("blocks non-recovery tools while recoveryMode is on", async () => {
    const session = makeSession({ recoveryMode: true });
    const tools = createAssistanceTools(session);
    const result = await tools.inspect_media.execute!(
      { assetId: "assets_flyer" },
      { toolCallId: "recovery_block", messages: [] } as never,
    );
    expect(result).toMatchObject({
      ok: false,
      error: "recovery_tools_only",
    });
  });
});
