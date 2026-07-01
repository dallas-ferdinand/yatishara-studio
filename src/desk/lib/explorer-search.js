import { displayWorkspacePath } from "@/desk/lib/display-path";

export function withSearchSections(results = [], scope = "") {
  const rows = [];
  let lastSection = null;
  for (const entry of results ?? []) {
    const section = entry.section ?? entry.type ?? scope ?? "Results";
    if (section && section !== lastSection) {
      rows.push({ type: "search-divider", id: `section:${section}`, label: section });
      lastSection = section;
    }
    rows.push(entry);
  }
  return rows;
}

export function searchResultMeta(entry, scope = "") {
  if (!entry || entry.type === "search-divider") return "";
  const path = entry.path ?? "";
  const visibleScope = scope ? displayWorkspacePath(scope) : "";
  if (!path) return visibleScope;
  const visiblePath = displayWorkspacePath(path);
  return visibleScope ? `${visibleScope} · ${visiblePath}` : visiblePath;
}
