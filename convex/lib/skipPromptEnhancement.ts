/** When true, API jobs pass userPrompt directly to image/video models. */
export function shouldSkipPromptEnhancement(args: {
  skipPromptEnhancement?: boolean;
  presetSlug?: string;
}): boolean {
  return args.skipPromptEnhancement === true || args.presetSlug === "raw";
}
