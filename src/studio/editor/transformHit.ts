/** Pixel-stable hit testing for canvas transform handles.

  Fractional-of-box edges shrink to a few pixels on short text, so the
  rotate knob looks clickable but misses — then empty-canvas deselect fires.
*/

export type TransformHandle = "move" | "ne" | "nw" | "se" | "sw" | "rotate";

export type TransformHitRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

const CORNER_PX = 14;
const ROTATE_KNOB_PX = 16;
/** Stem (14) + half knob (12) — visual center of the rotate control. */
export const ROTATE_KNOB_CENTER_PX = 26;
/** Extra hit pad so corner handles outside the blue box still receive events. */
export const TRANSFORM_HIT_PAD_PX = 16;

export function overlayRectStyle(
  rect: TransformHitRect,
  rotation: number,
  padPx = 0,
): {
  left: string;
  top: string;
  width: string;
  height: string;
  transform: string;
} {
  const rotate = `rotate(${rotation}deg)`;
  if (padPx <= 0) {
    return {
      left: `${rect.left * 100}%`,
      top: `${rect.top * 100}%`,
      width: `${rect.width * 100}%`,
      height: `${rect.height * 100}%`,
      transform: rotate,
    };
  }
  return {
    left: `calc(${rect.left * 100}% - ${padPx}px)`,
    top: `calc(${rect.top * 100}% - ${padPx}px)`,
    width: `calc(${rect.width * 100}% + ${padPx * 2}px)`,
    height: `calc(${rect.height * 100}% + ${padPx * 2}px)`,
    transform: rotate,
  };
}

export function toLocalPoint(
  nx: number,
  ny: number,
  rect: TransformHitRect,
  rotation: number,
  canvasWidth: number,
  canvasHeight: number,
): { x: number; y: number } {
  const cx = (rect.left + rect.width / 2) * canvasWidth;
  const cy = (rect.top + rect.height / 2) * canvasHeight;
  const px = nx * canvasWidth - cx;
  const py = ny * canvasHeight - cy;
  const rad = (-rotation * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const lx = c * px - s * py;
  const ly = s * px + c * py;
  const halfW = (rect.width * canvasWidth) / 2;
  const halfH = (rect.height * canvasHeight) / 2;
  return {
    x: (lx + halfW) / Math.max(1, rect.width * canvasWidth),
    y: (ly + halfH) / Math.max(1, rect.height * canvasHeight),
  };
}

/** True when the canvas point sits on the contain-rect (rotation-aware). */
export function pointHitsContentRect(
  nx: number,
  ny: number,
  rect: TransformHitRect,
  rotation: number,
  canvasWidth: number,
  canvasHeight: number,
): boolean {
  if (rect.width <= 0 || rect.height <= 0) return false;
  const local = toLocalPoint(nx, ny, rect, rotation, canvasWidth, canvasHeight);
  return local.x >= 0 && local.x <= 1 && local.y >= 0 && local.y <= 1;
}

export function hitTransformHandle(
  nx: number,
  ny: number,
  rect: TransformHitRect,
  rotation: number,
  canvasWidth: number,
  canvasHeight: number,
): TransformHandle | null {
  const local = toLocalPoint(nx, ny, rect, rotation, canvasWidth, canvasHeight);
  const boxW = Math.max(1, rect.width * canvasWidth);
  const boxH = Math.max(1, rect.height * canvasHeight);
  const edgeX = CORNER_PX / boxW;
  const edgeY = CORNER_PX / boxH;
  const rotateY = 1 + ROTATE_KNOB_CENTER_PX / boxH;
  const nearRotate =
    Math.abs(local.x - 0.5) <= ROTATE_KNOB_PX / boxW &&
    Math.abs(local.y - rotateY) <= ROTATE_KNOB_PX / boxH;
  if (nearRotate) return "rotate";

  const withinX = local.x >= -edgeX && local.x <= 1 + edgeX;
  const withinY = local.y >= -edgeY && local.y <= 1 + edgeY;
  if (!withinX || !withinY) return null;

  const nearL = Math.abs(local.x - 0) <= edgeX;
  const nearR = Math.abs(local.x - 1) <= edgeX;
  const nearT = Math.abs(local.y - 0) <= edgeY;
  const nearB = Math.abs(local.y - 1) <= edgeY;
  if (nearT && nearL) return "nw";
  if (nearT && nearR) return "ne";
  if (nearB && nearL) return "sw";
  if (nearB && nearR) return "se";

  if (local.x >= 0 && local.x <= 1 && local.y >= 0 && local.y <= 1) {
    return "move";
  }
  return null;
}
