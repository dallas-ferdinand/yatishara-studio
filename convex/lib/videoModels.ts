export type VideoModelSlug = "seedance-2.0" | "kling-3.0-i2v";

export type VideoModelDef = {
  slug: VideoModelSlug;
  label: string;
  gatewayModelId: string;
  description: string;
  requiresStartFrame: boolean;
  supportsMultimodalRefs: boolean;
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
  },
  {
    slug: "kling-3.0-i2v",
    label: "Kling 3.0 I2V",
    gatewayModelId: "klingai/kling-v3.0-i2v",
    description:
      "Secondary — cinematic faces and start-frame I2V. Easier on human likeness; prop refs via prompt.",
    requiresStartFrame: true,
    supportsMultimodalRefs: false,
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

export function isSeedanceGatewayModel(modelId: string): boolean {
  return modelId.includes("seedance");
}

export function listVideoModelsPublic(): Array<{
  slug: VideoModelSlug;
  label: string;
  description: string;
  requiresStartFrame: boolean;
  supportsMultimodalRefs: boolean;
  isDefault: boolean;
}> {
  const defaultSlug = defaultVideoModelSlug();
  return VIDEO_MODELS.map((model) => ({
    slug: model.slug,
    label: model.label,
    description: model.description,
    requiresStartFrame: model.requiresStartFrame,
    supportsMultimodalRefs: model.supportsMultimodalRefs,
    isDefault: model.slug === defaultSlug,
  }));
}
