export type VideoModelSlug =
  | "seedance-2.0"
  | "google-omni-flash"
  | "kling-3.0-i2v";

/** MCP/API explicit picks — hidden from Studio UI composer and public catalog. */
export const MCP_EXPLICIT_VIDEO_MODEL_SLUGS: VideoModelSlug[] = [
  "kling-3.0-i2v",
  "google-omni-flash",
];

export type VideoModelDef = {
  slug: VideoModelSlug;
  label: string;
  gatewayModelId: string;
  description: string;
  requiresStartFrame: boolean;
  supportsMultimodalRefs: boolean;
  /** Max output seconds supported by the provider. */
  maxDurationSeconds?: number;
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
};

export const VIDEO_MODELS: VideoModelDef[] = [
  {
    slug: "seedance-2.0",
    label: "Seedance",
    gatewayModelId: "bytedance/seedance-2.0",
    description: "Seedance",
    requiresStartFrame: false,
    supportsMultimodalRefs: true,
    maxDurationSeconds: 15,
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
    uiVisible: false,
  },
];

export function defaultVideoModelSlug(): VideoModelSlug {
  const env = process.env.GATEWAY_VIDEO_MODEL_ID ?? "bytedance/seedance-2.0";
  const match = VIDEO_MODELS.find((model) => model.gatewayModelId === env);
  return match?.slug ?? "seedance-2.0";
}

export function resolveVideoModel(slug?: string | null): VideoModelDef {
  const normalized = slug?.trim();
  if (normalized) {
    const found = VIDEO_MODELS.find(
      (model) => model.slug === normalized || model.gatewayModelId === normalized,
    );
    if (found) return found;
    throw new Error(
      `Unknown video model: ${normalized}. Use seedance-2.0, google-omni-flash, or kling-3.0-i2v.`,
    );
  }
  return (
    VIDEO_MODELS.find((model) => model.slug === defaultVideoModelSlug()) ?? VIDEO_MODELS[0]
  );
}

/** Public API / MCP — uiVisible models by default; MCP explicit slugs when caller passes videoModel. */
export function resolvePublicVideoModel(slug?: string | null): VideoModelDef {
  const normalized = slug?.trim() as VideoModelSlug | undefined;
  if (
    normalized &&
    MCP_EXPLICIT_VIDEO_MODEL_SLUGS.includes(normalized)
  ) {
    return resolveVideoModel(normalized);
  }
  const model = resolveVideoModel(slug);
  if (model.uiVisible === false) {
    throw new Error(
      `${model.label} is not available. Video generation uses Seedance.`,
    );
  }
  return model;
}

/**
 * Resolve and validate provider constraints before credits are reserved.
 * A start frame is a distinct model input and is not considered a multimodal
 * reference for models such as Kling I2V.
 */
export function validateVideoModelCapabilities(
  slugOrGatewayId: string | null | undefined,
  request: VideoCapabilityRequest,
): VideoModelDef {
  const model = resolveVideoModel(slugOrGatewayId);
  const duration = Number(request.durationSeconds ?? 4);
  const maxDuration = model.maxDurationSeconds ?? 15;

  if (!Number.isFinite(duration) || duration < 4 || duration > maxDuration) {
    throw new Error(
      `${model.label} video duration must be between 4 and ${maxDuration} seconds.`,
    );
  }
  if (model.requiresStartFrame && !request.hasStartFrame) {
    throw new Error(`${model.label} requires a start frame.`);
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

export type GenerationMode = "image" | "video";
export type GenerationBillingTier = "image" | "pro_video";

/** Billing tier is an invariant of generation mode, never caller authority. */
export function billingTierForMode(mode: GenerationMode): GenerationBillingTier {
  return mode === "video" ? "pro_video" : "image";
}

export function isSeedanceGatewayModel(modelId: string): boolean {
  return modelId.includes("seedance");
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
  return "seedance-2.0";
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
  maxDurationSeconds?: number;
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
  maxDurationSeconds?: number;
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
  }));
}
