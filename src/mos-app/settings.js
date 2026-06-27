/** Settings page — agent, MCP, memory, higgsfield, health, updates. */
import { setSounds, getUiSoundPrefs } from "./sounds.js";
import { setHaptics } from "./haptics.js";
import { getInstalledVersion, maybeShowUpdate, probeUpdateStatus } from "./update.js";
import { wireAppearanceSettings } from "./theme.js";
import * as auth from "./auth.js";
import * as api from "./api.js";
import * as agentPrefs from "./agent-prefs.js";
import { modelChoiceLabel, isAutoModel, AUTO_MODEL, normalizeModelChoice } from "./model-choice.js";
import { showToast, promptPwaInstall } from "./permissions.js";
import { haptic } from "./haptics.js";
import { sound } from "./sounds.js";
import { getDeviceId } from "./device.js";

let wired = false;
/** @type {null | { onImportSession?: (s: object) => void }} */
let ctx = null;
/** @type {object[]} */
let cachedModels = [];
/** @type {ReturnType<typeof setInterval> | null} */
let buildPollTimer = null;

function setBuildProgress(percent, label) {
  const wrap = document.querySelector("#build-progress");
  const fill = document.querySelector("#build-progress-fill");
  const text = document.querySelector("#build-progress-text");
  if (!wrap || !fill || !text) return;
  wrap.classList.remove("hidden");
  const pct = Math.max(0, Math.min(100, percent ?? 0));
  fill.style.width = `${pct}%`;
  text.textContent = label ?? `${pct}%`;
}

function hideBuildProgress() {
  document.querySelector("#build-progress")?.classList.add("hidden");
  const fill = document.querySelector("#build-progress-fill");
  if (fill) fill.style.width = "0%";
}

function stopBuildPoll() {
  if (buildPollTimer) clearInterval(buildPollTimer);
  buildPollTimer = null;
}

async function pollBuildStatus() {
  const btn = document.querySelector("#set-build-app");
  const el = document.querySelector("#set-build-status");
  try {
    const data = await api.getAppBuildStatus();
    const status = data.status ?? "idle";
    const progress = data.progress ?? 0;
    const phase = data.phase ?? "Building…";

    if (status === "building") {
      if (btn) btn.disabled = true;
      setBuildProgress(progress, `${progress}%`);
      if (el) el.textContent = phase;
      return true;
    }

    stopBuildPoll();
    if (btn) btn.disabled = false;

    if (status === "done") {
      setBuildProgress(100, "100%");
      const ver = data.release?.versionName;
      if (el) {
        el.textContent = ver ? `v${ver} ready — check update banner` : "Build finished";
      }
      setTimeout(hideBuildProgress, 4000);
    } else if (status === "error") {
      hideBuildProgress();
      if (el) el.textContent = data.error ?? "Build failed";
    } else {
      hideBuildProgress();
    }
    return false;
  } catch (err) {
    stopBuildPoll();
    if (btn) btn.disabled = false;
    hideBuildProgress();
    if (el) el.textContent = err?.message ?? "Build status unavailable";
    return false;
  }
}

function startBuildPoll() {
  stopBuildPoll();
  pollBuildStatus();
  buildPollTimer = setInterval(() => {
    pollBuildStatus();
  }, 1200);
}

