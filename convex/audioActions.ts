"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { makeFunctionReference, type FunctionReference } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { putObject } from "./lib/bunny";
import {
  addSharedVoice,
  isAccountVoiceOwnerId,
  libraryVoicesAvailable,
  listAccountVoices,
  listSharedVoices,
  mapCategoryToUseCase,
  mapVoiceSort,
  normalizeVoicePageSize,
  sliceVoicePage,
  soundGeneration,
  textToSpeechV3,
  VOICE_UNAVAILABLE_USER_MESSAGE,
  voiceUsableOnCurrentPlan,
  type SharedVoice,
  type SharedVoiceSort,
} from "./lib/elevenlabs";
import { friendlyGenerationErrorText } from "./lib/generationUserErrors";

function internalMutationRef<Args extends Record<string, unknown>, Return>(
  name: string,
): FunctionReference<"mutation", "internal", Args, Return> {
  return makeFunctionReference<"mutation", Args, Return>(name) as unknown as FunctionReference<
    "mutation",
    "internal",
    Args,
    Return
  >;
}

function internalQueryRef<Args extends Record<string, unknown>, Return>(
  name: string,
): FunctionReference<"query", "internal", Args, Return> {
  return makeFunctionReference<"query", Args, Return>(name) as unknown as FunctionReference<
    "query",
    "internal",
    Args,
    Return
  >;
}

const createQueuedJobRef = makeFunctionReference<
  "mutation",
  {
    threadId: Id<"generationThreads">;
    mode: "audio";
    tier: "audio";
    resolvedModel: string;
    userPrompt: string;
    audioType: "voiceover" | "sfx" | "music";
    elevenVoiceId?: string;
    elevenVoiceName?: string;
    elevenPublicOwnerId?: string;
    durationSeconds?: number;
    audioLoop?: boolean;
    promptInfluence?: number;
    folderId?: Id<"folders">;
  },
  Id<"generationJobs">
>("generation:createQueuedJob");

const markStageRef = internalMutationRef<
  {
    jobId: Id<"generationJobs">;
    stage: "queued" | "generating" | "saving" | "done" | "failed";
    error?: string;
  },
  null
>("generation:markStage");

const createGeneratedAssetRef = internalMutationRef<
  {
    jobId: Id<"generationJobs">;
    name: string;
    kind: "audio";
    mimeType: string;
  },
  { assetId: Id<"assets">; bunnyPath: string }
>("generation:createGeneratedAsset");

const setGeneratedAssetStorageStatusRef = internalMutationRef<
  {
    jobId: Id<"generationJobs">;
    assetId: Id<"assets">;
    status: "ready" | "failed";
    byteSize?: number;
  },
  null
>("generation:setGeneratedAssetStorageStatus");

const completeWithOutputsRef = internalMutationRef<
  { jobId: Id<"generationJobs">; assetIds: Id<"assets">[] },
  null
>("generation:completeWithOutputs");

const getJobRef = internalQueryRef<
  { jobId: Id<"generationJobs"> },
  {
    _id: Id<"generationJobs">;
    stage: "queued" | "generating" | "saving" | "done" | "failed";
    error?: string;
    userPrompt: string;
    audioType?: "voiceover" | "sfx" | "music";
    elevenVoiceId?: string;
    elevenVoiceName?: string;
    elevenPublicOwnerId?: string;
    durationSeconds?: number;
    audioLoop?: boolean;
    promptInfluence?: number;
  } | null
>("generation:getJobForAudio");

const prepareApiAudioGenerationRef = internalMutationRef<
  {
    userId: Id<"users">;
    folderId: Id<"folders">;
    apiKeyId?: Id<"apiKeys">;
    userPrompt: string;
    title?: string;
    audioType: "voiceover" | "sfx";
    elevenVoiceId?: string;
    elevenVoiceName?: string;
    elevenPublicOwnerId?: string;
    durationSeconds?: number;
    audioLoop?: boolean;
    promptInfluence?: number;
  },
  { threadId: Id<"generationThreads">; jobId: Id<"generationJobs"> }
>("generation:prepareApiAudioGeneration");

type ExploreVoicesArgs = {
  search?: string;
  language?: string;
  accent?: string;
  gender?: string;
  age?: string;
  category?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
  minNoticePeriodDays?: number | null;
  includeCustomRates?: boolean | null;
  includeLiveModerated?: boolean | null;
};

