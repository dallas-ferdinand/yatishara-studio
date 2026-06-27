export const SESSION_END_NOW_MD = "Wrap this session: summarize what changed, what is left, and next steps.";

let sessionEndNudge = false;
let onNudge = null;

export function hasSessionEndNudge() {
  return sessionEndNudge;
}

export function dismissSessionEndNudge() {
  sessionEndNudge = false;
}

export function markMeaningfulDeskSession() {
  sessionEndNudge = true;
  onNudge?.();
}

export function initSessionEndHook({ onNudge: nextOnNudge } = {}) {
  onNudge = typeof nextOnNudge === "function" ? nextOnNudge : null;
  return () => {
    if (onNudge === nextOnNudge) onNudge = null;
  };
}
