import * as requestTrace from "./request-trace.js";
import { normalizeModelChoice, isAutoModel } from "./model-choice.js";
import { DESK_RUN_VIEW, deskApiView } from "./desk-env.js";

let session = null;
let deviceIdProvider = null;

export function setDeviceIdProvider(fn) {
  deviceIdProvider = fn;
}

export const trace = requestTrace.trace;
export const getRequestTraceText = requestTrace.getTraceText;
export const clearRequestTrace = requestTrace.clearTrace;
export function flushRequestTrace(opts) {
  return requestTrace.flushTraceToGateway(
    { getSession, api },
    opts
  );
}

export function setSession(s) {
  session = s;
}

/** Web desk: portal cookie auth, no bearer token. */
export function useCookieAuth(origin) {
  session = { gatewayUrl: origin.replace(/\/$/, ""), cookieAuth: true };
}

export function getSession() {
  return session;
}

export function isNetworkError(err) {
  const m = String(err?.message ?? err ?? "").toLowerCase();
  return (
    m.includes("network") ||
    m.includes("failed to fetch") ||
    m.includes("load failed") ||
    m.includes("connection") ||
    m.includes("timeout") ||
    err?.name === "TypeError"
  );
}

export function networkErrorMessage() {
  const url = session?.gatewayUrl ?? "";
  if (url.includes("yatishara.com") || url.startsWith("https://")) {
    return "Connection lost — check mobile data or WiFi, then tap Retry in Settings.";
  }
  return "Connection lost — same WiFi? Make sure ./m is running on your computer.";
}

function fetchTimeout(ms) {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(ms);
  }
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), ms);
  return ctrl.signal;
}

function headers(extra = {}) {
  const client =
    session?.cookieAuth ? "desk" : (session?.clientTag ?? "phone");
  const h = {
    "Content-Type": "application/json",
    "X-Mercury-Client": client,
    ...extra,
  };
  if (session?.token) h.Authorization = `Bearer ${session.token}`;
  if (session?.userId) h["X-Mercury-User"] = session.userId;
  if (!session?.cookieAuth && deviceIdProvider) {
    const id = deviceIdProvider();
    if (id) h["X-Mercury-Device"] = id;
  }
  return h;
}

function publicHeaders(extra = {}) {
  return {
    "Content-Type": "application/json",
    "X-Mercury-Client": "phone",
    ...extra,
  };
}

/** @type {string[]} */
let gatewayFallbackBases = [];

export function setGatewayFallbacks(bases) {
  gatewayFallbackBases = Array.isArray(bases) ? bases : [];
}

/** @type {((url: string) => void) | null} */
let onGatewayUrlRepaired = null;

export function setGatewayUrlRepairHandler(fn) {
  onGatewayUrlRepaired = fn ?? null;
}

/** @type {{ request: Function } | null | undefined} */
let nativeHttp = undefined;

function isNativeApp() {
  const cap = typeof window !== "undefined" ? window.Capacitor : null;
  return (
    cap?.isNativePlatform?.() === true ||
    (typeof cap?.getPlatform === "function" && cap.getPlatform() !== "web")
  );
}

function getNativeHttp() {
  if (nativeHttp !== undefined) return nativeHttp;
  const cap = typeof window !== "undefined" ? window.Capacitor : null;
  const http = cap?.Plugins?.CapacitorHttp ?? null;
  nativeHttp = isNativeApp() && http?.request ? http : null;
  return nativeHttp;
}

function normalizeChatStartBody(body) {
  const model = normalizeModelChoice(body.model ?? "auto");
  return {
    ...body,
    model,
    modelParams: isAutoModel(model) ? [] : (body.modelParams ?? []),
  };
}

async function parseChatStartResponse(res) {
  if (res.status === 401) throw new Error("AUTH");
  if (res.status === 409) {
    const data = await res.json();
    throw new Error(data.error ?? "agent_busy");
  }
  if (res.ok || res.status === 202) return res;
  const data = await res.json().catch(() => ({}));
  throw new Error(data.error ?? `HTTP ${res.status}`);
}

/** Start or continue an agent run via v2 SDK-aligned gateway API. */
export async function postAgentChat(body) {
  return postAgentChatV2(body);
}

/** v2 SDK-aligned send — resolves to { chatId, runId, ... }. */
export async function postAgentChatV2(body) {
  const payload = normalizeChatStartBody(body);
  if (!payload.runId) {
    payload.runId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? `run_${crypto.randomUUID()}`
        : `run_${Date.now()}`;
  }
  requestTrace.trace("chat.v2.start", {
    chatId: payload.chatId,
    runId: payload.runId,
    workspaceId: payload.workspaceId,
  });
  const res = await gatewayRequest(`${session.gatewayUrl}/api/v2/chat/send`, {
    method: "POST",
    body: JSON.stringify(payload),
    signal: fetchTimeout(45_000),
  });
  const parsed = await parseChatStartResponse(res);
  const data = await parsed.json().catch(() => ({}));
  return { ...data, ok: parsed.ok, status: parsed.status };
}

function wrapNativeResponse(response) {
  const parseData = () => {
    const d = response.data;
    if (d == null || d === "") return {};
    if (typeof d === "object") return d;
    try {
      return JSON.parse(String(d));
    } catch {
      return { raw: String(d) };
    }
  };
  return {
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    json: async () => parseData(),
    text: async () => (typeof response.data === "string" ? response.data : JSON.stringify(response.data ?? "")),
  };
}

function responseErrorPayload(status, text) {
  const raw = String(text ?? "").trim();
  const message = raw ? raw.slice(0, 240) : `HTTP ${status}`;
  return { error: message, message, raw };
}

