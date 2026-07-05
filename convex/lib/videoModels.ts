export type VideoModelSlug = "seedance-2.0" | "kling-3.0-i2v";

/** MCP/API explicit picks — hidden from Studio UI composer and public catalog. */
export const MCP_EXPLICIT_VIDEO_MODEL_SLUGS: VideoModelSlug[] = [
  "kling-3.0-i2v",
];

export type VideoModelDef = {
  slug: VideoModelSlug;
  label: string;
  gatewayModelId: string;
  description: string;
  requiresStartFrame: boolean;
  supportsMultimodalRefs: boolean;
  /** When false, model stays API/MCP-wired but hidden from Studio composer UI. */
  uiVisible?: boolean;
};

export const VIDEO_MODELS: VideoModelDef[] = [
  {
    slug: "seedance-2.0",
    label: "Seedance 2.0",
    gatewayModelId: "bytedance/seedance-2.0",
    description:
      "Default — physics, multimodal refs, multi-shot. Strict filter on photoreal faces in input images.",
    requiresStartFrame: false,
    supportsMultimodalRefs: true,
    uiVisible: true,
  },
  {
    slug: "kling-3.0-i2v",
    label: "Kling 3.0 I2V",
    gatewayModelId: "klingai/kling-v3.0-i2v",
    description:
      "MCP only — cinematic faces and start-frame I2V. Easier on human likeness; prop refs via prompt.",
    requiresStartFrame: true,
    supportsMultimodalRefs: false,
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
      `Unknown video model: ${normalized}. Use seedance-2.0 or kling-3.0-i2v.`,
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
      `${model.label} is not available. Video generation uses Seedance 2.0.`,
    );
  }
  return model;
}

export function isSeedanceGatewayModel(modelId: string): boolean {
  return modelId.includes("seedance");
}

export function isKlingGatewayModel(modelId: string): boolean {
  return modelId.includes("kling");
}

export function videoPricingModelFromGatewayId(gatewayModelId: string): VideoModelSlug {
  if (gatewayModelId.includes("kling")) {
    return "kling-3.0-i2v";
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
  }));
}
