/** Wire mos-ui interactive actions in chat DOM. */
import * as api from "@mos-app/api.js";
import { renderMosUi } from "@mos-shared/mos-ui-render.js";
import { fileName, normalizeRelPath } from "@/desk/lib/workspace-links.js";
import { workspaceFileRawUrl, workspaceFileThumbUrl } from "@/desk/lib/workspace-file-url.js";

const wireOpts = new WeakMap();

function bindClick(el, handler) {
  if (!el || el.dataset.mosUiWired === "1") return;
  el.dataset.mosUiWired = "1";
  el.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    handler(e);
  });
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function flashBtn(el, label = "Copied") {
  const prev = el.textContent;
  el.textContent = label;
  el.classList.add("mos-ui-btn--copied");
  window.setTimeout(() => {
    el.textContent = prev;
    el.classList.remove("mos-ui-btn--copied");
  }, 1400);
}

function buttonLabel(el, fallback = "Done") {
  return el.getAttribute("data-mos-success-label") || fallback;
}

function buttonErrorLabel(el) {
  return el.getAttribute("data-mos-failure-label") || "Failed";
}

function parsePayload(raw) {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function renderResultValue(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

function resultToMosUiBlock(value, tone = "success") {
  if (Array.isArray(value)) {
    if (!value.length) {
      return { type: "empty", tone: "info", title: "No results", body: "The action completed but returned an empty list." };
    }
    if (value.every((item) => typeof item === "string")) {
      return {
        type: "card",
        tone,
        title: "Result",
        body: value.slice(0, 80).join("\n"),
      };
    }
    const first = value.find((item) => item && typeof item === "object");
    const columns = Object.keys(first ?? {}).slice(0, 6);
    if (columns.length) {
      return {
        type: "table",
        title: `Results (${value.length})`,
        columns,
        rows: value.slice(0, 40).map((row) => columns.map((col) => row?.[col] ?? "")),
      };
    }
  }

  if (value && typeof value === "object") {
    if (Array.isArray(value.files)) {
      return {
        type: "file-list",
        title: value.title ?? "Files",
        items: value.files.map((file) => (typeof file === "string" ? { path: file } : file)),
      };
    }
    if (Array.isArray(value.candidates)) {
      return {
        type: "table",
        title: `Workspace candidates (${value.candidates.length})`,
        columns: ["label", "path", "id"],
        rows: value.candidates.slice(0, 40).map((item) => [item.label ?? "", item.path ?? "", item.id ?? ""]),
      };
    }
    if (Array.isArray(value.servers)) {
      return {
        type: "table",
        title: `MCP servers (${value.servers.length})`,
        columns: ["id", "name", "enabled", "needsAuth"],
        rows: value.servers.slice(0, 60).map((item) => [item.id ?? "", item.name ?? "", item.enabled ?? "", item.needsAuth ?? ""]),
      };
    }
    if (Array.isArray(value.runs)) {
      return {
        type: "table",
        title: `Runs (${value.runs.length})`,
        columns: ["chatId", "status", "startedAt", "toolCount"],
        rows: value.runs.slice(0, 40).map((item) => [item.chatId ?? item.id ?? "", item.status ?? "", item.startedAt ?? "", item.toolCount ?? ""]),
      };
    }
    if (value.imageUrl || value.url) {
      const url = value.imageUrl ?? value.url;
      return {
        type: "card",
        tone,
        title: value.title ?? "Image ready",
        media: { src: url, caption: value.prompt ?? value.caption ?? "" },
        actions: [{ label: "Open image", action: "url", url }],
      };
    }
    if (value.status || value.ok !== undefined || value.error) {
      const rows = Object.entries(value)
        .filter(([, v]) => typeof v !== "object")
        .slice(0, 12)
        .map(([key, v]) => ({ key, value: String(v) }));
      return {
        type: "kv",
        title: value.error ? "Action failed" : "Action result",
        items: rows,
      };
    }
  }

  return {
    type: "card",
    tone,
    title: tone === "error" ? "Action failed" : "Action result",
    body: renderResultValue(value),
  };
}

function setInlineResult(el, value, tone = "success") {
  const host = el.closest(".mos-ui-form, .mos-ui-action-row, .mos-ui-actions, .mos-ui-action-menu, .mos-ui-card, .mos-ui-dashboard, .mos-ui-section") ?? el.parentElement;
  if (!host) return;
  let result = host.querySelector(":scope > .mos-ui-api-result");
  if (!result) {
    result = document.createElement("div");
    result.className = "mos-ui-api-result";
    host.appendChild(result);
  }
  result.classList.toggle("is-error", tone === "error");
  result.innerHTML = renderMosUi(JSON.stringify(resultToMosUiBlock(value, tone)));
}

function collectFormData(form) {
  const data = {};
  form.querySelectorAll("input, textarea, select").forEach((el) => {
    const name = el.name || el.id;
    if (!name) return;
    if (el.type === "checkbox") data[name] = el.checked;
    else if (el.type === "radio") {
      if (el.checked) data[name] = el.value;
    } else if (el.tagName === "SELECT" && el.multiple) {
      data[name] = [...el.selectedOptions].map((option) => option.value);
    } else data[name] = el.value;
  });
  return data;
}

function fillComposer(text, chatId) {
  window.dispatchEvent(
    new CustomEvent("mercuryos-composer-fill", {
      detail: { text: String(text ?? "").trim(), chatId: chatId ?? null },
    }),
  );
}

function sendToChat(text, chatId, workspaceId) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return false;
  window.dispatchEvent(
    new CustomEvent("mercuryos-composer-send", {
      detail: { text: trimmed, chatId: chatId ?? null, workspaceId: workspaceId ?? null },
    }),
  );
  return true;
}

function applyFormTemplate(template, form) {
  const data = collectFormData(form);
  let out = template;
  if (out.includes("{{json}}")) {
    out = out.replace(/\{\{json\}\}/g, JSON.stringify(data, null, 2));
  }
  for (const [key, val] of Object.entries(data)) {
    out = out.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), String(val ?? ""));
  }
  return out.trim();
}

