/** Presets that never run GPT prompt rewrite — handoff prompts pass verbatim. */
export const DIRECT_PROMPT_PRESET_SLUGS = new Set(["unstyled", "raw"]);

/** When true, jobs pass userPrompt directly to image/video models (no GPT rewrite). */
export function shouldSkipPromptEnhancement(args: {
  skipPromptEnhancement?: boolean;
  presetSlug?: string;
}): boolean {
  return (
    args.skipPromptEnhancement === true ||
    (args.presetSlug !== undefined && DIRECT_PROMPT_PRESET_SLUGS.has(args.presetSlug))
  );
}

/**
 * Direct / unstyled handoff: no GPT enhancement and no gateway start-frame prefix injection.
 * MCP production defaults here so generation_prompt / storyboard_prompt reach Seedance verbatim.
 */
export function isDirectPromptMode(args: {
  skipPromptEnhancement?: boolean;
  presetSlug?: string;
}): boolean {
  return shouldSkipPromptEnhancement(args);
}
