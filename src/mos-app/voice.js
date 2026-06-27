import * as api from "./api.js";
import { WebVoiceRecorder, isAndroidUa } from "./voice-web.js";

let webRecorder = new WebVoiceRecorder();
let usingNative = false;
let lastDiag = null;
let preferWebRecording = false;
let nativeFailStreak = 0;

const NATIVE_FAIL_KEY = "mercuryos-voice-native-fail";
const NATIVE_FAIL_STREAK_MAX = 2;

function loadNativeFailFlag() {
  try {
    preferWebRecording = sessionStorage.getItem(NATIVE_FAIL_KEY) === "1";
  } catch {
    preferWebRecording = false;
  }
}

function markNativeFailed() {
  nativeFailStreak += 1;
  if (nativeFailStreak >= NATIVE_FAIL_STREAK_MAX) {
    preferWebRecording = true;
    try {
      sessionStorage.setItem(NATIVE_FAIL_KEY, "1");
    } catch {
      /* ignore */
    }
  }
}

function clearNativeFailFlag() {
  nativeFailStreak = 0;
  preferWebRecording = false;
  try {
    sessionStorage.removeItem(NATIVE_FAIL_KEY);
  } catch {
    /* ignore */
  }
}

loadNativeFailFlag();

function voicePlugin() {
  return window.Capacitor?.Plugins?.MercuryVoice ?? null;
}

function hasNativePlugin() {
  return Boolean(voicePlugin()?.start);
}

export function isRecording() {
  if (usingNative) return true;
  return webRecorder.isRecording();
}

export function getLastDiagnostics() {
  return lastDiag ?? webRecorder.getLastDiagnostics();
}

export async function startRecording() {
  lastDiag = null;
  const native = voicePlugin();

  if (native?.start && !preferWebRecording) {
    try {
      await native.discard?.().catch(() => {});
      const res = await native.start();
      usingNative = true;
      clearNativeFailFlag();
      lastDiag = { source: "native", mimetype: res?.mimetype ?? "audio/wav" };
      return res?.mimetype ?? "audio/wav";
    } catch (err) {
      usingNative = false;
      markNativeFailed();
      lastDiag = { source: "native", startError: err.message };

      // Android WebView webm is unreliable — don't silently fall back.
      if (hasNativePlugin() && isAndroidUa()) {
        throw new Error(
          `${err.message ?? "Native mic failed"} — close apps using the mic, restart MercuryOS, tap mic again`
        );
      }
      if (!navigator.mediaDevices?.getUserMedia) throw err;
    }
  }

  if (hasNativePlugin() && isAndroidUa() && preferWebRecording) {
    throw new Error(
      "Native mic unavailable — restart MercuryOS app (browser mic is unreliable on Android)"
    );
  }

  usingNative = false;
  const mime = await webRecorder.start();
  lastDiag = webRecorder.getLastDiagnostics();
  return mime;
}

export function stopRecording() {
  if (usingNative) {
    return stopNativeRecording();
  }
  return stopWebRecording();
}

async function fetchNativeBlob(filePath, expectedBytes = 0) {
  const cap = window.Capacitor;
  const urls = [
    cap?.convertFileSrc?.(filePath),
    `capacitor://localhost/_capacitor_file_/${filePath}`,
    filePath.startsWith("file://") ? filePath : `file://${filePath}`,
  ].filter(Boolean);

  let lastErr = null;
  for (const url of urls) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const blob = await r.blob();
      if (blob.size > 0) return { blob, url };
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(
    `Could not read recording file${expectedBytes ? ` (${expectedBytes} bytes expected)` : ""}${lastErr ? `: ${lastErr.message}` : ""}`
  );
}

