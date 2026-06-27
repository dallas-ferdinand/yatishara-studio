/** Ring buffer of HTTP/send steps — copy in Settings or auto-flush to gateway on failure. */
const MAX = 150;
const KEY = "mercuryos-request-trace-v1";

/** @type {{ t: number, step: string, detail: Record<string, unknown> }[]} */
let buffer = [];

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) buffer = JSON.parse(raw);
  } catch {
    buffer = [];
  }
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(buffer.slice(-MAX)));
  } catch {
    /* quota */
  }
}

load();

function ts() {
  return new Date().toISOString().slice(11, 23);
}

export function safeUrl(url) {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}${u.search ? "?…" : ""}`;
  } catch {
    return String(url ?? "").slice(0, 120);
  }
}

/** @param {string} step @param {Record<string, unknown>} [detail] */
export function trace(step, detail = {}) {
  const entry = { t: Date.now(), step, detail };
  buffer.push(entry);
  if (buffer.length > MAX) buffer = buffer.slice(-MAX);
  persist();
  if (
    typeof console !== "undefined" &&
    console.debug &&
    localStorage.getItem("mercuryos-trace-console") === "1"
  ) {
    console.debug(`[mercury-trace] ${step}`, detail);
  }
  return entry;
}

export function clearTrace() {
  buffer = [];
  persist();
}

export function getTraceEntries() {
  return [...buffer];
}

export function formatTraceLines(entries = buffer) {
  return entries.map((e) => {
    const parts = Object.entries(e.detail ?? {})
      .filter(([, v]) => v != null && v !== "")
      .map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : v}`);
    return `${ts()} ${e.step}${parts.length ? " | " + parts.join(" | ") : ""}`;
  });
}

export function getTraceText() {
  return formatTraceLines().join("\n");
}

/** @param {import("./api.js")} apiMod */
export async function flushTraceToGateway(apiMod, { reason = "manual", chatId = null } = {}) {
  const session = apiMod.getSession?.();
  if (!session?.gatewayUrl || !session?.token) {
    trace("flush.skip", { reason: "no_session" });
    return { ok: false, error: "no_session" };
  }
  const lines = formatTraceLines();
  trace("flush.start", { reason, lines: lines.length });
  try {
    const res = await apiMod.api("/api/debug/trace", {
      method: "POST",
      body: JSON.stringify({
        reason,
        chatId,
        deviceId: localStorage.getItem("mercuryos-device-id") ?? null,
        appVersion: localStorage.getItem("mercuryos-installed-version") ?? null,
        gatewayUrl: safeUrl(session.gatewayUrl),
        lines,
      }),
    });
    const data = await res.json();
    trace("flush.ok", { reason, serverId: data.id });
    return data;
  } catch (err) {
    trace("flush.fail", { reason, error: String(err?.message ?? err) });
    return { ok: false, error: String(err?.message ?? err) };
  }
}