export function wireSettingsPanel(appCtx) {
  if (wired) return;
  wired = true;
  ctx = appCtx ?? null;

  wireAppearanceSettings();

  const soundsEl = document.querySelector("#set-sounds");
  if (soundsEl) soundsEl.checked = getUiSoundPrefs().enabled;

  $("#set-sounds")?.addEventListener("change", (e) => {
    setSounds(e.target.checked);
    if (e.target.checked) sound.tap();
  });
  $("#set-haptics")?.addEventListener("change", (e) => {
    setHaptics(e.target.checked);
    if (e.target.checked) haptic.tap();
  });

  $("#set-agent-mode")?.addEventListener("change", async (e) => {
    haptic.tap();
    syncModeSegment(e.target.value);
    await agentPrefs.updatePrefs({ mode: e.target.value });
    refreshHealth();
  });

  wireModeSegment();
  wireAdvancedToggle();
  wireRequestTracePanel();
  wireGatewayLogPanel();

  $("#set-agent-model")?.addEventListener("change", async (e) => {
    haptic.tap();
    const model = normalizeModelChoice(e.target.value);
    const patch = isAutoModel(model) ? { model: AUTO_MODEL, modelParams: [] } : { model, modelParams: [] };
    await agentPrefs.updatePrefs(patch);
    renderModelParams(model, []);
    const mode = document.querySelector("#set-agent-mode")?.value ?? "agent";
    updateAgentSummary(mode, model);
    refreshHealth();
  });

  document.querySelector("#set-check-update")?.addEventListener("click", async () => {
    haptic.tap();
    const status = document.querySelector("#set-update-status");
    const btn = document.querySelector("#set-check-update");
    if (status) status.textContent = "Checking…";
    btn.disabled = true;
    try {
      const probe = await probeUpdateStatus(appCtx?.getSession?.());
      if (probe.state === "available") {
        const update = await maybeShowUpdate(appCtx?.getSession?.(), { manual: true });
        if (status) status.textContent = `v${update?.versionName ?? probe.update.versionName} ready`;
      } else if (probe.state === "current") {
        if (status) status.textContent = `Up to date · ${probe.version}`;
      } else if (probe.state === "offline") {
        if (status) status.textContent = "Not connected to gateway";
      } else {
        if (status) status.textContent = probe.message ?? "Gateway unreachable";
      }
    } catch (err) {
      if (status) status.textContent = err?.message ?? "Check failed";
    } finally {
      btn.disabled = false;
    }
  });

  const pwaBtn = document.querySelector("#set-pwa-install");
  document.addEventListener("mercury-pwa-installable", () => pwaBtn?.classList.remove("hidden"));
  pwaBtn?.addEventListener("click", async () => {
    haptic.tap();
    const res = await promptPwaInstall();
    showToast(res.ok ? "App installed" : "Install cancelled", res.ok ? "Added to home screen" : "Use browser menu → Install app");
  });

  document.querySelector("#set-build-app")?.addEventListener("click", async () => {
    haptic.tap();
    const el = document.querySelector("#set-build-status");
    const btn = document.querySelector("#set-build-app");
    if (el) el.textContent = "Starting build…";
    setBuildProgress(4, "4%");
    btn.disabled = true;
    try {
      const data = await api.triggerAppBuild();
      if (!data.ok) {
        hideBuildProgress();
        if (el) el.textContent = data.error ?? "Failed to start build";
        btn.disabled = false;
        return;
      }
      startBuildPoll();
    } catch (err) {
      hideBuildProgress();
      if (el) el.textContent = err.message ?? "Build failed";
      btn.disabled = false;
    }
  });

  document.querySelector("#set-change-pin")?.addEventListener("click", () => appCtx?.onChangePin?.());
  document.querySelector("#set-repair")?.addEventListener("click", () => appCtx?.onRepair?.());

  document.querySelector("#set-sessions")?.addEventListener("click", () => openSessionsSheet());
  document.querySelector("#sessions-close")?.addEventListener("click", closeSessionsSheet);
  document.querySelector(".sessions-backdrop")?.addEventListener("click", closeSessionsSheet);

  document.querySelector("#set-run-history")?.addEventListener("click", () => openRunsSheet());
  document.querySelector("#runs-close")?.addEventListener("click", closeRunsSheet);
  document.querySelector(".runs-backdrop")?.addEventListener("click", closeRunsSheet);

  document.querySelector("#set-projects-explore")?.addEventListener("click", () => {
    haptic.tap();
    appCtx?.onExploreProjects?.();
  });

  document.querySelector("#cursor-cli-login")?.addEventListener("click", async () => {
    haptic.tap();
    const el = document.querySelector("#cursor-auth-status");
    const btn = document.querySelector("#cursor-cli-login");
    if (btn) btn.disabled = true;
    if (el) el.textContent = "Starting sign-in…";
    try {
      const data = await api.cursorLogin();
      if (data.url) {
        window.open(data.url, "_blank", "noopener");
        if (el) el.textContent = "Complete sign-in in the browser tab";
        showToast("Cursor", "Finish login in the browser, then pull to refresh", "Settings");
      } else if (el) {
        el.textContent = data.email ? `Signed in · ${data.email}` : data.message ?? "Signed in";
      }
      refreshHealth();
      refreshCursorAuth();
    } catch (err) {
      if (el) el.textContent = err.message ?? "Sign-in failed";
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  document.querySelector("#hf-login")?.addEventListener("click", async () => {
    haptic.tap();
    const el = document.querySelector("#hf-status");
    try {
      const data = await api.higgsfieldLogin();
      if (data.url) {
        window.open(data.url, "_blank", "noopener");
        if (el) el.textContent = "Complete sign-in in the browser tab";
        showToast("Higgsfield", "Open the browser tab to finish sign-in", "Settings");
      } else if (el) {
        el.textContent = data.message ?? "Login started";
      }
    } catch (err) {
      if (el) el.textContent = err.message ?? "Login failed";
    }
  });

  document.querySelector("#mem-save")?.addEventListener("click", async () => {
    haptic.tap();
    const title = document.querySelector("#mem-title")?.value?.trim();
    const content = document.querySelector("#mem-content")?.value?.trim();
    const status = document.querySelector("#mem-status");
    if (!title || !content) {
      if (status) status.textContent = "Title and content required";
      return;
    }
    if (status) status.textContent = "Saving…";
    try {
      const data = await api.addMemory({ title, content, memory_type: "context" });
      if (status) status.textContent = data.ok !== false ? "Saved" : data.error ?? "Failed";
      if (data.ok !== false) {
        document.querySelector("#mem-title").value = "";
        document.querySelector("#mem-content").value = "";
      }
    } catch (err) {
      if (status) status.textContent = err.message ?? "Save failed";
    }
  });

  wireAccordionPersistence();
  refreshVersionLabel(document.querySelector("#set-version"));
}

const ACCORDION_KEY = "mercuryos-settings-accordions";

function wireModeSegment() {
  const seg = document.querySelector("#set-agent-mode-seg");
  const select = document.querySelector("#set-agent-mode");
  if (!seg || !select) return;
  seg.querySelectorAll(".seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.mode;
      if (!mode || select.value === mode) return;
      haptic.tap();
      select.value = mode;
      syncModeSegment(mode);
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
  });
}

function syncModeSegment(mode) {
  document.querySelectorAll("#set-agent-mode-seg .seg-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  });
  const modeEl = document.querySelector("#set-agent-mode");
  if (modeEl && modeEl.value !== mode) modeEl.value = mode;
}

function wireAccordionPersistence() {
  try {
    const saved = JSON.parse(localStorage.getItem(ACCORDION_KEY) || "{}");
    document.querySelectorAll("#view-settings .settings-group[id]").forEach((el) => {
      if (saved[el.id] === true) el.open = true;
      else if (saved[el.id] === false) el.open = false;
      el.addEventListener("toggle", () => {
        const state = JSON.parse(localStorage.getItem(ACCORDION_KEY) || "{}");
        state[el.id] = el.open;
        localStorage.setItem(ACCORDION_KEY, JSON.stringify(state));
      });
    });
  } catch { /* ignore */ }
}

export async function refreshSettingsPanel() {
  refreshRequestTracePreview();
  await refreshAccessRequests();
  await refreshAgentControls();
  await refreshProjectsList();
  await refreshMcpList();
  await refreshCursorAuth();
  await refreshHiggsfieldStatus();
  refreshHealth();
  refreshVersionLabel(document.querySelector("#set-version"));
  const building = await pollBuildStatus();
  if (building && !buildPollTimer) startBuildPoll();
}

async function refreshProjectsList() {
  const list = document.querySelector("#set-projects-list");
  const summary = document.querySelector("#projects-summary");
  if (!list) return;
  list.innerHTML = `<p class="mcp-loading">Loading projects…</p>`;
  try {
    const data = await api.fetchWorkspaces();
    const workspaces = data.workspaces ?? [];
    const activeId = ctx?.getActiveWorkspaceId?.() ?? "mercuryos";
    list.innerHTML = "";
    if (summary) {
      summary.textContent =
        workspaces.length === 1
          ? "1 project opened"
          : `${workspaces.length} projects opened`;
    }
    if (!workspaces.length) {
      list.innerHTML = `<p class="mcp-loading">No projects yet — explore to add one</p>`;
      return;
    }
    const sorted = [...workspaces].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return a.label.localeCompare(b.label);
    });
    for (const w of sorted) {
      const row = document.createElement("div");
      row.className = "project-settings-row";
      const isDefault = w.id === "mercuryos";
      const isActive = w.id === activeId;
      row.innerHTML = `
        <div class="project-settings-copy">
          <span class="project-settings-title">${escapeHtml(w.label)}${isActive ? " · active" : ""}</span>
          <span class="project-settings-meta">${escapeHtml(w.id)}${w.pinned ? " · pinned" : ""}</span>
        </div>
        <div class="project-settings-actions">
          ${isDefault ? "" : `<button type="button" class="pill-btn sm proj-pin" data-id="${escapeHtml(w.id)}" data-pinned="${w.pinned ? "1" : "0"}">${w.pinned ? "Unpin" : "Pin"}</button>`}
          <button type="button" class="pill-btn sm proj-rename" data-id="${escapeHtml(w.id)}" data-label="${escapeHtml(w.label)}">Rename</button>
          ${isDefault ? "" : `<button type="button" class="pill-btn sm danger-text proj-remove" data-id="${escapeHtml(w.id)}" data-label="${escapeHtml(w.label)}">Remove</button>`}
          <button type="button" class="pill-btn sm proj-open" data-id="${escapeHtml(w.id)}">Open</button>
        </div>`;
      row.querySelector(".proj-pin")?.addEventListener("click", async (e) => {
        haptic.tap();
        const btn = e.currentTarget;
        const id = btn.dataset.id;
        btn.disabled = true;
        try {
          await api.updateWorkspace(id, { pinned: btn.dataset.pinned !== "1" });
          await ctx?.onProjectsChanged?.();
          await refreshProjectsList();
        } catch (err) {
          btn.disabled = false;
          showToast("Projects", err.message ?? "Pin failed", "Settings");
        }
      });
      row.querySelector(".proj-rename")?.addEventListener("click", async (e) => {
        haptic.tap();
        const btn = e.currentTarget;
        const id = btn.dataset.id;
        const next = await ctx?.promptRename?.(btn.dataset.label ?? "");
        if (next == null || !next.trim()) return;
        btn.disabled = true;
        try {
          await api.updateWorkspace(id, { label: next.trim() });
          await ctx?.onProjectsChanged?.();
          await refreshProjectsList();
        } catch (err) {
          btn.disabled = false;
          showToast("Projects", err.message ?? "Rename failed", "Settings");
        }
      });
      row.querySelector(".proj-remove")?.addEventListener("click", (e) => {
        haptic.tap();
        const btn = e.currentTarget;
        ctx?.openDeleteProject?.(btn.dataset.id, btn.dataset.label ?? btn.dataset.id);
      });
      row.querySelector(".proj-open")?.addEventListener("click", (e) => {
        haptic.tap();
        sound.tap();
        ctx?.onProjectSwitch?.(e.currentTarget.dataset.id);
      });
      list.appendChild(row);
    }
  } catch (err) {
    list.innerHTML = `<p class="mcp-loading">${escapeHtml(err.message ?? "Projects unavailable")}</p>`;
    if (summary) summary.textContent = "Unavailable";
  }
}

async function refreshAgentControls() {
  const prefs = await agentPrefs.syncPrefsFromGateway();
  const modeEl = document.querySelector("#set-agent-mode");
  const modelEl = document.querySelector("#set-agent-model");
  const mode = prefs.mode ?? "agent";
  if (modeEl) modeEl.value = mode;
  syncModeSegment(mode);

  if (!modelEl) return;
  try {
    cachedModels = await api.fetchModels();
    const { fillModelSelect } = await import("./chat-prefs.js");
    fillModelSelect(modelEl, cachedModels, prefs.model ?? "auto");
    renderModelParams(modelEl.value, prefs.modelParams ?? []);
    const status = document.querySelector("#set-model-status");
    if (status) status.textContent = `${cachedModels.length} models available`;
    updateAgentSummary(mode, modelEl.value, prefs.modelParams ?? []);
  } catch {
    const { fillModelSelect } = await import("./chat-prefs.js");
    fillModelSelect(modelEl, [], prefs.model ?? "auto");
    const status = document.querySelector("#set-model-status");
    if (status) status.textContent = "Offline — using cached";
    updateAgentSummary(mode, modelEl.value, prefs.modelParams ?? []);
  }
}

function updateAgentSummary(mode, model, modelParams = []) {
  const el = document.querySelector("#agent-summary");
  if (!el) return;
  const modeLabel = mode === "plan" ? "Plan" : mode === "ask" ? "Ask" : "Agent";
  const modelLabel = modelChoiceLabel(model);
  const paramBits = (modelParams ?? [])
    .map((p) => {
      const meta = cachedModels.find((m) => m.id === model)?.parameters?.find((x) => x.id === p.id);
      const label = meta?.values?.find((v) => v.value === p.value)?.displayName ?? p.value;
      return label;
    })
    .filter(Boolean);
  const paramStr = paramBits.length ? ` · ${paramBits.join(", ")}` : "";
  el.textContent = `${modelLabel} · ${modeLabel} mode${paramStr}`;
}

function renderModelParams(modelId, selectedParams = []) {
  const wrap = document.querySelector("#set-model-params");
  if (!wrap) return;
  if (isAutoModel(modelId)) {
    wrap.classList.add("hidden");
    wrap.innerHTML = "";
    return;
  }
  const meta = cachedModels.find((m) => m.id === modelId);
  const params = meta?.parameters ?? [];
  if (!params.length) {
    wrap.classList.add("hidden");
    wrap.innerHTML = "";
    return;
  }
  wrap.classList.remove("hidden");
  wrap.innerHTML = "";
  const selected = new Map((selectedParams ?? []).map((p) => [p.id, p.value]));
  for (const param of params) {
    const block = document.createElement("div");
    block.className = "field-block compact";
    const label = document.createElement("label");
    label.className = "field-label";
    label.textContent = param.displayName ?? param.id;
    const select = document.createElement("select");
    select.className = "field-select";
    select.dataset.paramId = param.id;
    for (const v of param.values ?? []) {
      const opt = document.createElement("option");
      opt.value = v.value;
      opt.textContent = v.displayName ?? v.value;
      select.appendChild(opt);
    }
    if (selected.has(param.id)) select.value = selected.get(param.id);
    select.addEventListener("change", async () => {
      haptic.tap();
      const modelParams = collectModelParams();
      await agentPrefs.updatePrefs({ modelParams });
      const modeEl = document.querySelector("#set-agent-mode");
      const modelEl = document.querySelector("#set-agent-model");
      updateAgentSummary(modeEl?.value ?? "agent", modelEl?.value ?? "auto", modelParams);
      refreshHealth();
    });
    block.append(label, select);
    wrap.appendChild(block);
  }
}

function collectModelParams() {
  const wrap = document.querySelector("#set-model-params");
  if (!wrap) return [];
  return [...wrap.querySelectorAll("select[data-param-id]")].map((sel) => ({
    id: sel.dataset.paramId,
    value: sel.value,
  }));
}

async function refreshMcpList() {
  const list = document.querySelector("#mcp-list");
  const summary = document.querySelector("#mcp-summary");
  if (!list) return;
  list.innerHTML = `<p class="mcp-loading">Loading MCP…</p>`;
  try {
    const servers = await api.fetchMcps();
    list.innerHTML = "";
    if (!servers.length) {
      list.innerHTML = `<p class="mcp-loading">No MCP servers configured</p>`;
      if (summary) summary.textContent = "None configured";
      return;
    }
    const enabled = servers.filter((s) => s.status === "enabled" || s.status === "loaded").length;
    if (summary) summary.textContent = `${enabled}/${servers.length} enabled`;
    for (const s of servers) {
      const row = document.createElement("div");
      row.className = "mcp-row";
      const enabled = s.status === "enabled" || s.status === "loaded";
      const needsApproval = s.status === "needs_approval";
      const needsOAuth = needsApproval && /oauth|login|sign/i.test(s.detail ?? "");
      row.innerHTML = `
        <div class="mcp-row-copy">
          <span class="mcp-row-name">${escapeHtml(s.id)}</span>
          <span class="mcp-row-status ${s.status}">${escapeHtml(s.detail ?? s.status)}</span>
        </div>
        <div class="mcp-row-actions">
          ${needsOAuth ? `<button type="button" class="pill-btn sm mcp-login" data-id="${escapeHtml(s.id)}">Sign in</button>` : ""}
          <button type="button" class="pill-btn sm mcp-toggle" data-id="${escapeHtml(s.id)}" data-enabled="${enabled ? "1" : "0"}">${enabled ? "Disable" : needsApproval ? "Approve" : "Enable"}</button>
        </div>
      `;
      row.querySelector(".mcp-login")?.addEventListener("click", async (e) => {
        haptic.tap();
        const btn = e.currentTarget;
        const id = btn.dataset.id;
        btn.disabled = true;
        btn.textContent = "Opening…";
        try {
          const data = await api.loginMcp(id);
          if (data.url) window.open(data.url, "_blank", "noopener");
          await refreshMcpList();
        } catch (err) {
          btn.disabled = false;
          btn.textContent = "Sign in";
          showToast("MCP sign-in", err.message ?? "Sign-in failed", "Settings");
        }
      });
      row.querySelector(".mcp-toggle")?.addEventListener("click", async (e) => {
        haptic.tap();
        const btn = e.currentTarget;
        const id = btn.dataset.id;
        btn.disabled = true;
        try {
          if (btn.dataset.enabled === "1") await api.disableMcp(id);
          else await api.enableMcp(id);
          await refreshMcpList();
        } catch (err) {
          btn.disabled = false;
          showToast("MCP", err.message ?? "Toggle failed", "Settings");
        }
      });
      list.appendChild(row);
    }
  } catch (err) {
    list.innerHTML = `<p class="mcp-loading">${escapeHtml(err.message ?? "MCP unavailable")}</p>`;
    if (summary) summary.textContent = "Unavailable";
  }
}

async function refreshAccessRequests() {
  const list = document.querySelector("#access-requests-list");
  const empty = document.querySelector("#access-requests-empty");
  const summary = document.querySelector("#access-summary");
  if (!list) return 0;
  try {
    const data = await api.fetchAccessPending();
    const requests = data.requests ?? [];
    list.innerHTML = "";
    if (summary) {
      summary.textContent = requests.length
        ? `${requests.length} pending — tap Verify`
        : "Approve browser sign-ins";
    }
    if (empty) empty.classList.toggle("hidden", requests.length > 0);
    const grp = document.querySelector("#grp-access");
    if (grp && requests.length) grp.open = true;
    for (const req of requests) {
      const row = document.createElement("div");
      row.className = "access-request-row";
      row.innerHTML = `
        <div class="access-request-copy">
          <span class="access-request-title">${escapeHtml(req.label || "Web access")}</span>
          <span class="access-request-meta">${req.method === "whatsapp" ? "💬 WhatsApp" : "📱 Phone"} · Code <strong>${escapeHtml(req.code)}</strong> · ${formatTime(req.created)}</span>
        </div>
        <div class="access-request-actions">
          <button type="button" class="btn access-deny" data-id="${escapeHtml(req.requestId)}">Deny</button>
          <button type="button" class="btn primary access-verify" data-id="${escapeHtml(req.requestId)}">Verify</button>
        </div>
      `;
      row.querySelector(".access-verify")?.addEventListener("click", async () => {
        haptic.tap();
        try {
          const r = await api.approveAccessRequest(req.requestId, getDeviceId());
          if (r.ok) {
            sound.success();
            showToast("Web access", "Browser signed in", "Approved");
            await refreshAccessRequests();
          } else showToast("Web access", r.error ?? "Failed", "Error");
        } catch (err) {
          showToast("Web access", err.message ?? "Failed", "Error");
        }
      });
      row.querySelector(".access-deny")?.addEventListener("click", async () => {
        haptic.tap();
        try {
          await api.denyAccessRequest(req.requestId);
          await refreshAccessRequests();
        } catch (err) {
          showToast("Web access", err.message ?? "Failed", "Error");
        }
      });
      list.appendChild(row);
    }
    return requests.length;
  } catch {
    if (summary) summary.textContent = "Gateway unreachable";
    list.innerHTML = "";
    return 0;
  }
}

/** Poll for pending web access while app is open. */
let accessPollTimer = null;
export function startAccessPoll() {
  if (accessPollTimer) return;
  let lastCount = -1;
  accessPollTimer = setInterval(async () => {
    const n = await refreshAccessRequests();
    if (n > 0 && n > lastCount && lastCount >= 0) {
      sound.message();
      showToast("Web access", "Someone wants in — tap Verify", "Settings");
    }
    lastCount = n;
  }, 8000);
}

export function stopAccessPoll() {
  if (accessPollTimer) clearInterval(accessPollTimer);
  accessPollTimer = null;
}

async function refreshCursorAuth() {
  const el = document.querySelector("#cursor-auth-status");
  if (!el) return;
  try {
    const s = await api.fetchCursorAuth();
    const parts = [];
    if (s.apiKey) parts.push("API key");
    else parts.push("no API key");
    if (s.cliLoggedIn) parts.push(s.email ? `CLI · ${s.email}` : "CLI signed in");
    else parts.push("CLI not signed in");
    el.textContent = parts.join(" · ");
  } catch {
    el.textContent = "Gateway unreachable";
  }
}

async function refreshHiggsfieldStatus() {
  const el = document.querySelector("#hf-status");
  if (!el) return;
  try {
    const s = await api.fetchHiggsfieldStatus();
    if (!s.installed) el.textContent = "CLI not installed on gateway";
    else if (s.authenticated) el.textContent = s.email ? `Signed in · ${s.email}` : "Ready";
    else el.textContent = "Not signed in — tap Sign in below";
  } catch {
    el.textContent = "Gateway unreachable";
  }
}

function formatTime(ts) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

async function openSessionsSheet() {
  haptic.tap();
  const sheet = document.querySelector("#sessions-sheet");
  const list = document.querySelector("#sessions-list");
  if (!sheet || !list) return;
  sheet.classList.remove("hidden");
  list.innerHTML = `<p class="sheet-hint">Loading…</p>`;
  try {
    const workspaceId = ctx?.getActiveWorkspaceId?.() ?? "mercuryos";
    const sessions = await api.fetchSessions(40, workspaceId);
    list.innerHTML = "";
    if (!sessions.length) {
      list.innerHTML = `<p class="sheet-hint">No desktop sessions found</p>`;
      return;
    }
    for (const s of sessions) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sheet-list-item";
      const label = s.summary || s.name || s.agentId?.slice(0, 12) || "Session";
      btn.innerHTML = `
        <span class="sheet-list-title">${escapeHtml(label)}</span>
        <span class="sheet-list-meta">${escapeHtml(s.status ?? "")} · ${formatTime(s.lastModified)}</span>
      `;
      btn.addEventListener("click", () => {
        haptic.tap();
        closeSessionsSheet();
        ctx?.onImportSession?.(s.agentId, s.summary || s.name || "Desktop session");
      });
      list.appendChild(btn);
    }
  } catch (err) {
    list.innerHTML = `<p class="sheet-hint">${escapeHtml(err.message ?? "Failed to load")}</p>`;
  }
}

