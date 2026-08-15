/**
 * Plan-strong / execute-cheap model routing for Studio Agent Pi turns.
 * Default exec = Seed Turbo; plan lanes = Seed Pro (overridable via env).
 */

/**
 * @param {{ message?: string, lane?: string, execModelId?: string, planModelId?: string }} args
 * @returns {{ modelId: string, tier: "plan" | "exec", reason: string }}
 */
export function pickAgentModel(args = {}) {
  const execModelId = String(
    args.execModelId ||
      process.env.STUDIO_AGENT_MODEL_ID ||
      "dola-seed-2-1-turbo-260628",
  ).trim();
  const planModelId = String(
    args.planModelId ||
      process.env.STUDIO_AGENT_PLAN_MODEL_ID ||
      "seed-2-0-pro-260328",
  ).trim();

  const message = String(args.message || "");
  const lane = String(args.lane || "");
  const text = message.toLowerCase();

  if (/^\s*continue\.?\s*$/i.test(message) || /LANE:\s*CONTINUE/i.test(lane)) {
    return { modelId: planModelId, tier: "plan", reason: "continue" };
  }
  if (/ELEMENT FLOW/i.test(lane) || /\belements?\b/.test(text)) {
    return { modelId: planModelId, tier: "plan", reason: "element" };
  }
  if (
    /prompt-(cinematic|hypermotion|image|voiceover)/i.test(lane) ||
    /\b(write|craft|create|make)\b.{0,40}\b(prompt|script)\b/.test(text) ||
    /\b(prompt|script)\b.{0,24}\b(write|craft|create|longer|better)\b/.test(text)
  ) {
    return { modelId: planModelId, tier: "plan", reason: "prompt-craft" };
  }
  if (/EDIT existing Script/i.test(lane)) {
    return { modelId: planModelId, tier: "plan", reason: "script-edit" };
  }
  if (
    /\b(generate|create|make)\b.{0,32}\b(image|video|clip|ad)\b/.test(text) &&
    /\b(and|then|also)\b/.test(text)
  ) {
    return { modelId: planModelId, tier: "plan", reason: "multi-gen" };
  }

  return { modelId: execModelId, tier: "exec", reason: "default-exec" };
}
