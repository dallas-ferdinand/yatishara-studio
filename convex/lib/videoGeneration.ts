/** Seedance / Vercel gateway video reference helpers. */

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
