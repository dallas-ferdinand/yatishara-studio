export type VideoModelSlug =
  | "seedance-2.5"
  | "seedance-2.0"
  | "google-omni-flash"
  | "kling-3.0-i2v";

/** MCP/API-only models — hidden from Studio UI composer. */
export const MCP_EXPLICIT_VIDEO_MODEL_SLUGS: VideoModelSlug[] = [
  "kling-3.0-i2v",
  "google-omni-flash",
];

export type VideoResolutionOption = {
  value: string;
  label: string;
  meta: string;
  gatewayLabel: "480p" | "720p" | "1080p" | "4k";
};

export type VideoModelDef = {
  slug: VideoModelSlug;
  label: string;
  gatewayModelId: string;
  description: string;
  requiresStartFrame: boolean;
  supportsMultimodalRefs: boolean;
  /** Max output seconds supported by the provider. */
  maxDurationSeconds: number;
  /** Composer/API resolution chips (Studio WxH values). */
  resolutionOptions: VideoResolutionOption[];
  /** Duration preset chips for the composer. */
  durationPresets: number[];
  /** When false, model stays API/MCP-wired but hidden from Studio composer UI. */
  uiVisible?: boolean;
};

export type VideoReferenceKind = "image" | "video" | "audio";

export type VideoCapabilityRequest = {
  durationSeconds?: number;
  hasStartFrame?: boolean;
  referenceKinds?: readonly VideoReferenceKind[];
  /** Use when the caller has already reduced references to a presence flag. */
  hasMultimodalReferences?: boolean;
  surface?: "studio" | "api" | "internal";
  resolution?: string;
};

const SEEDANCE_25_RESOLUTIONS: VideoResolutionOption[] = [
  { value: "854x480", label: "480p", meta: "Draft", gatewayLabel: "480p" },
  { value: "1280x720", label: "720p", meta: "Max", gatewayLabel: "720p" },
];

const SEEDANCE_20_RESOLUTIONS: VideoResolutionOption[] = [
  { value: "854x480", label: "480p", meta: "Draft", gatewayLabel: "480p" },
  { value: "1280x720", label: "720p", meta: "Standard", gatewayLabel: "720p" },
  { value: "1920x1080", label: "1080p", meta: "HD", gatewayLabel: "1080p" },
  { value: "3840x2160", label: "4K", meta: "Max", gatewayLabel: "4k" },
];

export const VIDEO_MODELS: VideoModelDef[] = [
  {
    slug: "seedance-2.5",
    label: "Seedance 2.5",
    gatewayModelId: "bytedance/seedance-2.5",
    description: "Default — up to 30s, 480p/720p",
    requiresStartFrame: false,
    supportsMultimodalRefs: true,
    maxDurationSeconds: 30,
    resolutionOptions: SEEDANCE_25_RESOLUTIONS,
    durationPresets: [4, 8, 15, 30],
    uiVisible: true,
  },
  {
    slug: "seedance-2.0",
    label: "Seedance 2.0",
    gatewayModelId: "bytedance/seedance-2.0",
    description: "Up to 15s — 480p/720p/1080p/4K",
    requiresStartFrame: false,
    supportsMultimodalRefs: true,
    maxDurationSeconds: 15,
    resolutionOptions: SEEDANCE_20_RESOLUTIONS,
    durationPresets: [4, 8, 12, 15],
    uiVisible: true,
  },
  {
    slug: "google-omni-flash",
    label: "Omni Flash",
    gatewayModelId: "google/gemini-omni-flash-preview",
    description: "Omni Flash",
    requiresStartFrame: false,
    supportsMultimodalRefs: true,
    maxDurationSeconds: 10,
    resolutionOptions: SEEDANCE_25_RESOLUTIONS,
    durationPresets: [4, 6, 8, 10],
    uiVisible: false,
  },
  {
    slug: "kling-3.0-i2v",
    label: "Kling",
    gatewayModelId: "klingai/kling-v3.0-i2v",
    description: "Kling",
    requiresStartFrame: true,
    supportsMultimodalRefs: false,
    maxDurationSeconds: 15,
    resolutionOptions: [
      { value: "1280x720", label: "720p", meta: "Standard", gatewayLabel: "720p" },
      { value: "1920x1080", label: "1080p", meta: "HD", gatewayLabel: "1080p" },
    ],
    durationPresets: [4, 8, 12, 15],
    uiVisible: false,
  },
];

