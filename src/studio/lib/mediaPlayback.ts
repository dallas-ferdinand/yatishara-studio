/** Shared helpers for custom HTMLMediaElement players. */

export function formatMediaTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function isVideoFileUrl(url: string | null | undefined): boolean {
  return typeof url === "string" && /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(url);
}

/** Prefer a real media URL; never treat an image poster as a playable video source. */
export function playableMediaUrl(
  ...candidates: Array<string | null | undefined>
): string | undefined {
  for (const candidate of candidates) {
    if (typeof candidate !== "string" || !/^https?:\/\//i.test(candidate)) continue;
    if (/\.(png|jpe?g|gif|webp|avif)(\?|#|$)/i.test(candidate)) continue;
    return candidate;
  }
  return undefined;
}

export function clampMediaTime(value: number, duration: number): number {
  if (!Number.isFinite(value)) return 0;
  if (!Number.isFinite(duration) || duration <= 0) return Math.max(0, value);
  return Math.min(Math.max(0, value), duration);
}

export function commitMediaSeek(
  media: HTMLMediaElement | null | undefined,
  next: number,
): number | null {
  if (!media || !Number.isFinite(next)) return null;
  const clamped = clampMediaTime(next, media.duration);
  try {
    media.currentTime = clamped;
  } catch {
    /* ignore NotSupportedError before metadata */
  }
  return clamped;
}

/**
 * Range inputs fire `change` for keyboard without pointerup.
 * Track pointer seeking separately and commit immediately for keyboard.
 */
export function createSeekHandlers(options: {
  getMedia: () => HTMLMediaElement | null | undefined;
  setSeekValue: (value: number) => void;
  setSeeking: (value: boolean) => void;
  setCurrent?: (value: number) => void;
  pointerSeekingRef: { current: boolean };
}) {
  const { getMedia, setSeekValue, setSeeking, setCurrent, pointerSeekingRef } = options;

  const finish = (raw: number) => {
    const committed = commitMediaSeek(getMedia(), raw);
    const next = committed ?? raw;
    setSeekValue(next);
    setCurrent?.(next);
    pointerSeekingRef.current = false;
    setSeeking(false);
  };

  return {
    onPointerDown: () => {
      pointerSeekingRef.current = true;
      setSeeking(true);
    },
    onChange: (event: { target: EventTarget | null }) => {
      const next = Number((event.target as HTMLInputElement).value);
      setSeekValue(next);
      if (!pointerSeekingRef.current) finish(next);
    },
    onPointerUp: (event: { currentTarget: EventTarget | null }) => {
      finish(Number((event.currentTarget as HTMLInputElement).value));
    },
    onPointerCancel: (event: { currentTarget: EventTarget | null }) => {
      finish(Number((event.currentTarget as HTMLInputElement).value));
    },
    onBlur: (event: { currentTarget: EventTarget | null }) => {
      finish(Number((event.currentTarget as HTMLInputElement).value));
    },
  };
}
