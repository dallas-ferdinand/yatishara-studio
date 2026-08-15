/**
 * Studio Agent always uses the Pro / plan model (Cursor-style).
 * BYOK still wins in the worker when the user brought their own key.
 */

/**
 * @param {{ message?: string, lane?: string, execModelId?: string, planModelId?: string }} args
 * @returns {{ modelId: string, tier: "plan" | "exec", reason: string }}
 */
export function pickAgentModel(args = {}) {
  const planModelId = String(
    args.planModelId ||
      process.env.STUDIO_AGENT_PLAN_MODEL_ID ||
      "seed-2-0-pro-260328",
  ).trim();

  return { modelId: planModelId, tier: "plan", reason: "always-pro" };
}
