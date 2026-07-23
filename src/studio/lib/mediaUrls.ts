/** Bunny Optimizer query params — present only on thumbnail/preview transforms. */
const THUMB_MAX_WIDTH = 1280;

export function isBunnyOptimizedUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== "string" || !/^https?:\/\//i.test(url)) return false;
  try {
    const parsed = new URL(url);
    if (parsed.searchParams.has("blur")) return true;
    const width = Number(parsed.searchParams.get("width") || 0);
    if (width > 0 && width <= THUMB_MAX_WIDTH) return true;
    const quality = Number(parsed.searchParams.get("quality") || 0);
    // Full reads use quality=100 + a high width ceiling; thumbs use ~58–88.
    if (quality > 0 && quality < 95 && (width <= 0 || width <= THUMB_MAX_WIDTH)) return true;
    return false;
  } catch {
    return false;
  }
}

/** First absolute URL that is not a Bunny thumbnail/preview transform. */
export function fullQualityUrl(
  ...candidates: Array<string | null | undefined>
): string | undefined {
  for (const candidate of candidates) {
    if (
      typeof candidate === "string" &&
      /^https?:\/\//i.test(candidate) &&
      !isBunnyOptimizedUrl(candidate)
    ) {
      return candidate;
    }
  }
  return undefined;
}

