import { creditCostForGeneration } from "./generationPricing";
import type {
  AssistedBriefPayload,
  AssistedMode,
  AttachmentRole,
  CompilerKind,
  VideoType,
} from "./guidedVideoTypes";
import { resolveCompilerKind } from "./hypermotionWorkflow";
import type { VideoModelDef, VideoModelSlug } from "./videoModels";

export const ASSISTANCE_PLAN_VERSION = 1 as const;
export const ASSISTANCE_PRICING_VERSION = "generation-pricing-v3-gemini-3.1-pro";

export function canReuseAssistanceMediaJob(
  stage: "queued" | "generating" | "saving" | "done" | "failed" | undefined,
): boolean {
  return stage !== undefined && stage !== "failed";
}

export type AssistanceReferenceManifestItem = {
  kind: "asset" | "document" | "element" | "style_sheet_visual";
  id: string;
  role: AttachmentRole;
  mediaKind?: "image" | "video" | "audio";
  label?: string;
  sortOrder: number;
};

export type AssistanceStyleContext = {
  elementId: string;
  name: string;
  styleRules?: string;
  renderMode?: "photoreal" | "illustrated_2d" | "illustrated_3d" | "mixed";
  sheetAssetId?: string;
  instructions: string;
};

export type AssistanceGenerationPlan = {
  version: typeof ASSISTANCE_PLAN_VERSION;
  mode: AssistedMode;
  videoType?: VideoType;
  compiler: CompilerKind;
  finalPrompt: string;
  references: AssistanceReferenceManifestItem[];
  settings: {
    resolvedModel: string;
    videoModel?: VideoModelSlug;
    aspectRatio?: string;
    resolution?: string;
    quality?: string;
    durationSeconds?: number;
    audioEnabled: boolean;
    skipPromptEnhancement: boolean;
    stylePresetId?: string;
    styleSheetElementId?: string;
  };
  capabilities?: {
    requiresStartFrame: boolean;
    supportsMultimodalRefs: boolean;
    maxDurationSeconds?: number;
  };
  style?: AssistanceStyleContext;
  warnings: string[];
  estimate: {
    credits?: number;
    pricingVersion: typeof ASSISTANCE_PRICING_VERSION;
    inputs: {
      tier?: "image" | "pro_video";
      hasReferenceInput: boolean;
      hasVideoReferenceInput: boolean;
      hasNonVideoReferenceInput: boolean;
      audioEnabled: boolean;
      videoModel?: VideoModelSlug;
    };
  };
  fingerprint: string;
};

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value;
}

export function assistancePlanFingerprint(value: unknown): string {
  const input = JSON.stringify(stableValue(value));
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `ap1-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function parseAssistanceGenerationPlan(
  value: string | undefined,
): AssistanceGenerationPlan | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as AssistanceGenerationPlan;
    if (
      parsed?.version !== ASSISTANCE_PLAN_VERSION ||
      typeof parsed.finalPrompt !== "string" ||
      typeof parsed.fingerprint !== "string" ||
      !Array.isArray(parsed.references)
    ) {
      return undefined;
    }
    const unsigned = { ...parsed } as Partial<AssistanceGenerationPlan>;
    delete unsigned.fingerprint;
    if (assistancePlanFingerprint(unsigned) !== parsed.fingerprint) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

export function buildAssistanceGenerationPlan(args: {
  mode: AssistedMode;
  videoType?: VideoType;
  payload: AssistedBriefPayload;
  compiledPrompt: string;
  references: AssistanceReferenceManifestItem[];
  warnings?: string[];
  resolvedModel: string;
  videoModel?: VideoModelSlug;
  videoCapabilities?: Pick<
    VideoModelDef,
    "requiresStartFrame" | "supportsMultimodalRefs" | "maxDurationSeconds"
  >;
  stylePresetId?: string;
  style?: AssistanceStyleContext;
}): AssistanceGenerationPlan {
  const references = [...args.references]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
    .filter(
      (item, index, all) =>
        all.findIndex((candidate) => candidate.kind === item.kind && candidate.id === item.id) ===
        index,
    );
  const mediaReferences = references.filter((item) => item.mediaKind);
  const hasReferenceInput =
    args.mode === "image"
      ? mediaReferences.some((item) => item.mediaKind === "image")
      : mediaReferences.length > 0;
  const hasVideoReferenceInput = mediaReferences.some((item) => item.mediaKind === "video");
  const hasNonVideoReferenceInput = mediaReferences.some(
    (item) => item.mediaKind === "image" || item.mediaKind === "audio",
  );
  const audioEnabled =
    args.payload.audio.voiceover === "include" ||
    args.payload.audio.sfx === "include" ||
    args.payload.audio.music === "include";
  const durationSeconds =
    args.mode === "video"
      ? Math.max(
          4,
          Math.min(
            args.videoCapabilities?.maxDurationSeconds ?? 15,
            Math.ceil(Number(args.payload.production.durationSeconds) || 4),
          ),
        )
      : args.payload.production.durationSeconds;
  const finalPrompt = [args.style?.instructions, args.compiledPrompt]
    .filter((part): part is string => Boolean(part?.trim()))
    .join("\n\n")
    .trim();
  const tier =
    args.mode === "video" ? ("pro_video" as const) : args.mode === "image" ? ("image" as const) : undefined;
  const credits = tier
    ? creditCostForGeneration({
        tier,
        resolution: args.payload.production.resolution,
        quality: args.payload.production.quality,
        aspectRatio: args.payload.production.aspectRatio,
        durationSeconds,
        hasReferenceInput,
        hasVideoReferenceInput,
        hasNonVideoReferenceInput,
        audioEnabled,
        videoModel: args.videoModel,
      })
    : undefined;
  const unsigned: Omit<AssistanceGenerationPlan, "fingerprint"> = {
    version: ASSISTANCE_PLAN_VERSION,
    mode: args.mode,
    videoType: args.mode === "video" ? args.videoType ?? "standard" : undefined,
    compiler: resolveCompilerKind(args.mode, args.videoType),
    finalPrompt,
    references,
    settings: {
      resolvedModel: args.resolvedModel,
      videoModel: args.mode === "video" ? args.videoModel : undefined,
      aspectRatio: args.payload.production.aspectRatio,
      resolution: args.payload.production.resolution,
      quality: args.payload.production.quality,
      durationSeconds,
      audioEnabled,
      skipPromptEnhancement: true,
      stylePresetId: args.stylePresetId,
      styleSheetElementId: args.style?.elementId,
    },
    capabilities: args.videoCapabilities
      ? {
          requiresStartFrame: args.videoCapabilities.requiresStartFrame,
          supportsMultimodalRefs: args.videoCapabilities.supportsMultimodalRefs,
          maxDurationSeconds: args.videoCapabilities.maxDurationSeconds,
        }
      : undefined,
    style: args.style,
    warnings: [...new Set(args.warnings ?? [])],
    estimate: {
      credits,
      pricingVersion: ASSISTANCE_PRICING_VERSION,
      inputs: {
        tier,
        hasReferenceInput,
        hasVideoReferenceInput,
        hasNonVideoReferenceInput,
        audioEnabled,
        videoModel: args.mode === "video" ? args.videoModel : undefined,
      },
    },
  };
  return { ...unsigned, fingerprint: assistancePlanFingerprint(unsigned) };
}
