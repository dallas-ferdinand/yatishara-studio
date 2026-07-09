/**
 * UI sounds via Web Audio — Yatishara-style synthesis, no asset files.
 */
import {
  DEFAULT_UI_SOUND_PREFS,
  readUiSoundPrefs,
  uiSoundsReducedBySystem,
  writeUiSoundPrefs,
} from "./sound-prefs.js";

export const UI_SOUND_IDS = [
  "tap",
  "button",
  "toggle",
  "select",
  "nav",
  "navBack",
  "success",
  "sheet",
  "send",
  "error",
  "shuffle",
];

/** @typedef {(typeof UI_SOUND_IDS)[number]} UiSoundId */

/** @type {AudioContext | null} */
let audioContext = null;
/** @type {GainNode | null} */
let masterGain = null;
let primed = false;
/** @type {import("./sound-prefs.js").UiSoundPrefs} */
let prefs = DEFAULT_UI_SOUND_PREFS;

/** @type {Set<() => void>} */
const prefsListeners = new Set();

function isBrowser() {
  return typeof window !== "undefined";
}

function applyMasterGain() {
  if (!masterGain) return;
  const base = prefs.enabled && !uiSoundsReducedBySystem() ? prefs.volume : 0;
  masterGain.gain.setValueAtTime(base, audioContext?.currentTime ?? 0);
}

export function getUiSoundPrefs() {
  return prefs;
}

/** @param {import("./sound-prefs.js").UiSoundPrefs} next */
export function setUiSoundPrefs(next) {
  prefs = {
    enabled: next.enabled,
    volume: Math.min(1, Math.max(0, next.volume)),
  };
  writeUiSoundPrefs(prefs);
  applyMasterGain();
  for (const listener of prefsListeners) listener();
}

export function subscribeUiSoundPrefs(listener) {
  prefsListeners.add(listener);
  return () => prefsListeners.delete(listener);
}

export async function primeUiSounds() {
  if (!isBrowser() || primed) return;
  prefs = readUiSoundPrefs();
  if (!audioContext) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audioContext = new Ctx();
    masterGain = audioContext.createGain();
    masterGain.connect(audioContext.destination);
    applyMasterGain();
  }
  if (audioContext.state === "suspended") {
    try {
      await audioContext.resume();
    } catch {
      return;
    }
  }
  primed = true;
}

/** @param {GainNode} gain @param {{ freq: number, duration: number, type?: OscillatorType, attack?: number, volume?: number, freqEnd?: number }} opts */
function playTone(gain, opts) {
  if (!audioContext) return;
  const now = audioContext.currentTime;
  const osc = audioContext.createOscillator();
  const env = audioContext.createGain();
  const attack = opts.attack ?? 0.002;
  const volume = opts.volume ?? 0.09;

  osc.type = opts.type ?? "sine";
  osc.frequency.setValueAtTime(Math.max(40, opts.freq), now);
  if (opts.freqEnd) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, opts.freqEnd), now + opts.duration);
  }

  env.gain.setValueAtTime(0.0001, now);
  env.gain.linearRampToValueAtTime(volume, now + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, now + opts.duration);

  osc.connect(env);
  env.connect(gain);
  osc.start(now);
  osc.stop(now + opts.duration + 0.02);
}

/** @param {GainNode} gain @param {{ duration?: number, volume?: number, freq?: number, q?: number }} [opts] */
function playNoise(gain, opts = {}) {
  if (!audioContext) return;
  const duration = opts.duration ?? 0.028;
  const volume = opts.volume ?? 0.05;
  const now = audioContext.currentTime;
  const sampleCount = Math.max(1, Math.floor(audioContext.sampleRate * duration));
  const buffer = audioContext.createBuffer(1, sampleCount, audioContext.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < sampleCount; i++) {
    const decay = Math.exp(-i / (sampleCount * 0.18));
    data[i] = (Math.random() * 2 - 1) * decay;
  }

  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  const filter = audioContext.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = opts.freq ?? 1400;
  filter.Q.value = opts.q ?? 1.1;
  const env = audioContext.createGain();
  env.gain.setValueAtTime(volume, now);
  env.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  source.connect(filter);
  filter.connect(env);
  env.connect(gain);
  source.start(now);
  source.stop(now + duration + 0.02);
}

/** @param {GainNode} gain @param {number[]} freqs */
function playChord(gain, freqs, spacing, duration, volume = 0.06) {
  if (!audioContext) return;
  const now = audioContext.currentTime;
  freqs.forEach((freq, index) => {
    const start = now + index * spacing;
    const osc = audioContext.createOscillator();
    const env = audioContext.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, start);
    env.gain.setValueAtTime(0.0001, start);
    env.gain.linearRampToValueAtTime(volume, start + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(env);
    env.connect(gain);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  });
}