/** Prefer an optimized thumb when available; otherwise any absolute URL. */
export function thumbnailDisplayUrl(
  ...candidates: Array<string | null | undefined>
): string | undefined {
  let fallback: string | undefined;
  for (const candidate of candidates) {
    if (typeof candidate !== "string" || !/^https?:\/\//i.test(candidate)) continue;
    if (isBunnyOptimizedUrl(candidate)) return candidate;
    if (!fallback) fallback = candidate;
  }
  return fallback;
}

function safeDownloadName(filename: string, fallback = "download") {
  return filename.replace(/[/\\?%*:|"<>]/g, "_").trim() || fallback;
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 2_000);
}

/** Encode a mono/stereo AudioBuffer slice as a 16-bit PCM WAV blob. */
export function audioBufferToWavBlob(
  buffer: AudioBuffer,
  trimInSec = 0,
  trimOutSec?: number,
): Blob {
  const sampleRate = buffer.sampleRate;
  const start = Math.max(0, Math.floor(trimInSec * sampleRate));
  const endSample = Math.min(
    buffer.length,
    Math.floor((trimOutSec ?? buffer.duration) * sampleRate),
  );
  const frameCount = Math.max(0, endSample - start);
  const numChannels = Math.min(2, Math.max(1, buffer.numberOfChannels));
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = frameCount * blockAlign;
  const headerSize = 44;
  const out = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(out);

  const writeStr = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);

  const channels = Array.from({ length: numChannels }, (_, ch) => buffer.getChannelData(ch));
  let offset = headerSize;
  for (let i = 0; i < frameCount; i += 1) {
    for (let ch = 0; ch < numChannels; ch += 1) {
      const sample = Math.max(-1, Math.min(1, channels[ch]![start + i]!));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([out], { type: "audio/wav" });
}

/**
 * Decode media audio in-browser and download only the trim range as WAV.
 * Never falls back to the full source file — callers should use a server cut instead.
 */
export async function downloadMediaAsWav(
  url: string,
  filename = "audio.wav",
  trimInSec = 0,
  trimOutSec?: number,
) {
  if (!url) return false;
  if (typeof AudioContext === "undefined") {
    throw new Error("Audio decode is not available in this browser.");
  }
  const safeName = safeDownloadName(
    filename.toLowerCase().endsWith(".wav") ? filename : `${filename.replace(/\.[^.]+$/, "")}.wav`,
    "audio.wav",
  );
  const response = await fetch(url, { mode: "cors", credentials: "omit" });
  if (!response.ok) throw new Error(`Download failed (${response.status})`);
  const raw = await response.arrayBuffer();
  const ctx = new AudioContext();
  try {
    const decoded = await ctx.decodeAudioData(raw.slice(0));
    const blob = audioBufferToWavBlob(decoded, trimInSec, trimOutSec);
    if (blob.size < 44) throw new Error("Clipped audio is empty.");
    triggerBlobDownload(blob, safeName);
    return true;
  } finally {
    await ctx.close().catch(() => undefined);
  }
}

function waitMediaEvent(element: HTMLMediaElement, event: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onOk = () => {
      cleanup();
      resolve();
    };
    const onErr = () => {
      cleanup();
      reject(new Error("Media failed to load."));
    };
    const cleanup = () => {
      element.removeEventListener(event, onOk);
      element.removeEventListener("error", onErr);
    };
    element.addEventListener(event, onOk, { once: true });
    element.addEventListener("error", onErr, { once: true });
  });
}

/**
 * Capture only [trimIn, trimOut] from a video URL via MediaRecorder.
 * Real-time (duration ≈ clip length). Prefer server ffmpeg cut when available.
 */
export async function downloadVideoSegment(
  url: string,
  filename = "clip.webm",
  trimInSec = 0,
  trimOutSec?: number,
) {
  if (!url || typeof document === "undefined") return false;
  if (typeof MediaRecorder === "undefined") {
    throw new Error("This browser cannot capture clipped video.");
  }
  const trimIn = Math.max(0, trimInSec);
  const trimOut = Math.max(trimIn + 0.05, trimOutSec ?? trimIn + 0.05);
  const durationSec = trimOut - trimIn;

  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.preload = "auto";
  video.playsInline = true;
  video.muted = false;
  video.src = url;
  await waitMediaEvent(video, "loadedmetadata");
  video.currentTime = trimIn;
  await waitMediaEvent(video, "seeked");

  const captureVideo = video as HTMLVideoElement & {
    captureStream?: () => MediaStream;
    mozCaptureStream?: () => MediaStream;
  };
  const capture =
    typeof captureVideo.captureStream === "function"
      ? captureVideo.captureStream()
      : typeof captureVideo.mozCaptureStream === "function"
        ? captureVideo.mozCaptureStream()
        : null;
  if (!capture) throw new Error("This browser cannot capture clipped video.");

  const mimeCandidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4",
  ];
  const mime =
    mimeCandidates.find(
      (candidate) =>
        typeof MediaRecorder.isTypeSupported === "function" &&
        MediaRecorder.isTypeSupported(candidate),
    ) ?? "";
  const chunks: BlobPart[] = [];
  const recorder = mime
    ? new MediaRecorder(capture, { mimeType: mime })
    : new MediaRecorder(capture);
  recorder.ondataavailable = (event) => {
    if (event.data?.size) chunks.push(event.data);
  };
  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });

  recorder.start(200);
  try {
    await video.play();
  } catch {
    video.muted = true;
    await video.play();
  }

  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      video.pause();
      if (recorder.state !== "inactive") recorder.stop();
      resolve();
    };
    const tick = () => {
      if (video.currentTime >= trimOut - 0.04 || video.ended) {
        finish();
        return;
      }
      requestAnimationFrame(tick);
    };
    window.setTimeout(finish, Math.ceil(durationSec * 1000) + 2000);
    tick();
  });
  await stopped;

  for (const track of capture.getTracks()) track.stop();
  video.removeAttribute("src");
  video.load();

  const type = recorder.mimeType || mime || "video/webm";
  const ext = type.includes("mp4") ? ".mp4" : ".webm";
  const base = filename.replace(/\.[^.]+$/, "");
  const safeName = safeDownloadName(`${base}${ext}`, `clip${ext}`);
  const blob = new Blob(chunks, { type });
  if (blob.size < 64) throw new Error("Clipped video is empty.");
  triggerBlobDownload(blob, safeName);
  return true;
}

/** Trigger a real file download (works for cross-origin CDN URLs with CORS). */
export async function downloadMediaUrl(url: string, filename = "download") {
  if (!url) return false;
  const safeName = safeDownloadName(filename);
  try {
    const response = await fetch(url, { mode: "cors", credentials: "omit" });
    if (!response.ok) throw new Error(`Download failed (${response.status})`);
    const blob = await response.blob();
    triggerBlobDownload(blob, safeName);
    return true;
  } catch {
    // Fallback: still try the download attribute without a new-tab target.
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = safeName;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return false;
  }
}