export function defaultVideoModelSlug(): VideoModelSlug {
  const env = process.env.GATEWAY_VIDEO_MODEL_ID ?? "bytedance/seedance-2.5";
  const match = VIDEO_MODELS.find((model) => model.gatewayModelId === env);
  return match?.slug ?? "seedance-2.5";
}

export function resolveVideoModel(slug?: string | null): VideoModelDef {
  const normalized = slug?.trim();
  if (normalized) {
    const found = VIDEO_MODELS.find(
      (model) => model.slug === normalized || model.gatewayModelId === normalized,
    );
    if (found) return found;
    throw new Error(
      `Unknown video model: ${normalized}. Use seedance-2.5, seedance-2.0, google-omni-flash, or kling-3.0-i2v.`,
    );
  }
  return (
    VIDEO_MODELS.find((model) => model.slug === defaultVideoModelSlug()) ?? VIDEO_MODELS[0]
  );
}

/** Public API / MCP — uiVisible models by default; MCP explicit slugs when caller passes videoModel. */
export function resolvePublicVideoModel(slug?: string | null): VideoModelDef {
  const normalized = slug?.trim() as VideoModelSlug | undefined;
  if (normalized && MCP_EXPLICIT_VIDEO_MODEL_SLUGS.includes(normalized)) {
    return resolveVideoModel(normalized);
  }
  const model = resolveVideoModel(slug);
  if (model.uiVisible === false) {
    throw new Error(
      `${model.label} is not available. Pass seedance-2.5 or seedance-2.0, or use an MCP-only model explicitly.`,
    );
  }
  return model;
}

export function isResolutionAllowedForModel(
  model: VideoModelDef,
  resolution?: string,
): boolean {
  if (!resolution?.trim()) return true;
  const key = resolution.trim().toLowerCase().replace(/×/g, "x");
  return model.resolutionOptions.some((opt) => {
    const v = opt.value.toLowerCase();
    const g = opt.gatewayLabel.toLowerCase();
    return (
      key === v ||
      key === g ||
      key === `${g}p` ||
      (g === "4k" && (key === "4k" || key === "2160p" || key.includes("3840")))
    );
  });
}

/**
 * Resolve and validate provider constraints before credits are reserved.
 */
export function validateVideoModelCapabilities(
  slugOrGatewayId: string | null | undefined,
  request: VideoCapabilityRequest,
): VideoModelDef {
  const model = resolveVideoModel(slugOrGatewayId);
  const duration = Number(request.durationSeconds ?? 4);
  const maxDuration = model.maxDurationSeconds;

  if (!Number.isFinite(duration) || duration < 4 || duration > maxDuration) {
    throw new Error(
      `${model.label} video duration must be between 4 and ${maxDuration} seconds.`,
    );
  }
  if (model.requiresStartFrame && !request.hasStartFrame) {
    throw new Error(`${model.label} requires a start frame.`);
  }
  if (request.resolution && !isResolutionAllowedForModel(model, request.resolution)) {
    const allowed = model.resolutionOptions.map((o) => o.label).join(", ");
    throw new Error(
      `${model.label} does not support that resolution. Use ${allowed}.`,
    );
  }

  const hasMultimodalReferences =
    request.hasMultimodalReferences === true ||
    Boolean(request.referenceKinds?.length);
  if (!model.supportsMultimodalRefs && hasMultimodalReferences) {
    const kinds = [...new Set(request.referenceKinds ?? [])];
    const suffix = kinds.length ? ` (${kinds.join(", ")})` : "";
    throw new Error(`${model.label} does not support multimodal references${suffix}.`);
  }
  if (request.surface === "studio" && model.uiVisible === false) {
    throw new Error(`${model.label} is not available in Studio.`);
  }

  return model;
}