const MOS_API_ACTIONS = {
  health: () => api.fetchHealthFull(),
  "gateway-logs": (payload) => api.fetchGatewayLogs(Number(payload.limit ?? 120)),
  models: () => api.fetchModels(),
  workspaces: () => api.fetchWorkspaces(),
  "add-workspace": (payload) => api.addWorkspace(payload),
  "discover-workspaces": (payload) => api.discoverWorkspaces(payload.root ?? ""),
  "update-workspace": (payload) => api.updateWorkspace(payload.id, payload.partial ?? payload),
  "remove-workspace": (payload) => api.removeWorkspace(payload.id),
  sessions: (payload, ctx) => api.fetchSessions(Number(payload.limit ?? 40), payload.workspaceId ?? ctx.workspaceId),
  "app-build": () => api.triggerAppBuild(),
  "app-build-status": () => api.getAppBuildStatus(),
  "agent-prefs": () => api.fetchAgentPrefs(),
  "set-agent-prefs": (payload) => api.setAgentPrefs(payload),
  "pulse-status": () => api.fetchPulseStatus(),
  "pulse-settings": (payload) => api.updatePulseSettings(Boolean(payload.enabled)),
  "pulse-run": (payload) => api.runPulseNow(String(payload.message ?? "")),
  "sophie-status": () => api.fetchSophieStatus(),
  "sophie-identity": () => api.fetchSophieIdentity(),
  "sophie-expression": () => api.fetchSophieExpression(),
  "sophie-expression-update": (payload) => api.updateSophieExpression(payload),
  "sophie-expression-choose": (payload) => api.chooseSophieExpression(payload),
  "sophie-reflect": (payload) => api.runSophieReflection(Number(payload.limit ?? 3)),
  "sophie-autonomy-run": (payload) => api.runSophieAutonomy(String(payload.reason ?? "mos-ui action")),
  "sophie-autonomy-update": (payload) => api.updateSophieAutonomy(payload),
  "add-memory": (payload) => api.addMemory(payload),
  "generate-image": (payload) => api.generateImage(payload),
  "cursor-status": () => api.fetchCursorAuth(),
  "cursor-login": () => api.cursorLogin(),
  "cursor-save-key": (payload) => api.saveCursorApiKey(payload.key ?? ""),
  "higgsfield-status": () => api.fetchHiggsfieldStatus(),
  "higgsfield-login": () => api.higgsfieldLogin(),
  "tiktok-status": () => api.fetchTikTokStatus(),
  "tiktok-status-health": () => api.fetchTikTokStatusFromHealth(),
  "tiktok-disconnect": () => api.tiktokDisconnect(),
  "access-pending": () => api.fetchAccessPending(),
  "access-approve": (payload) => api.approveAccessRequest(payload.requestId, payload.deviceId),
  "access-deny": (payload) => api.denyAccessRequest(payload.requestId),
  mcps: () => api.fetchMcps(),
  "mcp-enable": (payload) => api.enableMcp(payload.id),
  "mcp-disable": (payload) => api.disableMcp(payload.id),
  "mcp-login": (payload) => api.loginMcp(payload.id),
  "agent-reach-status": () => api.fetchAgentReachStatus(),
  "agent-reach-install": (payload) => api.installAgentReach(payload),
  "agent-reach-doctor": (payload) => api.runAgentReachDoctor(payload),
  "agent-reach-watch": () => api.runAgentReachWatch(),
  runs: () => api.fetchRuns(),
  "run-history": () => api.fetchRunHistory(),
  "run-fetch": (payload, ctx) => api.fetchRun(payload.chatId ?? ctx.chatId, { view: payload.view ?? null }),
  "run-cancel": (payload, ctx) => api.cancelRun(payload.chatId ?? ctx.chatId, { runId: payload.runId ?? null }),
  "run-reset-agent": (payload, ctx) => api.resetChatAgent(payload.chatId ?? ctx.chatId),
  "git-status": (payload, ctx) => api.fetchGitStatus(payload.workspaceId ?? ctx.workspaceId),
  "git-graph": (payload, ctx) => api.fetchGitGraph(payload.workspaceId ?? ctx.workspaceId, Number(payload.limit ?? 48)),
  "git-stage": (payload, ctx) => api.gitStage({ ...payload, workspaceId: payload.workspaceId ?? ctx.workspaceId }),
  "git-unstage": (payload, ctx) => api.gitUnstage({ ...payload, workspaceId: payload.workspaceId ?? ctx.workspaceId }),
  "git-discard": (payload, ctx) => api.gitDiscard({ ...payload, workspaceId: payload.workspaceId ?? ctx.workspaceId }),
  "git-commit": (payload, ctx) => api.gitCommit({ ...payload, workspaceId: payload.workspaceId ?? ctx.workspaceId }),
  "git-generate-message": (payload, ctx) => api.gitGenerateCommitMessage({ ...payload, workspaceId: payload.workspaceId ?? ctx.workspaceId }),
  "git-pull": (payload, ctx) => api.gitPull(payload.workspaceId ?? ctx.workspaceId),
  "git-push": (payload, ctx) => api.gitPush(payload.workspaceId ?? ctx.workspaceId),
  "git-checkpoint": (payload, ctx) => api.gitCheckpoint(payload.workspaceId ?? ctx.workspaceId),
  "git-revert": (payload, ctx) => api.gitRevert({ ...payload, workspaceId: payload.workspaceId ?? ctx.workspaceId }),
  "list-files": (payload, ctx) => api.listFiles(payload.path ?? "", payload.workspaceId ?? ctx.workspaceId),
  "search-files": (payload, ctx) =>
    api.searchFiles(payload.path ?? "", payload.query ?? "", payload.workspaceId ?? ctx.workspaceId, Number(payload.limit ?? 80)),
  "read-file": (payload, ctx) => api.readFile(payload.path ?? "", payload.workspaceId ?? ctx.workspaceId),
  "create-dir": (payload, ctx) => api.createDirectory(payload.path ?? "", payload.workspaceId ?? ctx.workspaceId),
  "write-file": (payload, ctx) => api.writeFile(payload.path ?? "", payload.content ?? "", payload.workspaceId ?? ctx.workspaceId),
  "delete-file": (payload, ctx) => api.deleteFile(payload.path ?? "", payload.workspaceId ?? ctx.workspaceId),
  "rename-file": (payload, ctx) => api.renameFile(payload.path ?? "", payload.newName ?? "", payload.workspaceId ?? ctx.workspaceId),
};

