// @ts-nocheck

import { whenFilmstripIdle } from "./filmstripGate";

const posterCache = new Map();
const filmstripCache = new Map();

/** At most two timeline video decodes at once — browsers choke on parallel seeks. */
const MAX_CONCURRENT_CAPTURES = 2;
/** Cap strip density so seeks don't starve live preview. */
const MAX_FILMSTRIP_CAPTURE_FRAMES = 16;
let activeCaptures = 0;
const captureWaiters = [];

function acquireCaptureSlot() {
  if (activeCaptures < MAX_CONCURRENT_CAPTURES) {
    activeCaptures += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    captureWaiters.push(resolve);
  }).then(() => {
    activeCaptures += 1;
  });
}

function releaseCaptureSlot() {
  activeCaptures = Math.max(0, activeCaptures - 1);
  const next = captureWaiters.shift();
  if (next) next();
}

export function isVideoFileUrl(url) {
  return typeof url === "string" && /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(url);
}

export function isImageThumbUrl(url) {
  return typeof url === "string" && url.length > 0 && !isVideoFileUrl(url);
}

function previewVideoUrl(media) {
  return media?.proxyUrl || media?.url || null;
}

function loadVideoElement(videoUrl) {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    // metadata is enough for seeks — "auto" downloads far more than we need.
    video.preload = "metadata";
    video.crossOrigin = "anonymous";
    video.src = videoUrl;

    const onError = () => {
      cleanup();
      reject(new Error("video load failed"));
    };
    const onReady = () => {
      cleanup();
      resolve(video);
    };
    const cleanup = () => {
      clearTimeout(timeout);
      video.removeEventListener("loadedmetadata", onReady);
      video.removeEventListener("loadeddata", onReady);
      video.removeEventListener("error", onError);
    };
    const timeout = setTimeout(onError, 8_000);
    video.addEventListener("loadedmetadata", onReady, { once: true });
    video.addEventListener("loadeddata", onReady, { once: true });
    video.addEventListener("error", onError, { once: true });
  });
}

function seekVideo(video, time) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      video.removeEventListener("seeked", onSeeked);
      clearTimeout(timeout);
      resolve();
    };
    const onSeeked = () => finish();
    const timeout = setTimeout(finish, 1_200);
    video.addEventListener("seeked", onSeeked);
    try {
      const duration = Number.isFinite(video.duration) ? video.duration : time;
      const target = Math.max(0, Math.min(time, Math.max(0, duration - 0.05)));
      if (video.readyState >= 2 && Math.abs(video.currentTime - target) < 0.005) {
        queueMicrotask(finish);
        return;
      }
      video.currentTime = target;
    } catch {
      finish();
    }
  });
}

function frameToDataUrl(video, maxW = 72) {
  try {
    const vw = video.videoWidth || 180;
    const vh = video.videoHeight || 320;
    if (!vw || !vh) return null;
    const scale = Math.min(1, maxW / vw);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(vw * scale));
    canvas.height = Math.max(1, Math.round(vh * scale));
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.62);
  } catch {
    return null;
  }
}

function disposeVideo(video) {
  try {
    video.removeAttribute("src");
    video.load();
  } catch {
    // ignore
  }
}

function sampleWindow(trimIn, trimOut) {
  const start = Math.max(0, trimIn);
  const end = Math.max(start + 0.05, trimOut);
  const span = end - start;
  // Skip the opening black/hold frame — sample a bit into the clip.
  const headPad = Math.min(0.45, Math.max(0.15, span * 0.12));
  const tailPad = Math.min(0.12, span * 0.04);
  const sampleStart = Math.min(end - 0.05, start + headPad);
  const sampleEnd = Math.max(sampleStart + 0.05, end - tailPad);
  return { sampleStart, sampleEnd, span };
}

export function captureVideoPoster(videoUrl, { trimIn = 0, trimOut } = {}) {
  if (!videoUrl) return Promise.resolve(null);
  const cacheKey = trimOut == null ? videoUrl : `${videoUrl}|${trimIn}|${trimOut}|poster`;
  if (posterCache.has(cacheKey)) return posterCache.get(cacheKey);

  const promise = (async () => {
    await whenFilmstripIdle();
    await acquireCaptureSlot();
    try {
      await whenFilmstripIdle();
      const video = await loadVideoElement(videoUrl);
      const end = trimOut ?? (Number.isFinite(video.duration) ? video.duration : trimIn + 4);
      const { sampleStart } = sampleWindow(trimIn, end);
      await seekVideo(video, sampleStart);
      const url = frameToDataUrl(video);
      disposeVideo(video);
      return url;
    } catch {
      return null;
    } finally {
      releaseCaptureSlot();
    }
  })().then((url) => {
    // Never cache a miss — contention / gate / timeout used to stick logos forever.
    if (!url) posterCache.delete(cacheKey);
    return url;
  });

  posterCache.set(cacheKey, promise);
  return promise;
}

/**
 * Capture a strip of frames across [trimIn, trimOut] for CapCut-like timeline tiles.
 * Density follows clip width; hard-capped so seeks stay bounded.
 */