async function readNativeFile(res) {
  const native = voicePlugin();
  const expected = res.bytes ?? 0;
  const filePath = res.filePath;
  const mimetype = res.mimetype ?? "audio/wav";

  if (!filePath) {
    throw new Error(`Recording file missing (expected ${expected} bytes)`);
  }

  // Prefer native readFile — base64 avoids WebView file:// fetch + blob upload truncation.
  if (native?.readFile && expected < 8_000_000) {
    try {
      const file = await native.readFile({ path: filePath });
      const bytes = file.bytes ?? 0;
      if (bytes >= 500 && file.base64) {
        await native?.discard?.().catch(() => {});
        return {
          base64: file.base64,
          mimetype: file.mimetype ?? mimetype,
          bytes,
          durationMs: res.durationMs,
          source: "native",
        };
      }
      lastDiag = { source: "native", readFileTooSmall: bytes, expected, filePath };
    } catch (err) {
      lastDiag = { source: "native", readFileError: err.message, filePath };
    }
  }

  try {
    const { blob } = await fetchNativeBlob(filePath, expected);
    if (blob.size >= 500) {
      await native?.discard?.().catch(() => {});
      return {
        blob,
        mimetype,
        bytes: blob.size,
        durationMs: res.durationMs,
        source: "native",
      };
    }
    lastDiag = { source: "native", fetchTooSmall: blob.size, expected, filePath };
  } catch (err) {
    lastDiag = { source: "native", fetchError: err.message, filePath, expected };
  }

  await native?.discard?.().catch(() => {});
  throw new Error(
    `Could not read recording (${expected} bytes on device) — try a shorter clip or update the app`
  );
}

async function stopNativeRecording() {
  const native = voicePlugin();
  if (!native?.stop) {
    usingNative = false;
    return null;
  }
  try {
    const res = await native.stop();
    usingNative = false;
    const data = await readNativeFile(res);
    clearNativeFailFlag();
    lastDiag = {
      source: "native",
      bytes: data.bytes,
      durationMs: data.durationMs,
      mimetype: data.mimetype,
      filePath: res.filePath,
    };
    return data;
  } catch (err) {
    usingNative = false;
    await native?.discard?.().catch(() => {});
    markNativeFailed();
    lastDiag = { source: "native", error: err.message };
    const msg = err.message ?? "Recording failed";
    if (msg.includes("No audio") || msg.includes("failed") || msg.includes("not ready")) {
      throw new Error(`${msg} — tap mic again after closing other mic apps`);
    }
    throw err;
  }
}

async function stopWebRecording() {
  try {
    const data = await webRecorder.stop();
    lastDiag = webRecorder.getLastDiagnostics();
    return data;
  } catch (err) {
    lastDiag = err.diagnostics ?? webRecorder.getLastDiagnostics();
    throw err;
  }
}

export async function cancelRecording() {
  usingNative = false;
  await voicePlugin()?.discard?.().catch(() => {});
  webRecorder.cancel();
}

function formatDiag(data, diag) {
  const parts = [];
  if (diag?.source) parts.push(diag.source);
  const bytes = data?.bytes ?? diag?.bytes;
  if (bytes != null) parts.push(`${bytes} bytes`);
  if (diag?.durationMs != null) parts.push(`${Math.round(diag.durationMs / 100) / 10}s`);
  if (diag?.chunks != null) parts.push(`${diag.chunks} chunks`);
  if (diag?.mimetype || data?.mimetype) parts.push(diag?.mimetype ?? data?.mimetype);
  return parts.length ? ` (${parts.join(", ")})` : "";
}

export async function transcribeRecording(data) {
  const diag = getLastDiagnostics();
  if (!data) {
    throw new Error(
      `No audio captured${formatDiag(null, diag)} — tap mic to start, tap again to stop`
    );
  }
  const bytes = data.bytes ?? data.blob?.size ?? 0;
  if (bytes > 0 && bytes < 500) {
    if (data.source === "native") markNativeFailed();
    throw new Error(
      `Recording too short (${bytes} bytes)${formatDiag(data, diag)} — tap mic again`
    );
  }
  try {
    const payload = typeof data.base64 === "string" ? data.base64 : data.blob;
    const res = await api.transcribe(payload, data.mimetype, {
      bytes: data.bytes,
      source: data.source,
      durationMs: data.durationMs,
      client: "phone",
    });
    const text = (res.text ?? "").trim();
    if (!text) {
      throw new Error(`No speech detected${formatDiag(data, diag)} — try again in a quieter spot`);
    }
    return text;
  } catch (err) {
    const msg = err.message ?? "Transcription failed";
    if (!msg.includes("bytes") && data.bytes != null) {
      throw new Error(`${msg}${formatDiag(data, diag)}`);
    }
    throw err;
  }
}
