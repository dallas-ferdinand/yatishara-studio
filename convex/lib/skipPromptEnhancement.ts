/** Presets that never run GPT prompt rewrite — handoff prompts pass verbatim. */
export const DIRECT_PROMPT_PRESET_SLUGS = new Set(["unstyled", "raw"]);

/**
 * Enhancement is the sticking layer: when a Style Sheet is active it merges
 * style rules + attached script/elements into the model prompt.
 *
 * Direct (no Style Sheet): skip rewrite — prompt reaches the model verbatim.
 * Styled (Style Sheet set): enhance by default; MCP/API may still force skip.
 */
export function shouldSkipPromptEnhancement(args: {
  skipPromptEnhancement?: boolean;
  presetSlug?: string;
  styleSheetElementId?: string | null;
}): boolean {
  if (args.styleSheetElementId) {
    return args.skipPromptEnhancement === true;
  }
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
  styleSheetElementId?: string | null;
}): boolean {
  return shouldSkipPromptEnhancement(args);
}
