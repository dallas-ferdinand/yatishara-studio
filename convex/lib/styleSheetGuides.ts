import type { Doc } from "../_generated/dataModel";

export type StyleSheetRenderMode =
  | "photoreal"
  | "illustrated_2d"
  | "illustrated_3d"
  | "mixed";

export function isStyleSheetElement(
  element: Pick<Doc<"elements">, "type">,
): boolean {
  return element.type === "style_sheet";
}

export function assertStyleSheetReady(element: Pick<
  Doc<"elements">,
  "type" | "sheetAssetId" | "styleRules" | "name"
>) {
  if (element.type !== "style_sheet") {
    throw new Error("Element is not a Style Sheet");
  }
  if (!element.styleRules?.trim() && !element.sheetAssetId) {
    throw new Error("Add style rules or build the visual Style Sheet before using it");
  }
}

export function buildStyleSheetImagePrompt(args: {
  name: string;
  styleRules?: string;
  renderMode?: StyleSheetRenderMode;
  referenceCount: number;
}): string {
  const mode = args.renderMode ?? "mixed";
  const rules = args.styleRules?.trim() ?? "";
  return [
    "Create a professional visual STYLE BOARD reference sheet on a clean neutral gray background.",
    "Layout: top row = 5–8 color swatches with hex labels; middle = 2–4 sample panels showing the look applied to simple shapes or environments;",
    "bottom = typography/line-weight samples if relevant.",
    "NO narrative scene, NO characters unless rules require silhouette samples, NO watermark, NO UI chrome.",
    `Style name: ${args.name}.`,
    `Render mode: ${mode.replace(/_/g, " ")}.`,
    rules ? `Style rules to encode visually:\n${rules}` : "",
    args.referenceCount > 0
      ? "Honor attached mood reference images for palette and material feel."
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function styleSheetSystemInstructions(args: {
  name: string;
  styleRules?: string;
  renderMode?: StyleSheetRenderMode;
  hasVisualReference?: boolean;
}): string {
  const mode = args.renderMode ?? "mixed";
  const rules = args.styleRules?.trim();
  const parts = [
    `Apply the "${args.name}" Style Sheet as a complete visual WORLD, not a light theme or color filter.`,
    `Render mode: ${mode.replace(/_/g, " ")}.`,
    "REIMAGINE LOCK: rebuild every subject and surface into this production grammar — character design, proportions, line/material language, wardrobe construction, and environments must look native to this world. Do not wash a photographic base with a stylized overlay. Identity cues from user references may survive; form language must convert fully.",
    "FULL-SCENE STYLE LOCK: restyle the entire output frame as one coherent world — people, wardrobe, props, architecture, ground, foliage, vehicles, sky, weather, atmosphere, reflections, and lighting. Never leave photographic or mismatched backgrounds behind stylized subjects. Never collage stylized characters onto live-action environments.",
  ];
  if (args.hasVisualReference) {
    parts.push(
      "The first attached image is the active Style Sheet visual. Match its cartoon/world grammar (line, materials, lighting logic, palette behavior, finish) across every surface. Do not copy its specific people, identities, wardrobe, poses, location layout, or camera composition unless the user prompt independently requests them.",
    );
  }
  if (rules) {
    parts.push(`Style rules:\n${rules}`);
  }
  return parts.join("\n\n");
}

export function renderModeModelHints(
  renderMode?: StyleSheetRenderMode,
): Record<string, string | number | boolean> | undefined {
  switch (renderMode) {
    case "photoreal":
      return { preferPhotoreal: true, avoidCartoonStylization: true };
    case "illustrated_2d":
      return { prefer2D: true, celShading: true };
    case "illustrated_3d":
      return { preferStylized3D: true, toonShader: true };
    default:
      return undefined;
  }
}
