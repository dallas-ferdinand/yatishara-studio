/** File extension → viewer kind + icon names for desk explorer and attachments. */

const IMAGE = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".ico", ".avif",
]);
const VIDEO = new Set([".mp4", ".webm", ".mov", ".m4v", ".ogv", ".mkv"]);
const AUDIO = new Set([".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac", ".opus"]);
const PDF = new Set([".pdf"]);
const CSV = new Set([".csv", ".tsv"]);
const OFFICE = new Set([".xlsx", ".xls", ".docx", ".doc", ".pptx", ".ppt", ".odt", ".ods"]);
const ARCHIVE = new Set([".zip", ".tar", ".gz", ".tgz", ".7z", ".rar", ".bz2"]);
const CODE = new Set([
  ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".json", ".md", ".html", ".htm", ".css",
  ".py", ".sh", ".bash", ".yml", ".yaml", ".xml", ".sql", ".go", ".rs", ".java", ".c", ".cpp",
  ".h", ".txt", ".env", ".toml", ".ini", ".log", ".vue", ".svelte", ".rb", ".php", ".swift",
  ".kt", ".scala", ".dart", ".lua", ".r", ".zig",
]);

export function fileExt(nameOrPath = "") {
  const base = String(nameOrPath).split("/").pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "";
  return base.slice(dot).toLowerCase();
}

export function fileViewerKind(ext) {
  const e = ext?.startsWith(".") ? ext.toLowerCase() : fileExt(ext);
  if (!e) return "binary";
  if (IMAGE.has(e)) return "image";
  if (VIDEO.has(e)) return "video";
  if (AUDIO.has(e)) return "audio";
  if (PDF.has(e)) return "pdf";
  if (CSV.has(e)) return "csv";
  if (OFFICE.has(e)) return "office";
  if (ARCHIVE.has(e)) return "archive";
  if (e === ".md") return "markdown";
  if (e === ".html" || e === ".htm") return "html";
  if (CODE.has(e)) return "code";
  return "binary";
}

export function isEditableInTab(kind) {
  return kind === "code" || kind === "markdown" || kind === "html" || kind === "csv";
}

export function isHtmlExt(ext) {
  const e = ext?.startsWith(".") ? ext.toLowerCase() : fileExt(ext);
  return e === ".html" || e === ".htm";
}

/** Default editor pane: markdown/html render; other editable types start in source. */
export function defaultEditorViewMode(ext) {
  const kind = fileViewerKind(ext);
  if (kind === "markdown") return "preview";
  if (kind === "html") return "preview";
  if (isEditableInTab(kind)) return "code";
  return "preview";
}

/** Lucide-style icon id from path or entry (explorer + attachments). */
export function fileIconName(nameOrPath, { isDir = false } = {}) {
  if (isDir) return "folder";
  const ext = fileExt(nameOrPath);
  const kind = fileViewerKind(ext);
  if (kind === "image") return "image";
  if (kind === "video") return "film";
  if (kind === "audio") return "music";
  if (kind === "pdf") return "filePdf";
  if (kind === "csv") return "table";
  if (kind === "archive") return "archive";
  if (kind === "markdown") return "fileText";
  if (kind === "html") return "globe";
  if (kind === "office") return "fileText";
  if (kind === "code") {
    if ([".sh", ".bash", ".zsh"].includes(ext)) return "terminal";
    if ([".json", ".yaml", ".yml", ".toml", ".xml"].includes(ext)) return "fileCode";
    return "fileCode";
  }
  return "file";
}

export function explorerEntryIcon(entry) {
  if (entry?.studioKind === "trash") return "trash";
  if (entry?.type === "dir" || entry?.type === "parent") return entry?.type === "parent" ? "chevL" : "folder";
  if (entry?.studioKind === "element") {
    if (entry.elementType === "character") return "user";
    if (entry.elementType === "prop") return "package";
    if (entry.elementType === "location") return "mapPin";
    return "fileText";
  }
  return fileIconName(entry?.name ?? entry?.path ?? "");
}

/** Icon for unified workspace file tab. */
export function workspaceTabIcon(tab) {
  if (!tab) return "file";
  if (tab.kind === "chat") return "message";
  if (tab.kind === "pulse") return "infinity";
  if (tab.kind === "buckets") return "bucket";
  if (tab.kind === "settings") return "settings";
  const path = tab.path ?? tab.title ?? "";
  if (tab.ext) return fileIconName(`file${tab.ext.startsWith(".") ? tab.ext : `.${tab.ext}`}`);
  return fileIconName(path);
}

/** Icon for @ picker result row. */
export function refPickerIcon(item) {
  if (!item) return "file";
  if (item.kind === "scope") return "search";
  if (item.kind === "person") return "user";
  if (item.kind === "chat") return "message";
  if (item.kind === "terminal") return "terminal";
  if (item.kind === "web") return "globe";
  if (item.kind === "skill") return "tool";
  if (item.kind === "git") return "share";
  if (item.kind === "tab") return "file";
  if (item.kind === "dir" || item.isDir) return "folder";
  if (item.kind === "mcp") return "mcp";
  return fileIconName(item.path ?? item.name ?? "");
}
