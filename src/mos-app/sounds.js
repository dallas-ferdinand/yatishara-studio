/**
 * UI sounds via Web Audio — soft modern tones, no asset files.
 * Warm midrange, gentle releases (no click-off), minimal high sparkle.
 */
import {
  DEFAULT_UI_SOUND_PREFS,
  readUiSoundPrefs,
  uiSoundCategoryEnabled,
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
  "like",
  "unlike",
  "save",
  "unsave",
  "follow",
  "unfollow",
  "share",
  "pop",
];

/** @typedef {(typeof UI_SOUND_IDS)[number]} UiSoundId */

/** @type {AudioContext | null} */
let audioContext = null;
/** @type {GainNode | null} */
let masterGain = null;
/** @type {BiquadFilterNode | null} */
let masterLowpass = null;
let primed = false;
/** @type {import("./sound-prefs.js").UiSoundPrefs} */
let prefs = DEFAULT_UI_SOUND_PREFS;

/** @type {Set<() => void>} */
const prefsListeners = new Set();

function isBrowser() {
  return typeof window !== "undefined";
}

function applyMasterGain() {
  if (!masterGain || !audioContext) return;
  const base = prefs.enabled && !uiSoundsReducedBySystem() ? prefs.volume : 0;
  masterGain.gain.setValueAtTime(base, audioContext.currentTime);
}

export function getUiSoundPrefs() {
  return prefs;
}

