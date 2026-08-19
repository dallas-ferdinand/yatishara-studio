export function timeLabel(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function msAtClientX(
  clientX: number,
  rect: { left: number; width: number },
  durationMs: number,
): number {
  if (rect.width <= 0 || durationMs <= 0) return 0;
  const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  return ratio * durationMs;
}

export function rangePercents(
  startMs: number,
  endMs: number,
  durationMs: number,
): { startPct: number; widthPct: number } {
  if (durationMs <= 0) return { startPct: 0, widthPct: 0 };
  const startPct = Math.min(100, Math.max(0, (startMs / durationMs) * 100));
  const endPct = Math.min(100, Math.max(0, (endMs / durationMs) * 100));
  return { startPct, widthPct: Math.max(0, endPct - startPct) };
}

/** Square a filmstrip end once the handle is flush with that corner. */
export const FILM_EDGE_SQUARE_PX = 6;

export function filmEndCovered(
  distancePx: number,
  coverPx = FILM_EDGE_SQUARE_PX,
): boolean {
  return distancePx <= coverPx;
}

export function playheadPercent(currentMs: number, durationMs: number): number {
  if (durationMs <= 0) return 0;
  return Math.min(100, Math.max(0, (currentMs / durationMs) * 100));
}

export function clampMsToPreview(
  currentMs: number,
  startMs: number,
  endMs: number,
): number {
  if (endMs <= startMs) return Math.max(0, startMs);
  return Math.min(endMs, Math.max(startMs, currentMs));
}

export function movePreviewWindow(args: {
  durationMs: number;
  startMs: number;
  endMs: number;
  deltaMs: number;
}): { previewStartMs: number; previewEndMs: number } {
  const duration = Math.max(0, args.durationMs);
  const len = Math.max(0, args.endMs - args.startMs);
  if (duration <= 0 || len <= 0) {
    return { previewStartMs: 0, previewEndMs: 0 };
  }
  const maxStart = Math.max(0, duration - len);
  const start = Math.min(maxStart, Math.max(0, args.startMs + args.deltaMs));
  return {
    previewStartMs: Math.round(start),
    previewEndMs: Math.round(start + len),
  };
}

export function togglePreviewPlayback(
  video: HTMLVideoElement,
  startMs: number,
  endMs: number,
): void {
  if (video.paused) {
    const ms = video.currentTime * 1000;
    if (ms < startMs - 80 || ms >= endMs - 80) {
      video.currentTime = Math.max(0, startMs / 1000);
    }
    void video.play();
    return;
  }
  video.pause();
}

export function clampPlayheadToPreview(
  currentMs: number,
  startMs: number,
  endMs: number,
): "ok" | "ended" {
  if (currentMs >= endMs - 40) return "ended";
  if (currentMs < startMs - 80) return "ended";
  return "ok";
}
