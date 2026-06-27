/** New file/folder helpers for the desk explorer. */

export const NEW_FILE_TYPES = [
  {
    id: "md",
    label: "Markdown",
    ext: ".md",
    defaultName: "untitled.md",
    content: "# Untitled\n\n",
  },
  {
    id: "txt",
    label: "Text file",
    ext: ".txt",
    defaultName: "untitled.txt",
    content: "",
  },
  {
    id: "csv",
    label: "Spreadsheet (CSV)",
    ext: ".csv",
    defaultName: "untitled.csv",
    content: "Column A,Column B,Column C\n,,,\n,,,\n",
  },
  {
    id: "json",
    label: "JSON",
    ext: ".json",
    defaultName: "untitled.json",
    content: "{\n  \n}\n",
  },
  {
    id: "html",
    label: "HTML",
    ext: ".html",
    defaultName: "untitled.html",
    content:
      "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"UTF-8\" />\n  <title>Untitled</title>\n</head>\n<body>\n\n</body>\n</html>\n",
  },
  {
    id: "js",
    label: "JavaScript",
    ext: ".js",
    defaultName: "untitled.js",
    content: "",
  },
  {
    id: "ts",
    label: "TypeScript",
    ext: ".ts",
    defaultName: "untitled.ts",
    content: "",
  },
  {
    id: "py",
    label: "Python",
    ext: ".py",
    defaultName: "untitled.py",
    content: "",
  },
];

export function joinExplorerPath(dir, name) {
  const folder = String(dir ?? "")
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "");
  const leaf = String(name ?? "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .trim();
  if (!leaf) throw new Error("Name required");
  if (leaf.includes("..")) throw new Error("Invalid name");
  return folder ? `${folder}/${leaf}` : leaf;
}

export function sanitizeEntryName(raw) {
  const name = String(raw ?? "").trim();
  if (!name) throw new Error("Name required");
  if (/[\\/:*?"<>|]/.test(name)) throw new Error("Name contains invalid characters");
  if (name === "." || name === "..") throw new Error("Invalid name");
  return name;
}

export function uniqueName(baseName, existsSet) {
  let name = sanitizeEntryName(baseName);
  if (!existsSet?.has?.(name.toLowerCase())) return name;
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  let n = 2;
  while (existsSet.has(`${stem} ${n}${ext}`.toLowerCase())) n += 1;
  return `${stem} ${n}${ext}`;
}

export function entryNamesSet(entries) {
  const set = new Set();
  for (const e of entries ?? []) {
    const n = e?.name ?? e?.path?.split("/").pop();
    if (n) set.add(String(n).toLowerCase());
  }
  return set;
}

export function getNewFileType(id) {
  return NEW_FILE_TYPES.find((t) => t.id === id) ?? NEW_FILE_TYPES[0];
}
