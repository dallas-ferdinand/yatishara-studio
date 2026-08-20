export type LiveFacing = "user" | "environment";

export type LiveCameraInfo = {
  deviceId: string;
  label: string;
  facing: LiveFacing | "unknown";
};

type TorchCaps = { torch?: boolean };
type ZoomCaps = {
  zoom?: { min: number; max: number; step?: number } | number;
};

export type LiveZoomRange = { min: number; max: number; step: number };

export function guessFacing(
  label: string,
  facingMode?: string,
): LiveFacing | "unknown" {
  const mode = String(facingMode ?? "").toLowerCase();
  if (mode === "user" || mode === "environment") return mode;
  const text = label.toLowerCase();
  if (/\b(front|user|face|facetime|selfie)\b/.test(text)) return "user";
  if (/\b(back|rear|environment|wide|ultra)\b/.test(text)) return "environment";
  return "unknown";
}

export function phoneTypeName() {
  if (typeof navigator === "undefined") return "Phone";
  const ua = navigator.userAgent;
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Android/i.test(ua)) return "Android";
  return "Phone";
}

export function facingLabel(facing: LiveFacing | "unknown") {
  if (facing === "user") return "Front camera";
  if (facing === "environment") return "Back camera";
  return "Camera";
}

export function cameraSourceName(opts: {
  kind: "camera" | "phone";
  label?: string;
  facing?: LiveFacing | "unknown";
}) {
  if (opts.kind === "phone") {
    const type = phoneTypeName();
    const cam = facingLabel(opts.facing ?? "environment");
    return `${type} · ${cam}`;
  }
  const label = (opts.label ?? "").replace(/\s*\([0-9a-f:]{4,}\)\s*$/i, "").trim();
  if (label) return label;
  return facingLabel(opts.facing ?? "unknown");
}

export function trackCanTorch(track: MediaStreamTrack | null | undefined) {
  if (!track || typeof track.getCapabilities !== "function") return false;
  const caps = track.getCapabilities() as MediaTrackCapabilities & TorchCaps;
  return Boolean(caps.torch);
}

export async function applyTrackTorch(
  track: MediaStreamTrack | null | undefined,
  on: boolean,
) {
  if (!track) return false;
  const attempts: MediaTrackConstraints[] = [
    { advanced: [{ torch: on } as MediaTrackConstraintSet] },
    { torch: on } as MediaTrackConstraintSet,
  ];
  for (const constraints of attempts) {
    try {
      await track.applyConstraints(constraints);
      return true;
    } catch {
      /* try the next shape — Chrome and Samsung disagree */
    }
  }
  return false;
}

export function trackZoomRange(
  track: MediaStreamTrack | null | undefined,
): LiveZoomRange | null {
  if (!track || typeof track.getCapabilities !== "function") return null;
  const caps = track.getCapabilities() as MediaTrackCapabilities & ZoomCaps;
  const zoom = caps.zoom;
  if (zoom == null) return null;
  if (typeof zoom === "number") {
    if (!Number.isFinite(zoom) || zoom <= 1) return null;
    return { min: 1, max: Math.min(16, zoom), step: 0.1 };
  }
  const min = Number(zoom.min);
  const max = Number(zoom.max);
  if (!Number.isFinite(min) || !Number.isFinite(max) || !(max > min)) return null;
  return {
    min,
    max: Math.min(16, max),
    step: zoom.step && Number.isFinite(zoom.step) && zoom.step > 0 ? zoom.step : 0.1,
  };
}

export async function applyTrackZoom(
  track: MediaStreamTrack | null | undefined,
  zoom: number,
) {
  if (!track) return false;
  const range = trackZoomRange(track);
  if (!range) return false;
  const value = Math.min(range.max, Math.max(range.min, zoom));
  const attempts: MediaTrackConstraints[] = [
    { advanced: [{ zoom: value } as MediaTrackConstraintSet] },
    { zoom: value } as MediaTrackConstraintSet,
  ];
  for (const constraints of attempts) {
    try {
      await track.applyConstraints(constraints);
      return true;
    } catch {
      /* Chrome and Safari disagree on zoom constraint shape */
    }
  }
  return false;
}

export async function listVideoInputs(): Promise<LiveCameraInfo[]> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
    return [];
  }
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((row) => row.kind === "videoinput" && row.deviceId)
    .map((row) => ({
      deviceId: row.deviceId,
      label: row.label || "Camera",
      facing: guessFacing(row.label),
    }));
}

export async function releaseCamera(
  stream: MediaStream | null | undefined,
  video?: HTMLVideoElement | null,
) {
  if (video) {
    video.pause();
    video.srcObject = null;
  }
  const tracks = stream?.getTracks() ?? [];
  for (const track of tracks) {
    if (track.kind === "video") {
      try {
        await applyTrackTorch(track, false);
      } catch {
        /* torch may already be off */
      }
    }
  }
  tracks.forEach((track) => {
    try {
      track.stop();
    } catch {
      /* already stopped */
    }
  });
  await new Promise((resolve) => window.setTimeout(resolve, 180));
}

export async function openCamera(opts: {
  deviceId?: string;
  facing?: LiveFacing;
  torch?: boolean;
  simple?: boolean;
  portrait?: boolean;
  audio?: boolean;
}) {
  const video: MediaTrackConstraints = opts.simple
    ? opts.portrait
      ? { aspectRatio: { ideal: 9 / 16 } }
      : {}
    : opts.portrait
      ? {
          width: { ideal: 1080 },
          height: { ideal: 1920 },
          aspectRatio: { ideal: 9 / 16 },
        }
      : {
          width: { ideal: 1280 },
          height: { ideal: 720 },
        };
  if (opts.deviceId) video.deviceId = { exact: opts.deviceId };
  else if (opts.facing) video.facingMode = { ideal: opts.facing };
  const videoOnly = Object.keys(video).length ? video : true;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: Boolean(opts.audio),
      video: videoOnly,
    });
    const track = stream.getVideoTracks()[0];
    if (opts.torch) await applyTrackTorch(track, true);
    return stream;
  } catch (error) {
    if (opts.audio) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: videoOnly,
        });
        const track = stream.getVideoTracks()[0];
        if (opts.torch) await applyTrackTorch(track, true);
        return stream;
      } catch {
        /* fall through to facing fallback */
      }
    }
    if (opts.facing && !opts.deviceId) {
      return await navigator.mediaDevices.getUserMedia({
        audio: Boolean(opts.audio),
        video: { facingMode: opts.facing },
      });
    }
    throw error;
  }
}

export async function openFacingCamera(facing: LiveFacing, simple = true) {
  try {
    return await openCamera({ facing, simple, portrait: false, audio: true });
  } catch {
    const cams = await listVideoInputs();
    const match =
      cams.find((row) => row.facing === facing) ??
      cams.find((row) => row.facing !== facing && row.facing !== "unknown") ??
      cams[0];
    if (!match) throw new Error("Could not switch camera");
    return await openCamera({
      deviceId: match.deviceId,
      simple: true,
      portrait: false,
      audio: true,
    });
  }
}

export function cameraFromStream(stream: MediaStream | null): {
  deviceId?: string;
  label: string;
  facing: LiveFacing | "unknown";
  torchSupported: boolean;
  zoom: LiveZoomRange | null;
} {
  const track = stream?.getVideoTracks()[0];
  const settings = track?.getSettings?.() ?? {};
  const label = track?.label || "Camera";
  return {
    deviceId: settings.deviceId,
    label,
    facing: guessFacing(label, settings.facingMode),
    torchSupported: trackCanTorch(track),
    zoom: trackZoomRange(track),
  };
}