export type GenerationMode = "image" | "video" | "audio";
export type GenerationBillingTier = "image" | "pro_video" | "audio";

/** Billing tier is an invariant of generation mode, never caller authority. */
export function billingTierForMode(mode: GenerationMode): GenerationBillingTier {
  if (mode === "video") return "pro_video";
  if (mode === "audio") return "audio";
  return "image";
}

export function isSeedanceGatewayModel(modelId: string): boolean {
  return modelId.includes("seedance");
}

export function isSeedance25GatewayModel(modelId: string): boolean {
  return modelId.includes("seedance-2.5");
}

export function isKlingGatewayModel(modelId: string): boolean {
  return modelId.includes("kling");
}

export function isOmniFlashGatewayModel(modelId: string): boolean {
  return (
    modelId.includes("gemini-omni-flash") ||
    modelId.includes("google-omni-flash") ||
    modelId === "google/gemini-omni-flash-preview"
  );
}

export function videoPricingModelFromGatewayId(gatewayModelId: string): VideoModelSlug {
  if (gatewayModelId.includes("kling")) {
    return "kling-3.0-i2v";
  }
  if (isOmniFlashGatewayModel(gatewayModelId)) {
    return "google-omni-flash";
  }
  if (isSeedance25GatewayModel(gatewayModelId)) {
    return "seedance-2.5";
  }
  if (gatewayModelId.includes("seedance-2.0")) {
    return "seedance-2.0";
  }
  return "seedance-2.5";
}

export function videoPricingModelFromSlug(slug?: string | null): VideoModelSlug {
  return resolveVideoModel(slug).slug;
}

export function listVideoModelsForMcp(): Array<{
  slug: VideoModelSlug;
  label: string;
  description: string;
  requiresStartFrame: boolean;
  supportsMultimodalRefs: boolean;
  maxDurationSeconds: number;
  resolutions: string[];
  isDefault: boolean;
  mcpOnly: boolean;
}> {
  const defaultSlug = defaultVideoModelSlug();
  return VIDEO_MODELS.map((model) => ({
    slug: model.slug,
    label: model.label,
    description: model.description,
    requiresStartFrame: model.requiresStartFrame,
    supportsMultimodalRefs: model.supportsMultimodalRefs,
    maxDurationSeconds: model.maxDurationSeconds,
    resolutions: model.resolutionOptions.map((o) => o.gatewayLabel),
    isDefault: model.slug === defaultSlug,
    mcpOnly: model.uiVisible === false,
  }));
}

export function listVideoModelsPublic(options?: { uiOnly?: boolean }): Array<{
  slug: VideoModelSlug;
  label: string;
  description: string;
  requiresStartFrame: boolean;
  supportsMultimodalRefs: boolean;
  isDefault: boolean;
  maxDurationSeconds: number;
  resolutionOptions: VideoResolutionOption[];
  durationPresets: number[];
}> {
  const defaultSlug = defaultVideoModelSlug();
  const models = options?.uiOnly
    ? VIDEO_MODELS.filter((model) => model.uiVisible !== false)
    : VIDEO_MODELS;
  return models.map((model) => ({
    slug: model.slug,
    label: model.label,
    description: model.description,
    requiresStartFrame: model.requiresStartFrame,
    supportsMultimodalRefs: model.supportsMultimodalRefs,
    isDefault: model.slug === defaultSlug,
    maxDurationSeconds: model.maxDurationSeconds,
    resolutionOptions: model.resolutionOptions,
    durationPresets: model.durationPresets,
  }));
}
