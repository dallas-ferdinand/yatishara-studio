/** Project switcher + explorer sheets. */
import { icon } from "./icons.js";
import { wireLongPress } from "./mobile-gestures.js";
import * as api from "./api.js";
import { haptic } from "./haptics.js";
import { sound } from "./sounds.js";
import { showToast } from "./permissions.js";
import {
  setActiveWorkspace,
  setWorkspacesCache,
  sortedWorkspaces,
  workspaceActivity,
  getActiveWorkspace,
  ensureValidActiveWorkspace,
} from "./project-context.js";

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s ?? "";
  return d.innerHTML;
}

function pathTail(p) {
  if (!p) return "";
  const parts = String(p).split("/").filter(Boolean);
  return parts.length > 2 ? `…/${parts.slice(-2).join("/")}` : p;
}

/** @type {{ ctx: object, chatState: object, onSwitch: (id: string) => void, onProjectRowMenu?: (meta: object) => void } | null} */
let bind = null;
let explorerFromSwitcher = false;

export function wireWorkspacesUi({ projectCtx, chatState, onSwitch, onProjectRowMenu }) {
  bind = { ctx: projectCtx, chatState, onSwitch, onProjectRowMenu };

  document.querySelector("#project-switcher-btn")?.addEventListener("click", () => {
    haptic.tap();
    openProjectSwitcher();
  });
  document.querySelector("#project-switcher-btn-files")?.addEventListener("click", () => {
    haptic.tap();
    openProjectSwitcher();
  });
  document.querySelector(".project-switcher-backdrop")?.addEventListener("click", closeProjectSwitcher);
  document.querySelector("#project-switcher-close")?.addEventListener("click", closeProjectSwitcher);
  document.querySelector("#project-explore-btn")?.addEventListener("click", () => {
    haptic.tap();
    openProjectExplorer();
  });
  document.querySelector(".project-explorer-backdrop")?.addEventListener("click", closeProjectExplorer);
  document.querySelector("#project-explorer-close")?.addEventListener("click", closeProjectExplorer);
  document.querySelector("#project-explorer-back")?.addEventListener("click", () => {
    closeProjectExplorer();
    openProjectSwitcher();
  });
}

export async function refreshWorkspacesCache(ctx) {
  try {
    const data = await api.fetchWorkspaces();
    setWorkspacesCache(ctx, {
      workspaces: data.workspaces ?? [],
      defaultWorkspaceId: data.defaultWorkspaceId ?? "mercuryos",
    });
    return ensureValidActiveWorkspace(ctx);
  } catch {
    return false;
  }
}

export function paintProjectHeader(ctx, chatState) {
  const ws = getActiveWorkspace(ctx);
  const activity = workspaceActivity(chatState?.chats ?? []);
  const act = activity[ctx.activeWorkspaceId] ?? {};
  const badge =
    act.awaiting > 0 ? "awaiting" : act.streaming > 0 ? "streaming" : "";

  for (const sel of ["#project-switcher-btn", "#project-switcher-btn-files"]) {
    const btn = document.querySelector(sel);
    if (!btn) continue;
    btn.classList.toggle("has-awaiting", badge === "awaiting");
    btn.classList.toggle("has-streaming", badge === "streaming");
    const label = btn.querySelector(".project-switcher-label");
    const sub = btn.querySelector(".project-switcher-path");
    if (label) label.textContent = ws.label ?? ws.id;
    if (sub) sub.textContent = pathTail(ws.path);
  }

  const search = document.querySelector("#chat-search");
  if (search) {
    search.placeholder = `Search chats in ${ws.label ?? "project"}…`;
  }

  const threadSub = document.querySelector("#topbar-project-sub");
  if (threadSub) threadSub.textContent = ws.label ?? "";
}

