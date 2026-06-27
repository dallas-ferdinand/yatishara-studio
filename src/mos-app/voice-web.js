/**
 * Shared browser MediaRecorder pipeline (desk + phone web fallback).
 * Stop sequence: requestData → stop → flush delay → release tracks.
 */

export const MIN_AUDIO_BYTES = 500;
export const MIN_RECORD_MS = 700;

export function isAndroidUa() {
  return /Android/i.test(navigator.userAgent);
}

export function pickRecordingMime() {
  const candidates = isAndroidUa()
    ? ["audio/mp4", "audio/aac", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"]
    : ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4", "audio/aac"];
  for (const m of candidates) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return "";
}

export class WebVoiceRecorder {
  constructor() {
    this.recorder = null;
    this.stream = null;
    this.chunks = [];
    this.startedAt = 0;
    this.lastDiag = null;
  }

  isRecording() {
    return this.recorder?.state === "recording";
  }

  getLastDiagnostics() {
    return this.lastDiag;
  }

  async start() {
    if (this.isRecording()) return this.recorder.mimeType;

    this.chunks = [];
    this.lastDiag = null;

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Microphone not available in this browser");
    }

    this.stream = await navigator.mediaDevices
      .getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
        },
      })
      .catch((err) => {
        if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
          throw new Error("Mic blocked — allow microphone access for this site");
        }
        throw err;
      });

    const mime = pickRecordingMime();
    try {
      this.recorder = mime
        ? new MediaRecorder(this.stream, { mimeType: mime })
        : new MediaRecorder(this.stream);
    } catch {
      this.recorder = new MediaRecorder(this.stream);
    }

    this.recorder.ondataavailable = (e) => {
      if (e.data?.size > 0) this.chunks.push(e.data);
    };

    try {
      this.recorder.start();
    } catch {
      try {
        this.recorder.start(250);
      } catch {
        this.recorder.start();
      }
    }

    this.startedAt = Date.now();
    const actualMime = this.recorder.mimeType || mime || "audio/webm";
    this.lastDiag = { source: "web", mimetype: actualMime, mimePicked: mime };
    return actualMime;
  }

  async stop() {
    if (!this.recorder) return null;

    const rec = this.recorder;
    const stream = this.stream;
    const mime = rec.mimeType || pickRecordingMime() || "audio/webm";
    const started = this.startedAt;
    const chunksBeforeStop = this.chunks.length;

    this.recorder = null;
    this.stream = null;
    this.startedAt = 0;

    const blob = await new Promise((resolve, reject) => {
      let settled = false;

      const finish = async () => {
        if (settled) return;
        settled = true;
        await new Promise((r) => setTimeout(r, 320));
        stream?.getTracks?.().forEach((t) => t.stop());
        resolve(new Blob(this.chunks, { type: mime }));
        this.chunks = [];
      };

      rec.onerror = (ev) => {
        if (settled) return;
        settled = true;
        stream?.getTracks?.().forEach((t) => t.stop());
        this.chunks = [];
        reject(new Error(`Recorder error: ${ev.error?.message ?? "unknown"}`));
      };

      rec.ondataavailable = (e) => {
        if (e.data?.size > 0) this.chunks.push(e.data);
      };

      rec.onstop = () => {
        finish().catch(reject);
      };

      try {
        if (rec.state === "recording") rec.requestData();
      } catch {
        /* ignore */
      }

      try {
        if (rec.state !== "inactive") rec.stop();
      } catch (err) {
        stream?.getTracks?.().forEach((t) => t.stop());
        this.chunks = [];
        reject(new Error(`Recorder stop failed: ${err.message ?? "unknown"}`));
      }
    });

    const durationMs = Date.now() - started;
    const bytes = blob.size;
    const diag = {
      source: "web",
      bytes,
      durationMs,
      mimetype: mime,
      chunks: chunksBeforeStop,
    };
    this.lastDiag = diag;

    if (bytes < MIN_AUDIO_BYTES || durationMs < MIN_RECORD_MS) {
      const why =
        durationMs < MIN_RECORD_MS
          ? "Recording too brief — tap mic, speak, tap again to stop"
          : `No audio captured (${bytes} bytes) — check mic permission and try again`;
      const err = new Error(why);
      err.diagnostics = diag;
      throw err;
    }

    return { blob, mimetype: mime, bytes, durationMs, source: "web", chunks: chunksBeforeStop };
  }

  cancel() {
    try {
      if (this.recorder?.state === "recording") this.recorder.stop();
    } catch {
      /* ignore */
    }
    this.stream?.getTracks?.().forEach((t) => t.stop());
    this.recorder = null;
    this.stream = null;
    this.chunks = [];
    this.startedAt = 0;
  }
}
