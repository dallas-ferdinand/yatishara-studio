/** Gateway client layout — load/save shell state. */
import * as api from "@mos-app/api.js";

let cachedLayout = null;
let saveTimer = null;

export const DESK2_LAYOUT_VERSION = 4;
export const DEFAULT_COLUMN_FRACTIONS = [0.2, 0.48, 0.32];

export function columnLayoutFromSaved(fractions) {
  if (!Array.isArray(fractions)) return [...DEFAULT_COLUMN_FRACTIONS];
  if (fractions.length === 3) return fractions;
  if (fractions.length === 2) {
    const editor = Number(fractions[0]) || 0.58;
    const agent = Number(fractions[1]) || 0.42;
    const inner = editor + agent || 1;
    return [0.2, (editor / inner) * 0.8, (agent / inner) * 0.8];
  }
  return [...DEFAULT_COLUMN_FRACTIONS];
}

/** @deprecated */
export function twoColumnFromLayout(fractions) {
  return columnLayoutFromSaved(fractions).slice(1);
}

/** Reset stale layout defaults + bump layout schema. */
export function migrateClientLayout(layout) {
  if (!layout || typeof layout !== "object") {
    return {
      columnFractions: [...DEFAULT_COLUMN_FRACTIONS],
      savedColumnFractions: [...DEFAULT_COLUMN_FRACTIONS],
      layoutVersion: DESK2_LAYOUT_VERSION,
      _migrated: true,
    };
  }
  const out = { ...layout };
  let migrated = false;
  if (out.layoutVersion !== DESK2_LAYOUT_VERSION) {
    out.columnFractions = columnLayoutFromSaved(out.columnFractions);
    out.savedColumnFractions = columnLayoutFromSaved(out.savedColumnFractions);
    out.layoutVersion = DESK2_LAYOUT_VERSION;
    migrated = true;
  }
  if (migrated) out._migrated = true;
  return out;
}

export async function loadClientLayout() {
  try {
    const raw = await api.fetchClientLayout();
    const layout = migrateClientLayout(raw);
    cachedLayout = layout && typeof layout === "object" ? layout : null;
    if (cachedLayout?._migrated) {
      delete cachedLayout._migrated;
      try {
        await api.saveClientLayout(cachedLayout);
      } catch {
        /* best effort */
      }
    }
    return cachedLayout;
  } catch {
    return null;
  }
}

export function getCachedLayout() {
  return cachedLayout;
}

export function mergeLayoutPatch(patch) {
  cachedLayout = { ...(cachedLayout ?? {}), ...patch };
  return cachedLayout;
}

async function persistLayoutPatch(patch) {
  if (!patch || typeof patch !== "object") return;
  const layout = mergeLayoutPatch(patch);
  await api.saveClientLayout(layout);
}

export function scheduleSaveLayout(getPatch, delayMs = 800) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    try {
      const patch = typeof getPatch === "function" ? getPatch() : getPatch;
      await persistLayoutPatch(patch);
    } catch (err) {
      console.warn("[desk2] layout save failed:", err?.message ?? err);
    }
  }, delayMs);
}

/** Save shell layout immediately (tab close / beforeunload safety). */
export async function flushSaveLayout(getPatch) {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  try {
    const patch = typeof getPatch === "function" ? getPatch() : getPatch;
    await persistLayoutPatch(patch);
  } catch (err) {
    console.warn("[desk2] layout flush failed:", err?.message ?? err);
  }
}

export function buildDeskLayoutPatch({
  mobileTab,
  twoPanelSizes,
  workspaceTabOrder,
  activeWorkspaceKey,
  editorTabs,
  activeTabId,
  workspaceId,
  pulseTabOpen,
  bucketsTabOpen,
}) {
  return {
    layoutVersion: DESK2_LAYOUT_VERSION,
    mobileTab,
    terminalOpen: false,
    columnFractions: fractionsFromPanelSizes(twoPanelSizes) ?? undefined,
    workspaceTabOrder,
    activeWorkspaceTabKey: activeWorkspaceKey,
    pulseTabOpen: Boolean(pulseTabOpen),
    bucketsTabOpen: Boolean(bucketsTabOpen),
    ...layoutEditorTabs(editorTabs, activeTabId, workspaceId),
    ...layoutAgentState({
      agentMaximized: false,
      terminalMaximized: false,
    }),
  };
}

/** Panel sizes (0–100) → column fractions. Supports 2- or 3-panel layouts. */
export function fractionsFromPanelSizes(sizes) {
  if (!Array.isArray(sizes) || sizes.length < 2) return null;
  const sum = sizes.reduce((a, b) => a + b, 0) || 100;
  return sizes.map((s) => s / sum);
}

export function panelDefaultSizes(fractions) {
  const cols = columnLayoutFromSaved(fractions);
  return cols.map((f) => Math.max(12, Math.round(f * 100)));
}

/** Explorer + agent only (editor hidden). */
export function explorerAgentPanelSizes(fractions) {
  const cols = columnLayoutFromSaved(fractions);
  const explorer = cols[0] ?? 0.2;
  const agent = cols[2] ?? 0.8;
  const sum = explorer + agent || 1;
  return [
    Math.max(14, Math.round((explorer / sum) * 100)),
    Math.max(28, Math.round((agent / sum) * 100)),
  ];
}

export function terminalEditorSizes(terminalOpen, terminalSplit = 0.28) {
  if (!terminalOpen) return { editor: 100, terminal: 0 };
  const term = Math.round(Math.min(55, Math.max(10, terminalSplit * 100)));
  return { editor: 100 - term, terminal: term };
}

export function layoutEditorTabs(tabs, activeTabId, workspaceId) {
  const scoped =
    workspaceId != null
      ? tabs.filter((t) => t.workspaceId === workspaceId)
      : tabs;
  const idx = scoped.findIndex((t) => t.id === activeTabId);
  return {
    editorTabs: scoped.map((t) => ({
      path: t.path,
      name: t.name,
      ext: t.ext,
      viewMode: t.viewMode ?? "code",
      savedContent: t.savedContent ?? t.content,
    })),
    activeEditorTabIndex: idx >= 0 ? idx : 0,
  };
}

export function layoutShellTerminals(shellTerminals) {
  return {
    terminalShellTabs: (shellTerminals?.tabs ?? []).map((t) => ({
      id: t.id,
      title: t.title ?? "bash",
    })),
    activeTerminalShellId: shellTerminals?.activeId ?? null,
  };
}

/** Shell chrome only — open chat tabs / active chat live in the chat snapshot (IndexedDB + gateway). */
export function layoutAgentState({
  agentMaximized,
  terminalMaximized,
  savedColumnFractions,
}) {
  const patch = {};
  if (typeof agentMaximized === "boolean") patch.agentMaximized = agentMaximized;
  if (typeof terminalMaximized === "boolean") patch.terminalMaximized = terminalMaximized;
  if (Array.isArray(savedColumnFractions)) patch.savedColumnFractions = savedColumnFractions;
  return patch;
}