async function openProjectSwitcher() {
  const sheet = document.querySelector("#project-switcher-sheet");
  const list = document.querySelector("#project-switcher-list");
  if (!sheet || !list || !bind) return;
  await refreshWorkspacesCache(bind.ctx);
  const activity = workspaceActivity(bind.chatState.chats);
  const active = bind.ctx.activeWorkspaceId;
  const rows = sortedWorkspaces(bind.ctx);

  list.innerHTML = "";
  if (!rows.length) {
    list.innerHTML = `<p class="sheet-hint">No projects opened yet</p>`;
  }
  for (const w of rows) {
    const act = activity[w.id] ?? {};
    const wrap = document.createElement("div");
    wrap.className = `project-row-wrap${w.id === active ? " is-active" : ""}`;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `project-row${w.id === active ? " is-active" : ""}`;
    const chatCount = (bind.chatState.chats ?? []).filter((c) => (c.workspaceId ?? "mercuryos") === w.id).length;
    let status = "";
    if (act.awaiting) status = `<span class="project-row-badge awaiting">${act.awaiting} waiting</span>`;
    else if (act.streaming) status = `<span class="project-row-badge streaming">Working</span>`;
    btn.innerHTML = `
      <span class="project-row-icon">${icon("folder", 18)}</span>
      <span class="project-row-body">
        <span class="project-row-title">${esc(w.label)}${w.id === active ? ` ${icon("chevR", 12)}` : ""}</span>
        <span class="project-row-meta">${esc(w.id)} · ${chatCount} chat${chatCount === 1 ? "" : "s"}</span>
        <span class="project-row-path">${esc(pathTail(w.path))}</span>
      </span>
      ${status}`;
    btn.addEventListener("click", () => {
      haptic.tap();
      sound.tap();
      switchProject(w.id);
      closeProjectSwitcher();
    });
    wireLongPress(btn, () => {
      haptic.medium();
      bind?.onProjectRowMenu?.({
        id: w.id,
        label: w.label,
        isActive: w.id === active,
        canRemove: w.id !== "mercuryos",
      });
    });
    wrap.append(btn);
    list.appendChild(wrap);
  }

  sheet.classList.remove("hidden");
}

export function closeProjectSwitcher() {
  document.querySelector("#project-switcher-sheet")?.classList.add("hidden");
}

export async function openProjectExplorer(fromSwitcher = true) {
  explorerFromSwitcher = fromSwitcher;
  if (fromSwitcher) closeProjectSwitcher();
  const sheet = document.querySelector("#project-explorer-sheet");
  const list = document.querySelector("#project-explorer-list");
  if (!sheet || !list || !bind) return;
  list.innerHTML = `<p class="sheet-hint">Scanning your computer…</p>`;
  sheet.classList.remove("hidden");
  try {
    const candidates = await api.discoverWorkspaces();
    list.innerHTML = "";
    if (!candidates.length) {
      list.innerHTML = `<p class="sheet-hint">No new projects found under Documents/code</p>`;
      return;
    }
    for (const c of candidates) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "project-row";
      const kind = c.hasGit ? icon("tool", 14) : icon("file", 14);
      btn.innerHTML = `
        <span class="project-row-icon">${kind}</span>
        <span class="project-row-body">
          <span class="project-row-title">${esc(c.label)}</span>
          <span class="project-row-path">${esc(pathTail(c.path))}</span>
        </span>
        <span class="pill-btn sm">Open</span>`;
      btn.addEventListener("click", async () => {
        haptic.tap();
        btn.disabled = true;
        try {
          const { workspace } = await api.addWorkspace({ label: c.label, path: c.path });
          await refreshWorkspacesCache(bind.ctx);
          switchProject(workspace.id);
          closeProjectExplorer();
        } catch (err) {
          btn.disabled = false;
          showToast("Projects", err.message ?? "Could not add project", "Explorer");
        }
      });
      list.appendChild(btn);
    }
  } catch (err) {
    list.innerHTML = `<p class="sheet-hint">${esc(err.message ?? "Discover failed")}</p>`;
  }
}

function closeProjectExplorer() {
  document.querySelector("#project-explorer-sheet")?.classList.add("hidden");
  explorerFromSwitcher = false;
}

/** System back: explorer → switcher when opened from switcher. */
export function handleExplorerSystemBack() {
  const sheet = document.querySelector("#project-explorer-sheet");
  if (!sheet || sheet.classList.contains("hidden")) return false;
  if (explorerFromSwitcher) {
    closeProjectExplorer();
    openProjectSwitcher();
    return true;
  }
  closeProjectExplorer();
  return true;
}

function switchProject(workspaceId) {
  if (!bind) return;
  setActiveWorkspace(bind.ctx, workspaceId);
  bind.onSwitch?.(workspaceId);
}

export function openSwitcher() {
  openProjectSwitcher();
}
