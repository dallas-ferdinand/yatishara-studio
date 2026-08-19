import { toast } from "sonner";
import { HELP_ANSWER_MAX_RECORDING_MS } from "../../../convex/lib/helpAnswer";
import { flattenFileForUpload } from "./flattenUploadFile";

export type ScreenSharePhase =
  | "idle"
  | "recording"
  | "preparing"
  | "uploading"
  | "finishing";

export type ScreenShareSnapshot = {
  recording: boolean;
  elapsedMs: number;
  includeMic: boolean;
  panelOpen: boolean;
  stageControls: boolean;
  phase: ScreenSharePhase;
  saveLoaded: number;
  saveTotal: number;
  uploadStartedAt: number;
  finishStartedAt: number;
  finishEstimateMs: number;
  pending: { file: File; durationMs: number } | null;
};

const SAVE_PHASES: ReadonlySet<ScreenSharePhase> = new Set([
  "preparing",
  "uploading",
  "finishing",
]);

/** Capture bitrate — unconstrained VP9 screen dumps are huge and save slowly. */
export const SCREEN_SHARE_VIDEO_BPS = 2_800_000;
export const SCREEN_SHARE_AUDIO_BPS = 96_000;
const UPLOAD_BAR_MAX = 90;
const FINISH_BAR_MAX = 97;

export function isScreenShareSaving(phase: ScreenSharePhase): boolean {
  return SAVE_PHASES.has(phase);
}

function formatSaveSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb >= 10 ? mb.toFixed(0) : mb.toFixed(1)} MB`;
}

export function finishEstimateMsForSize(byteSize: number): number {
  const bytes = Math.max(0, byteSize);
  return Math.max(8_000, Math.min(180_000, (bytes / (1.2 * 1024 * 1024)) * 1000));
}

export function screenShareSavePercent(
  snap: Pick<
    ScreenShareSnapshot,
    | "phase"
    | "saveLoaded"
    | "saveTotal"
    | "uploadStartedAt"
    | "finishStartedAt"
    | "finishEstimateMs"
  >,
  now = Date.now(),
): number | null {
  if (snap.phase === "preparing") return null;
  if (snap.phase === "uploading") {
    const real = snap.saveTotal > 0 ? snap.saveLoaded / snap.saveTotal : 0;
    const elapsed = snap.uploadStartedAt > 0 ? Math.max(0, now - snap.uploadStartedAt) : 0;
    const creep = snap.saveLoaded <= 0 ? Math.min(0.08, elapsed / 45_000) : 0;
    return Math.round(Math.min(UPLOAD_BAR_MAX, Math.max(real, creep) * 100));
  }
  if (snap.phase === "finishing") {
    const elapsed = snap.finishStartedAt > 0 ? Math.max(0, now - snap.finishStartedAt) : 0;
    const t = snap.finishEstimateMs > 0 ? elapsed / snap.finishEstimateMs : 0;
    const eased = 1 - Math.exp(-2.2 * Math.max(0, t));
    return Math.min(FINISH_BAR_MAX, UPLOAD_BAR_MAX + Math.round(eased * (FINISH_BAR_MAX - UPLOAD_BAR_MAX)));
  }
  return null;
}

export function screenShareSaveLabel(
  snap: Pick<
    ScreenShareSnapshot,
    | "phase"
    | "saveLoaded"
    | "saveTotal"
    | "uploadStartedAt"
    | "finishStartedAt"
    | "finishEstimateMs"
  >,
  now = Date.now(),
): string | null {
  if (snap.phase === "preparing") return "Preparing recording…";
  if (snap.phase === "uploading") {
    const pct = screenShareSavePercent(snap, now) ?? 0;
    if (snap.saveLoaded > 0 && snap.saveTotal > 0) {
      const bytesPct = Math.min(100, Math.round((snap.saveLoaded / snap.saveTotal) * 100));
      return `Saving ${bytesPct}% · ${formatSaveSize(snap.saveLoaded)} of ${formatSaveSize(snap.saveTotal)}`;
    }
    return pct > 0 ? `Saving ${pct}%` : "Saving…";
  }
  if (snap.phase === "finishing") return "Saving to Screen Recordings…";
  return null;
}

function pickRecorderMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return [
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp9,opus",
    "video/webm",
    "video/mp4",
  ].find((type) => MediaRecorder.isTypeSupported(type));
}

function createScreenRecorder(stream: MediaStream): MediaRecorder {
  const mime = pickRecorderMime();
  const withBitrate = {
    ...(mime ? { mimeType: mime } : {}),
    videoBitsPerSecond: SCREEN_SHARE_VIDEO_BPS,
    audioBitsPerSecond: SCREEN_SHARE_AUDIO_BPS,
  };
  try {
    return new MediaRecorder(stream, withBitrate);
  } catch {
    return mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
  }
}

const DISPLAY_CONSTRAINTS: DisplayMediaStreamOptions[] = [
  {
    video: {
      width: { ideal: 1920, max: 1920 },
      height: { ideal: 1080, max: 1080 },
      frameRate: { ideal: 20, max: 24 },
    },
    audio: true,
  },
  {
    video: {
      width: { ideal: 1920, max: 1920 },
      height: { ideal: 1080, max: 1080 },
      frameRate: { ideal: 20, max: 24 },
    },
    audio: false,
  },
  { video: true, audio: true },
  { video: true, audio: false },
];

async function acquireDisplayStream(): Promise<MediaStream> {
  let lastError: unknown;
  for (const constraints of DISPLAY_CONSTRAINTS) {
    try {
      return await navigator.mediaDevices.getDisplayMedia(constraints);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Screen share was cancelled");
}

type RecordedHandler = (file: File, durationMs: number) => void;

const listeners = new Set<() => void>();
const recordedHandlers: RecordedHandler[] = [];

let recording = false;
let elapsedMs = 0;
let includeMic = true;
let panelOpen = false;
let stageControls = false;
let pending: ScreenShareSnapshot["pending"] = null;
let phase: ScreenSharePhase = "idle";
let saveLoaded = 0;
let saveTotal = 0;
let uploadStartedAt = 0;
let finishStartedAt = 0;
let finishEstimateMs = 8_000;
let lastProgressNotify = 0;

let recorder: MediaRecorder | null = null;
let streams: MediaStream[] = [];
let audioCtx: AudioContext | null = null;
let startedAt = 0;
let tickId: number | null = null;

function snapshotFromState(): ScreenShareSnapshot {
  return {
    recording,
    elapsedMs,
    includeMic,
    panelOpen,
    stageControls,
    phase,
    saveLoaded,
    saveTotal,
    uploadStartedAt,
    finishStartedAt,
    finishEstimateMs,
    pending,
  };
}

let cached: ScreenShareSnapshot = snapshotFromState();

function emit(): void {
  cached = snapshotFromState();
  for (const listener of listeners) listener();
}

function writeCached(): void {
  cached = snapshotFromState();
}

function snapshot(): ScreenShareSnapshot {
  return cached;
}

function stopTracks(): void {
  for (const stream of streams) {
    for (const track of stream.getTracks()) track.stop();
  }
  streams = [];
  if (audioCtx) {
    void audioCtx.close().catch(() => {});
    audioCtx = null;
  }
  if (tickId != null) {
    window.clearInterval(tickId);
    tickId = null;
  }
  recorder = null;
}

function finishBlob(rec: MediaRecorder, chunks: BlobPart[]): void {
  const durationMs = Date.now() - startedAt;
  phase = "preparing";
  emit();
  void (async () => {
    try {
      const blob = new Blob(chunks, { type: rec.mimeType || "video/webm" });
      stopTracks();
      recording = false;
      elapsedMs = 0;
      if (blob.size < 1000) {
        pending = null;
        phase = "idle";
        toast.error("Recording was empty");
        emit();
        return;
      }
      const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const file = await flattenFileForUpload(
        blob,
        `Screen recording ${stamp}.webm`,
      );
      const handler = recordedHandlers[recordedHandlers.length - 1] ?? null;
      if (handler) {
        pending = null;
        phase = "uploading";
        saveLoaded = 0;
        saveTotal = file.size;
        uploadStartedAt = Date.now();
        handler(file, durationMs);
      } else {
        pending = { file, durationMs };
        phase = "idle";
        toast.success("Recording kept — it will save when Studio is ready");
      }
      emit();
    } catch {
      stopTracks();
      recording = false;
      elapsedMs = 0;
      pending = null;
      phase = "idle";
      toast.error("Could not pack the recording");
      emit();
    }
  })();
}

export const screenShareSession = {
  getSnapshot: snapshot,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  setIncludeMic(next: boolean): void {
    if (recording) return;
    includeMic = next;
    emit();
  },
  armPanel(): void {
    if (panelOpen) return;
    panelOpen = true;
    emit();
  },
  disarmPanel(): void {
    if (!panelOpen) return;
    if (recording || isScreenShareSaving(phase)) return;
    panelOpen = false;
    emit();
  },
  setStageControls(next: boolean): void {
    if (stageControls === next) return;
    stageControls = next;
    emit();
  },
  addRecordedHandler(handler: RecordedHandler): () => void {
    recordedHandlers.push(handler);
    return () => {
      const index = recordedHandlers.lastIndexOf(handler);
      if (index >= 0) recordedHandlers.splice(index, 1);
    };
  },
  recordedHandlerCount(): number {
    return recordedHandlers.length;
  },
  /** Last registered handler wins. Compose overlays the library saver. */
  setRecordedHandler(handler: RecordedHandler | null): void {
    recordedHandlers.length = 0;
    if (handler) recordedHandlers.push(handler);
  },
  consumePending(): ScreenShareSnapshot["pending"] {
    const held = pending;
    pending = null;
    if (held) emit();
    return held;
  },
  async start(): Promise<"ok" | "unsupported" | "cancelled"> {
    if (recording || isScreenShareSaving(phase)) return "ok";
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getDisplayMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      return "unsupported";
    }
    try {
      const display = await acquireDisplayStream();
      streams.push(display);
      let mixed: MediaStream = display;
      if (includeMic) {
        try {
          const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
          streams.push(mic);
          const ctx = new AudioContext();
          audioCtx = ctx;
          const dest = ctx.createMediaStreamDestination();
          const displayAudio = display.getAudioTracks()[0];
          if (displayAudio) {
            ctx.createMediaStreamSource(new MediaStream([displayAudio])).connect(dest);
          }
          const micTrack = mic.getAudioTracks()[0];
          if (micTrack) {
            ctx.createMediaStreamSource(new MediaStream([micTrack])).connect(dest);
          }
          mixed = new MediaStream([
            ...display.getVideoTracks(),
            ...dest.stream.getAudioTracks(),
          ]);
        } catch {
          mixed = display;
        }
      }
      const chunks: BlobPart[] = [];
      const rec = createScreenRecorder(mixed);
      rec.ondataavailable = (event) => {
        if (event.data?.size) chunks.push(event.data);
      };
      rec.onstop = () => {
        phase = "preparing";
        recording = false;
        emit();
        window.setTimeout(() => finishBlob(rec, chunks), 0);
      };
      display.getVideoTracks()[0]?.addEventListener("ended", () => {
        if (rec.state === "recording" || rec.state === "paused") rec.stop();
      });
      recorder = rec;
      startedAt = Date.now();
      elapsedMs = 0;
      recording = true;
      panelOpen = true;
      phase = "recording";
      rec.start(2000);
      tickId = window.setInterval(() => {
        elapsedMs = Date.now() - startedAt;
        emit();
        if (elapsedMs >= HELP_ANSWER_MAX_RECORDING_MS && rec.state === "recording") {
          rec.stop();
        }
      }, 250);
      emit();
      return "ok";
    } catch {
      stopTracks();
      recording = false;
      elapsedMs = 0;
      phase = "idle";
      emit();
      return "cancelled";
    }
  },
  stop(): void {
    const rec = recorder;
    if (rec && (rec.state === "recording" || rec.state === "paused")) {
      phase = "preparing";
      emit();
      rec.stop();
      return;
    }
    stopTracks();
    recording = false;
    elapsedMs = 0;
    if (phase === "recording" || phase === "preparing") phase = "idle";
    emit();
  },
  setSaveProgress(loaded: number, total: number): void {
    if (phase === "finishing") return;
    if (phase !== "uploading") uploadStartedAt = Date.now();
    phase = "uploading";
    saveLoaded = loaded;
    saveTotal = total > 0 ? total : saveTotal;
    writeCached();
    const now = Date.now();
    const done = saveTotal > 0 && saveLoaded >= saveTotal;
    if (!done && now - lastProgressNotify < 120) return;
    lastProgressNotify = now;
    for (const listener of listeners) listener();
  },
  beginFinishing(): void {
    phase = "finishing";
    finishStartedAt = Date.now();
    finishEstimateMs = finishEstimateMsForSize(saveTotal);
    emit();
  },
  clearSave(): void {
    phase = "idle";
    saveLoaded = 0;
    saveTotal = 0;
    uploadStartedAt = 0;
    finishStartedAt = 0;
    finishEstimateMs = 8_000;
    lastProgressNotify = 0;
    emit();
  },
};