function closeSessionsSheet() {
  document.querySelector("#sessions-sheet")?.classList.add("hidden");
}

async function openRunsSheet() {
  haptic.tap();
  const sheet = document.querySelector("#runs-sheet");
  const list = document.querySelector("#runs-list");
  if (!sheet || !list) return;
  sheet.classList.remove("hidden");
  list.innerHTML = `<p class="sheet-hint">Loading…</p>`;
  try {
    const [active, history] = await Promise.all([api.fetchRuns(), api.fetchRunHistory()]);
    const rows = [...active.map((r) => ({ ...r, live: true })), ...history];
    list.innerHTML = "";
    if (!rows.length) {
      list.innerHTML = `<p class="sheet-hint">No runs yet</p>`;
      return;
    }
    for (const r of rows.slice(0, 40)) {
      const div = document.createElement("div");
      div.className = "sheet-list-item static";
      const preview = r.textPreview ?? (r.textLength ? `${r.textLength} chars` : "");
      div.innerHTML = `
        <span class="sheet-list-title">${escapeHtml(r.chatId)} · ${escapeHtml(r.status)}${r.live ? " (live)" : ""}</span>
        <span class="sheet-list-meta">${formatTime(r.endedAt ?? r.startedAt)} · ${r.toolCount ?? 0} tools</span>
        ${preview ? `<span class="sheet-list-preview">${escapeHtml(preview)}</span>` : ""}
      `;
      list.appendChild(div);
    }
  } catch (err) {
    list.innerHTML = `<p class="sheet-hint">${escapeHtml(err.message ?? "Failed")}</p>`;
  }
}

