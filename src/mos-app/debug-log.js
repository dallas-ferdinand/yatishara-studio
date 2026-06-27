let debugEnabled = null;

function isDeskDebugEnabled() {
  if (debugEnabled != null) return debugEnabled;
  try {
    debugEnabled =
      localStorage.getItem("mercuryos-debug") === "1" ||
      new URLSearchParams(globalThis.location?.search ?? "").get("debug") === "1";
  } catch {
    debugEnabled = false;
  }
  return debugEnabled;
}

export function deskDebug(hypothesisId, location, message, data = {}) {
  if (!isDeskDebugEnabled()) return;
  console.debug("[mercuryos-debug]", { hypothesisId, location, message, data });
}
