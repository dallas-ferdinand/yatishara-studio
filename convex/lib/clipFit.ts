/**
 * One contain/cover fit for preview paint, overlay chrome, hit-test, and export.
 * Scale 1 = the fitted quad (letterbox for contain, crop-fill for cover).
 */

export type MediaFitMode = "contain" | "cover";

export type FitTransform = {
  scale: number;
  x: number;
  y: number;
};

export function isMediaFitMode(value: unknown): value is MediaFitMode {
  return value === "contain" || value === "cover";
}

/** Stills letterbox inside the frame; video fills like a movie. */
export function defaultFitModeForKind(kind: string | undefined): MediaFitMode {
  return kind === "image" ? "contain" : "cover";
}

export function resolveFitMode(
  effects: { fitMode?: unknown } | undefined,
  kind?: string,
): MediaFitMode {
  return isMediaFitMode(effects?.fitMode)
    ? effects.fitMode
    : defaultFitModeForKind(kind);
}

export function ffmpegFitAspect(fitMode: MediaFitMode): "increase" | "decrease" {
  return fitMode === "contain" ? "decrease" : "increase";
}

/**
 * Unscaled fitted size in normalized canvas space [0,1].
 * Scale 1 maps to this quad; user zoom multiplies it.
 */
export function fittedNormalizedSize(
  canvasWidth: number,
  canvasHeight: number,
  sourceWidth: number,
  sourceHeight: number,
  fitMode: MediaFitMode,
): { width: number; height: number } {
  const canvasAspect = canvasWidth / Math.max(1, canvasHeight);
  const sourceAspect =
    (sourceWidth || canvasWidth) / Math.max(1, sourceHeight || canvasHeight);
  if (fitMode === "contain") {
    if (sourceAspect > canvasAspect) {
      return { width: 1, height: canvasAspect / sourceAspect };
    }
    return { width: sourceAspect / canvasAspect, height: 1 };
  }
  if (sourceAspect > canvasAspect) {
    return { width: sourceAspect / canvasAspect, height: 1 };
  }
  return { width: 1, height: canvasAspect / sourceAspect };
}

/**
 * Fitted content rect in normalized canvas coordinates, after user scale/pan.
 * Same function for compositor, overlay, and hit-test.
 */
export function contentRectForTransform(
  transform: FitTransform,
  canvasWidth: number,
  canvasHeight: number,
  sourceWidth: number,
  sourceHeight: number,
  fitMode: MediaFitMode = "cover",
): { left: number; top: number; width: number; height: number } {
  const fitted = fittedNormalizedSize(
    canvasWidth,
    canvasHeight,
    sourceWidth,
    sourceHeight,
    fitMode,
  );
  const width = fitted.width * transform.scale;
  const height = fitted.height * transform.scale;
  const left = 0.5 + transform.x - width / 2;
  const top = 0.5 + transform.y - height / 2;
  return { left, top, width, height };
}
