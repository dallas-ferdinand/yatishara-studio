// @ts-nocheck

const posterCache = new Map();

export function isVideoFileUrl(url) {
  return typeof url === "string" && /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(url);
}

export function isImageThumbUrl(url) {
  return typeof url === "string" && url.length > 0 && !isVideoFileUrl(url);
}

export function captureVideoPoster(videoUrl) {
  if (!videoUrl) return Promise.resolve(null);
  if (posterCache.has(videoUrl)) return posterCache.get(videoUrl);

  const promise = new Promise((resolve) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = videoUrl;

    const finish = (value) => {
      if (value) posterCache.set(videoUrl, Promise.resolve(value));
      resolve(value);
    };

    video.addEventListener(
      "loadeddata",
      () => {
        try {
          video.currentTime = Math.min(0.35, Math.max(0.05, (video.duration || 1) * 0.08));
        } catch {
          finish(null);
        }
      },
      { once: true },
    );

    video.addEventListener(
      "seeked",
      () => {
        try {
          const canvas = document.createElement("canvas");
          const w = video.videoWidth || 180;
          const h = video.videoHeight || 320;
          canvas.width = w;
          canvas.height = h;
          canvas.getContext("2d")?.drawImage(video, 0, 0, w, h);
          finish(canvas.toDataURL("image/jpeg", 0.75));
        } catch {
          finish(null);
        }
      },
      { once: true },
    );

    video.addEventListener("error", () => finish(null), { once: true });
  });

  posterCache.set(videoUrl, promise);
  return promise;
}

export function resolveClipPoster(media) {
  if (!media) return Promise.resolve(null);
  const thumb = media.thumbnailUrl ?? media.url;
  if (isImageThumbUrl(thumb)) return Promise.resolve(thumb);
  if (media.kind === "video" && media.url) return captureVideoPoster(media.url);
  if (media.kind === "image" && media.url) return Promise.resolve(media.url);
  return Promise.resolve(null);
}
