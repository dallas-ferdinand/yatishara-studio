/**
 * Bunny Stream embed ↔ Player.js bridge for currentTime / seek.
 * Docs: https://docs.bunny.net/stream/playback-api
 */

type PlayerJsPlayer = {
  on: (event: string, cb: (...args: unknown[]) => void) => void;
  off?: (event: string, cb: (...args: unknown[]) => void) => void;
  getCurrentTime: (cb: (value: number) => void) => void;
  setCurrentTime: (seconds: number) => void;
};

type PlayerJsGlobal = {
  Player: new (el: HTMLIFrameElement | string) => PlayerJsPlayer;
};

declare global {
  interface Window {
    playerjs?: PlayerJsGlobal;
  }
}

const PLAYER_JS_SRC =
  "https://assets.mediadelivery.net/playerjs/player-0.1.0.min.js";

let loadPromise: Promise<PlayerJsGlobal | null> | null = null;

function loadPlayerJs(): Promise<PlayerJsGlobal | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (window.playerjs) return Promise.resolve(window.playerjs);
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${PLAYER_JS_SRC}"]`,
    );
    if (existing) {
      existing.addEventListener("load", () => resolve(window.playerjs ?? null), {
        once: true,
      });
      existing.addEventListener("error", () => resolve(null), { once: true });
      if (window.playerjs) resolve(window.playerjs);
      return;
    }
    const script = document.createElement("script");
    script.src = PLAYER_JS_SRC;
    script.async = true;
    script.onload = () => resolve(window.playerjs ?? null);
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
  return loadPromise;
}

function readSeconds(data: unknown): number | null {
  if (typeof data === "number" && Number.isFinite(data)) return Math.max(0, data);
  if (data && typeof data === "object") {
    const row = data as { seconds?: unknown; value?: unknown };
    const raw = row.seconds ?? row.value;
    if (typeof raw === "number" && Number.isFinite(raw)) return Math.max(0, raw);
  }
  return null;
}

/** Attach Player.js to a Bunny Stream iframe; returns dispose + seek helpers. */
export function attachBunnyStreamPlayer(
  iframe: HTMLIFrameElement,
  onTime: (seconds: number) => void,
): { dispose: () => void; seekTo: (seconds: number) => void } {
  let disposed = false;
  let player: PlayerJsPlayer | null = null;

  const seekTo = (seconds: number) => {
    if (!player || !Number.isFinite(seconds)) return;
    try {
      player.setCurrentTime(Math.max(0, seconds));
    } catch {
      /* ignore */
    }
  };

  void loadPlayerJs().then((api) => {
    if (disposed || !api || !iframe.isConnected) return;
    try {
      player = new api.Player(iframe);
      player.on("ready", () => {
        if (disposed || !player) return;
        player.on("timeupdate", (data: unknown) => {
          const sec = readSeconds(data);
          if (sec != null) onTime(sec);
        });
        player.getCurrentTime((value) => {
          const sec = readSeconds(value);
          if (sec != null) onTime(sec);
        });
      });
    } catch {
      player = null;
    }
  });

  return {
    dispose: () => {
      disposed = true;
      player = null;
    },
    seekTo,
  };
}

export function formatVideoTimecode(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}
