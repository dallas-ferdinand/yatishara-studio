"use node";

/**
 * BYOK language models for Agent Mode (reasoning only — not media gen).
 * Uses @ai-sdk/openai for OpenAI-compatible providers (OpenAI, OpenRouter, Z.ai).
 * Anthropic keys: use via OpenRouter, or we accept the key and call Anthropic
 * Messages REST for text-only fallback when tools aren't required — preferred path
 * is OpenAI-compatible base URLs.
 */
import { createOpenAI } from "@ai-sdk/openai";

export type AgentByokProvider = "openai" | "anthropic" | "zai" | "openrouter";

const DEFAULT_MODELS: Record<AgentByokProvider, string> = {
  openai: "gpt-4.1-mini",
  anthropic: "claude-sonnet-4-5",
  zai: "glm-4.5",
  openrouter: "openai/gpt-4.1-mini",
};

function zaiBaseUrl(): string {
  return (
    process.env.ZAI_API_BASE_URL?.trim() ||
    process.env.Z_AI_BASE_URL?.trim() ||
    "https://api.z.ai/api/paas/v4"
  );
}

export function byokDefaultModelId(provider: AgentByokProvider): string {
  return DEFAULT_MODELS[provider];
}

/**
 * Build a chat model from a user-supplied key.
 * Anthropic: routes through OpenRouter-compatible Anthropic models when
 * ANTHROPIC_BYOK_VIA=openrouter is unset — otherwise uses api.anthropic.com
 * OpenAI-compat shim is unavailable; we map anthropic → OpenAI SDK against
 * `https://api.anthropic.com/v1` is invalid, so anthropic BYOK uses the
 * Messages API via a tiny OpenAI-compat proxy pattern: prefer OpenRouter
 * with the same key only when provider is openrouter. For provider=anthropic
 * we call createOpenAI against env ANTHROPIC_COMPAT_BASE_URL if set, else
 * throw a clear error directing the user to OpenRouter or OpenAI/Z.ai.
 */
export function byokLanguageModel(
  provider: AgentByokProvider,
  apiKey: string,
  modelId?: string,
) {
  const id = (modelId?.trim() || byokDefaultModelId(provider)).trim();
  if (provider === "anthropic") {
    const compat = process.env.ANTHROPIC_COMPAT_BASE_URL?.trim();
    if (!compat) {
      throw new Error(
        "Anthropic BYOK needs ANTHROPIC_COMPAT_BASE_URL, or use OpenRouter / OpenAI / Z.ai.",
      );
    }
    return createOpenAI({
      apiKey,
      baseURL: compat,
      name: "anthropic-byok",
    }).chat(id);
  }
  if (provider === "openrouter") {
    return createOpenAI({
      apiKey,
      baseURL: "https://openrouter.ai/api/v1",
      name: "openrouter-byok",
    }).chat(id);
  }
  if (provider === "zai") {
    return createOpenAI({
      apiKey,
      baseURL: zaiBaseUrl(),
      name: "zai-byok",
    }).chat(id);
  }
  return createOpenAI({
    apiKey,
    name: "openai-byok",
  }).chat(id);
}
