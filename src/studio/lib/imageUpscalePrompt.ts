/** Durable prompt for image-to-image upscale / re-render jobs from context menu or chat. */
export const IMAGE_UPSCALE_PROMPT = [
  "Faithfully upscale and re-render this image at higher fidelity from the attached reference.",
  "Preserve composition, subject identity, layout, colors, branding, logos, and all on-image text exactly.",
  "Repair soft or broken text, jagged edges, aliasing, and compression artifacts.",
  "Sharpen fine detail without inventing new content, restyling, or changing the look.",
  "Do not crop or reframe unless required to fit the target canvas.",
].join(" ");

const IMAGE_ASPECT_OPTIONS = [
  "16:9",
  "9:16",
  "1:1",
  "4:5",
  "4:3",
  "3:4",
  "21:9",
] as const;

/** Pick the closest supported composer aspect ratio from pixel dimensions. */
export function aspectRatioFromDimensions(
  width: number | null | undefined,
  height: number | null | undefined,
): (typeof IMAGE_ASPECT_OPTIONS)[number] | null {
  if (!(typeof width === "number" && width > 0 && typeof height === "number" && height > 0)) {
    return null;
  }
  const ratio = width / height;
  let best: (typeof IMAGE_ASPECT_OPTIONS)[number] | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const label of IMAGE_ASPECT_OPTIONS) {
    const [w, h] = label.split(":").map(Number);
    if (!w || !h) continue;
    const dist = Math.abs(ratio - w / h);
    if (dist < bestDist) {
      bestDist = dist;
      best = label;
    }
  }
  return best;
}