function closeRunsSheet() {
  document.querySelector("#runs-sheet")?.classList.add("hidden");
}

function refreshRequestTracePreview() {
  const el = document.querySelector("#request-trace-preview");
  if (!el) return;
  const text = api.getRequestTraceText?.() ?? "";
  el.textContent = text || "No trace yet — send a chat message";
}

/** @type {ReturnType<typeof setInterval> | null} */
let gatewayLogPollTimer = null;

function stopGatewayLogPoll() {
  if (gatewayLogPollTimer) clearInterval(gatewayLogPollTimer);
  gatewayLogPollTimer = null;
}

async function refreshGatewayLogPreview() {
  const el = document.querySelector("#gateway-log-preview");
  if (!el) return;
  try {
    const lines = await api.fetchGatewayLogs(150);
    el.textContent = lines.length ? lines.join("\n") : "No gateway output yet — send a chat message";
  } catch (err) {
    el.textContent = err.message ?? "Could not load gateway logs";
  }
}

function startGatewayLogPoll() {
  if (gatewayLogPollTimer) return;
  void refreshGatewayLogPreview();
  gatewayLogPollTimer = setInterval(refreshGatewayLogPreview, 3000);
}

function wireGatewayLogPanel() {
  const grp = document.querySelector("#grp-diagnostics");
  grp?.addEventListener("toggle", () => {
    if (grp.open) startGatewayLogPoll();
    else stopGatewayLogPoll();
  });
  document.querySelector("#gwlog-refresh")?.addEventListener("click", () => {
    haptic.tap();
    void refreshGatewayLogPreview();
  });
  document.querySelector("#gwlog-copy")?.addEventListener("click", async () => {
    haptic.tap();
    const text = document.querySelector("#gateway-log-preview")?.textContent ?? "";
    try {
      await navigator.clipboard.writeText(text);
      showToast("Gateway", "Logs copied", "Diagnostics");
    } catch {
      showToast("Gateway", "Copy failed", "Diagnostics");
    }
  });
  if (grp?.open) startGatewayLogPoll();
}