type ExploreVoicesResult = {
  voices: SharedVoice[];
  hasMore: boolean;
  totalCount: number;
  libraryVoicesAvailable: boolean;
};

async function browseVoices(args: ExploreVoicesArgs): Promise<ExploreVoicesResult> {
  const sort = mapVoiceSort(args.sort) as SharedVoiceSort;
  const useCase = mapCategoryToUseCase(args.category);
  const page = Math.max(0, Math.floor(args.page ?? 0));
  const pageSize = normalizeVoicePageSize(args.pageSize);
  const canUseLibrary = libraryVoicesAvailable();

  // Premade/account voices work for TTS on current plan; show them first on page 0.
  let accountVoices: SharedVoice[] = [];
  if (page === 0 || !canUseLibrary) {
    try {
      accountVoices = await listAccountVoices();
      const q = args.search?.trim().toLowerCase();
      if (q) {
        accountVoices = accountVoices.filter(
          (voice) =>
            voice.name.toLowerCase().includes(q) ||
            voice.description?.toLowerCase().includes(q),
        );
      }
    } catch {
      accountVoices = [];
    }
  }

  // Hide voices the current plan can't use — no Unavailable tags in the UI.
  const usableAccount = accountVoices
    .filter((voice) => voiceUsableOnCurrentPlan(voice.category))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (!canUseLibrary) {
    const sliced = sliceVoicePage(usableAccount, page, pageSize);
    return {
      voices: sliced.voices,
      hasMore: sliced.hasMore,
      totalCount: sliced.totalCount,
      libraryVoicesAvailable: false,
    };
  }

  const shared = await listSharedVoices({
    search: args.search,
    language: args.language,
    accent: args.accent,
    gender: args.gender,
    age: args.age,
    useCases: useCase ? [useCase] : undefined,
    sort,
    page,
    pageSize,
    minNoticePeriodDays: args.minNoticePeriodDays,
    includeCustomRates: args.includeCustomRates,
    includeLiveModerated: args.includeLiveModerated,
  });

  const seen = new Set(usableAccount.map((voice) => voice.voiceId));
  if (page === 0) {
    const merged = [
      ...usableAccount,
      ...shared.voices.filter((voice) => !seen.has(voice.voiceId)),
    ];
    const sliced = sliceVoicePage(merged, 0, pageSize);
    return {
      voices: sliced.voices,
      hasMore: sliced.hasMore || shared.hasMore,
      totalCount: shared.totalCount + usableAccount.length,
      libraryVoicesAvailable: true,
    };
  }

  return {
    voices: shared.voices.filter((voice) => !seen.has(voice.voiceId)),
    hasMore: shared.hasMore,
    totalCount: shared.totalCount + usableAccount.length,
    libraryVoicesAvailable: true,
  };
}

const exploreVoicesArgs = {
  search: v.optional(v.string()),
  language: v.optional(v.string()),
  accent: v.optional(v.string()),
  gender: v.optional(v.string()),
  age: v.optional(v.string()),
  category: v.optional(v.string()),
  sort: v.optional(v.string()),
  page: v.optional(v.number()),
  pageSize: v.optional(v.number()),
  minNoticePeriodDays: v.optional(v.union(v.number(), v.null())),
  includeCustomRates: v.optional(v.union(v.boolean(), v.null())),
  includeLiveModerated: v.optional(v.union(v.boolean(), v.null())),
};

const exploreVoicesReturns = v.object({
  voices: v.array(
    v.object({
      voiceId: v.string(),
      publicOwnerId: v.string(),
      name: v.string(),
      description: v.optional(v.string()),
      previewUrl: v.optional(v.string()),
      imageUrl: v.optional(v.string()),
      language: v.optional(v.string()),
      accent: v.optional(v.string()),
      gender: v.optional(v.string()),
      age: v.optional(v.string()),
      useCase: v.optional(v.string()),
      category: v.optional(v.string()),
      descriptive: v.optional(v.string()),
      featured: v.optional(v.boolean()),
      clonedByCount: v.optional(v.number()),
    }),
  ),
  hasMore: v.boolean(),
  totalCount: v.number(),
  libraryVoicesAvailable: v.boolean(),
});

export const exploreVoices = action({
  args: exploreVoicesArgs,
  returns: exploreVoicesReturns,
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in to browse voices.");
    return await browseVoices(args);
  },
});