/** @type {Record<string, (gain: GainNode) => void>} */
const SOUND_PLAYERS = {
  tap: (gain) => {
    playNoise(gain, { duration: 0.02, volume: 0.035, freq: 1800, q: 0.9 });
    playTone(gain, { freq: 1680, freqEnd: 920, duration: 0.034, volume: 0.045, type: "sine" });
  },
  button: (gain) => {
    playNoise(gain, { duration: 0.03, volume: 0.05, freq: 1100, q: 1.3 });
    playTone(gain, { freq: 520, freqEnd: 280, duration: 0.055, volume: 0.08, type: "triangle" });
  },
  toggle: (gain) => {
    playTone(gain, { freq: 640, duration: 0.022, volume: 0.055, type: "sine" });
    playTone(gain, { freq: 980, duration: 0.02, volume: 0.05, type: "sine", attack: 0.024 });
  },
  select: (gain) => {
    playTone(gain, { freq: 2280, freqEnd: 1960, duration: 0.02, volume: 0.042, type: "sine" });
    playNoise(gain, { duration: 0.012, volume: 0.02, freq: 2600, q: 2 });
  },
  nav: (gain) => {
    playTone(gain, { freq: 420, freqEnd: 1180, duration: 0.07, volume: 0.05, type: "sine" });
    playNoise(gain, { duration: 0.045, volume: 0.018, freq: 900, q: 0.8 });
  },
  navBack: (gain) => {
    playTone(gain, { freq: 1080, freqEnd: 460, duration: 0.065, volume: 0.048, type: "sine" });
  },
  success: (gain) => {
    playChord(gain, [523.25, 659.25, 783.99], 0.045, 0.11, 0.05);
  },
  sheet: (gain) => {
    playTone(gain, { freq: 180, freqEnd: 520, duration: 0.12, volume: 0.04, type: "sine" });
    playNoise(gain, { duration: 0.08, volume: 0.022, freq: 500, q: 0.7 });
  },
  send: (gain) => {
    playTone(gain, { freq: 880, freqEnd: 1320, duration: 0.05, volume: 0.055, type: "sine" });
    playNoise(gain, { duration: 0.035, volume: 0.03, freq: 1600, q: 1.2 });
    playTone(gain, { freq: 420, duration: 0.04, volume: 0.04, type: "triangle", attack: 0.04 });
  },
  error: (gain) => {
    playTone(gain, { freq: 220, freqEnd: 160, duration: 0.09, volume: 0.06, type: "square" });
  },
  /** Logo shuffle — bouncy pop with major-third sparkle */
  shuffle: (gain) => {
    playTone(gain, { freq: 880, freqEnd: 1320, duration: 0.035, volume: 0.1, type: "triangle" });
    playNoise(gain, { duration: 0.022, volume: 0.055, freq: 2200, q: 1.4 });
    playChord(gain, [523.25, 659.25], 0.018, 0.08, 0.055);
  },
  notify: (gain) => {
    playTone(gain, { freq: 880, duration: 0.07, volume: 0.05, type: "sine" });
    playTone(gain, { freq: 1100, duration: 0.1, volume: 0.055, type: "sine", attack: 0.09 });
  },
  message: (gain) => {
    playTone(gain, { freq: 660, duration: 0.04, volume: 0.042, type: "sine" });
  },
  lock: (gain) => {
    playTone(gain, { freq: 380, duration: 0.12, volume: 0.05, type: "triangle" });
  },
  key: (gain) => {
    playTone(gain, { freq: 760, duration: 0.018, volume: 0.045, type: "sine" });
  },
};

/** @param {string} id */
export function playUiSound(id) {
  if (!isBrowser() || !prefs.enabled || uiSoundsReducedBySystem()) return;
  void primeUiSounds().then(() => {
    if (!audioContext || !masterGain || masterGain.gain.value <= 0) return;
    const player = SOUND_PLAYERS[id];
    if (!player) return;
    player(masterGain);
  });
}

/** Backward-compatible imperative API */
export const sound = {
  tap: () => playUiSound("tap"),
  key: () => playUiSound("key"),
  send: () => playUiSound("send"),
  success: () => playUiSound("success"),
  error: () => playUiSound("error"),
  lock: () => playUiSound("lock"),
  notify: () => playUiSound("notify"),
  message: () => playUiSound("message"),
  shuffle: () => playUiSound("shuffle"),
};

export function setSounds(on) {
  setUiSoundPrefs({ ...prefs, enabled: on });
}

export function primeAudio() {
  void primeUiSounds();
}
