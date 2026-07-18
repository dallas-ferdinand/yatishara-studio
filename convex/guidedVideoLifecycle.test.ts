/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import {
  buildAssistanceGenerationPlan,
} from "./lib/assistanceGenerationPlan";
import { emptyBriefPayload } from "./lib/guidedVideoTypes";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);

describe("Assistance approval lifecycle", () => {
  it("publishes generated assets only after storage is ready", async () => {
    const t = convexTest(schema, modules);
    const seeded = await t.run(async (ctx) => {
      const now = Date.now();
      const userId = await ctx.db.insert("users", {
        name: "Storage Tester",
        email: "storage@example.com",
        role: "user",
        createdAt: now,
        updatedAt: now,
      });
      const folderId = await ctx.db.insert("folders", {
        ownerId: userId,
        name: "Outputs",
        icon: "folder",
        sortOrder: now,
        createdAt: now,
        updatedAt: now,
      });
      const threadId = await ctx.db.insert("generationThreads", {
        ownerId: userId,
        linkedFolderId: folderId,
        title: "Storage",
        sortOrder: now,
        createdAt: now,
        updatedAt: now,
      });
      const stylePresetId = await ctx.db.insert("stylePresets", {
        name: "Default",
        slug: "storage-default",
        kind: "any",
        systemInstructions: "Default style",
        enabled: true,
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
      });
      const jobId = await ctx.db.insert("generationJobs", {
        ownerId: userId,
        threadId,
        saveFolderId: folderId,
        mode: "image",
        tier: "image",
        resolvedModel: "openai/gpt-image-2",
        stylePresetId,
        userPrompt: "A product image",
        stage: "saving",
        createdAt: now,
        updatedAt: now,
      });
      return { jobId };
    });

    const reserved = await t.mutation(internal.generation.createGeneratedAsset, {
      jobId: seeded.jobId,
      name: "output.png",
      kind: "image",
      mimeType: "image/png",
    });
    await t.run(async (ctx) => {
      expect((await ctx.db.get(reserved.assetId))?.storageStatus).toBe("pending");
    });

    await t.mutation(internal.generation.setGeneratedAssetStorageStatus, {
      jobId: seeded.jobId,
      assetId: reserved.assetId,
      status: "ready",
      byteSize: 1234,
    });
    await t.run(async (ctx) => {
      const asset = await ctx.db.get(reserved.assetId);
      expect(asset?.storageStatus).toBe("ready");
      expect(asset?.byteSize).toBe(1234);
    });
  });

  it("atomically replaces a failed media job and snapshots the reviewed plan", async () => {
    const t = convexTest(schema, modules);
    const seeded = await t.run(async (ctx) => {
      const now = Date.now();
      const userId = await ctx.db.insert("users", {
        name: "Lifecycle Tester",
        email: "lifecycle@example.com",
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
      const threadId = await ctx.db.insert("generationThreads", {
        ownerId: userId,
        linkedFolderId: folderId,
        title: "Approval",
        sortOrder: now,
        createdAt: now,
        updatedAt: now,
      });
      const stylePresetId = await ctx.db.insert("stylePresets", {
        name: "Default",
        slug: "default",
        kind: "any",
        systemInstructions: "Default style",
        enabled: true,
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
      });
      const payload = emptyBriefPayload({
        resolution: "2K",
        quality: "medium",
        aspectRatio: "1:1",
      });
      payload.subject = "A bottle";
      const plan = buildAssistanceGenerationPlan({
        mode: "image",
        payload,
        compiledPrompt: "A bottle on a clean background",
        references: [],
        warnings: [],
        resolvedModel: "openai/gpt-image-2",
        stylePresetId: String(stylePresetId),
      });
      const briefId = await ctx.db.insert("guidedBriefs", {
        ownerId: userId,
        threadId,
        mode: "image",
        status: "failed",
        revision: 2,
        userPrompt: "A bottle",
        payload,
        lockedFields: [],
        inferredFields: [],
        assumptions: [],
        warnings: [],
        offeredOptionalIds: [],
        skippedOptionalIds: [],
        compiledPrompt: "A bottle on a clean background",
        generationPlanJson: JSON.stringify(plan),
        generationPlanFingerprint: plan.fingerprint,
        estimatedCredits: plan.estimate.credits,
        stylePresetId,
        createdAt: now,
        updatedAt: now,
      });
      const failedJobId = await ctx.db.insert("generationJobs", {
        ownerId: userId,
        threadId,
        saveFolderId: folderId,
        mode: "image",
        tier: "image",
        resolvedModel: "openai/gpt-image-2",
        stylePresetId,
        userPrompt: plan.finalPrompt,
        stage: "failed",
        source: "ui",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.patch(briefId, {
        approvedRevision: 2,
        approvedJobId: failedJobId,
      });
      await ctx.db.insert("billingAccounts", {
        userId,
        creditBalance: 100,
        reservedCredits: 0,
        createdAt: now,
        updatedAt: now,
      });
      return { userId, briefId, failedJobId, plan };
    });

    const approved = await t.mutation(internal.generation.approveAssistedMedia, {
      userId: seeded.userId,
      briefId: seeded.briefId,
      expectedRevision: 2,
      planFingerprint: seeded.plan.fingerprint,
    });

    expect(approved.created).toBe(true);
    expect(approved.replacement).toBe(true);
    expect(approved.jobId).not.toBe(seeded.failedJobId);
    const replay = await t.mutation(internal.generation.approveAssistedMedia, {
      userId: seeded.userId,
      briefId: seeded.briefId,
      expectedRevision: 2,
      planFingerprint: seeded.plan.fingerprint,
    });
    expect(replay).toEqual({
      jobId: approved.jobId,
      created: false,
      replacement: false,
    });
    await t.run(async (ctx) => {
      const brief = await ctx.db.get(seeded.briefId);
      const job = await ctx.db.get(approved.jobId);
      const inputs = await ctx.db
        .query("generationInputs")
        .withIndex("by_job", (query) => query.eq("jobId", approved.jobId))
        .collect();
      expect(brief?.status).toBe("generating");
      expect(brief?.approvedJobId).toBe(approved.jobId);
      expect(job?.stage).toBe("queued");
      expect(inputs).toHaveLength(0);
      const jobs = await ctx.db
        .query("generationJobs")
        .withIndex("by_thread", (query) => query.eq("threadId", job!.threadId))
        .collect();
      expect(jobs).toHaveLength(2);
    });
  });
});
