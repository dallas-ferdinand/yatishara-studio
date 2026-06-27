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
  if (!path) return scope || "";
  return scope ? `${scope} · ${path}` : path;
}
