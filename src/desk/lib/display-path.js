export function displayWorkspacePath(path, rootLabel = "files") {
  const clean = String(path ?? "")
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "");
  const parts = clean.split("/").filter(Boolean);
  const visibleParts = parts[0]?.toLowerCase() === "studio" ? parts.slice(1) : parts;
  return [rootLabel, ...visibleParts].filter(Boolean).join("/");
}

export function displayEntryPath(entry, rootLabel = "files") {
  return entry?.displayPath ?? displayWorkspacePath(entry?.path, rootLabel);
}
