import { isKlingGatewayModel } from "./videoModels";

/** Vercel AI Gateway / Kling provider cap — not a Studio limit. */
export const KLING_GATEWAY_PROMPT_MAX = 2500;

export type ElementPromptAppendInput = {
  type: string;
  name: string;
  description?: string;
  attachSheet: boolean;
  imageTag?: string;
};

/** One-line element stub for gateway — full bibles stay in elements + shot packets. */
export function compactElementPromptLine(
  input: ElementPromptAppendInput,
  options: { hasStartFrame: boolean; isCharacter: boolean },
): string {
  const label = `${input.type} @${input.name}`;
  if (options.isCharacter && options.hasStartFrame) {
    return `${label}: likeness locked in start frame.`;
  }
  if (input.attachSheet && input.imageTag) {
    return `${label}: match ${input.imageTag}.`;
  }
  if (input.description?.trim()) {
    return `${label}: ${firstSentence(input.description, 120)}`;
  }
  return `${label}: match production element.`;
}

function firstSentence(text: string | undefined, maxLen: number): string {
  if (!text?.trim()) return "";
  const line = text.trim().split(/\n+/)[0]?.replace(/\s+/g, " ").trim() ?? "";
  if (line.length <= maxLen) return line;
  return `${line.slice(0, maxLen - 1).trim()}…`;
}

export type KlingPromptLengthReport = {
  total: number;
  max: number;
  creativeChars: number;
  appendixChars: number;
  withinLimit: boolean;
};

export function measureKlingPromptParts(args: {
  creativePrompt: string;
  elementAppendix?: string;
  startFramePrefix?: boolean;
  referenceImageTags?: string;
}): KlingPromptLengthReport {
  const prefix = args.startFramePrefix
    ? "Animate from the opening frame. Characters and composition match the start frame.\n\n"
    : "";
  const creativeChars = args.creativePrompt.trim().length;
  const appendixChars =
    (args.elementAppendix?.length ?? 0) + (args.referenceImageTags?.length ?? 0);
  const total = prefix.length + creativeChars + appendixChars;
  return {
    total,
    max: KLING_GATEWAY_PROMPT_MAX,
    creativeChars,
    appendixChars,
    withinLimit: total <= KLING_GATEWAY_PROMPT_MAX,
  };
}

export function assertKlingGatewayPromptLength(args: {
  prompt: string;
  creativePrompt: string;
}): void {
  if (args.prompt.length <= KLING_GATEWAY_PROMPT_MAX) return;
  const creativeOnly = args.creativePrompt.trim().length;
  throw new Error(
    `Kling gateway prompt limit (${KLING_GATEWAY_PROMPT_MAX} chars): assembled ${args.prompt.length}, creative core ${creativeOnly}. ` +
      `Do not shorten shot_packet.generation_prompt — iterate the shot (tighter beat prose, fewer element refs on video step, or regen). ` +
      `Full director definition stays in the signed shot packet.`,
  );
}

export function gatewayUsesKling(modelId: string): boolean {
  return isKlingGatewayModel(modelId);
}
