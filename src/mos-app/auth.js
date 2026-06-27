/** Pairing (gateway) + local app PIN — persisted on device. */
const PAIR_KEY = "mercuryos-pair-v1";
const APP_PIN_KEY = "mercuryos-app-pin-v1";

async function digest(pin, salt) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}:${pin}`));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function isPaired() {
  return Boolean(localStorage.getItem(PAIR_KEY));
}

export function loadPairing() {
  try {
    const raw = localStorage.getItem(PAIR_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function savePairing(session) {
  localStorage.setItem(PAIR_KEY, JSON.stringify(session));
}

export function clearPairing() {
  localStorage.removeItem(PAIR_KEY);
}

export function hasAppPin() {
  return Boolean(localStorage.getItem(APP_PIN_KEY));
}

export async function setAppPin(pin) {
  const digits = String(pin).replace(/\D/g, "");
  if (digits.length < 4 || digits.length > 6) throw new Error("Use 4–6 digits");
  const salt = crypto.randomUUID();
  const hash = await digest(digits, salt);
  localStorage.setItem(APP_PIN_KEY, JSON.stringify({ salt, hash, len: digits.length }));
}

export async function verifyAppPin(pin) {
  const raw = localStorage.getItem(APP_PIN_KEY);
  if (!raw) return true;
  const { salt, hash } = JSON.parse(raw);
  return (await digest(String(pin).replace(/\D/g, ""), salt)) === hash;
}

export function appPinLength() {
  try {
    return JSON.parse(localStorage.getItem(APP_PIN_KEY))?.len ?? 6;
  } catch {
    return 6;
  }
}

export async function clearAppPin() {
  localStorage.removeItem(APP_PIN_KEY);
}
