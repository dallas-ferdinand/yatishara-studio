let speakBackend = null;
let paused = false;
let busy = false;
const listeners = new Set();

function state() {
  return { busy, paused, backend: speakBackend };
}

function emit() {
  for (const listener of listeners) listener(state());
}

export function setSpeakBackend(backend) {
  speakBackend = backend ?? null;
}

export function getSpeakBackend() {
  return speakBackend;
}

export function unlockSpeakAudio() {
  return true;
}

export async function speakText(text, _opts = {}) {
  if (typeof window === "undefined" || !window.speechSynthesis) return false;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(String(text ?? ""));
  utterance.onend = () => {
    busy = false;
    paused = false;
    emit();
  };
  utterance.onerror = utterance.onend;
  busy = true;
  paused = false;
  emit();
  window.speechSynthesis.speak(utterance);
  return true;
}

export function stopSpeaking() {
  if (typeof window !== "undefined") window.speechSynthesis?.cancel?.();
  busy = false;
  paused = false;
  emit();
}

export function clearSpeakSession() {
  stopSpeaking();
}

export function syncSpeakFromBlocks() {
  return false;
}

export function maybeSpeakLatestReply() {
  return false;
}

export function pauseSpeaking() {
  if (typeof window !== "undefined") window.speechSynthesis?.pause?.();
  if (busy) paused = true;
  emit();
}

export function resumeSpeaking() {
  if (typeof window !== "undefined") window.speechSynthesis?.resume?.();
  paused = false;
  emit();
}

export function subscribeSpeakState(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSpeakTransportState() {
  return state();
}

export function isSpeaking() {
  return busy && !paused;
}

export function textForSpeech(message) {
  return String(message?.content ?? message?.text ?? "");
}

export async function speakAssistantMessage(message, opts = {}) {
  return await speakText(textForSpeech(message), opts);
}
