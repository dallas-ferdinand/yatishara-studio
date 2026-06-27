/** Multi-tab editor state — keyed by workspace + path. */

import { fileViewerKind, isEditableInTab, defaultEditorViewMode } from "@/desk/lib/file-kind";

export function tabId(workspaceId, path) {
  return `${workspaceId}:${path}`;
}

export function fileExt(name) {
  return (name.match(/\.[^.]+$/)?.[0] ?? "").toLowerCase();
}

export function tabsForWorkspace(tabs, workspaceId) {
  return (Array.isArray(tabs) ? tabs : []).filter((t) => t.workspaceId === workspaceId);
}

export function closeTab(tabs, activeId, id) {
  const next = tabs.filter((t) => t.id !== id);
  if (activeId !== id) return { tabs: next, activeId };
  const idx = tabs.findIndex((t) => t.id === id);
  const neighbor = next[idx] ?? next[idx - 1] ?? null;
  return { tabs: next, activeId: neighbor?.id ?? null };
}

export function closeOtherTabs(tabs, activeId) {
  const keep = tabs.find((t) => t.id === activeId);
  return { tabs: keep ? [keep] : [], activeId: keep?.id ?? null };
}

export function closeAllTabs() {
  return { tabs: [], activeId: null };
}

/** Row for a tab restored from saved client layout. */
export function editorTabFromSaved(t, workspaceId) {
  const name = t.name ?? t.path?.split("/").pop() ?? t.path;
  const ext = t.ext ?? fileExt(name);
  const viewerKind = fileViewerKind(ext);
  const viewMode = isEditableInTab(viewerKind)
    ? t.viewMode === "code" || t.viewMode === "preview"
      ? t.viewMode
      : defaultEditorViewMode(ext)
    : "preview";
  return {
    id: tabId(workspaceId, t.path),
    workspaceId,
    path: t.path,
    name,
    ext,
    viewMode,
    loading: true,
  };
}

/** Load tab body after open/restore — media skips readFile. */
export async function hydrateEditorTabContent(tab, readFile) {
  const viewerKind = fileViewerKind(tab.ext);
  if (!isEditableInTab(viewerKind)) {
    return {
      loading: false,
      content: "",
      savedContent: "",
      dirty: false,
      error: undefined,
      viewMode: "preview",
    };
  }
  try {
    const file = await readFile(tab.path, tab.workspaceId);
    return {
      loading: false,
      content: file.content,
      savedContent: file.content,
      dirty: false,
      error: undefined,
      viewMode: isEditableInTab(fileViewerKind(tab.ext)) ? tab.viewMode : "preview",
    };
  } catch (err) {
    return {
      loading: false,
      content: undefined,
      error: err?.message ?? String(err),
      viewMode: tab.viewMode,
    };
  }
}
