/**
 * Normalize Pi/BytePlus measured usage for Studio ledger billing.
 *
 * Pi openai-completions already splits:
 *   input = prompt_tokens - cached_tokens - cache_write_tokens
 *   cacheRead / cacheWrite separate
 *
 * BytePlus ModelArk bills:
 *   - non-cached input @ list input
 *   - cache hits @ cache-hit input
 *   - cache storage @ USD/M tokens/hour (not Anthropic-style write×input)
 *   - output @ list output
 *
 * Never fold cache into input. Never bill cacheWrite as full input.
 */

/**
 * @param {{
 *   inputTokens?: number,
 *   outputTokens?: number,
 *   cacheReadTokens?: number,
 *   cacheWriteTokens?: number,
 *   promptTokens?: number,
 * }} raw
 */
export function normalizeAgentUsage(raw) {
  const cacheReadTokens = Math.max(0, Math.floor(Number(raw?.cacheReadTokens ?? 0)));
  const cacheWriteTokens = Math.max(0, Math.floor(Number(raw?.cacheWriteTokens ?? 0)));
  const outputTokens = Math.max(0, Math.floor(Number(raw?.outputTokens ?? 0)));
  let inputTokens = Math.max(0, Math.floor(Number(raw?.inputTokens ?? 0)));
  const promptTokens = Math.max(0, Math.floor(Number(raw?.promptTokens ?? 0)));

  // If caller passed total prompt_tokens, derive non-cached input (no double-count).
  if (promptTokens > 0) {
    inputTokens = Math.max(0, promptTokens - cacheReadTokens - cacheWriteTokens);
  }

  return {
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
  };
}