/** API-key path: userId is an auth gate only (ElevenLabs is account-level). */
export const exploreVoicesForApi = internalAction({
  args: {
    userId: v.id("users"),
    ...exploreVoicesArgs,
  },
  returns: exploreVoicesReturns,
  handler: async (_ctx, args) => {
    const { userId: _userId, ...filters } = args;
    return await browseVoices(filters);
  },
});

export const addVoiceToProvider = action({
  args: {
    publicOwnerId: v.string(),
    voiceId: v.string(),
    name: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in to save voices.");
    await addSharedVoice(args.publicOwnerId, args.voiceId, args.name);
    return null;
  },
});

/**
 * Client entry: create the job and return immediately.
 * Long TTS/SFX + upload runs in executeAudioJob so the websocket isn't held open.
 */
export const runAudioFlow = action({
  args: {
    threadId: v.id("generationThreads"),
    folderId: v.optional(v.id("folders")),
    userPrompt: v.string(),
    audioType: v.union(v.literal("voiceover"), v.literal("sfx"), v.literal("music")),
    elevenVoiceId: v.optional(v.string()),
    elevenVoiceName: v.optional(v.string()),
    elevenPublicOwnerId: v.optional(v.string()),
    durationSeconds: v.optional(v.number()),
    audioLoop: v.optional(v.boolean()),
    promptInfluence: v.optional(v.number()),
  },
  returns: v.object({
    jobId: v.id("generationJobs"),
    assetIds: v.optional(v.array(v.id("assets"))),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ jobId: Id<"generationJobs">; assetIds?: Id<"assets">[] }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in to generate audio.");
    if (args.audioType === "music") {
      throw new Error("Music generation is coming soon.");
    }

    const resolvedModel =
      args.audioType === "sfx"
        ? "elevenlabs/eleven_text_to_sound_v2"
        : "elevenlabs/eleven_v3";

    const jobId = await ctx.runMutation(createQueuedJobRef, {
      threadId: args.threadId,
      mode: "audio",
      tier: "audio",
      resolvedModel,
      userPrompt: args.userPrompt,
      audioType: args.audioType,
      elevenVoiceId: args.elevenVoiceId,
      elevenVoiceName: args.elevenVoiceName,
      elevenPublicOwnerId: args.elevenPublicOwnerId,
      durationSeconds: args.durationSeconds,
      audioLoop: args.audioLoop,
      promptInfluence: args.promptInfluence,
      folderId: args.folderId,
    });

    await ctx.scheduler.runAfter(0, internal.audioActions.executeAudioJob, {
      jobId,
    });
    return { jobId };
  },
});