export async function captureVideoFilmstrip(videoUrl, { trimIn = 0, trimOut = 4, count = 1 } = {}) {
  if (!videoUrl || count < 1) return [];
  const safeCount = Math.max(1, Math.min(MAX_FILMSTRIP_CAPTURE_FRAMES, count));
  const { sampleStart, sampleEnd } = sampleWindow(trimIn, trimOut);
  const key = `${videoUrl}|${sampleStart.toFixed(2)}|${sampleEnd.toFixed(2)}|${safeCount}`;
  if (filmstripCache.has(key)) return filmstripCache.get(key);

  const promise = (async () => {
    await whenFilmstripIdle();
    await acquireCaptureSlot();
    try {
      await whenFilmstripIdle();
      const video = await loadVideoElement(videoUrl);
      const frames = [];
      for (let i = 0; i < safeCount; i += 1) {
        await whenFilmstripIdle();
        const u = safeCount === 1 ? 0 : i / Math.max(1, safeCount - 1);
        const t = sampleStart + (sampleEnd - sampleStart) * u;
        await seekVideo(video, t);
        const frame = frameToDataUrl(video);
        if (frame) frames.push(frame);
      }
      disposeVideo(video);
      return frames;
    } catch {
      return [];
    } finally {
      releaseCaptureSlot();
    }
  })().then((frames) => {
    if (!frames.length) filmstripCache.delete(key);
    return frames;
  });

  filmstripCache.set(key, promise);
  return promise;
}

export function resolveClipPoster(media) {
  if (!media) return Promise.resolve(null);
  const thumb = media.thumbnailUrl ?? null;
  if (thumb && isImageThumbUrl(thumb)) return Promise.resolve(thumb);
  if (media.kind === "image" && media.url) return Promise.resolve(media.url);
  if (media.url && isImageThumbUrl(media.url)) return Promise.resolve(media.url);
  const videoUrl = previewVideoUrl(media);
  if ((media.kind === "video" || !media.kind) && videoUrl) return captureVideoPoster(videoUrl);
  if (thumb) return Promise.resolve(thumb);
  return Promise.resolve(null);
}

/** Timeline strip: never paint a multi‑MB original PNG as a CSS background. */
const FILMSTRIP_IMAGE_MAX_EDGE = 320;
const imageFilmstripCache = new Map();

export async function resolveImageFilmstripSrc(media) {
  if (!media) return null;
  const optimizedThumb =
    (media.thumbnailUrl && isImageThumbUrl(media.thumbnailUrl) && media.thumbnailUrl) || null;
  // Bunny/optimizer thumbs are already small — use as-is.
  if (optimizedThumb && /[?&](width|blur)=/i.test(optimizedThumb)) {
    return optimizedThumb;
  }
  if (optimizedThumb && optimizedThumb !== media.url) {
    return optimizedThumb;
  }
  const url = optimizedThumb || media.url || null;
  if (!url) return null;
  const cacheKey = `${media.assetId || url}:${FILMSTRIP_IMAGE_MAX_EDGE}`;
  const hit = imageFilmstripCache.get(cacheKey);
  if (hit) return hit;
  try {
    const response = await fetch(url, { credentials: "omit", mode: "cors" });
    if (!response.ok) return url;
    const blob = await response.blob();
    const full = await createImageBitmap(blob, { premultiplyAlpha: "none" });
    const scale = Math.min(1, FILMSTRIP_IMAGE_MAX_EDGE / Math.max(full.width, full.height, 1));
    let bitmap = full;
    if (scale < 0.999) {
      bitmap = await createImageBitmap(full, {
        resizeWidth: Math.max(1, Math.round(full.width * scale)),
        resizeHeight: Math.max(1, Math.round(full.height * scale)),
        resizeQuality: "low",
        premultiplyAlpha: "none",
      });
      full.close();
    }
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return url;
    }
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const out = await new Promise((resolve) => {
      canvas.toBlob(
        (b) => resolve(b ? URL.createObjectURL(b) : url),
        "image/webp",
        0.72,
      );
    });
    imageFilmstripCache.set(cacheKey, out);
    return out;
  } catch {
    return url;
  }
}

export async function resolveClipFilmstrip(media, { trimIn, trimOut, count }) {
  if (!media) return { frames: [], fallback: null };

  if (media.kind === "image") {
    const src = await resolveImageFilmstripSrc(media);
    return { frames: src ? [src] : [], fallback: src };
  }

  const videoUrl = previewVideoUrl(media);
  if (videoUrl && (media.kind === "video" || isVideoFileUrl(videoUrl))) {
    const thumb =
      (media.thumbnailUrl && isImageThumbUrl(media.thumbnailUrl) && media.thumbnailUrl) ||
      null;
    // While the edit proxy builds, skip multi-tile seek storms on the original —
    // but still grab one poster so the lane is not stuck on logos.
    const proxyPending =
      !media.proxyUrl &&
      (media.proxyStatus === "pending" || media.proxyStatus === "processing");
    if (proxyPending) {
      if (thumb) return { frames: [thumb], fallback: thumb };
      const poster = await captureVideoPoster(videoUrl, { trimIn, trimOut });
      if (poster) return { frames: [poster], fallback: poster };
      return { frames: [], fallback: null };
    }
    // Sample past the black open once proxy/original is ready for seeks.
    const tileCount = Math.max(1, Math.min(MAX_FILMSTRIP_CAPTURE_FRAMES, count || 1));
    if (tileCount >= 2) {
      const frames = await captureVideoFilmstrip(videoUrl, {
        trimIn,
        trimOut,
        count: tileCount,
      });
      if (frames.length) return { frames, fallback: frames[0] };
    }
    const poster = await captureVideoPoster(videoUrl, { trimIn, trimOut });
    if (poster) return { frames: [poster], fallback: poster };
    if (thumb) return { frames: [thumb], fallback: thumb };
  }

  const thumb =
    (media.thumbnailUrl && isImageThumbUrl(media.thumbnailUrl) && media.thumbnailUrl) || null;
  return { frames: thumb ? [thumb] : [], fallback: thumb };
}