const CONFIRM_BY_API = new Set([
  "app-build",
  "add-workspace",
  "update-workspace",
  "remove-workspace",
  "set-agent-prefs",
  "pulse-settings",
  "cursor-save-key",
  "tiktok-disconnect",
  "access-approve",
  "access-deny",
  "mcp-enable",
  "mcp-disable",
  "agent-reach-install",
  "agent-reach-watch",
  "git-stage",
  "git-unstage",
  "git-discard",
  "git-commit",
  "git-pull",
  "git-push",
  "git-revert",
  "write-file",
  "delete-file",
  "rename-file",
  "create-dir",
  "run-cancel",
  "run-reset-agent",
]);

async function runMosApi(name, payload, ctx) {
  const fn = MOS_API_ACTIONS[name];
  if (!fn) throw new Error(`Unsupported mos api: ${name}`);
  return await fn(payload, ctx);
}

async function finishApiAction(el, result, { chatId, workspaceId }) {
  const mode = String(el.getAttribute("data-mos-result") ?? "inline").toLowerCase();
  const text = renderResultValue(result);
  if (mode === "none") return;
  if (mode === "copy") {
    if (await copyText(text)) flashBtn(el, "Copied");
    return;
  }
  if (mode === "composer" || mode === "fill") {
    fillComposer(text, chatId);
    flashBtn(el, "In composer");
    return;
  }
  if (mode === "send" || mode === "chat") {
    sendToChat(text, chatId, workspaceId);
    flashBtn(el, "Sent");
    return;
  }
  setInlineResult(el, result);
}

