import { describe, expect, it } from "vitest";
import { createAssistanceTools, type AssistanceAgentSession } from "./assistanceTools";
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
    ...overrides,
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
        voiceover: "omit",
        sfx: "omit",
        music: "include",
        musicMood: "Bright tropical pop",
      },
      { toolCallId: "audio_1", messages: [] } as never,
    );
    expect(session.draft.brand.offerText).toBe("ONLY $100 — JULY 18");
    expect(session.draft.brand.contactValue).toContain("1-868");
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
      { message: "Ready", finalPrompt: "hero sushi" },
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
      { message: "Ready to generate", finalPrompt: richPrompt },
      { toolCallId: "t2", messages: [] } as never,
    );
    expect(ready).toMatchObject({ ok: true, terminal: "review" });
    expect(session.terminal?.kind).toBe("review");
  });

  it("does not ask for aspect ratio again once set", async () => {
    const session = makeSession();
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
  });
});
