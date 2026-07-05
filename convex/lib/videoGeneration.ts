/** Seedance / Vercel gateway video reference helpers. */

import {
  assertKlingGatewayPromptLength,
  gatewayUsesKling,
} from "./klingGatewayPrompt";

export type VideoReferenceLabel = {
  tag: string;
  label: string;
};

export function videoReferenceTag(index: number): string {
  return `[Image ${index}]`;
}

/** Append [Image N] lines so Seedance knows which ref is which. */
export function appendVideoReferenceTags(
  prompt: string,
  labels: VideoReferenceLabel[],
): string {
  if (!labels.length) return prompt.trim();
  const tagLines = labels.map((item) => `${item.tag}: ${item.label}`);
  return `${prompt.trim()}\n\nReference images:\n${tagLines.join("\n")}`;
}

export function startFramePromptPrefix(): string {
  return "Animate from the opening frame. Characters and composition match the start frame.";
}

/** Avoid double-prefix when HTTP already prepended start-frame line. */
export function promptHasStartFramePrefix(prompt: string): boolean {
  return prompt.trimStart().startsWith(startFramePromptPrefix());
}

export function extractCreativeVideoPrompt(userPrompt: string): string {
  const marker = "\n\nElement references:\n";
  const idx = userPrompt.indexOf(marker);
  let core = idx >= 0 ? userPrompt.slice(0, idx) : userPrompt;
  if (promptHasStartFramePrefix(core)) {
    core = core.slice(startFramePromptPrefix().length).trim();
  }
  return core.trim();
}

export function finalizeGatewayVideoPrompt(args: {
  prompt: string;
  startFrameUrl?: string;
  referenceImageCount: number;
  gatewayModelId: string;
  /** Original creative prompt before element appendix — for Kling length errors. */
  creativePrompt?: string;
  /** MCP/production handoff — do not inject start-frame prefix; prompt is model-ready. */
  directPrompt?: boolean;
}): string {
  const labels = Array.from({ length: args.referenceImageCount }, (_, index) => ({
    tag: videoReferenceTag(index + 1),
    label: `reference image ${index + 1}`,
  }));

  let result = args.prompt.trim();
  if (
    args.startFrameUrl &&
    !promptHasStartFramePrefix(result) &&
    !args.directPrompt
  ) {
    result = `${startFramePromptPrefix()}\n\n${appendVideoReferenceTags(result, labels)}`;
  } else if (!args.startFrameUrl && labels.length && !result.includes("Reference images:")) {
    result = appendVideoReferenceTags(result, labels);
  } else if (
    args.startFrameUrl &&
    args.directPrompt &&
    labels.length &&
    !result.includes("Reference images:")
  ) {
    result = appendVideoReferenceTags(result, labels);
  }

  if (gatewayUsesKling(args.gatewayModelId)) {
    assertKlingGatewayPromptLength({
      prompt: result,
      creativePrompt: args.creativePrompt ?? args.prompt,
    });
  }
  return result;
}
