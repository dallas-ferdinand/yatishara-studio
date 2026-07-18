/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { buildAssistanceGenerationPlan } from "./lib/assistanceGenerationPlan";
import { emptyBriefPayload, type GuidedQuestion } from "./lib/guidedVideoTypes";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);

type TestHarness = ReturnType<typeof convexTest>;

async function seedWorkspace(t: TestHarness) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const userId = await ctx.db.insert("users", {
      name: "Assistance Tester",
      email: `assistance-${now}@example.com`,
      role: "user",
      createdAt: now,
      updatedAt: now,
    });
    const otherUserId = await ctx.db.insert("users", {
      name: "Other User",
      email: `other-${now}@example.com`,
      role: "user",
      createdAt: now,
      updatedAt: now,
    });
    const folderId = await ctx.db.insert("folders", {
      ownerId: userId,
      name: "Assistance",
      icon: "folder",
      sortOrder: now,
      createdAt: now,
      updatedAt: now,
    });
    const otherFolderId = await ctx.db.insert("folders", {
      ownerId: otherUserId,
      name: "Other",
      icon: "folder",
      sortOrder: now,
      createdAt: now,
      updatedAt: now,
    });
    const threadId = await ctx.db.insert("generationThreads", {
      ownerId: userId,
      linkedFolderId: folderId,
      title: "Guardrails",
      sortOrder: now,
      createdAt: now,
      updatedAt: now,
    });
    const stylePresetId = await ctx.db.insert("stylePresets", {
      name: "Test preset",
      slug: `guardrail-${now}`,
      kind: "any",
      systemInstructions: "Use the reviewed style.",
      enabled: true,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    });
    const styleSheetElementId = await ctx.db.insert("elements", {
      ownerId: userId,
      folderId,
      type: "style_sheet",
      name: "Illustrated board",
      description: "Flat illustrated campaign",
      sourceAssetIds: [],
      styleRules: "Flat shapes, ink outlines, illustrated rendering.",
      renderMode: "illustrated_2d",
      createdAt: now,
      updatedAt: now,
    });
    const foreignAssetId = await ctx.db.insert("assets", {
      ownerId: otherUserId,
      folderId: otherFolderId,
      name: "Private reference",
      kind: "image",
      mimeType: "image/png",
      bunnyPath: "private/reference.png",
      createdAt: now,
      updatedAt: now,
    });
    return {
      userId,
      otherUserId,
      folderId,
      otherFolderId,
      threadId,
      stylePresetId,
      styleSheetElementId,
      foreignAssetId,
    };
  });
}

async function insertBrief(
  t: TestHarness,
  workspace: Awaited<ReturnType<typeof seedWorkspace>>,
  args: {
    mode?: "image" | "video" | "script" | "element";
    videoType?: "standard" | "hypermotion_ad";
    status?: "collecting" | "awaiting_input" | "review_ready" | "failed";
    revision?: number;
    payload?: ReturnType<typeof emptyBriefPayload>;
    questions?: GuidedQuestion[];
    styleSheetElementId?: Id<"elements">;
    generationPlanJson?: string;
    generationPlanFingerprint?: string;
    estimatedCredits?: number;
  } = {},
) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    return await ctx.db.insert("guidedBriefs", {
      ownerId: workspace.userId,
      threadId: workspace.threadId,
      mode: args.mode ?? "image",
      videoType: args.videoType,
      status: args.status ?? "awaiting_input",
      revision: args.revision ?? 1,
      userPrompt: "",
      payload: args.payload ?? emptyBriefPayload(),
      lockedFields: [],
      inferredFields: [],
      assumptions: [],
      warnings: [],
      offeredOptionalIds: [],
      skippedOptionalIds: [],
      pendingQuestionsJson: args.questions ? JSON.stringify(args.questions) : undefined,
      generationPlanJson: args.generationPlanJson,
      generationPlanFingerprint: args.generationPlanFingerprint,
      estimatedCredits: args.estimatedCredits,
      stylePresetId: workspace.stylePresetId,
      styleSheetElementId: args.styleSheetElementId,
      createdAt: now,
      updatedAt: now,
    });
  });
}