function wireRequestTracePanel() {
  refreshRequestTracePreview();
  document.querySelector("#trace-refresh")?.addEventListener("click", () => {
    haptic.tap();
    refreshRequestTracePreview();
  });
  document.querySelector("#trace-copy")?.addEventListener("click", async () => {
    haptic.tap();
    const text = api.getRequestTraceText?.() ?? "";
    try {
      await navigator.clipboard.writeText(text);
      showToast("Trace", "Copied to clipboard", "Diagnostics");
    } catch {
      showToast("Trace", "Copy failed", "Diagnostics");
    }
  });
  document.querySelector("#trace-upload")?.addEventListener("click", async () => {
    haptic.tap();
    const btn = document.querySelector("#trace-upload");
    if (btn) btn.disabled = true;
    try {
      const res = await api.flushRequestTrace({ reason: "manual_upload" });
      if (res?.ok) showToast("Trace", `Uploaded (${res.id}) — check gateway logs`, "Diagnostics");
      else showToast("Trace", res?.error ?? "Upload failed", "Diagnostics");
    } catch (err) {
      showToast("Trace", err?.message ?? "Upload failed", "Diagnostics");
    } finally {
      if (btn) btn.disabled = false;
      refreshRequestTracePreview();
    }
  });
  document.querySelector("#trace-clear")?.addEventListener("click", () => {
    haptic.tap();
    api.clearRequestTrace?.();
    refreshRequestTracePreview();
  });
}

