"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { makeFunctionReference, type FunctionReference } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { putObject, signBunnyCdnUrl } from "./lib/bunny";
import {
  addSharedVoice,
  clampMusicDurationSeconds,
  composeMusic,
  composeMusicDetailed,
  composeMusicFromPromptWithPlan,
  extendStoredMusic,
  appendCustomLyricsToMusicPrompt,
  injectCustomLyricsIntoMusicPlan,
  isAccountVoiceOwnerId,
  libraryVoicesAvailable,
  listAccountVoices,
  listSharedVoices,
  mapCategoryToUseCase,
  mapVoiceSort,
  normalizeVoicePageSize,
  resolveMusicModelId,
  separateMusicStems,
  sliceVoicePage,
  soundGeneration,
  textToSpeechV3,
  VOICE_UNAVAILABLE_USER_MESSAGE,
  voiceUsableOnCurrentPlan,
  type MusicCompositionPlan,
  type SharedVoice,
  type SharedVoiceSort,
} from "./lib/elevenlabs";
import { voiceMatchesExploreFilters } from "./lib/voiceExploreFilters";
import { friendlyGenerationErrorText } from "./lib/generationUserErrors";
import { generationAssetFileName } from "./lib/generationAssetNames";

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
    forceInstrumental?: boolean;
    musicWorkflow?: "composition_plan" | "prompt" | "extend";
    musicModelId?: "music_v1" | "music_v2";
    musicFinetuneId?: string;
    musicCustomLyrics?: string;
    musicCompositionPlanJson?: string;
    musicStoreForInpainting?: boolean;
    musicSourceSongId?: string;
    musicKeepMs?: number;
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
    forceInstrumental?: boolean;
    musicWorkflow?: "composition_plan" | "prompt" | "extend";
    musicModelId?: "music_v1" | "music_v2";
    musicFinetuneId?: string;
    musicCustomLyrics?: string;
    musicCompositionPlanJson?: string;
    musicStoreForInpainting?: boolean;
    musicSourceSongId?: string;
    musicKeepMs?: number;
    elevenMusicSongId?: string;
    musicPlanResultJson?: string;
    resolvedModel?: string;
  } | null
>("generation:getJobForAudio");

const patchMusicJobResultRef = internalMutationRef<
  {
    jobId: Id<"generationJobs">;
    elevenMusicSongId?: string;
    musicPlanResultJson?: string;
  },
  null
>("generation:patchMusicJobResult");

