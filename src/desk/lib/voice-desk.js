/** Desk voice → gateway → Deepgram (shared web recorder + raw blob upload). */
import * as api from "@mos-app/api.js";
import { WebVoiceRecorder } from "@mos-app/voice-web.js";

const rec = new WebVoiceRecorder();

export function isRecording() {
  return rec.isRecording();
}

export async function startRecording() {
  return rec.start();
}

export async function stopRecording() {
  return rec.stop();
}

export async function cancelRecording() {
  rec.cancel();
}

export async function transcribeRecording(data) {
  const payload = data ?? (await stopRecording());
  if (!payload?.blob) {
    throw new Error("No audio captured — tap mic to start, tap again to stop");
  }

  const res = await api.transcribe(payload.blob, payload.mimetype, {
    bytes: payload.bytes,
    source: payload.source ?? "web",
    durationMs: payload.durationMs,
    client: "desk",
  });

  const text = (res.text ?? res.transcript ?? "").trim();
  if (!text) {
    throw new Error(
      `No speech detected (${payload.bytes} bytes) — speak clearly, then tap mic to stop`
    );
  }
  return text;
}