function wrapFetchResponse(response) {
  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
    url: response.url,
    json: async () => {
      try {
        return await response.clone().json();
      } catch {
        const text = await response.clone().text().catch(() => "");
        return responseErrorPayload(response.status, text || response.statusText);
      }
    },
    text: () => response.text(),
    blob: () => response.blob(),
    arrayBuffer: () => response.arrayBuffer(),
  };
}

function xhrRequest(url, opts = {}) {
  const method = (opts.method ?? "GET").toUpperCase();
  const hdrs = { ...headers(), ...opts.headers };
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url, true);
    xhr.timeout = 45_000;
    for (const [k, v] of Object.entries(hdrs)) {
      try {
        xhr.setRequestHeader(k, v);
      } catch {
        /* ignore */
      }
    }
    xhr.onload = () => {
      let data = xhr.responseText;
      try {
        data = data ? JSON.parse(data) : {};
      } catch {
        data = { raw: data };
      }
      resolve({
        ok: xhr.status >= 200 && xhr.status < 300,
        status: xhr.status,
        json: async () => data,
        text: async () => xhr.responseText,
      });
    };
    xhr.onerror = () => reject(new TypeError("Network request failed"));
    xhr.ontimeout = () => reject(new Error("Network timeout"));
    xhr.send(opts.body ?? null);
  });
}

function attemptTimeout(ms, label = "Request") {
  return sleep(ms).then(() => {
    throw new Error(`${label} timeout`);
  });
}

function raceAttempt(run, ms, label) {
  if (!ms || ms <= 0) return run();
  return Promise.race([run(), attemptTimeout(ms, label)]);
}

/** Android WebView often blocks LAN POST via fetch(); XHR first for JSON POST bodies. */
async function gatewayRequest(url, opts = {}, hdrFactory = headers) {
  const method = (opts.method ?? "GET").toUpperCase();
  const hdrs = { ...hdrFactory(), ...opts.headers };
  const http = getNativeHttp();
  /** @type {{ name: string, run: () => Promise<Response-like> }[]} */
  const attempts = [];
  const hasJsonBody = method === "POST" && opts.body;
  const native = isNativeApp();
  const safe = requestTrace.safeUrl(url);
  const bodyBytes = hasJsonBody ? String(opts.body).length : 0;

  requestTrace.trace("http.begin", { method, url: safe, native, hasBody: hasJsonBody, bodyBytes });

  if (hasJsonBody && native) {
    attempts.push({
      name: "xhr+json",
      run: () => raceAttempt(() => xhrRequest(url, { ...opts, headers: hdrs }), 20_000, "XHR"),
    });
  }

  if (http) {
    let data;
    if (opts.body) {
      try {
        data = JSON.parse(opts.body);
      } catch {
        data = opts.body;
      }
    }
    const base = {
      url,
      headers: hdrs,
      responseType: "json",
      data,
      connectTimeout: 12_000,
      readTimeout: hasJsonBody ? 12_000 : 20_000,
    };
    attempts.push({
      name: "capacitor",
      run: () =>
        raceAttempt(async () => {
          const response =
            method === "POST" && http.post
              ? await http.post(base)
              : method === "GET" && http.get
                ? await http.get(base)
                : await http.request({ ...base, method });
          return wrapNativeResponse(response);
        }, hasJsonBody ? 14_000 : 22_000, "Native HTTP"),
    });
  }

  if (method === "POST" && !(hasJsonBody && native)) {
    attempts.push({
      name: "xhr",
      run: () => raceAttempt(() => xhrRequest(url, { ...opts, headers: hdrs }), 20_000, "XHR"),
    });
  }

  attempts.push({
    name: "fetch",
    run: () =>
      raceAttempt(
        () =>
          fetch(url, {
            cache: "no-store",
            credentials: session?.cookieAuth ? "include" : "same-origin",
            ...opts,
            headers: hdrs,
            signal: opts.signal,
          }).then(wrapFetchResponse),
        opts.signal ? 0 : 25_000,
        "Fetch"
      ),
  });

  let lastErr;
  for (let i = 0; i < attempts.length; i++) {
    const { name, run } = attempts[i];
    const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
    requestTrace.trace("http.attempt", { transport: name, method, url: safe, idx: i });
    try {
      const res = await run();
      const ms = Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - t0);
      requestTrace.trace("http.ok", { transport: name, status: res.status, ms, url: safe });
      return res;
    } catch (err) {
      const ms = Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - t0);
      requestTrace.trace("http.fail", {
        transport: name,
        ms,
        url: safe,
        error: String(err?.message ?? err),
        errName: err?.name,
      });
      lastErr = err;
    }
  }
  requestTrace.trace("http.exhausted", {
    method,
    url: safe,
    attempts: attempts.map((a) => a.name).join(","),
    lastError: String(lastErr?.message ?? lastErr),
  });
  throw lastErr ?? new Error("Network request failed");
}

/** Unauthenticated gateway calls (pin request, unlock) — same transport as gatewayRequest. */
export async function publicGatewayRequest(url, opts = {}) {
  return gatewayRequest(url, opts, publicHeaders);
}

export async function api(path, opts = {}) {
  if (!session?.gatewayUrl) throw new Error("Not connected");
  const res = await gatewayRequest(`${session.gatewayUrl}${path}`, opts);
  if (res.status === 401) throw new Error("AUTH");
  return res;
}

async function healthAt(base) {
  const res = await gatewayRequest(`${base}/api/health`, {
    signal: fetchTimeout(4000),
  });
  return res.json();
}