/** @param {import("./sound-prefs.js").UiSoundPrefs} next */
export function setUiSoundPrefs(next) {
  prefs = {
    enabled: next.enabled,
    volume: Math.min(1, Math.max(0, next.volume)),
    categories: {
      ...DEFAULT_UI_SOUND_PREFS.categories,
      ...(next.categories ?? {}),
    },
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
    // Global soft ceiling — keeps everything rounded, never piercing.
    masterLowpass = audioContext.createBiquadFilter();
    masterLowpass.type = "lowpass";
    masterLowpass.frequency.value = 2400;
    masterLowpass.Q.value = 0.7;
    masterGain.connect(masterLowpass);
    masterLowpass.connect(audioContext.destination);
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

/**
 * Soft tone with attack + long release (avoids abrupt cut).
 * @param {GainNode} gain
 * @param {{
 *   freq: number,
 *   duration?: number,
 *   release?: number,
 *   type?: OscillatorType,
 *   attack?: number,
 *   volume?: number,
 *   freqEnd?: number,
 *   detune?: number,
 *   lowpass?: number,
 * }} opts
 */
function playTone(gain, opts) {
  if (!audioContext) return;
  const now = audioContext.currentTime;
  const attack = opts.attack ?? 0.012;
  const body = opts.duration ?? 0.08;
  const release = opts.release ?? 0.14;
  const volume = opts.volume ?? 0.07;
  const total = attack + body + release;

  const osc = audioContext.createOscillator();
  const env = audioContext.createGain();
  const filter = audioContext.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = opts.lowpass ?? 1600;
  filter.Q.value = 0.5;

  osc.type = opts.type ?? "sine";
  osc.frequency.setValueAtTime(Math.max(40, opts.freq), now);
  if (opts.detune) osc.detune.setValueAtTime(opts.detune, now);
  if (opts.freqEnd) {
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(40, opts.freqEnd),
      now + attack + body * 0.85,
    );
  }

  // Smooth in → hold → long exponential out (never hard-stop at peak).
  env.gain.setValueAtTime(0.0001, now);
  env.gain.linearRampToValueAtTime(volume, now + attack);
  env.gain.setValueAtTime(volume, now + attack + body * 0.35);
  env.gain.exponentialRampToValueAtTime(0.0001, now + total);

  osc.connect(filter);
  filter.connect(env);
  env.connect(gain);
  osc.start(now);
  osc.stop(now + total + 0.04);
}

/**
 * Soft low thump / hush — not a clicky noise burst.
 * @param {GainNode} gain
 * @param {{ duration?: number, volume?: number, freq?: number, q?: number }} [opts]
 */
function playNoise(gain, opts = {}) {
  if (!audioContext) return;
  const duration = opts.duration ?? 0.06;
  const release = 0.08;
  const volume = opts.volume ?? 0.028;
  const now = audioContext.currentTime;
  const sampleCount = Math.max(1, Math.floor(audioContext.sampleRate * (duration + release)));
  const buffer = audioContext.createBuffer(1, sampleCount, audioContext.sampleRate);
  const data = buffer.getChannelData(0);
  // Soft pink-ish noise with smooth envelope baked in.
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  for (let i = 0; i < sampleCount; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99765 * b0 + white * 0.099046;
    b1 = 0.963 * b1 + white * 0.032;
    b2 = 0.57 * b2 + white * 0.004;
    const t = i / sampleCount;
    const env = Math.sin(Math.PI * Math.min(1, t * 1.15)) * Math.exp(-t * 2.4);
    data[i] = (b0 + b1 + b2 + white * 0.05) * env * 0.55;
  }

  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  const filter = audioContext.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = opts.freq ?? 700;
  filter.Q.value = opts.q ?? 0.6;
  const env = audioContext.createGain();
  env.gain.setValueAtTime(0.0001, now);
  env.gain.linearRampToValueAtTime(volume, now + 0.01);
  env.gain.exponentialRampToValueAtTime(0.0001, now + duration + release);

  source.connect(filter);
  filter.connect(env);
  env.connect(gain);
  source.start(now);
  source.stop(now + duration + release + 0.04);
}

/**
 * Soft stacked partials — warm, rounded, long fade.
 * @param {GainNode} gain
 * @param {number[]} freqs
 */
function playChord(gain, freqs, spacing, duration, volume = 0.045) {
  if (!audioContext) return;
  freqs.forEach((freq, index) => {
    playTone(gain, {
      freq,
      duration: duration * 0.45,
      release: duration * 0.7,
      volume: volume * (index === 0 ? 1 : 0.72),
      attack: 0.018 + index * spacing,
      type: "sine",
      lowpass: 1400,
      detune: index === 1 ? 6 : index === 2 ? -4 : 0,
    });
  });
}

/** @type {Record<string, (gain: GainNode) => void>} */
const SOUND_PLAYERS = {
  /** Soft finger pad — low thud, no tick */
  tap: (gain) => {
    playNoise(gain, { duration: 0.045, volume: 0.022, freq: 480, q: 0.5 });
    playTone(gain, {
      freq: 320,
      freqEnd: 240,
      duration: 0.04,
      release: 0.12,
      volume: 0.055,
      type: "sine",
      attack: 0.008,
      lowpass: 900,
    });
  },
  button: (gain) => {
    playNoise(gain, { duration: 0.05, volume: 0.02, freq: 420, q: 0.55 });
    playTone(gain, {
      freq: 280,
      freqEnd: 210,
      duration: 0.055,
      release: 0.14,
      volume: 0.065,
      type: "triangle",
      attack: 0.01,
      lowpass: 1000,
    });
  },
  toggle: (gain) => {
    playTone(gain, {
      freq: 360,
      duration: 0.035,
      release: 0.1,
      volume: 0.048,
      type: "sine",
      lowpass: 1100,
    });
    playTone(gain, {
      freq: 480,
      duration: 0.04,
      release: 0.12,
      volume: 0.04,
      type: "sine",
      attack: 0.04,
      lowpass: 1200,
    });
  },
  select: (gain) => {
    playTone(gain, {
      freq: 420,
      freqEnd: 380,
      duration: 0.04,
      release: 0.11,
      volume: 0.045,
      type: "sine",
      lowpass: 1100,
    });
  },
  /** Premium tab/section — muted glass tick, no whoosh sweep */
  nav: (gain) => {
    playNoise(gain, { duration: 0.032, volume: 0.01, freq: 260, q: 0.35 });
    playTone(gain, {
      freq: 186,
      duration: 0.026,
      release: 0.2,
      volume: 0.036,
      type: "sine",
      attack: 0.005,
      lowpass: 520,
    });
    playTone(gain, {
      freq: 279,
      duration: 0.02,
      release: 0.18,
      volume: 0.014,
      type: "sine",
      attack: 0.01,
      lowpass: 640,
      detune: -4,
    });
  },
  navBack: (gain) => {
    playNoise(gain, { duration: 0.03, volume: 0.009, freq: 240, q: 0.35 });
    playTone(gain, {
      freq: 168,
      duration: 0.028,
      release: 0.2,
      volume: 0.034,
      type: "sine",
      attack: 0.006,
      lowpass: 480,
    });
    playTone(gain, {
      freq: 252,
      duration: 0.018,
      release: 0.16,
      volume: 0.012,
      type: "sine",
      attack: 0.012,
      lowpass: 580,
      detune: 3,
    });
  },
  success: (gain) => {
    playChord(gain, [392, 493.88, 587.33], 0.04, 0.22, 0.042);
  },
  sheet: (gain) => {
    playTone(gain, {
      freq: 160,
      freqEnd: 280,
      duration: 0.1,
      release: 0.18,
      volume: 0.05,
      type: "sine",
      lowpass: 800,
    });
    playNoise(gain, { duration: 0.09, volume: 0.016, freq: 320, q: 0.45 });
  },
  /** Soft whoosh up — messaging send */
  send: (gain) => {
    playTone(gain, {
      freq: 300,
      freqEnd: 520,
      duration: 0.07,
      release: 0.16,
      volume: 0.055,
      type: "sine",
      attack: 0.015,
      lowpass: 1300,
    });
    playTone(gain, {
      freq: 220,
      duration: 0.05,
      release: 0.14,
      volume: 0.035,
      type: "triangle",
      attack: 0.03,
      lowpass: 900,
    });
    playNoise(gain, { duration: 0.07, volume: 0.018, freq: 550, q: 0.55 });
  },
  error: (gain) => {
    playTone(gain, {
      freq: 200,
      freqEnd: 150,
      duration: 0.1,
      release: 0.16,
      volume: 0.055,
      type: "triangle",
      lowpass: 700,
    });
  },
  shuffle: (gain) => {
    playTone(gain, {
      freq: 340,
      freqEnd: 480,
      duration: 0.05,
      release: 0.14,
      volume: 0.06,
      type: "sine",
      lowpass: 1200,
    });
    playChord(gain, [392, 493.88], 0.03, 0.18, 0.04);
  },
  /** Warm heart — two soft partials, long bloom */
  like: (gain) => {
    playTone(gain, {
      freq: 340,
      freqEnd: 460,
      duration: 0.08,
      release: 0.2,
      volume: 0.052,
      type: "sine",
      attack: 0.016,
      lowpass: 1300,
    });
    playTone(gain, {
      freq: 510,
      duration: 0.07,
      release: 0.22,
      volume: 0.032,
      type: "sine",
      attack: 0.05,
      lowpass: 1400,
      detune: 4,
    });
  },
  unlike: (gain) => {
    playTone(gain, {
      freq: 420,
      freqEnd: 280,
      duration: 0.06,
      release: 0.16,
      volume: 0.042,
      type: "sine",
      lowpass: 1100,
    });
  },
  save: (gain) => {
    playNoise(gain, { duration: 0.04, volume: 0.016, freq: 500, q: 0.55 });
    playTone(gain, {
      freq: 300,
      freqEnd: 380,
      duration: 0.06,
      release: 0.15,
      volume: 0.05,
      type: "sine",
      lowpass: 1100,
    });
  },
  unsave: (gain) => {
    playTone(gain, {
      freq: 360,
      freqEnd: 250,
      duration: 0.055,
      release: 0.14,
      volume: 0.04,
      type: "sine",
      lowpass: 1000,
    });
  },
  follow: (gain) => {
    playChord(gain, [349.23, 440], 0.035, 0.2, 0.042);
  },
  unfollow: (gain) => {
    playTone(gain, {
      freq: 320,
      freqEnd: 220,
      duration: 0.07,
      release: 0.15,
      volume: 0.042,
      type: "sine",
      lowpass: 900,
    });
  },
  share: (gain) => {
    playTone(gain, {
      freq: 280,
      freqEnd: 400,
      duration: 0.08,
      release: 0.18,
      volume: 0.048,
      type: "sine",
      lowpass: 1200,
    });
    playTone(gain, {
      freq: 360,
      duration: 0.05,
      release: 0.14,
      volume: 0.028,
      type: "sine",
      attack: 0.055,
      lowpass: 1100,
    });
  },
  pop: (gain) => {
    playTone(gain, {
      freq: 380,
      freqEnd: 300,
      duration: 0.04,
      release: 0.12,
      volume: 0.042,
      type: "sine",
      lowpass: 1000,
    });
  },
  notify: (gain) => {
    playTone(gain, {
      freq: 400,
      duration: 0.07,
      release: 0.14,
      volume: 0.045,
      type: "sine",
      lowpass: 1200,
    });
    playTone(gain, {
      freq: 500,
      duration: 0.08,
      release: 0.16,
      volume: 0.038,
      type: "sine",
      attack: 0.08,
      lowpass: 1300,
    });
  },
  message: (gain) => {
    playTone(gain, {
      freq: 360,
      duration: 0.05,
      release: 0.14,
      volume: 0.042,
      type: "sine",
      lowpass: 1100,
    });
  },
  lock: (gain) => {
    playTone(gain, {
      freq: 240,
      duration: 0.1,
      release: 0.16,
      volume: 0.05,
      type: "triangle",
      lowpass: 800,
    });
  },
  key: (gain) => {
    playTone(gain, {
      freq: 340,
      duration: 0.03,
      release: 0.08,
      volume: 0.035,
      type: "sine",
      lowpass: 1000,
    });
  },
};

/** @param {string} id */
export function playUiSound(id) {
  if (!isBrowser() || !prefs.enabled || uiSoundsReducedBySystem()) return;
  if (!uiSoundCategoryEnabled(id, prefs)) return;
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
  like: () => playUiSound("like"),
  unlike: () => playUiSound("unlike"),
  save: () => playUiSound("save"),
  unsave: () => playUiSound("unsave"),
  follow: () => playUiSound("follow"),
  unfollow: () => playUiSound("unfollow"),
  share: () => playUiSound("share"),
  pop: () => playUiSound("pop"),
  button: () => playUiSound("button"),
  toggle: () => playUiSound("toggle"),
  select: () => playUiSound("select"),
  nav: () => playUiSound("nav"),
  navBack: () => playUiSound("navBack"),
  sheet: () => playUiSound("sheet"),
};

export function setSounds(on) {
  setUiSoundPrefs({ ...prefs, enabled: on });
}

export function primeAudio() {
  void primeUiSounds();
}