/** API-key audio generation (credits + thread owned by API user, not session). */
export const runAudioForApi = internalAction({
  args: {
    userId: v.id("users"),
    folderId: v.id("folders"),
    apiKeyId: v.optional(v.id("apiKeys")),
    prompt: v.string(),
    audioType: v.union(v.literal("voiceover"), v.literal("sfx")),
    elevenVoiceId: v.optional(v.string()),
    elevenVoiceName: v.optional(v.string()),
    elevenPublicOwnerId: v.optional(v.string()),
    durationSeconds: v.optional(v.number()),
    audioLoop: v.optional(v.boolean()),
    promptInfluence: v.optional(v.number()),
    wait: v.optional(v.boolean()),
  },
  returns: v.object({
    jobId: v.id("generationJobs"),
    threadId: v.id("generationThreads"),
  }),
  handler: async (ctx, args) => {
    const prompt = args.prompt.trim();
    if (!prompt) {
      throw new Error(
        args.audioType === "sfx"
          ? "Describe the sound effect to generate."
          : "Enter voiceover text.",
      );
    }
    if (args.audioType === "voiceover" && !args.elevenVoiceId?.trim()) {
      throw new Error("Select a voice for the voiceover.");
    }

    const prepared = await ctx.runMutation(prepareApiAudioGenerationRef, {
      userId: args.userId,
      folderId: args.folderId,
      apiKeyId: args.apiKeyId,
      userPrompt: prompt,
      title: prompt.slice(0, 64) || "API audio",
      audioType: args.audioType,
      elevenVoiceId: args.elevenVoiceId,
      elevenVoiceName: args.elevenVoiceName,
      elevenPublicOwnerId: args.elevenPublicOwnerId,
      durationSeconds: args.durationSeconds,
      audioLoop: args.audioLoop,
      promptInfluence: args.promptInfluence,
    });

    await ctx.scheduler.runAfter(0, internal.audioActions.executeAudioJob, {
      jobId: prepared.jobId,
    });

    if (args.wait === false) {
      return prepared;
    }

    const deadline = Date.now() + 5 * 60_000;
    while (Date.now() < deadline) {
      const job = await ctx.runQuery(getJobRef, { jobId: prepared.jobId });
      if (!job) throw new Error("Audio job not found.");
      if (job.stage === "done" || job.stage === "failed") {
        if (job.stage === "failed") {
          throw new Error(job.error ?? "Audio generation failed");
        }
        return prepared;
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    // Still running — return job id so the client can poll.
    return prepared;
  },
});

export const executeAudioJob = internalAction({
  args: { jobId: v.id("generationJobs") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const jobId = args.jobId;
    try {
      await ctx.runMutation(markStageRef, { jobId, stage: "generating" });
      const job = await ctx.runQuery(getJobRef, { jobId });
      if (!job) throw new Error("Audio job not found.");

      let audio: { data: Uint8Array; mediaType: string };
      if (job.audioType === "sfx") {
        audio = await soundGeneration({
          text: job.userPrompt,
          durationSeconds: job.durationSeconds,
          loop: job.audioLoop,
          promptInfluence: job.promptInfluence,
        });
      } else {
        const voiceId = job.elevenVoiceId?.trim();
        if (!voiceId) throw new Error("Select a voice for the voiceover.");
        if (!isAccountVoiceOwnerId(job.elevenPublicOwnerId)) {
          if (!libraryVoicesAvailable()) {
            throw new Error(VOICE_UNAVAILABLE_USER_MESSAGE);
          }
          await addSharedVoice(
            job.elevenPublicOwnerId!.trim(),
            voiceId,
            job.elevenVoiceName,
          );
        } else if (!libraryVoicesAvailable()) {
          // Account list includes copied library voices; only premade works free.
          const accountVoices = await listAccountVoices();
          const match = accountVoices.find((voice) => voice.voiceId === voiceId);
          if (!match || !voiceUsableOnCurrentPlan(match.category)) {
            throw new Error(VOICE_UNAVAILABLE_USER_MESSAGE);
          }
        }
        audio = await textToSpeechV3({
          voiceId,
          text: job.userPrompt,
        });
      }

      await ctx.runMutation(markStageRef, { jobId, stage: "saving" });
      const voiceLabel = job.elevenVoiceName?.trim();
      const assetId = await saveAudioAsset(ctx, {
        jobId,
        name:
          job.audioType === "sfx"
            ? `Sound effect${jobId.slice(-4) ? ` ${jobId.slice(-4)}` : ""}`
            : voiceLabel
              ? `${voiceLabel} voiceover`
              : "Voiceover",
        mediaType: audio.mediaType,
        body: audio.data,
      });
      await ctx.runMutation(completeWithOutputsRef, {
        jobId,
        assetIds: [assetId],
      });
      return null;
    } catch (error) {
      const raw =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : "Audio generation failed";
      const message =
        /voice is unavailable|Select a voice|Enter text|Describe the sound/i.test(raw)
          ? raw
          : friendlyGenerationErrorText(raw);
      await ctx.runMutation(markStageRef, {
        jobId,
        stage: "failed",
        error: message,
      });
      return null;
    }
  },
});

async function saveAudioAsset(
  ctx: ActionCtx,
  args: {
    jobId: Id<"generationJobs">;
    name: string;
    mediaType: string;
    body: Uint8Array;
  },
): Promise<Id<"assets">> {
  const asset = await ctx.runMutation(createGeneratedAssetRef, {
    jobId: args.jobId,
    name: args.name,
    kind: "audio",
    mimeType: args.mediaType,
  });
  try {
    await putObject({
      path: asset.bunnyPath,
      body: args.body,
      contentType: args.mediaType,
    });
    await ctx.runMutation(setGeneratedAssetStorageStatusRef, {
      jobId: args.jobId,
      assetId: asset.assetId,
      status: "ready",
      byteSize: args.body.byteLength,
    });
    return asset.assetId;
  } catch (error) {
    await ctx.runMutation(setGeneratedAssetStorageStatusRef, {
      jobId: args.jobId,
      assetId: asset.assetId,
      status: "failed",
    });
    throw error;
  }
}