function closeLightbox(box) {
  if (!box) return;
  box.classList.remove("is-open");
  const video = box.querySelector(".mos-ui-lightbox-video");
  if (video) {
    video.pause();
    video.removeAttribute("src");
    video.load();
  }
}

function ensureLightboxRoot() {
  let el = document.getElementById("mos-ui-lightbox");
  if (!el) {
    el = document.createElement("div");
    el.id = "mos-ui-lightbox";
    el.className = "mos-ui-lightbox";
    el.innerHTML =
      '<button type="button" class="mos-ui-lightbox-close" aria-label="Close">×</button><figure class="mos-ui-lightbox-figure"><img class="mos-ui-lightbox-img" alt="" /><video class="mos-ui-lightbox-video" controls playsinline></video><figcaption class="mos-ui-lightbox-cap"></figcaption></figure>';
    document.body.appendChild(el);
    el.querySelector(".mos-ui-lightbox-close")?.addEventListener("click", () => closeLightbox(el));
    el.addEventListener("click", (e) => {
      if (e.target === el) closeLightbox(el);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeLightbox(el);
    });
  }
  return el;
}

function openLightbox({ kind = "image", src, poster = "", caption = "" } = {}) {
  if (!src) return;
  const box = ensureLightboxRoot();
  const img = box.querySelector(".mos-ui-lightbox-img");
  const video = box.querySelector(".mos-ui-lightbox-video");
  const cap = box.querySelector(".mos-ui-lightbox-cap");
  if (kind === "video" && video) {
    if (img) img.hidden = true;
    video.hidden = false;
    if (poster) video.poster = poster;
    else video.removeAttribute("poster");
    video.src = src;
    video.play().catch(() => {});
  } else if (img) {
    if (video) {
      video.hidden = true;
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
    img.hidden = false;
    img.src = src;
  }
  if (cap) cap.textContent = caption;
  box.classList.add("is-open");
}

function handleMosUiActionClick(e) {
  const root = e.currentTarget;
  const el = e.target.closest("[data-mos-action]");
  if (!el || !root.contains(el)) return;

  const action = String(el.getAttribute("data-mos-action") ?? "").toLowerCase();
  if (!action) return;

  e.preventDefault();
  e.stopPropagation();

  const { onOpenFile, onNavigateFolder, chatId, workspaceId = "mercuryos" } = wireOpts.get(root) ?? {};
  const confirmMessage = el.getAttribute("data-mos-confirm");
  if (confirmMessage && !window.confirm(confirmMessage)) return;

  if (action === "open-file") {
    const path = normalizeRelPath(el.getAttribute("data-mos-path"));
    if (!path) return;
    onOpenFile?.(path, fileName(path));
    return;
  }

  if (action === "open-dir") {
    const path = normalizeRelPath(el.getAttribute("data-mos-path"));
    onNavigateFolder?.(path);
    return;
  }

  if (action === "open-root") {
    onNavigateFolder?.("");
    return;
  }

  if (action === "open-raw") {
    const path = normalizeRelPath(el.getAttribute("data-mos-path"));
    if (!path) return;
    const url = workspaceFileRawUrl(path, workspaceId);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    return;
  }

  if (action === "copy") {
    const text = el.getAttribute("data-mos-copy") ?? "";
    if (!text) return;
    void copyText(text).then((ok) => {
      if (ok) flashBtn(el);
    });
    return;
  }

  if (action === "composer") {
    const text = el.getAttribute("data-mos-composer") ?? "";
    if (!text) return;
    fillComposer(text, chatId);
    flashBtn(el, "In composer");
    return;
  }

  if (action === "send" || action === "send-chat") {
    const text = el.getAttribute("data-mos-composer") ?? el.getAttribute("data-mos-send") ?? "";
    if (!sendToChat(text, chatId, workspaceId)) return;
    flashBtn(el, "Sent");
    return;
  }

  if (action === "event") {
    const eventName = el.getAttribute("data-mos-event") ?? "";
    if (!eventName) return;
    const payload = parsePayload(el.getAttribute("data-mos-payload"));
    window.dispatchEvent(new CustomEvent(eventName, { detail: { ...payload, chatId, workspaceId } }));
    flashBtn(el, buttonLabel(el, "Done"));
    return;
  }

  if (action === "api") {
    const name = String(el.getAttribute("data-mos-api") ?? "").trim();
    if (!name) return;
    if (CONFIRM_BY_API.has(name) && !confirmMessage && !window.confirm(`Run ${name}?`)) return;
    const payload = parsePayload(el.getAttribute("data-mos-payload"));
    el.classList.add("is-running");
    el.disabled = true;
    void runMosApi(name, payload, { chatId, workspaceId })
      .then(async (result) => {
        await finishApiAction(el, result, { chatId, workspaceId });
        flashBtn(el, buttonLabel(el, "Done"));
        window.dispatchEvent(new CustomEvent("mercuryos-mos-api-action", { detail: { name, payload, result, chatId, workspaceId } }));
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        setInlineResult(el, message, "error");
        flashBtn(el, buttonErrorLabel(el));
      })
      .finally(() => {
        el.disabled = false;
        el.classList.remove("is-running");
      });
    return;
  }

  if (action === "form-submit") {
    const form = el.closest("[data-mos-form]");
    if (!form) return;
    if (typeof form.reportValidity === "function" && !form.reportValidity()) return;
    const formConfirm = form.getAttribute("data-mos-confirm");
    if (formConfirm && !window.confirm(formConfirm)) return;
    const template = form.getAttribute("data-mos-form-template") ?? "{{json}}";
    const text = applyFormTemplate(template, form);
    const mode = String(form.getAttribute("data-mos-form-send") ?? "send").toLowerCase();
    const apiName = String(form.getAttribute("data-mos-api") ?? "").trim();
    if (mode === "api" || apiName) {
      const payload = collectFormData(form);
      if (CONFIRM_BY_API.has(apiName) && !formConfirm && !window.confirm(`Run ${apiName}?`)) return;
      el.classList.add("is-running");
      el.disabled = true;
      void runMosApi(apiName, payload, { chatId, workspaceId })
        .then(async (result) => {
          await finishApiAction(form, result, { chatId, workspaceId });
          flashBtn(el, buttonLabel(el, "Done"));
          window.dispatchEvent(new CustomEvent("mercuryos-mos-api-action", { detail: { name: apiName, payload, result, chatId, workspaceId } }));
        })
        .catch((err) => {
          const message = err instanceof Error ? err.message : String(err);
          setInlineResult(form, message, "error");
          flashBtn(el, buttonErrorLabel(el));
        })
        .finally(() => {
          el.disabled = false;
          el.classList.remove("is-running");
        });
      return;
    }
    if (!text) return;
    if (mode === "fill" || mode === "composer") {
      fillComposer(text, chatId);
      flashBtn(el, "In composer");
    } else {
      if (!sendToChat(text, chatId, workspaceId)) return;
      flashBtn(el, "Sent");
    }
  }
}

function wireCarousel(root) {
  root.querySelectorAll("[data-mos-carousel]").forEach((carousel) => {
    if (carousel.dataset.mosCarouselWired === "1") return;
    carousel.dataset.mosCarouselWired = "1";
    const slides = [...carousel.querySelectorAll(".mos-ui-carousel-slide")];
    const dots = [...carousel.querySelectorAll("[data-mos-carousel-dot]")];
    const counter = carousel.querySelector("[data-mos-carousel-counter]");
    if (slides.length < 2) return;
    let idx = slides.findIndex((s) => s.classList.contains("is-active"));
    if (idx < 0) idx = 0;

    const show = (next) => {
      const prev = idx;
      const dir = next > prev ? 1 : prev === 0 && next === slides.length - 1 ? -1 : next < prev ? -1 : 1;
      idx = (next + slides.length) % slides.length;
      slides.forEach((s, i) => {
        s.classList.toggle("is-active", i === idx);
        s.classList.toggle("is-from-left", i === idx && dir < 0);
        s.classList.toggle("is-from-right", i === idx && dir > 0);
      });
      dots.forEach((d, i) => d.classList.toggle("is-active", i === idx));
      if (counter) counter.textContent = `${idx + 1} / ${slides.length}`;
    };

    carousel.querySelector("[data-mos-carousel-prev]")?.addEventListener("click", (e) => {
      e.preventDefault();
      show(idx - 1);
    });
    carousel.querySelector("[data-mos-carousel-next]")?.addEventListener("click", (e) => {
      e.preventDefault();
      show(idx + 1);
    });
    dots.forEach((dot) => {
      dot.addEventListener("click", (e) => {
        e.preventDefault();
        show(Number(dot.getAttribute("data-mos-carousel-dot") ?? 0));
      });
    });

    let touchStartX = 0;
    carousel.addEventListener(
      "touchstart",
      (ev) => {
        touchStartX = ev.changedTouches[0]?.clientX ?? 0;
      },
      { passive: true },
    );
    carousel.addEventListener(
      "touchend",
      (ev) => {
        const dx = (ev.changedTouches[0]?.clientX ?? 0) - touchStartX;
        if (Math.abs(dx) < 44) return;
        show(dx < 0 ? idx + 1 : idx - 1);
      },
      { passive: true },
    );
  });
}

function wireTabs(root) {
  root.querySelectorAll("[data-mos-tabs]").forEach((host) => {
    if (host.dataset.mosTabsWired === "1") return;
    host.dataset.mosTabsWired = "1";
    const tabs = [...host.querySelectorAll("[data-mos-tab]")];
    const panels = [...host.querySelectorAll("[data-mos-tab-panel]")];
    tabs.forEach((tab) => {
      tab.addEventListener("click", (e) => {
        e.preventDefault();
        const i = Number(tab.getAttribute("data-mos-tab") ?? 0);
        tabs.forEach((t, j) => t.classList.toggle("is-active", j === i));
        panels.forEach((p, j) => p.classList.toggle("is-active", j === i));
        tab.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
      });
    });
  });
}

function wireSelect(root) {
  root.querySelectorAll("[data-mos-select]").forEach((host) => {
    if (host.dataset.mosSelectWired === "1") return;
    host.dataset.mosSelectWired = "1";
    const trigger = host.querySelector("[data-mos-select-trigger]");
    const panels = [...host.querySelectorAll("[data-select-panel]")];
    if (!trigger || !panels.length) return;
    trigger.addEventListener("change", () => {
      const i = trigger.selectedIndex;
      panels.forEach((p, j) => p.classList.toggle("is-active", j === i));
    });
  });
}

function wireCompare(root) {
  root.querySelectorAll("[data-mos-compare]").forEach((host) => {
    if (host.dataset.mosCompareWired === "1") return;
    host.dataset.mosCompareWired = "1";
    const slider = host.querySelector(".mos-ui-compare-slider");
    if (!slider) return;
    const sync = () => {
      const v = Number(slider.value);
      host.style.setProperty("--mos-compare", `${v}%`);
    };
    slider.addEventListener("input", sync);
    sync();
  });
}

function wireLightbox(root) {
  root.querySelectorAll(".mos-ui-media--lightbox .mos-ui-img").forEach((img) => {
    if (img.dataset.mosLightboxWired === "1") return;
    img.dataset.mosLightboxWired = "1";
    const frame = img.closest(".mos-ui-media-frame");
    if (frame) frame.classList.add("mos-ui-media-frame--zoom");
    const open = () => {
      if (!img.src) return;
      const cap = img.closest("figure")?.querySelector(".mos-ui-media-cap")?.textContent ?? img.alt ?? "";
      openLightbox({ kind: "image", src: img.src, caption: cap });
    };
    bindClick(img, open);
  });

  root.querySelectorAll(".mos-ui-media--lightbox-video .mos-ui-media-frame").forEach((frame) => {
    if (frame.dataset.mosLightboxWired === "1") return;
    frame.dataset.mosLightboxWired = "1";
    const video = frame.querySelector(".mos-ui-video");
    if (!video) return;
    frame.classList.add("mos-ui-media-frame--zoom");
    const open = () => {
      const src = video.src || video.currentSrc;
      if (!src) return;
      const cap = video.closest("figure")?.querySelector(".mos-ui-media-cap")?.textContent ?? "";
      openLightbox({ kind: "video", src, poster: video.poster ?? "", caption: cap });
    };
    const playBtn = frame.querySelector(".mos-ui-media-play");
    if (playBtn) bindClick(playBtn, open);
    else bindClick(video, open);
  });

  root.querySelectorAll(".mos-ui-compare-stage img").forEach((img) => {
    if (img.dataset.mosLightboxWired === "1" || !img.src) return;
    img.dataset.mosLightboxWired = "1";
    bindClick(img, () => openLightbox({ kind: "image", src: img.src, caption: img.alt ?? "" }));
  });
}

function hydrateWorkspaceMedia(root, workspaceId = "mercuryos") {
  root.querySelectorAll("img[data-mos-workspace-image]").forEach((img) => {
    if (img.dataset.mosImgHydrated === "1") return;
    const path = normalizeRelPath(img.getAttribute("data-mos-workspace-image"));
    const url = workspaceFileThumbUrl(path, workspaceId, 1200);
    if (url) {
      img.src = url;
      img.dataset.mosImgHydrated = "1";
    }
  });

  root.querySelectorAll("video[data-mos-workspace-media]").forEach((video) => {
    if (video.dataset.mosMediaHydrated === "1") return;
    const path = normalizeRelPath(video.getAttribute("data-mos-path"));
    const url = workspaceFileRawUrl(path, workspaceId);
    if (url) {
      video.src = url;
      video.dataset.mosMediaHydrated = "1";
    }
    const posterPath = video.getAttribute("data-mos-workspace-poster");
    if (posterPath && !video.poster) {
      const posterUrl = workspaceFileThumbUrl(normalizeRelPath(posterPath), workspaceId, 960);
      if (posterUrl) video.poster = posterUrl;
    }
  });

  root.querySelectorAll("audio[data-mos-workspace-media]").forEach((audio) => {
    if (audio.dataset.mosMediaHydrated === "1") return;
    const path = normalizeRelPath(audio.getAttribute("data-mos-path"));
    const url = workspaceFileRawUrl(path, workspaceId);
    if (url) {
      audio.src = url;
      audio.dataset.mosMediaHydrated = "1";
    }
  });

  root.querySelectorAll("iframe[data-mos-workspace-pdf]").forEach((frame) => {
    if (frame.dataset.mosPdfHydrated === "1") return;
    const path = normalizeRelPath(frame.getAttribute("data-mos-workspace-pdf"));
    const url = workspaceFileRawUrl(path, workspaceId);
    if (url) {
      frame.src = `${url}#view=FitH&toolbar=0`;
      frame.dataset.mosPdfHydrated = "1";
    }
  });
}

/** Attach click handlers for all mos-ui interactions. */
export function wireMosUi(root, { onOpenFile, onNavigateFolder, chatId, workspaceId = "mercuryos" } = {}) {
  if (!root?.querySelectorAll) return;

  wireOpts.set(root, { onOpenFile, onNavigateFolder, chatId, workspaceId });

  if (root.dataset.mosUiDelegate !== "1") {
    root.dataset.mosUiDelegate = "1";
    root.addEventListener("click", handleMosUiActionClick);
  }

  hydrateWorkspaceMedia(root, workspaceId);
  wireCarousel(root);
  wireTabs(root);
  wireSelect(root);
  wireCompare(root);
  wireLightbox(root);
}