const prepareApiAudioGenerationRef = internalMutationRef<
  {
    userId: Id<"users">;
    folderId: Id<"folders">;
    apiKeyId?: Id<"apiKeys">;
    userPrompt: string;
    title?: string;
    audioType: "voiceover" | "sfx" | "music";
    elevenVoiceId?: string;
    elevenVoiceName?: string;
    elevenPublicOwnerId?: string;
    durationSeconds?: number;
    audioLoop?: boolean;
    promptInfluence?: number;
    forceInstrumental?: boolean;
    musicWorkflow?: "composition_plan" | "prompt" | "extend";
    musicModelId?: "music_v1" | "music_v2";
    musicFinetuneId?: string;
    musicCustomLyrics?: string;
    musicCompositionPlanJson?: string;
    musicStoreForInpainting?: boolean;
    musicSourceSongId?: string;
    musicKeepMs?: number;
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
  // Always honor language/gender/accent/age/category — previously filters only hit shared library.
  let accountVoices: SharedVoice[] = [];
  if (page === 0 || !canUseLibrary) {
    try {
      accountVoices = await listAccountVoices();
    } catch {
      accountVoices = [];
    }
  }

  const exploreFilters = {
    search: args.search,
    language: args.language,
    accent: args.accent,
    gender: args.gender,
    age: args.age,
    category: args.category,
  };

  // Hide voices the current plan can't use — no Unavailable tags in the UI.
  const usableAccount = accountVoices
    .filter((voice) => voiceUsableOnCurrentPlan(voice.category))
    .filter((voice) => voiceMatchesExploreFilters(voice, exploreFilters))
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
    forceInstrumental: v.optional(v.boolean()),
    musicWorkflow: v.optional(
      v.union(
        v.literal("composition_plan"),
        v.literal("prompt"),
        v.literal("extend"),
      ),
    ),
    musicModelId: v.optional(v.union(v.literal("music_v1"), v.literal("music_v2"))),
    musicFinetuneId: v.optional(v.string()),
    musicCustomLyrics: v.optional(v.string()),
    musicCompositionPlanJson: v.optional(v.string()),
    musicStoreForInpainting: v.optional(v.boolean()),
    musicSourceSongId: v.optional(v.string()),
    musicKeepMs: v.optional(v.number()),
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

    const musicModel =
      args.audioType === "music" ? resolveMusicModelId(args.musicModelId) : undefined;
    const resolvedModel =
      args.audioType === "sfx"
        ? "elevenlabs/eleven_text_to_sound_v2"
        : args.audioType === "music"
          ? `elevenlabs/${musicModel}`
          : "elevenlabs/eleven_v3";

    const durationSeconds =
      args.audioType === "music"
        ? args.durationSeconds == null || !Number.isFinite(args.durationSeconds)
          ? undefined
          : clampMusicDurationSeconds(args.durationSeconds)
        : args.durationSeconds;

    const musicWorkflow =
      args.audioType === "music"
        ? (args.musicWorkflow ?? "composition_plan")
        : undefined;

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
      durationSeconds,
      audioLoop: args.audioLoop,
      promptInfluence: args.promptInfluence,
      forceInstrumental:
        args.audioType === "music" ? (args.forceInstrumental ?? true) : undefined,
      musicWorkflow,
      musicModelId: musicModel,
      musicFinetuneId:
        args.audioType === "music" ? args.musicFinetuneId?.trim() || undefined : undefined,
      musicCustomLyrics:
        args.audioType === "music" ? args.musicCustomLyrics?.trim() || undefined : undefined,
      musicCompositionPlanJson:
        args.audioType === "music" ? args.musicCompositionPlanJson : undefined,
      musicStoreForInpainting:
        args.audioType === "music"
          ? (args.musicStoreForInpainting ?? true)
          : undefined,
      musicSourceSongId:
        args.audioType === "music" ? args.musicSourceSongId : undefined,
      musicKeepMs: args.audioType === "music" ? args.musicKeepMs : undefined,
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
    audioType: v.union(v.literal("voiceover"), v.literal("sfx"), v.literal("music")),
    elevenVoiceId: v.optional(v.string()),
    elevenVoiceName: v.optional(v.string()),
    elevenPublicOwnerId: v.optional(v.string()),
    durationSeconds: v.optional(v.number()),
    audioLoop: v.optional(v.boolean()),
    promptInfluence: v.optional(v.number()),
    forceInstrumental: v.optional(v.boolean()),
    musicWorkflow: v.optional(
      v.union(
        v.literal("composition_plan"),
        v.literal("prompt"),
        v.literal("extend"),
      ),
    ),
    musicModelId: v.optional(v.union(v.literal("music_v1"), v.literal("music_v2"))),
    musicFinetuneId: v.optional(v.string()),
    musicCustomLyrics: v.optional(v.string()),
    musicCompositionPlanJson: v.optional(v.string()),
    musicStoreForInpainting: v.optional(v.boolean()),
    musicSourceSongId: v.optional(v.string()),
    musicKeepMs: v.optional(v.number()),
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
          : args.audioType === "music"
            ? "Describe the music to generate."
            : "Enter voiceover text.",
      );
    }
    if (args.audioType === "voiceover" && !args.elevenVoiceId?.trim()) {
      throw new Error("Select a voice for the voiceover.");
    }

    const durationSeconds =
      args.audioType === "music"
        ? args.durationSeconds == null || !Number.isFinite(args.durationSeconds)
          ? undefined
          : clampMusicDurationSeconds(args.durationSeconds)
        : args.durationSeconds;

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
      durationSeconds,
      audioLoop: args.audioLoop,
      promptInfluence: args.promptInfluence,
      forceInstrumental:
        args.audioType === "music" ? (args.forceInstrumental ?? true) : undefined,
      musicWorkflow:
        args.audioType === "music"
          ? (args.musicWorkflow ?? "composition_plan")
          : undefined,
      musicModelId:
        args.audioType === "music"
          ? resolveMusicModelId(args.musicModelId)
          : undefined,
      musicFinetuneId:
        args.audioType === "music" ? args.musicFinetuneId?.trim() || undefined : undefined,
      musicCustomLyrics:
        args.audioType === "music" ? args.musicCustomLyrics?.trim() || undefined : undefined,
      musicCompositionPlanJson:
        args.audioType === "music" ? args.musicCompositionPlanJson : undefined,
      musicStoreForInpainting:
        args.audioType === "music"
          ? (args.musicStoreForInpainting ?? true)
          : undefined,
      musicSourceSongId:
        args.audioType === "music" ? args.musicSourceSongId : undefined,
      musicKeepMs: args.audioType === "music" ? args.musicKeepMs : undefined,
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
      const audioType =
        job.audioType ??
        (/music_v2|elevenlabs\/music/i.test(job.resolvedModel ?? "")
          ? "music"
          : /text_to_sound|sound_v2/i.test(job.resolvedModel ?? "")
            ? "sfx"
            : "voiceover");
      if (audioType === "sfx") {
        audio = await soundGeneration({
          text: job.userPrompt,
          durationSeconds: job.durationSeconds,
          loop: job.audioLoop,
          promptInfluence: job.promptInfluence,
        });
      } else if (audioType === "music") {
        const workflow = job.musicWorkflow ?? "composition_plan";
        const store = job.musicStoreForInpainting ?? true;
        const customLyrics = job.musicCustomLyrics?.trim() || "";
        let plan: MusicCompositionPlan | undefined;
        if (job.musicCompositionPlanJson?.trim()) {
          try {
            plan = JSON.parse(job.musicCompositionPlanJson) as MusicCompositionPlan;
          } catch {
            throw new Error("Invalid music composition plan JSON.");
          }
        }
        if (plan && customLyrics) {
          plan = injectCustomLyricsIntoMusicPlan(plan, customLyrics);
        }
        let musicResult;
        if (workflow === "extend") {
          const songId = job.musicSourceSongId?.trim();
          if (!songId) throw new Error("Select a stored music track to extend.");
          const keepMs =
            job.musicKeepMs != null && Number.isFinite(job.musicKeepMs)
              ? Math.max(50, Math.floor(job.musicKeepMs))
              : Math.max(
                  50,
                  Math.floor((job.durationSeconds ?? 30) * 1000 * 0.66),
                );
          const extendMs = Math.max(
            3000,
            Math.floor(clampMusicDurationSeconds(job.durationSeconds) * 1000) -
              keepMs,
          );
          musicResult = await extendStoredMusic({
            songId,
            keepMs,
            extendMs: Math.max(3000, extendMs),
            prompt: job.userPrompt,
            storeForInpainting: store,
          });
        } else if (plan) {
          musicResult = await composeMusicDetailed({
            compositionPlan: plan,
            storeForInpainting: store,
            modelId: job.musicModelId,
            finetuneId: job.musicFinetuneId,
          });
        } else if (workflow === "prompt") {
          const prompt = customLyrics
            ? appendCustomLyricsToMusicPrompt(job.userPrompt, customLyrics)
            : job.userPrompt;
          musicResult = store
            ? await composeMusicDetailed({
                prompt,
                durationSeconds: job.durationSeconds,
                forceInstrumental: job.forceInstrumental ?? true,
                storeForInpainting: true,
                modelId: job.musicModelId,
                finetuneId: job.musicFinetuneId,
              })
            : await composeMusic({
                prompt,
                durationSeconds: job.durationSeconds,
                forceInstrumental: job.forceInstrumental ?? true,
                modelId: job.musicModelId,
                finetuneId: job.musicFinetuneId,
              });
        } else {
          musicResult = await composeMusicFromPromptWithPlan({
            prompt: job.userPrompt,
            durationSeconds: job.durationSeconds,
            forceInstrumental: job.forceInstrumental ?? true,
            storeForInpainting: store,
            modelId: job.musicModelId,
            finetuneId: job.musicFinetuneId,
            customLyrics: customLyrics || undefined,
          });
        }
        const planJson = musicResult.compositionPlan
          ? JSON.stringify(musicResult.compositionPlan)
          : "sourcePlan" in musicResult && musicResult.sourcePlan
            ? JSON.stringify(musicResult.sourcePlan)
            : undefined;
        if (musicResult.songId || planJson) {
          await ctx.runMutation(patchMusicJobResultRef, {
            jobId,
            elevenMusicSongId: musicResult.songId,
            musicPlanResultJson: planJson,
          });
        }
        audio = { data: musicResult.data, mediaType: musicResult.mediaType };
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
      const audioKind =
        audioType === "sfx" ? "sfx" : audioType === "music" ? "music" : "audio";
      const assetId = await saveAudioAsset(ctx, {
        jobId,
        name: generationAssetFileName({
          kind: audioKind,
          prompt: job.userPrompt,
          voiceName: job.elevenVoiceName,
          uniqueId: jobId,
          extension: audio.mediaType.includes("wav")
            ? "wav"
            : audio.mediaType.includes("ogg")
              ? "ogg"
              : "mp3",
        }),
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
        /voice is unavailable|Select a voice|Enter text|Describe the sound|Describe the music/i.test(
          raw,
        )
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

/**
 * Separate stems from an existing Studio audio asset (ElevenLabs stem-separation).
 * Saves the provider result into the same folder via a queued audio job.
 */
export const separateStemsFromAsset = action({
  args: {
    assetId: v.id("assets"),
  },
  returns: v.object({ jobId: v.id("generationJobs") }),
  handler: async (ctx, args): Promise<{ jobId: Id<"generationJobs"> }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in to separate stems.");
    const asset = await ctx.runQuery(internal.videoEditInternal.getAssetForExport, {
      userId,
      assetId: args.assetId,
    });
    if (!asset?.bunnyPath) throw new Error("Audio asset not found.");
    if (asset.kind !== "audio") throw new Error("Stem separation requires an audio file.");

    const prepared: { threadId: Id<"generationThreads">; jobId: Id<"generationJobs"> } =
      await ctx.runMutation(prepareApiAudioGenerationRef, {
        userId,
        folderId: asset.folderId,
        userPrompt: `Stem separation: ${asset.name}`,
        title: `Stems — ${asset.name}`.slice(0, 64),
        audioType: "music",
        durationSeconds: 30,
        musicWorkflow: "prompt",
        forceInstrumental: true,
      });
    await ctx.scheduler.runAfter(0, internal.audioActions.executeStemSeparationJob, {
      jobId: prepared.jobId,
      assetId: args.assetId,
      userId,
    });
    return { jobId: prepared.jobId };
  },
});

export const executeStemSeparationJob = internalAction({
  args: {
    jobId: v.id("generationJobs"),
    assetId: v.id("assets"),
    userId: v.id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      await ctx.runMutation(markStageRef, { jobId: args.jobId, stage: "generating" });
      const asset = await ctx.runQuery(internal.videoEditInternal.getAssetForExport, {
        userId: args.userId,
        assetId: args.assetId,
      });
      if (!asset?.bunnyPath) throw new Error("Audio asset not found.");
      const url = await signBunnyCdnUrl(
        asset.bunnyPath,
        Math.floor(Date.now() / 1000) + 60 * 60,
      );
      const downloaded = await fetch(url);
      if (!downloaded.ok) {
        throw new Error(`Could not download audio for stem separation (${downloaded.status}).`);
      }
      const bytes = new Uint8Array(await downloaded.arrayBuffer());
      const stems = await separateMusicStems({
        fileBytes: bytes,
        fileName: asset.name,
        mimeType: "audio/mpeg",
      });
      await ctx.runMutation(markStageRef, { jobId: args.jobId, stage: "saving" });
      const ext = stems.mediaType.includes("zip")
        ? "zip"
        : stems.mediaType.includes("wav")
          ? "wav"
          : "mp3";
      const assetId = await saveAudioAsset(ctx, {
        jobId: args.jobId,
        name: generationAssetFileName({
          kind: "music",
          prompt: `stems ${asset.name}`,
          uniqueId: args.jobId,
          extension: ext,
        }),
        mediaType: stems.mediaType.includes("zip")
          ? "application/zip"
          : stems.mediaType,
        body: stems.data,
      });
      await ctx.runMutation(completeWithOutputsRef, {
        jobId: args.jobId,
        assetIds: [assetId],
      });
      return null;
    } catch (error) {
      const raw =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : "Stem separation failed";
      await ctx.runMutation(markStageRef, {
        jobId: args.jobId,
        stage: "failed",
        error: /stem|forbidden|enterprise|permission/i.test(raw)
          ? raw
          : friendlyGenerationErrorText(raw),
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
    if (args.body.byteLength < 512) {
      throw new Error("Audio came back empty — try again.");
    }
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