describe("Assistance guardrails", () => {
  it("applies resolve_mode_conflict and clears incompatible production state", async () => {
    const t = convexTest(schema, modules);
    const workspace = await seedWorkspace(t);
    const payload = emptyBriefPayload();
    payload.subject = "Launch film";
    payload.timedBeats = [{ startSec: 0, endSec: 2, action: "Product reveal" }];
    payload.brand.logo = "include";
    payload.production.scriptType = "commercial";
    const briefId = await insertBrief(t, workspace, {
      mode: "video",
      videoType: "hypermotion_ad",
      payload,
      questions: [
        {
          id: "resolve_mode_conflict",
          kind: "choice",
          prompt: "Which output do you want?",
          options: [
            { value: "video", label: "Video" },
            { value: "script", label: "Script" },
          ],
          required: true,
        },
      ],
    });

    const updated = await t
      .withIdentity({ subject: workspace.userId })
      .mutation(api.guidedVideo.answerQuestions, {
        briefId,
        expectedRevision: 1,
        answers: [{ questionId: "resolve_mode_conflict", value: "script" }],
      });

    expect(updated.mode).toBe("script");
    expect(updated.videoType).toBeUndefined();
    expect(updated.payload.timedBeats).toBeUndefined();
    expect(updated.payload.brand.logo).toBe("undecided");
    expect(updated.payload.production.scriptType).toBe("commercial");
  });

  it.each([
    { answer: "photoreal", keepsSheet: false },
    { answer: "illustrated", keepsSheet: true },
  ] as const)(
    "resolves a style conflict with $answer and keepsSheet=$keepsSheet",
    async ({ answer, keepsSheet }) => {
      const t = convexTest(schema, modules);
      const workspace = await seedWorkspace(t);
      const payload = emptyBriefPayload();
      payload.subject = "Campaign key art";
      const briefId = await insertBrief(t, workspace, {
        payload,
        styleSheetElementId: workspace.styleSheetElementId,
        questions: [
          {
            id: "resolve_style_conflict",
            kind: "choice",
            field: "visualDirection",
            prompt: "Use the request or Style Sheet?",
            options: [
              { value: "photoreal", label: "Photoreal request" },
              { value: "illustrated", label: "Illustrated Style Sheet" },
            ],
            required: true,
          },
        ],
      });

      const updated = await t
        .withIdentity({ subject: workspace.userId })
        .mutation(api.guidedVideo.answerQuestions, {
          briefId,
          expectedRevision: 1,
          answers: [{ questionId: "resolve_style_conflict", value: answer }],
        });

      expect(updated.payload.visualDirection).toBe(answer);
      expect(updated.styleSheetElementId).toBe(
        keepsSheet ? workspace.styleSheetElementId : undefined,
      );
    },
  );

  it("stores immutable review snapshots while later revisions change", async () => {
    const t = convexTest(schema, modules);
    const workspace = await seedWorkspace(t);
    const seededPayload = emptyBriefPayload();
    seededPayload.visualDirection = "Clean bright product photography";
    seededPayload.offer = "Launch special";
    const briefId = await insertBrief(t, workspace, {
      payload: seededPayload,
      questions: [
        {
          id: "image_subject",
          kind: "text",
          field: "subject",
          prompt: "What should the image show?",
          required: true,
        },
      ],
    });
    const asUser = t.withIdentity({ subject: workspace.userId });
    const first = await asUser.mutation(api.guidedVideo.answerQuestions, {
      briefId,
      expectedRevision: 1,
      answers: [{ questionId: "image_subject", value: "Amber bottle" }],
    });
    expect(first.status).toBe("review_ready");

    const firstEvent = await t.run(async (ctx) => {
      const events = await ctx.db
        .query("generationEvents")
        .withIndex("by_brief", (q) => q.eq("briefId", briefId))
        .collect();
      return events.find((event) => event.kind === "review" && event.briefRevision === 2);
    });
    expect(firstEvent?.briefSnapshotJson).toBeTypeOf("string");
    expect(JSON.parse(firstEvent!.briefSnapshotJson!).payload.subject).toBe("Amber bottle");

    const second = await asUser.mutation(api.guidedVideo.editBrief, {
      briefId,
      expectedRevision: 2,
      patch: { ...first.payload, subject: "Cobalt bottle" },
      lockFields: ["subject"],
    });
    expect(second.revision).toBe(3);

    await t.run(async (ctx) => {
      const oldEvent = await ctx.db.get(firstEvent!._id);
      const events = await ctx.db
        .query("generationEvents")
        .withIndex("by_brief", (q) => q.eq("briefId", briefId))
        .collect();
      const latest = events.find(
        (event) => event.kind === "review" && event.briefRevision === 3,
      );
      expect(oldEvent?.briefSnapshotJson).toBe(firstEvent?.briefSnapshotJson);
      expect(JSON.parse(oldEvent!.briefSnapshotJson!).payload.subject).toBe("Amber bottle");
      expect(JSON.parse(latest!.briefSnapshotJson!).payload.subject).toBe("Cobalt bottle");
    });
  });

  it("rejects foreign attachment IDs during merge and media resolution", async () => {
    const t = convexTest(schema, modules);
    const workspace = await seedWorkspace(t);
    const briefId = await insertBrief(t, workspace);

    await expect(
      t.mutation(internal.guidedVideo.mergeBriefAttachments, {
        briefId,
        briefRevision: 1,
        attachments: [
          {
            assetId: workspace.foreignAssetId,
            role: "reference",
            sortOrder: 0,
          },
        ],
      }),
    ).rejects.toThrow("Attachment asset not found");

    await t.run(async (ctx) => {
      await ctx.db.insert("guidedBriefAttachments", {
        briefId,
        ownerId: workspace.userId,
        assetId: workspace.foreignAssetId,
        role: "reference",
        sortOrder: 0,
        briefRevision: 1,
        createdAt: Date.now(),
      });
    });
    await expect(
      t.query(internal.guidedVideo.resolveBriefMediaInternal, {
        briefId,
        expiresUnix: Math.floor(Date.now() / 1000) + 60,
      }),
    ).rejects.toThrow("Attachment asset not found");
  });

  it("does not create jobs while submitting analysis or answering questions", async () => {
    const t = convexTest(schema, modules);
    const workspace = await seedWorkspace(t);
    const briefId = await insertBrief(t, workspace, {
      questions: [
        {
          id: "image_subject",
          kind: "text",
          field: "subject",
          prompt: "What should the image show?",
          required: true,
        },
      ],
    });

    await t.mutation(internal.guidedVideo.applyAnalysisResult, {
      briefId,
      expectedRevision: 1,
      userPrompt: "Create an image",
      message: "What should it show?",
      decision: "ask",
      questionsJson: JSON.stringify([
        {
          id: "image_subject",
          kind: "text",
          field: "subject",
          prompt: "What should the image show?",
          required: true,
        },
      ]),
      assumptions: [],
      warnings: [],
      inferredFields: [],
      attachmentRoleUpdates: [],
    });
    await t
      .withIdentity({ subject: workspace.userId })
      .mutation(api.guidedVideo.answerQuestions, {
        briefId,
        expectedRevision: 2,
        answers: [{ questionId: "image_subject", value: "A glass sculpture" }],
      });

    await t.run(async (ctx) => {
      expect(await ctx.db.query("generationJobs").collect()).toHaveLength(0);
    });
  });

  it("keeps failed approval retryable and reserves the exact reviewed estimate", async () => {
    const t = convexTest(schema, modules);
    const workspace = await seedWorkspace(t);
    const seeded = await t.run(async (ctx) => {
      const now = Date.now();
      const payload = emptyBriefPayload({
        resolution: "2K",
        quality: "medium",
        aspectRatio: "1:1",
      });
      payload.subject = "A glass sculpture";
      const plan = buildAssistanceGenerationPlan({
        mode: "image",
        payload,
        compiledPrompt: "A glass sculpture on seamless white",
        references: [],
        resolvedModel: "openai/gpt-image-2",
        stylePresetId: String(workspace.stylePresetId),
      });
      const briefId = await ctx.db.insert("guidedBriefs", {
        ownerId: workspace.userId,
        threadId: workspace.threadId,
        mode: "image",
        status: "review_ready",
        revision: 1,
        userPrompt: "A glass sculpture",
        payload,
        lockedFields: ["subject"],
        inferredFields: [],
        assumptions: [],
        warnings: [],
        offeredOptionalIds: [],
        skippedOptionalIds: [],
        compiledPrompt: plan.finalPrompt,
        generationPlanJson: JSON.stringify(plan),
        generationPlanFingerprint: plan.fingerprint,
        estimatedCredits: plan.estimate.credits,
        stylePresetId: workspace.stylePresetId,
        createdAt: now,
        updatedAt: now,
      });
      const accountId = await ctx.db.insert("billingAccounts", {
        userId: workspace.userId,
        creditBalance: 0,
        reservedCredits: 0,
        createdAt: now,
        updatedAt: now,
      });
      return { briefId, accountId, plan };
    });
    const approvalArgs = {
      briefId: seeded.briefId,
      expectedRevision: 1,
      planFingerprint: seeded.plan.fingerprint,
    };

    await expect(
      t.mutation(internal.generation.approveAssistedMedia, {
        userId: workspace.userId,
        ...approvalArgs,
      }),
    ).rejects.toThrow("Top up to continue");
    await t.run(async (ctx) => {
      expect((await ctx.db.get(seeded.briefId))?.status).toBe("review_ready");
      expect(await ctx.db.query("generationJobs").collect()).toHaveLength(0);
      await ctx.db.patch(seeded.accountId, { creditBalance: 100 });
    });

    const approved = await t.mutation(
      internal.generation.approveAssistedMedia,
      {
        userId: workspace.userId,
        ...approvalArgs,
      },
    );
    expect(approved.created).toBe(true);
    await t.run(async (ctx) => {
      const estimate = seeded.plan.estimate.credits!;
      const account = await ctx.db.get(seeded.accountId);
      const job = await ctx.db.get(approved.jobId);
      const reservation = await ctx.db.get(job!.reservedCreditTransactionId!);
      expect(account?.creditBalance).toBe(100 - estimate);
      expect(account?.reservedCredits).toBe(estimate);
      expect(reservation?.amount).toBe(-estimate);
      expect((await ctx.db.get(seeded.briefId))?.approvedJobId).toBe(approved.jobId);
      expect(await ctx.db.query("generationJobs").collect()).toHaveLength(1);
    });
  });

  it("emits one assistant event and never a question event on ask turns", async () => {
    const t = convexTest(schema, modules);
    const workspace = await seedWorkspace(t);
    const briefId = await insertBrief(t, workspace);
    await t.mutation(internal.guidedVideo.applyAnalysisResult, {
      briefId,
      expectedRevision: 1,
      userPrompt: "flyer for sushi",
      message: "What should the flyer feature?",
      decision: "ask",
      questionsJson: JSON.stringify([
        {
          id: "image_subject",
          kind: "text",
          field: "subject",
          prompt: "What should this image show?",
          required: true,
        },
      ]),
      agentPlanJson: JSON.stringify({
        goal: "Sushi flyer",
        knownFacts: [],
        missingCritical: ["Hero content"],
        missingOptional: [],
        nextFocus: "Hero content",
        unresolvedDecisions: [],
        readinessRationale: "Need the offer details",
        readyForReview: false,
        turnStrategy: "clarify",
      }),
      assumptions: [],
      warnings: [],
      inferredFields: [],
      attachmentRoleUpdates: [],
    });
    await t.run(async (ctx) => {
      const events = await ctx.db
        .query("generationEvents")
        .withIndex("by_brief", (q) => q.eq("briefId", briefId))
        .collect();
      expect(events.filter((event) => event.kind === "question")).toHaveLength(0);
      expect(events.filter((event) => event.kind === "assistant")).toHaveLength(1);
      const assistantMessage = events.find(
        (event) => event.kind === "assistant",
      )?.message;
      expect(assistantMessage).toContain("What should the flyer feature?");
      expect(assistantMessage).toMatch(/What should .*(?:flyer|image).*\?/i);
    });
  });

  it("migrates legacy question events into assistant prose", async () => {
    const t = convexTest(schema, modules);
    const workspace = await seedWorkspace(t);
    const briefId = await insertBrief(t, workspace);
    await t.run(async (ctx) => {
      await ctx.db.insert("generationEvents", {
        ownerId: workspace.userId,
        threadId: workspace.threadId,
        kind: "question",
        order: Date.now(),
        briefId,
        briefRevision: 1,
        message: "Need a couple details",
        questionsJson: JSON.stringify([
          {
            id: "image_subject",
            kind: "text",
            prompt: "What should this image show?",
          },
        ]),
        createdAt: Date.now(),
      });
    });
    const result = await t.mutation(internal.guidedVideo.migrateLegacyAssistanceData, {
      limit: 50,
    });
    expect(result.questionEventsConverted).toBeGreaterThanOrEqual(1);
    await t.run(async (ctx) => {
      const events = await ctx.db
        .query("generationEvents")
        .withIndex("by_brief", (q) => q.eq("briefId", briefId))
        .collect();
      expect(events.every((event) => event.kind !== "question")).toBe(true);
      expect(
        events.some(
          (event) =>
            event.kind === "assistant" &&
            event.message?.includes("What should this image show?"),
        ),
      ).toBe(true);
    });
  });

  it("failed turns leave brief revision and review untouched", async () => {
    const t = convexTest(schema, modules);
    const workspace = await seedWorkspace(t);
    const briefId = await insertBrief(t, workspace, {
      status: "review_ready",
      generationPlanJson: JSON.stringify({ fingerprint: "fp-1" }),
      generationPlanFingerprint: "fp-1",
      estimatedCredits: 12,
    });
    const begun = await t.mutation(internal.guidedVideo.beginAssistanceTurn, {
      ownerId: workspace.userId,
      threadId: workspace.threadId,
      briefId,
      clientTurnId: "fail-turn-1",
      userPrompt: "change color",
    });
    const failed = await t.mutation(internal.guidedVideo.failAssistanceTurn, {
      turnId: begun.turnId,
      error: "model timeout",
      userPrompt: "change color",
      assistantMessage: "I hit a snag analyzing that — try again.",
    });
    expect(failed.alreadyFailed).toBe(false);
    const again = await t.mutation(internal.guidedVideo.failAssistanceTurn, {
      turnId: begun.turnId,
      error: "model timeout again",
    });
    expect(again.alreadyFailed).toBe(true);
    await t.run(async (ctx) => {
      const brief = await ctx.db.get(briefId);
      expect(brief?.revision).toBe(1);
      expect(brief?.status).toBe("review_ready");
      expect(brief?.generationPlanFingerprint).toBe("fp-1");
      const events = await ctx.db
        .query("generationEvents")
        .withIndex("by_thread_and_order", (q) =>
          q.eq("threadId", workspace.threadId),
        )
        .collect();
      expect(events.filter((event) => event.kind === "prompt")).toHaveLength(1);
      expect(events.filter((event) => event.kind === "assistant")).toHaveLength(1);
    });
  });

  it("commits Assistance turns idempotently by clientTurnId", async () => {
    const t = convexTest(schema, modules);
    const workspace = await seedWorkspace(t);
    const briefId = await insertBrief(t, workspace);
    const begun = await t.mutation(internal.guidedVideo.beginAssistanceTurn, {
      ownerId: workspace.userId,
      threadId: workspace.threadId,
      briefId,
      clientTurnId: "client-turn-1",
      userPrompt: "make a flyer",
    });
    expect(begun.idempotent).toBe(false);
    const again = await t.mutation(internal.guidedVideo.beginAssistanceTurn, {
      ownerId: workspace.userId,
      threadId: workspace.threadId,
      briefId,
      clientTurnId: "client-turn-1",
      userPrompt: "make a flyer",
    });
    expect(again.idempotent).toBe(true);
    expect(again.turnId).toBe(begun.turnId);

    const committed = await t.mutation(internal.guidedVideo.commitAssistanceTurn, {
      turnId: begun.turnId,
      expectedRevision: 1,
      userPrompt: "make a flyer",
      message: "Tell me more about the offer.",
      decision: "ask",
      agentStateJson: JSON.stringify({
        goal: "Flyer",
        knownFacts: [],
        missingCritical: ["Offer"],
        missingOptional: [],
        nextFocus: "Offer",
        unresolvedDecisions: [],
        readinessRationale: "Need offer",
        readyForReview: false,
        turnStrategy: "clarify",
      }),
      assumptions: [],
      warnings: [],
      inferredFields: [],
      attachmentRoleUpdates: [],
    });
    expect(committed.revision).toBe(2);
    const replay = await t.mutation(internal.guidedVideo.commitAssistanceTurn, {
      turnId: begun.turnId,
      expectedRevision: 1,
      userPrompt: "make a flyer",
      message: "ignored",
      decision: "ask",
      assumptions: [],
      warnings: [],
      inferredFields: [],
      attachmentRoleUpdates: [],
    });
    expect(replay.idempotent).toBe(true);
    expect(replay.revision).toBe(2);
    await t.run(async (ctx) => {
      const events = await ctx.db
        .query("generationEvents")
        .withIndex("by_brief", (q) => q.eq("briefId", briefId))
        .collect();
      expect(events.filter((event) => event.kind === "prompt")).toHaveLength(1);
      expect(events.filter((event) => event.kind === "assistant")).toHaveLength(1);
      expect(events.filter((event) => event.kind === "question")).toHaveLength(0);
    });
  });

  it("rejects reused clientTurnId with different request contents", async () => {
    const t = convexTest(schema, modules);
    const workspace = await seedWorkspace(t);
    const briefId = await insertBrief(t, workspace);
    await t.mutation(internal.guidedVideo.beginAssistanceTurn, {
      ownerId: workspace.userId,
      threadId: workspace.threadId,
      briefId,
      clientTurnId: "conflict-turn",
      userPrompt: "make a flyer",
      requestJson: JSON.stringify({ mode: "image" }),
    });
    await expect(
      t.mutation(internal.guidedVideo.beginAssistanceTurn, {
        ownerId: workspace.userId,
        threadId: workspace.threadId,
        briefId,
        clientTurnId: "conflict-turn",
        userPrompt: "make a different flyer",
        requestJson: JSON.stringify({ mode: "image" }),
      }),
    ).rejects.toThrow("idempotency_key_conflict");
  });

  it("charges Assistance turns atomically and idempotently", async () => {
    const t = convexTest(schema, modules);
    const workspace = await seedWorkspace(t);
    const briefId = await insertBrief(t, workspace);
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("billingAccounts", {
        userId: workspace.userId,
        creditBalance: 50,
        reservedCredits: 0,
        createdAt: now,
        updatedAt: now,
      });
    });
    const begun = await t.mutation(internal.guidedVideo.beginAssistanceTurn, {
      ownerId: workspace.userId,
      threadId: workspace.threadId,
      briefId,
      clientTurnId: "charge-turn",
      userPrompt: "make a flyer",
    });
    const first = await t.mutation(internal.guidedVideo.chargeAssistanceTurn, {
      turnId: begun.turnId,
      ownerId: workspace.userId,
      folderId: workspace.folderId,
      inputTokens: 1_000,
      outputTokens: 200,
    });
    const replay = await t.mutation(internal.guidedVideo.chargeAssistanceTurn, {
      turnId: begun.turnId,
      ownerId: workspace.userId,
      folderId: workspace.folderId,
      inputTokens: 1_000,
      outputTokens: 200,
    });
    expect(first.idempotent).toBe(false);
    expect(first.creditsCharged).toBeGreaterThan(0);
    expect(replay.idempotent).toBe(true);
    expect(replay.creditTransactionId).toBe(first.creditTransactionId);
    await t.run(async (ctx) => {
      const turn = await ctx.db.get(begun.turnId);
      const account = (
        await ctx.db
          .query("billingAccounts")
          .withIndex("by_user", (q) => q.eq("userId", workspace.userId))
          .unique()
      )!;
      const spends = await ctx.db
        .query("creditTransactions")
        .withIndex("by_user", (q) => q.eq("userId", workspace.userId))
        .collect();
      expect(turn?.creditTransactionId).toBe(first.creditTransactionId);
      expect(spends.filter((row) => row.kind === "spent")).toHaveLength(1);
      expect(account.creditBalance).toBeLessThan(50);
    });
  });

  it("commits durable tool calls and ownership-checked approval requests atomically", async () => {
    const t = convexTest(schema, modules);
    const workspace = await seedWorkspace(t);
    const briefId = await insertBrief(t, workspace);
    const begun = await t.mutation(internal.guidedVideo.beginAssistanceTurn, {
      ownerId: workspace.userId,
      threadId: workspace.threadId,
      briefId,
      clientTurnId: "approval-turn-1",
      userPrompt: "trash the old asset",
    });
    await t.mutation(internal.guidedVideo.commitAssistanceTurn, {
      turnId: begun.turnId,
      expectedRevision: 1,
      userPrompt: "trash the old asset",
      message: "Review the requested action below.",
      decision: "ask",
      assumptions: [],
      warnings: [],
      inferredFields: [],
      attachmentRoleUpdates: [],
      approvals: [
        {
          toolCallId: "tool-trash-1",
          action: "trash",
          title: "Trash old asset",
          summary: "Move the old asset to trash.",
          argumentsJson: JSON.stringify({
            kind: "asset",
            id: "assets_old",
          }),
        },
      ],
      toolCalls: [
        {
          toolCallId: "tool-trash-1",
          toolName: "request_approval",
          argumentsJson: JSON.stringify({ action: "trash" }),
          outputJson: JSON.stringify({ ok: true }),
        },
      ],
    });

    const asOwner = t.withIdentity({ subject: workspace.userId });
    const approvals = await asOwner.query(
      api.assistanceApprovals.listForThread,
      { threadId: workspace.threadId },
    );
    expect(approvals).toHaveLength(1);
    expect(approvals[0]).toMatchObject({
      action: "trash",
      status: "pending",
    });
    const asOther = t.withIdentity({ subject: workspace.otherUserId });
    await expect(
      asOther.mutation(api.assistanceApprovals.decide, {
        approvalId: approvals[0]._id,
        decision: "deny",
      }),
    ).rejects.toThrow("Approval request not found");
    await asOwner.mutation(api.assistanceApprovals.decide, {
      approvalId: approvals[0]._id,
      decision: "deny",
    });
    await t.run(async (ctx) => {
      const approval = await ctx.db.get(approvals[0]._id);
      expect(approval?.status).toBe("denied");
      const toolCalls = await ctx.db
        .query("assistanceToolCalls")
        .withIndex("by_turn", (q) => q.eq("turnId", begun.turnId))
        .collect();
      expect(toolCalls).toHaveLength(1);
      expect(toolCalls[0].toolName).toBe("request_approval");
    });
  });

  it("makes safe workspace writes idempotent and rejects foreign targets", async () => {
    const t = convexTest(schema, modules);
    const workspace = await seedWorkspace(t);
    const briefId = await insertBrief(t, workspace);
    const begun = await t.mutation(internal.guidedVideo.beginAssistanceTurn, {
      ownerId: workspace.userId,
      threadId: workspace.threadId,
      briefId,
      clientTurnId: "safe-write-turn",
      userPrompt: "create a campaign folder",
    });
    const args = {
      ownerId: workspace.userId,
      threadId: workspace.threadId,
      turnId: begun.turnId,
      toolCallId: "create-folder-1",
      operation: "create_folder" as const,
      argumentsJson: JSON.stringify({
        name: "Campaign",
        parentId: workspace.folderId,
      }),
    };
    const first = await t.mutation(
      internal.assistanceWorkspace.performSafeWorkspaceToolCall,
      args,
    );
    const replay = await t.mutation(
      internal.assistanceWorkspace.performSafeWorkspaceToolCall,
      args,
    );
    expect(first.idempotent).toBe(false);
    expect(replay.idempotent).toBe(true);
    expect(replay.resultJson).toBe(first.resultJson);
    await expect(
      t.mutation(
        internal.assistanceWorkspace.performSafeWorkspaceToolCall,
        {
          ...args,
          toolCallId: "foreign-folder",
          argumentsJson: JSON.stringify({
            name: "Stolen",
            parentId: workspace.otherFolderId,
          }),
        },
      ),
    ).rejects.toThrow("Folder not found");
  });

  it("patches Seedance video review settings and rebuilds the generation plan", async () => {
    const t = convexTest(schema, modules);
    const workspace = await seedWorkspace(t);
    const payload = emptyBriefPayload({
      durationSeconds: 4,
      aspectRatio: "9:16",
      resolution: "1280x720",
    });
    payload.subject = "Banana bread loaf";
    payload.objective = "Promote weekend bakery pickup";
    payload.keyMessage = "Fresh loaves Saturday morning";
    payload.visualDirection = "Warm bakery counter, soft window light";
    payload.audio = {
      voiceover: "none",
      sfx: "none",
      music: "none",
    };
    const priorPlan = buildAssistanceGenerationPlan({
      mode: "video",
      videoType: "standard",
      payload,
      compiledPrompt:
        "4s Seedance clip of banana bread on a bakery counter with one slow push-in.",
      references: [],
      resolvedModel: "bytedance/seedance-2.0",
      videoModel: "seedance-2.0",
      videoCapabilities: {
        requiresStartFrame: false,
        supportsMultimodalRefs: true,
        maxDurationSeconds: 15,
      },
      stylePresetId: String(workspace.stylePresetId),
    });
    const briefId = await insertBrief(t, workspace, {
      mode: "video",
      videoType: "standard",
      status: "review_ready",
      payload,
      generationPlanJson: JSON.stringify(priorPlan),
      generationPlanFingerprint: priorPlan.fingerprint,
      estimatedCredits: priorPlan.estimate.credits,
    });

    const asUser = t.withIdentity({ subject: workspace.userId });
    const updated = await asUser.mutation(api.guidedVideo.patchBriefProduction, {
      briefId,
      expectedRevision: 1,
      production: {
        videoType: "hypermotion_ad",
        durationSeconds: 8,
        resolution: "1920x1080",
        aspectRatio: "9:16",
        audioEnabled: true,
      },
    });

    expect(updated.videoType).toBe("hypermotion_ad");
    expect(updated.payload.production.durationSeconds).toBe(8);
    expect(updated.payload.production.resolution).toBe("1920x1080");
    expect(updated.payload.audio.music).toBe("include");
    expect(updated.status).toBe("review_ready");
    expect(updated.estimatedCredits).toBeGreaterThan(0);
    expect(updated.generationPlanFingerprint).toBeTruthy();
    expect(updated.generationPlanFingerprint).not.toBe(priorPlan.fingerprint);
    expect(updated.lockedFields).toEqual(
      expect.arrayContaining([
        "videoType",
        "production.durationSeconds",
        "production.resolution",
        "audio.music",
      ]),
    );

    await expect(
      asUser.mutation(api.guidedVideo.patchBriefProduction, {
        briefId,
        expectedRevision: 1,
        production: { durationSeconds: 30 },
      }),
    ).rejects.toThrow(/duration/i);

    await expect(
      asUser.mutation(api.guidedVideo.patchBriefProduction, {
        briefId,
        expectedRevision: 1,
        production: { resolution: "4K" },
      }),
    ).rejects.toThrow(/720p|1080p|resolution/i);
  });
});
