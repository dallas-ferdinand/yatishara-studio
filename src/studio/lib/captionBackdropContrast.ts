/**
 * Pick caption ink from what's actually behind the caption (letterbox stage
 * and/or media), not from light/dark appearance mode.
 */

export type CaptionBackdrop = "light" | "dark";

/** How to turn a sampled strip into light/dark ink. */
export type OverlaySampleBias = "average" | "preferDark";

const LIGHT_LUMA_THRESHOLD = 0.58;
/** Rail is tall + mixed; only use dark ink when most pixels are clearly light. */
const RAIL_LIGHT_SHARE_THRESHOLD = 0.72;

function srgbChannelToLinear(channel: number): number {
  const s = channel / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance 0–1 (WCAG). */
export function relativeLuminance(r: number, g: number, b: number): number {
  const R = srgbChannelToLinear(r);
  const G = srgbChannelToLinear(g);
  const B = srgbChannelToLinear(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

export function backdropFromLuminance(luma: number): CaptionBackdrop {
  return luma >= LIGHT_LUMA_THRESHOLD ? "light" : "dark";
}

function parseCssColor(input: string): { r: number; g: number; b: number } | null {
  const value = input.trim();
  if (!value || value === "transparent") return null;
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const h = hex[1]!;
    if (h.length === 3) {
      return {
        r: parseInt(h[0]! + h[0]!, 16),
        g: parseInt(h[1]! + h[1]!, 16),
        b: parseInt(h[2]! + h[2]!, 16),
      };
    }
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    };
  }
  const rgb = value.match(
    /^rgba?\(\s*([0-9.]+)\s*[, ]\s*([0-9.]+)\s*[, ]\s*([0-9.]+)(?:\s*[,/]\s*([0-9.]+))?\s*\)$/i,
  );
  if (!rgb) return null;
  const alpha = rgb[4] != null ? Number(rgb[4]) : 1;
  if (!Number.isFinite(alpha) || alpha <= 0.05) return null;
  return {
    r: Math.round(Number(rgb[1])),
    g: Math.round(Number(rgb[2])),
    b: Math.round(Number(rgb[3])),
  };
}

function readOpaqueBackground(el: Element | null): { r: number; g: number; b: number } | null {
  let node: Element | null = el;
  while (node && node !== document.documentElement) {
    const color = parseCssColor(getComputedStyle(node).backgroundColor);
    if (color) return color;
    node = node.parentElement;
  }
  return null;
}

/** object-fit: contain destination rect inside a box. */
function containDest(
  boxW: number,
  boxH: number,
  mediaW: number,
  mediaH: number,
): { dx: number; dy: number; dw: number; dh: number } {
  if (boxW <= 0 || boxH <= 0 || mediaW <= 0 || mediaH <= 0) {
    return { dx: 0, dy: 0, dw: boxW, dh: boxH };
  }
  const scale = Math.min(boxW / mediaW, boxH / mediaH);
  const dw = mediaW * scale;
  const dh = mediaH * scale;
  return {
    dx: (boxW - dw) / 2,
    dy: (boxH - dh) / 2,
    dw,
    dh,
  };
}

function mediaIntrinsicSize(
  media: HTMLImageElement | HTMLVideoElement,
): { w: number; h: number } | null {
  if (media instanceof HTMLVideoElement) {
    if (media.readyState < 2 || !media.videoWidth || !media.videoHeight) return null;
    return { w: media.videoWidth, h: media.videoHeight };
  }
  if (!media.complete || !media.naturalWidth || !media.naturalHeight) return null;
  return { w: media.naturalWidth, h: media.naturalHeight };
}

/**
 * Classify sampled pixels. Caption uses mean luma; rail requires a clear light
 * majority so neon/sky highlights don't flip the whole strip to black ink.
 */
export function backdropFromImageData(
  data: ImageData,
  bias: OverlaySampleBias = "average",
): CaptionBackdrop | null {
  const pixels = data.data;
  let sum = 0;
  let count = 0;
  let lightCount = 0;
  for (let i = 0; i < pixels.length; i += 16) {
    const a = pixels[i + 3] ?? 0;
    if (a < 16) continue;
    const luma = relativeLuminance(pixels[i] ?? 0, pixels[i + 1] ?? 0, pixels[i + 2] ?? 0);
    sum += luma;
    count += 1;
    if (luma >= LIGHT_LUMA_THRESHOLD) lightCount += 1;
  }
  if (!count) return null;
  if (bias === "preferDark") {
    return lightCount / count >= RAIL_LIGHT_SHARE_THRESHOLD ? "light" : "dark";
  }
  return backdropFromLuminance(sum / count);
}

/**
 * Composite stage fill + object-fit:contain media into an overlay's on-screen
 * rectangle (caption, action rail, etc.), then return light/dark backdrop.
 */
export function sampleOverlayBackdrop(
  slide: HTMLElement,
  overlay: HTMLElement,
  options?: { bias?: OverlaySampleBias },
): CaptionBackdrop | null {
  const bias = options?.bias ?? "average";
  const mediaBox = slide.querySelector(".profile-post-slide-media") as HTMLElement | null;
  const media = slide.querySelector(
    ".profile-post-slide-media img, .profile-post-slide-media video",
  ) as HTMLImageElement | HTMLVideoElement | null;

  const stage =
    readOpaqueBackground(mediaBox) ||
    readOpaqueBackground(slide) ||
    readOpaqueBackground(slide.closest(".profile-post-viewer")) ||
    { r: 5, g: 6, b: 8 };

  const slideRect = slide.getBoundingClientRect();
  const overlayRect = overlay.getBoundingClientRect();
  if (slideRect.width < 2 || slideRect.height < 2 || overlayRect.height < 1) {
    return backdropFromLuminance(relativeLuminance(stage.r, stage.g, stage.b));
  }

  const sampleLeft = Math.max(0, overlayRect.left - slideRect.left);
  const sampleTop = Math.max(0, overlayRect.top - slideRect.top);
  const sampleW = Math.max(
    1,
    Math.min(overlayRect.width, slideRect.right - Math.max(overlayRect.left, slideRect.left)),
  );
  const sampleH = Math.max(
    1,
    Math.min(overlayRect.height, slideRect.bottom - Math.max(overlayRect.top, slideRect.top)),
  );

  const outW = 64;
  const outH = Math.max(12, Math.round(outW * (sampleH / sampleW)));
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return backdropFromLuminance(relativeLuminance(stage.r, stage.g, stage.b));
  }

  ctx.fillStyle = `rgb(${stage.r},${stage.g},${stage.b})`;
  ctx.fillRect(0, 0, outW, outH);

  const intrinsic = media ? mediaIntrinsicSize(media) : null;
  const box = (mediaBox || slide).getBoundingClientRect();

  if (media && intrinsic && box.width > 0 && box.height > 0) {
    const { dx, dy, dw, dh } = containDest(box.width, box.height, intrinsic.w, intrinsic.h);
    // Map caption sample (slide-local) → media-box-local, then draw the
    // intersecting contain destination into our sample canvas.
    const mediaOriginX = box.left - slideRect.left;
    const mediaOriginY = box.top - slideRect.top;

    // Source region in media-box coordinates covered by the caption sample.
    const srcBoxX = sampleLeft - mediaOriginX;
    const srcBoxY = sampleTop - mediaOriginY;

    // Intersection of caption sample with the contain destination.
    const ix0 = Math.max(srcBoxX, dx);
    const iy0 = Math.max(srcBoxY, dy);
    const ix1 = Math.min(srcBoxX + sampleW, dx + dw);
    const iy1 = Math.min(srcBoxY + sampleH, dy + dh);

    if (ix1 > ix0 && iy1 > iy0) {
      const sx = ((ix0 - dx) / dw) * intrinsic.w;
      const sy = ((iy0 - dy) / dh) * intrinsic.h;
      const sw = ((ix1 - ix0) / dw) * intrinsic.w;
      const sh = ((iy1 - iy0) / dh) * intrinsic.h;

      const dxOut = ((ix0 - srcBoxX) / sampleW) * outW;
      const dyOut = ((iy0 - srcBoxY) / sampleH) * outH;
      const dwOut = ((ix1 - ix0) / sampleW) * outW;
      const dhOut = ((iy1 - iy0) / sampleH) * outH;

      try {
        ctx.drawImage(media, sx, sy, sw, sh, dxOut, dyOut, dwOut, dhOut);
      } catch {
        // Tainted / not ready — keep stage fill (letterbox-accurate) and any
        // prior pixels. When caption sits mostly on media, fall through to
        // weighted guess below via stage-only sample.
      }
    }
  }

  let classified: CaptionBackdrop | null = null;
  try {
    classified = backdropFromImageData(ctx.getImageData(0, 0, outW, outH), bias);
  } catch {
    classified = null;
  }

  if (classified == null) {
    // CORS-tainted or empty: use stage when overlay is mostly letterbox;
    // otherwise assume dark media (light ink) which matches most posts.
    if (media && intrinsic && box.width > 0) {
      const { dx, dy, dw, dh } = containDest(box.width, box.height, intrinsic.w, intrinsic.h);
      const mediaOriginX = box.left - slideRect.left;
      const mediaOriginY = box.top - slideRect.top;
      const content = {
        left: mediaOriginX + dx,
        top: mediaOriginY + dy,
        right: mediaOriginX + dx + dw,
        bottom: mediaOriginY + dy + dh,
      };
      const overlapW = Math.max(
        0,
        Math.min(sampleLeft + sampleW, content.right) - Math.max(sampleLeft, content.left),
      );
      const overlapH = Math.max(
        0,
        Math.min(sampleTop + sampleH, content.bottom) - Math.max(sampleTop, content.top),
      );
      const coverage = (overlapW * overlapH) / (sampleW * sampleH);
      if (coverage < 0.4) {
        return backdropFromLuminance(relativeLuminance(stage.r, stage.g, stage.b));
      }
      return "dark";
    }
    return backdropFromLuminance(relativeLuminance(stage.r, stage.g, stage.b));
  }

  return classified;
}

/** @deprecated Prefer sampleOverlayBackdrop — same implementation. */
export const sampleCaptionBackdrop = sampleOverlayBackdrop;