export { refreshRequestTracePreview };

function updateSettingsFoot(h) {
  const el = document.querySelector("#settings-foot");
  if (!el) return;
  const host = h?.access?.publicHost;
  const gw = api.getSession()?.gatewayUrl ?? "";
  if (host || gw.startsWith("https://")) {
    const name = host || (() => {
      try {
        return new URL(gw).hostname;
      } catch {
        return "production";
      }
    })();
    el.textContent = `MercuryOS · ${name}`;
  } else {
    el.textContent = "MercuryOS Phone · local gateway on your WiFi";
  }
}

export async function refreshHealth() {
  const setDiag = (id, ok, label, warn) => {
    const el = document.querySelector(id);
    if (!el) return;
    el.textContent = label ?? (ok ? "OK" : "Off");
    el.classList.toggle("ok", ok && !warn);
    el.classList.toggle("bad", !ok);
    el.classList.toggle("warn", !!warn);
  };
  const setPill = (pillId, ok, warn) => {
    const pill = document.querySelector(pillId);
    if (!pill) return;
    const dot = pill.querySelector(".status-dot");
    if (!dot) return;
    dot.classList.toggle("ok", ok && !warn);
    dot.classList.toggle("bad", !ok);
    dot.classList.toggle("warn", !!warn);
  };
  try {
    const h = await api.fetchHealthFull();
    const gwOk = !!h.ok;
    const ca = h.cursorAuth ?? {};
    const cursorOk = Boolean(h.cursor ?? ca.ready);
    const cursorWarn = ca.apiKey && !ca.cliLoggedIn;
    const voiceOk = !!h.deepgram;
    setDiag("#health-gateway", gwOk, gwOk ? "Connected" : "Unreachable");
    let cursorLabel = "Not configured";
    if (cursorOk) cursorLabel = ca.email ? `Ready · ${ca.email}` : "Ready";
    else if (ca.apiKey && !ca.cliLoggedIn) cursorLabel = "API key set · CLI sign-in needed";
    else if (!ca.apiKey && ca.cliLoggedIn) cursorLabel = `CLI only · ${ca.email ?? "signed in"}`;
    else if (ca.apiKey) cursorLabel = "API key only";
    setDiag("#health-cursor", cursorOk, cursorLabel, cursorWarn);
    setDiag("#health-deepgram", voiceOk, voiceOk ? "Ready" : "Not configured");
    setPill("#pill-gateway", gwOk);
    setPill("#pill-cursor", cursorOk, cursorWarn);
    setPill("#pill-voice", voiceOk);
    const wa = h.whatsapp && h.whatsapp !== "off";
    setDiag("#health-whatsapp", wa, wa ? h.whatsapp : "Off");
    const mode = h.agent?.mode ?? "agent";
    const model = h.agent?.model ?? "auto";
    const modeLabel = mode === "plan" ? "Plan" : mode === "ask" ? "Ask" : "Agent";
    setDiag("#health-agent", true, `${modeLabel} · ${modelChoiceLabel(model)}`);
    updateAgentSummary(mode, model);
    const runsEl = document.querySelector("#health-runs");
    if (runsEl) runsEl.textContent = String(h.activeRuns ?? 0);
    const wsEl = document.querySelector("#health-active-workspaces");
    if (wsEl) {
      const ids = h.activeWorkspaces ?? [];
      wsEl.textContent = ids.length ? ids.join(", ") : "none";
    }
    updateSettingsFoot(h);
  } catch {
    setDiag("#health-gateway", false, "Unreachable");
    setDiag("#health-cursor", false, "—");
    setDiag("#health-deepgram", false, "—");
    setDiag("#health-whatsapp", false, "—");
    setDiag("#health-agent", false, "—");
    setDiag("#health-active-workspaces", false, "—");
    setPill("#pill-gateway", false);
    setPill("#pill-cursor", false);
    setPill("#pill-voice", false);
  }
}

export async function refreshVersionLabel(el) {
  if (!el) return;
  try {
    const v = await getInstalledVersion();
    el.textContent = v.versionName;
    const badge = document.querySelector("#set-version-badge");
    if (badge) badge.textContent = `v${v.versionName}`;
    const appSummary = document.querySelector("#app-summary");
    if (appSummary) appSummary.textContent = `v${v.versionName} installed`;
  } catch {
    el.textContent = "—";
  }
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const ADVANCED_KEY = "mercuryos-settings-advanced";

function wireAdvancedToggle() {
  const input = document.querySelector("#set-toggle-advanced");
  const apply = (show) => {
    document.querySelectorAll(".settings-advanced").forEach((el) => {
      el.classList.toggle("is-collapsed", !show);
    });
    if (input) input.checked = show;
  };
  apply(localStorage.getItem(ADVANCED_KEY) === "1");
  input?.addEventListener("change", () => {
    const show = Boolean(input.checked);
    localStorage.setItem(ADVANCED_KEY, show ? "1" : "0");
    apply(show);
    haptic.tap();
  });
}

function $(s) {
  return document.querySelector(s);
}