export async function ping() {
  if (!session?.gatewayUrl) return { ok: false, error: "offline" };
  const bases = [
    session.gatewayUrl,
    ...gatewayFallbackBases.filter((b) => b !== session.gatewayUrl),
  ];
  for (const base of bases) {
    try {
      const data = await healthAt(base);
      if (data?.ok) {
        if (base !== session.gatewayUrl) {
          session = { ...session, gatewayUrl: base };
          onGatewayUrlRepaired?.(base);
        }
        return data;
      }
    } catch {
      /* try next */
    }
  }
  return { ok: false, error: "unreachable" };
}

export async function fetchHealthFull() {
  const res = await api("/api/health?full=1");
  return res.json();
}

export async function fetchGitStatus(workspaceId) {
  const q = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : "";
  const res = await api(`/api/git/status${q}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Git status failed");
  return data;
}

function gitStatusFromBody(body) {
  return body?.status ?? body;
}

export async function fetchGitGraph(workspaceId, limit = 48) {
  const q = new URLSearchParams();
  if (workspaceId) q.set("workspaceId", workspaceId);
  q.set("limit", String(limit));
  const res = await api(`/api/git/graph?${q}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Git graph failed");
  return data;
}

export async function gitStage({ workspaceId, paths = [], all = false } = {}) {
  const res = await api("/api/git/stage", {
    method: "POST",
    body: JSON.stringify({ workspaceId, paths, all }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Stage failed");
  return gitStatusFromBody(data);
}

export async function gitUnstage({ workspaceId, paths = [] } = {}) {
  const res = await api("/api/git/unstage", {
    method: "POST",
    body: JSON.stringify({ workspaceId, paths }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Unstage failed");
  return gitStatusFromBody(data);
}

export async function gitDiscard({ workspaceId, paths = [] } = {}) {
  const res = await api("/api/git/discard", {
    method: "POST",
    body: JSON.stringify({ workspaceId, paths }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Discard failed");
  return gitStatusFromBody(data);
}

export async function gitCommit({ workspaceId, message, amend = false } = {}) {
  const res = await api("/api/git/commit", {
    method: "POST",
    body: JSON.stringify({ workspaceId, message, amend }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Commit failed");
  return gitStatusFromBody(data);
}

export async function gitGenerateCommitMessage({
  workspaceId,
  staged = true,
  includeUnstaged = false,
} = {}) {
  const res = await api("/api/git/generate-message", {
    method: "POST",
    body: JSON.stringify({ workspaceId, staged, includeUnstaged }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Generate message failed");
  return data;
}

export async function gitPull(workspaceId) {
  const res = await api("/api/git/pull", {
    method: "POST",
    body: JSON.stringify({ workspaceId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Pull failed");
  return gitStatusFromBody(data);
}

export async function gitPush(workspaceId) {
  const res = await api("/api/git/push", {
    method: "POST",
    body: JSON.stringify({ workspaceId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Push failed");
  return gitStatusFromBody(data);
}

export async function gitCheckpoint(workspaceId) {
  const res = await api("/api/git/checkpoint", {
    method: "POST",
    body: JSON.stringify({ workspaceId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Checkpoint failed");
  return data;
}

export async function gitRevert({ workspaceId, head, stashRef = null } = {}) {
  const res = await api("/api/git/revert", {
    method: "POST",
    body: JSON.stringify({ workspaceId, head, stashRef }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Revert failed");
  return data;
}

export async function fetchClientVersion() {
  const res = await api("/api/client/version");
  return res.json();
}

export async function fetchAgentPrefs() {
  const res = await api("/api/agent/prefs");
  return res.json();
}

export async function setAgentPrefs(prefs) {
  const res = await api("/api/agent/prefs", {
    method: "POST",
    body: JSON.stringify(prefs),
  });
  return res.json();
}

export async function warmAgent({ workspaceId = "mercuryos", mode = "agent" } = {}) {
  const res = await api("/api/agent/warm", {
    method: "POST",
    body: JSON.stringify({ workspaceId, mode }),
  });
  return res.json();
}

export async function fetchChatSnapshot() {
  const res = await api("/api/chats");
  return res.json();
}

export async function saveChatSnapshot(state, revision = 0) {
  const startedAt = Date.now();
  const body = JSON.stringify({ state, revision });
  const res = await api("/api/chats", {
    method: "PUT",
    body,
  });
  const data = await res.json();
  requestTrace.trace("chat.snapshot.put", {
    revision,
    nextRevision: data?.revision,
    bytes: body.length,
    gatewayBytes: data?.bytes,
    gatewayMs: data?.durationMs,
    ms: Date.now() - startedAt,
  });
  return data;
}

export function chatStreamUrl() {
  if (!session?.gatewayUrl) return null;
  let url = `${session.gatewayUrl}/api/chats/stream`;
  const qs = [];
  if (session.token) qs.push(`token=${encodeURIComponent(session.token)}`);
  qs.push(`_=${Date.now()}`);
  url += `?${qs.join("&")}`;
  return url;
}

export async function postHealAlert({ chatId, workspaceId, reason }) {
  const res = await api("/api/heal/alert", {
    method: "POST",
    body: JSON.stringify({ chatId, workspaceId, reason }),
  });
  return res.json();
}

export async function fetchModels() {
  const res = await api("/api/agent/models");
  const data = await res.json();
  return data.models ?? [];
}

export async function fetchHarness() {
  const res = await api("/api/agent/harness");
  return res.json();
}

export async function setHarness(harness) {
  const res = await api("/api/agent/harness", {
    method: "POST",
    body: JSON.stringify({ harness }),
  });
  return res.json();
}

export async function savePiApiKey(key) {
  const res = await api("/api/agent/pi-key", {
    method: "POST",
    body: JSON.stringify({ key }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to save Pi API key");
  return data;
}

export async function fetchWorkspaces() {
  const res = await api("/api/workspaces");
  return res.json();
}

export async function addWorkspace(body) {
  const res = await api("/api/workspaces", { method: "POST", body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to add project");
  return data;
}

export async function discoverWorkspaces(root) {
  const q = root ? `?root=${encodeURIComponent(root)}` : "";
  const res = await api(`/api/workspaces/discover${q}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Discover failed");
  return data.candidates ?? [];
}

export async function updateWorkspace(id, partial) {
  const res = await api(`/api/workspaces/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(partial),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to update project");
  return data;
}

export async function removeWorkspace(id) {
  const res = await api(`/api/workspaces/${encodeURIComponent(id)}`, { method: "DELETE" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to remove project");
  return data;
}

export async function fetchSessions(limit = 40, workspaceId = "mercuryos") {
  const res = await api(
    `/api/agent/sessions?limit=${limit}&workspaceId=${encodeURIComponent(workspaceId)}`
  );
  const data = await res.json();
  return data.sessions ?? [];
}

export async function fetchMcps() {
  const res = await api("/api/mcp");
  const data = await res.json();
  return data.servers ?? [];
}

export async function enableMcp(id) {
  const res = await api("/api/mcp/enable", { method: "POST", body: JSON.stringify({ id }) });
  return res.json();
}

export async function disableMcp(id) {
  const res = await api("/api/mcp/disable", { method: "POST", body: JSON.stringify({ id }) });
  return res.json();
}

export async function loginMcp(id) {
  const res = await api("/api/mcp/login", { method: "POST", body: JSON.stringify({ id }) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "MCP login failed");
  return data;
}

export async function fetchAgentReachStatus() {
  const res = await api("/api/agent-reach/status");
  return res.json();
}

export async function installAgentReach({ safe = true, dryRun = false, channels = [] } = {}) {
  const res = await api("/api/agent-reach/install", {
    method: "POST",
    body: JSON.stringify({ safe, dryRun, channels }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Agent Reach install failed");
  return data;
}

export async function runAgentReachDoctor({ json = false } = {}) {
  const res = await api("/api/agent-reach/doctor", {
    method: "POST",
    body: JSON.stringify({ json }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Agent Reach doctor failed");
  return data;
}

export async function runAgentReachWatch() {
  const res = await api("/api/agent-reach/watch", { method: "POST" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Agent Reach watch failed");
  return data;
}

export async function fetchAgentConversation(agentId) {
  const res = await api(`/api/agent/conversation?agentId=${encodeURIComponent(agentId)}`);
  return res.json();
}

export async function fetchRunHistory() {
  const res = await api("/api/v2/runs/history");
  const data = await res.json();
  return data.history ?? [];
}

export async function fetchPulseStatus() {
  const res = await api("/api/pulse/status");
  return res.json();
}

export async function updatePulseSettings(enabled) {
  const res = await api("/api/pulse/settings", {
    method: "PUT",
    body: JSON.stringify({ enabled }),
  });
  return res.json();
}

export async function fetchFinanceBuckets(filters = {}) {
  const q = new URLSearchParams();
  if (filters.currency) q.set("currency", filters.currency);
  if (filters.entity) q.set("entity", filters.entity);
  const res = await api(`/api/finance/buckets${q.toString() ? `?${q}` : ""}`);
  return res.json();
}

export async function createFinanceBucket(bucket) {
  const res = await api("/api/finance/buckets", {
    method: "POST",
    body: JSON.stringify(bucket),
  });
  return res.json();
}

export async function recordBucketIncome(income) {
  const res = await api("/api/finance/buckets/income", {
    method: "POST",
    body: JSON.stringify(income),
  });
  return res.json();
}

export async function recordBucketSpend(spend) {
  const res = await api("/api/finance/buckets/spend", {
    method: "POST",
    body: JSON.stringify(spend),
  });
  return res.json();
}

export async function runPulseNow(message) {
  const res = await api("/api/pulse/run", {
    method: "POST",
    body: JSON.stringify({ source: "manual", message }),
  });
  return res.json();
}

export async function fetchSophieStatus() {
  const res = await api("/api/sophie/status");
  return res.json();
}

export async function fetchSophieIdentity() {
  const res = await api("/api/sophie/identity");
  return res.json();
}

export async function fetchSophieExpression() {
  const res = await api("/api/sophie/expression");
  return res.json();
}

export async function updateSophieExpression(body = {}) {
  const res = await api("/api/sophie/expression", {
    method: "PUT",
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function chooseSophieExpression(body = {}) {
  const res = await api("/api/sophie/expression/choose", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function runSophieReflection(limit = 3) {
  const res = await api("/api/sophie/reflect", {
    method: "POST",
    body: JSON.stringify({ limit }),
  });
  return res.json();
}

export async function runSophieAutonomy(reason = "manual desk run") {
  const res = await api("/api/sophie/autonomy/run", {
    method: "POST",
    body: JSON.stringify({ reason, force: true }),
  });
  return res.json();
}

export async function updateSophieAutonomy(body = {}) {
  const res = await api("/api/sophie/autonomy", {
    method: "PUT",
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function fetchGatewayLogs(limit = 120) {
  const res = await api(`/api/gateway/logs?limit=${limit}`);
  const data = await res.json();
  return data.lines ?? [];
}

export async function addMemory(entry) {
  const res = await api("/api/memory/add", { method: "POST", body: JSON.stringify(entry) });
  return res.json();
}

export async function fetchAccessPending() {
  const res = await api("/api/access/pending");
  return res.json();
}

export async function approveAccessRequest(requestId, deviceId) {
  const res = await api("/api/access/approve", {
    method: "POST",
    body: JSON.stringify({ requestId, deviceId }),
  });
  return res.json();
}

export async function denyAccessRequest(requestId) {
  const res = await api("/api/access/deny", {
    method: "POST",
    body: JSON.stringify({ requestId }),
  });
  return res.json();
}

export async function fetchCursorAuth() {
  const res = await api("/api/cursor/status");
  return res.json();
}

export async function cursorLogin() {
  const res = await api("/api/cursor/login", { method: "POST", body: "{}" });
  return res.json();
}

export async function saveCursorApiKey(key) {
  const res = await api("/api/cursor/key", {
    method: "POST",
    body: JSON.stringify({ key }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to save API key");
  return data;
}

export async function fetchHiggsfieldStatus() {
  const res = await api("/api/higgsfield/status");
  return res.json();
}

export async function higgsfieldLogin() {
  const res = await api("/api/higgsfield/login", { method: "POST", body: "{}" });
  return res.json();
}

export function tiktokConnectUrl() {
  const base = session?.gatewayUrl?.replace(/\/$/, "") ?? "";
  return base ? `${base}/api/tiktok/connect` : "/api/tiktok/connect";
}

export async function fetchTikTokStatus() {
  if (!session?.gatewayUrl) throw new Error("Not connected");
  const url = `${session.gatewayUrl.replace(/\/$/, "")}/api/tiktok/status`;
  const res = await publicGatewayRequest(url, { signal: fetchTimeout(10_000) });
  if (!res.ok) {
    const text = (await res.text().catch(() => "")).trim();
    throw new Error(text || `TikTok status HTTP ${res.status}`);
  }
  const data = await res.json();
  return data;
}

/** Fallback when /api/tiktok/status is unreachable — uses authenticated full health. */
export async function fetchTikTokStatusFromHealth() {
  const res = await api("/api/health?full=1");
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Health check failed");
  return data.tiktok ?? { configured: false, connected: false };
}

export async function tiktokDisconnect() {
  const res = await api("/api/tiktok/disconnect", { method: "POST", body: "{}" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to disconnect TikTok");
  return data;
}

export async function generateImage(body) {
  const res = await api("/api/higgsfield/generate", { method: "POST", body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Generation failed");
  return data;
}

export async function triggerAppBuild() {
  const res = await api("/api/deploy/desk", { method: "POST", body: "{}" });
  const data = await res.json();
  if (!res.ok || data.ok === false) {
    throw new Error(data.error ?? data.reason ?? "Desk build failed to start");
  }
  return data;
}

export async function getAppBuildStatus() {
  const res = await api("/api/jobs/desk");
  return res.json();
}

export function higgsfieldImageUrl(id) {
  return `${session.gatewayUrl}/api/higgsfield/images/${encodeURIComponent(id)}?token=${encodeURIComponent(session.token)}`;
}

export async function fetchFilesRevision(path = "", workspaceId = "mercuryos") {
  const res = await api(
    `/api/files/revision?path=${encodeURIComponent(path)}&workspaceId=${encodeURIComponent(workspaceId)}&_=${Date.now()}`
  );
  return res.json();
}

export async function listFiles(path = "", workspaceId = "mercuryos") {
  const res = await api(
    `/api/files?path=${encodeURIComponent(path)}&workspaceId=${encodeURIComponent(workspaceId)}`
  );
  return res.json();
}

export async function searchFiles(path = "", query = "", workspaceId = "mercuryos", limit = 400) {
  const params = new URLSearchParams({
    path,
    q: query,
    workspaceId,
    limit: String(limit),
  });
  const res = await api(`/api/files/search?${params}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Search failed");
  return data;
}

export async function readFile(path, workspaceId = "mercuryos") {
  const res = await api(
    `/api/files/read?path=${encodeURIComponent(path)}&workspaceId=${encodeURIComponent(workspaceId)}`
  );
  return res.json();
}

export async function fetchFileMeta(path, workspaceId = "mercuryos") {
  const res = await api(
    `/api/files/meta?path=${encodeURIComponent(path)}&workspaceId=${encodeURIComponent(workspaceId)}`
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Meta failed");
  return data;
}

export async function writeFile(path, content, workspaceId = "mercuryos") {
  const res = await api("/api/files/write", {
    method: "POST",
    body: JSON.stringify({ path, content, workspaceId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Write failed");
  return data;
}

export async function deleteFile(path, workspaceId = "mercuryos") {
  const res = await api("/api/files/delete", {
    method: "POST",
    body: JSON.stringify({ path, workspaceId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Delete failed");
  return data;
}

export async function renameFile(path, newName, workspaceId = "mercuryos") {
  const res = await api("/api/files/rename", {
    method: "POST",
    body: JSON.stringify({ path, newName, workspaceId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Rename failed");
  return data;
}

export async function createDirectory(path, workspaceId = "mercuryos") {
  const res = await api("/api/files/mkdir", {
    method: "POST",
    body: JSON.stringify({ path, workspaceId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Could not create folder");
  return data;
}

export async function fetchClientLayout() {
  const res = await api("/api/client/layout");
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Layout fetch failed");
  return data.layout ?? data;
}

export async function saveClientLayout(layout) {
  const res = await api("/api/client/layout", {
    method: "PUT",
    body: JSON.stringify({ layout }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Layout save failed");
  return data.layout ?? layout;
}

export function previewUrl(path, workspaceId = "mercuryos") {
  const base = `${session.gatewayUrl}/api/preview?path=${encodeURIComponent(path)}&workspaceId=${encodeURIComponent(workspaceId)}`;
  if (session?.cookieAuth) return base;
  return `${base}&token=${encodeURIComponent(session.token)}`;
}

function parseTranscribeError(data, status) {
  const parts = [data.error ?? `Transcription failed (${status})`];
  const clientBytes = data.meta?.bytes ?? data.meta?.clientBytes;
  if (clientBytes != null && data.bytes != null && clientBytes !== data.bytes) {
    parts.push(`${clientBytes} bytes sent · ${data.bytes} at gateway`);
  } else if (data.bytes != null) {
    parts.push(`${data.bytes} bytes at gateway`);
  }
  if (data.mimetype) parts.push(data.mimetype);
  if (data.hint) parts.push(data.hint);
  return new Error(parts.filter(Boolean).join(" · "));
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Could not encode audio for upload"));
        return;
      }
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.onerror = () => reject(new Error("Could not read recording for upload"));
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(b64, mime = "application/octet-stream") {
  const raw = String(b64 ?? "").replace(/^data:[^;]+;base64,/, "").trim();
  if (!raw) return new Blob([], { type: mime });
  const bin = atob(raw);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

function xhrBlobPost(url, blob, { contentType, meta = {}, timeout = 90_000 } = {}) {
  const type = contentType || blob.type || "audio/webm";
  const client = session?.cookieAuth ? "desk" : "phone";
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
    xhr.timeout = timeout;
    xhr.responseType = "json";
    if (session?.cookieAuth) xhr.withCredentials = true;
    xhr.setRequestHeader("Authorization", `Bearer ${session?.token ?? ""}`);
    xhr.setRequestHeader("Content-Type", type);
    xhr.setRequestHeader("X-Mercury-Client", client);
    xhr.setRequestHeader("X-Mercury-Meta", JSON.stringify(meta));
    xhr.onload = () => {
      const data = xhr.response && typeof xhr.response === "object" ? xhr.response : {};
      resolve({
        ok: xhr.status >= 200 && xhr.status < 300,
        status: xhr.status,
        json: async () => data,
      });
    };
    xhr.onerror = () => reject(new TypeError("Network request failed"));
    xhr.ontimeout = () => reject(new Error("Transcription timeout"));
    xhr.send(blob);
  });
}

export async function transcribe(audio, mimetype, meta = {}) {
  if (!session?.gatewayUrl) throw new Error("Not connected");

  const type = mimetype || (audio instanceof Blob ? audio.type : null) || "audio/webm";
  let res;

  // Phone native: raw audio/wav body (matches desk) — avoids JSON base64 through Capacitor HTTP.
  if (isNativeApp() && (typeof audio === "string" || audio instanceof Blob)) {
    const blob = typeof audio === "string" ? base64ToBlob(audio, type) : audio;
    const clientBytes = meta.bytes ?? blob.size;
    meta = { ...meta, clientBytes, bytes: clientBytes, uploadVia: "binary" };
    if (clientBytes < 500) {
      throw new Error(
        `Recording too short (${clientBytes} bytes) — tap mic to start, speak, tap again to stop`
      );
    }
    res = await xhrBlobPost(`${session.gatewayUrl}/api/transcribe`, blob, {
      contentType: type,
      meta,
    });
  } else if (typeof audio === "string") {
    meta = { ...meta, clientBytes: meta.bytes ?? meta.clientBytes, uploadVia: "base64" };
    res = await api("/api/transcribe", {
      method: "POST",
      body: JSON.stringify({ audio, mimetype: type, meta }),
    });
  } else if (audio instanceof Blob) {
    const clientBytes = meta.bytes ?? audio.size;
    meta = { ...meta, clientBytes, bytes: clientBytes };
    if (clientBytes < 500) {
      throw new Error(
        `Recording too short (${clientBytes} bytes) — tap mic to start, speak, tap again to stop`
      );
    }
    if (session?.cookieAuth) {
      res = await xhrBlobPost(`${session.gatewayUrl}/api/transcribe`, audio, {
        contentType: type,
        meta,
      });
    } else {
      res = await gatewayRequest(`${session.gatewayUrl}/api/transcribe`, {
        method: "POST",
        headers: {
          "Content-Type": type,
          "X-Mercury-Meta": JSON.stringify(meta),
        },
        body: audio,
      });
    }
  } else {
    res = await api("/api/transcribe", {
      method: "POST",
      body: JSON.stringify({ audio, mimetype: type, meta }),
    });
  }

  const data = await res.json();
  if (!res.ok) throw parseTranscribeError(data, res.status);
  return data;
}

export async function fetchSpeakAudio(text, { backend = null } = {}) {
  if (!session?.gatewayUrl) throw new Error("Not connected");
  const payload = String(text ?? "").trim();
  if (!payload) throw new Error("No text to speak");

  const body = { text: payload.slice(0, 2000) };
  if (backend) body.backend = backend;

  const res = await fetch(`${session.gatewayUrl}/api/speak`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
    cache: "no-store",
    credentials: "same-origin",
    signal: fetchTimeout(45_000),
  });

  const contentType = res.headers.get("content-type") ?? "";
  if (!res.ok) {
    const data = contentType.includes("json") ? await res.json().catch(() => ({})) : {};
    throw new Error(data.error ?? `Speech failed (${res.status})`);
  }

  const blob = await res.blob();
  if (!blob || blob.size < 64) {
    throw new Error("Gateway returned empty speech audio");
  }
  return blob;
}

export async function fetchRuns() {
  const res = await api(`/api/v2/runs?_=${Date.now()}`);
  const data = await res.json();
  return data.runs ?? [];
}

export async function cancelRun(chatId, { runId = null } = {}) {
  const id = runId ?? chatId;
  const res = await api(`/api/v2/runs/${encodeURIComponent(id)}/cancel`, { method: "POST" });
  return res.json();
}

/** Release pooled Cursor agent for a chat (after manual context compact). */
export async function resetChatAgent(chatId) {
  const res = await gatewayRequest(`${session.gatewayUrl}/api/v2/chat/reset-agent`, {
    method: "POST",
    body: JSON.stringify({ chatId }),
    signal: fetchTimeout(8000),
  });
  try {
    return await res.json();
  } catch {
    return { ok: false };
  }
}

export async function fetchRun(chatId, { view = null } = {}) {
  const resolvedView = deskApiView(view);
  const viewQ = resolvedView ? `&view=${encodeURIComponent(resolvedView)}` : "";
  const res = await api(`/api/v2/runs/${encodeURIComponent(chatId)}?_=${Date.now()}${viewQ}`, {
    signal: fetchTimeout(8000),
  });
  return res.json();
}

export function runStreamUrl(runOrChatId, { view = DESK_RUN_VIEW } = {}) {
  if (!session?.gatewayUrl) return null;
  const path = `/api/v2/runs/${encodeURIComponent(runOrChatId)}/stream`;
  let url = `${session.gatewayUrl}${path}`;
  const qs = [];
  if (session.token) qs.push(`token=${encodeURIComponent(session.token)}`);
  const resolvedView = deskApiView(view ?? DESK_RUN_VIEW);
  if (resolvedView) qs.push(`view=${encodeURIComponent(resolvedView)}`);
  qs.push(`_=${Date.now()}`);
  url += `?${qs.join("&")}`;
  return url;
}

export async function uploadFile(base64, filename, mimetype) {
  const res = await api("/api/upload", {
    method: "POST",
    body: JSON.stringify({ data: base64, filename, mimetype }),
  });
  return res.json();
}

export function uploadRawUrl(stored) {
  if (!session?.gatewayUrl || !stored) return null;
  const base = `${session.gatewayUrl}/api/uploads/raw/${encodeURIComponent(stored)}`;
  if (session?.cookieAuth) return base;
  return `${base}?token=${encodeURIComponent(session.token)}`;
}

export async function searchRefs(
  query = "",
  limit = 40,
  workspaceId = "mercuryos",
  category = null,
  openTabs = [],
  signal = null,
) {
  const res = await api("/api/refs/search", {
    method: "POST",
    body: JSON.stringify({ query, limit, workspaceId, category, openTabs }),
    signal,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Search failed");
  let items = Array.isArray(data.items) ? data.items : [];
  if (category === "docs") {
    items = items.filter((i) => i.kind === "doc" || i.kind === "skill" || /\.md$/i.test(i.path ?? ""));
  } else if (category === "files") {
    items = items.filter((i) => i.kind !== "skill");
  } else if (category === "codebase") {
    items = items.filter((i) => !String(i.path ?? "").includes(".cursor/skills") && i.kind !== "dir");
  } else if (category === "skills") {
    items = items.filter((i) => i.kind === "skill");
  } else if (category === "people") {
    items = items.filter((i) => i.kind === "person");
  }
  return items;
}

export async function resolvePerson(remoteJid, { displayName, phone, timeoutMs } = {}) {
  const res = await api("/api/people/resolve", {
    method: "POST",
    body: JSON.stringify({ remoteJid, displayName, phone, timeoutMs }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Could not resolve person");
  return data.identity ?? null;
}

const POLL_MS = 260;
const RUN_WAIT_MS = 8000;
const RUN_POST_WAIT_MS = 60_000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** If stored gateway URL is stale, try LAN candidates and update session. */
export async function tryRepairGateway(candidates = []) {
  if (!session?.token || !candidates.length) return false;
  for (const base of candidates) {
    if (base === session.gatewayUrl) continue;
    try {
      const res = await gatewayRequest(`${base}/api/health`, { signal: fetchTimeout(5000) });
      if (!res.ok) continue;
      const health = await res.json();
      if (!health.ok) continue;
      session = { gatewayUrl: base, token: session.token };
      return true;
    } catch {
      /* try next */
    }
  }
  return false;
}

/** Poll run snapshot — reliable on Android (fetch SSE body often buffers until close). */
async function pollRunEvents(chatId, handlers, signal, { fromIndex = 0, postStarted = false, runId = null } = {}) {
  let lastIdx = fromIndex;
  const deadline = Date.now() + (postStarted ? RUN_POST_WAIT_MS : RUN_WAIT_MS);
  let netRetries = 0;
  let nullPolls = 0;
  let zombiePolls = 0;
  let lastEventCount = -1;
  let lastProgressKey = "";
  const pollId = runId ?? chatId;
  const pollView = DESK_RUN_VIEW;

  while (!signal.aborted) {
    let data;
    try {
      data = await fetchRun(pollId, { view: pollView });
      netRetries = 0;
    } catch (err) {
      if (signal.aborted) return;
      if (isNetworkError(err) && netRetries < 40) {
        netRetries += 1;
        await sleep(Math.min(POLL_MS * (1 + netRetries * 0.25), 3000));
        continue;
      }
      throw err;
    }
    const run = data.run;
    if (!run) {
      nullPolls += 1;
      if (lastIdx > 0 && nullPolls >= 8) {
        handlers.onDone?.();
        return;
      }
      if (nullPolls >= 6 && lastIdx === 0) {
        throw new Error(
          postStarted
            ? "Agent never started — send again (gateway may have restarted)"
            : "Run not found"
        );
      }
      if (Date.now() < deadline) {
        await sleep(POLL_MS);
        continue;
      }
      throw new Error(
        postStarted
          ? "Agent run lost — restart ./m on your computer and send again"
          : "Run not found"
      );
    }
    nullPolls = 0;

    const events = run.events ?? [];
    const startedAt = run.startedAt ?? Date.now();
    const elapsed = Date.now() - startedAt;
    const sdkSeq = run.sdkMessageSeq ?? run.sdkMessages?.length ?? 0;
    const progressKey =
      pollView === DESK_RUN_VIEW
        ? `${run.flowSig ?? ""}|${sdkSeq}|${String(run.content ?? "").length}`
        : `${events.length}|${sdkSeq}|${String(run.text ?? "").length}`;

    if (run.status === "streaming" && progressKey === lastProgressKey) {
      zombiePolls += 1;
      const staleLimit = postStarted ? 120 : 8;
      const minWaitMs = postStarted ? 60_000 : 2200;
      const hasSdkProgress = sdkSeq > 0 || String(run.content ?? run.text ?? "").trim().length > 0;
      const onlyPassive =
        pollView === DESK_RUN_VIEW
          ? !hasSdkProgress && !run.showPlanning
          : !hasSdkProgress &&
            events.every((e) => e.type === "status" || e.type === "thinking" || e.type === "agent");
      if (zombiePolls >= staleLimit && elapsed >= minWaitMs && onlyPassive) {
        throw new Error("Stale agent session — send your message again");
      }
    } else {
      zombiePolls = 0;
    }
    lastProgressKey = progressKey;
    lastEventCount = events.length;

    if (pollView === DESK_RUN_VIEW && handlers.onSnapshot) {
      handlers.onSnapshot(run);
    }

    for (let i = lastIdx; i < events.length; i++) {
      handlers.onEvent?.(events[i], i);
    }
    lastIdx = events.length;

    if (run.status === "awaiting_input") {
      handlers.onDone?.({ awaiting: true });
      return;
    }

    if (run.status !== "streaming") {
      try {
        const final = await fetchRun(pollId, { view: pollView });
        const fe = final.run?.events ?? [];
        for (let i = lastIdx; i < fe.length; i++) {
          handlers.onEvent?.(fe[i], i);
        }
        if (pollView === DESK_RUN_VIEW && final.run) handlers.onSnapshot?.(final.run);
      } catch {
        /* best-effort final sweep */
      }
      handlers.onDone?.();
      return;
    }

    await sleep(POLL_MS);
  }
  if (signal.aborted) handlers.onAborted?.();
}

/**
 * Legacy phone poll path — prefer postAgentChat + startRunWatch (desk/phone shells).
 * Kept for external Capacitor bundles that cannot use SSE.
 */
export function streamChat(body, { onEvent, onDone, onError, onAborted, onPostStarted, onSnapshot } = {}) {
  const chatId = body.chatId ?? "default";
  if (!session?.gatewayUrl) {
    requestTrace.trace("stream.abort", { chatId, reason: "no_gateway_url" });
    onError?.(new Error("Not connected"));
    return () => {};
  }

  const ctrl = new AbortController();
  requestTrace.trace("stream.open", { chatId, reconnect: Boolean(body.reconnect) });

  (async () => {
    try {
      if (body.reconnect) {
        const snap = await fetchRun(chatId, { view: null });
        const run = snap.run;
        if (!run || (run.status !== "streaming" && run.status !== "awaiting_input")) {
          const events = run?.events ?? [];
          const from = body.fromEventIndex ?? 0;
          for (let i = from; i < events.length; i++) onEvent?.(events[i], i);
          onDone?.();
          return;
        }
        const fromIndex = body.fromEventIndex ?? 0;
        await pollRunEvents(chatId, { onEvent, onDone, onError, onSnapshot }, ctrl.signal, {
          fromIndex,
          runId: body.runId ?? null,
        });
        return;
      }

      const ack = await postAgentChatV2(body);
      const runId = ack.gatewayRunId ?? ack.runId ?? body.runId ?? null;
      requestTrace.trace("stream.post_started", { chatId, status: ack.status, runId });
      onPostStarted?.();
      await pollRunEvents(chatId, { onEvent, onDone, onError, onSnapshot }, ctrl.signal, {
        fromIndex: 0,
        postStarted: true,
        runId,
      });
    } catch (err) {
      if (err.name === "AbortError") {
        requestTrace.trace("stream.aborted", { chatId });
        void flushRequestTrace({ reason: "stream_aborted", chatId });
        onAborted?.();
        return;
      }
      requestTrace.trace("stream.error", { chatId, error: String(err?.message ?? err) });
      void flushRequestTrace({ reason: "stream_error", chatId });
      onError?.(err);
    }
  })();

  return () => ctrl.abort();
}

/** Continue agent run (AskQuestion answers, plan execute) — same session. */
export function continueChat(body, handlers = {}) {
  const model = normalizeModelChoice(body.model ?? "auto");
  return streamChat(
    {
      chatId: body.chatId,
      agentId: body.agentId,
      workspaceId: body.workspaceId,
      model,
      mode: body.mode,
      modelParams: isAutoModel(model) ? [] : (body.modelParams ?? []),
      continuation: body.continuation,
      message: "",
    },
    handlers
  );
}

export function resumeChat(chatId, { onEvent, onDone, onError, onAborted, fromEventIndex = 0 } = {}) {
  return streamChat({ chatId, reconnect: true, fromEventIndex }, { onEvent, onDone, onError, onAborted });
}
