/** @ mention picker scopes. */

export const RefPickerScope = {
  root: "root",
  files: "files",
  docs: "docs",
  skills: "skills",
  people: "people",
  terminals: "terminals",
  chats: "chats",
  branch: "branch",
  web: "web",
  codebase: "codebase",
};

const SCOPE_META = {
  [RefPickerScope.files]: { prefix: "files", label: "Files & Folders", apiCategory: "files" },
  [RefPickerScope.docs]: { prefix: "docs", label: "Docs", apiCategory: "docs" },
  [RefPickerScope.skills]: { prefix: "skills", label: "Skills", apiCategory: "skills" },
  [RefPickerScope.people]: { prefix: "people", label: "People (WhatsApp)", apiCategory: "people" },
  [RefPickerScope.terminals]: { prefix: "terminals", label: "Terminals", clientOnly: true },
  [RefPickerScope.chats]: { prefix: "chats", label: "Past Chats", clientOnly: true },
  [RefPickerScope.branch]: { prefix: "branch", label: "Branch (Diff with Main)", apiCategory: "branch" },
  [RefPickerScope.web]: { prefix: "web", label: "Web", clientOnly: true },
  [RefPickerScope.codebase]: { prefix: "codebase", label: "Codebase", apiCategory: "codebase" },
};

export const ROOT_SCOPES = [
  RefPickerScope.files,
  RefPickerScope.docs,
  RefPickerScope.skills,
  RefPickerScope.people,
  RefPickerScope.terminals,
  RefPickerScope.chats,
  RefPickerScope.branch,
  RefPickerScope.web,
  RefPickerScope.codebase,
];

export function scopeFromPrefix(raw) {
  const p = String(raw ?? "").toLowerCase();
  for (const [scope, meta] of Object.entries(SCOPE_META)) {
    if (meta.prefix === p) return scope;
  }
  return null;
}

export function scopeLabel(scope) {
  return SCOPE_META[scope]?.label ?? scope;
}

export function scopeApiCategory(scope) {
  return SCOPE_META[scope]?.apiCategory ?? null;
}

export function scopeIsClientOnly(scope) {
  return SCOPE_META[scope]?.clientOnly === true;
}

/** Parsed `@` context from composer caret position. */
export function parseRefAtContext(text, cursor) {
  const value = String(text ?? "");
  const pos = Math.max(0, Math.min(cursor ?? value.length, value.length));
  const before = value.slice(0, pos);
  const at = before.lastIndexOf("@");
  if (at < 0) return null;
  if (at > 0) {
    const prev = before[at - 1];
    if (prev !== " " && prev !== "\n" && prev !== "\t" && prev !== "\uFFFC") return null;
  }

  const raw = before.slice(at + 1);
  if (raw.includes("\n")) return null;

  const space = raw.indexOf(" ");
  if (space < 0) {
    return { atStart: at, scope: RefPickerScope.root, query: raw, rawAfterAt: raw };
  }

  const prefix = raw.slice(0, space);
  const scoped = scopeFromPrefix(prefix);
  if (!scoped) return null;
  const query = raw.slice(space + 1);
  if (query.includes(" ")) return null;
  return { atStart: at, scope: scoped, query, rawAfterAt: raw };
}

export function scopedComposerPrefix(scope) {
  const prefix = SCOPE_META[scope]?.prefix;
  return prefix ? `@${prefix} ` : "@";
}

export function sectionLabelForKind(kind) {
  switch (kind) {
    case "tab":
      return "Open tabs";
    case "git":
      return "Git changes";
    case "branch":
      return "Diff with main";
    case "skill":
      return "Skills";
    case "symbol":
      return "Symbols";
    case "doc":
      return "Files";
    case "codebase":
      return "Codebase";
    case "terminal":
      return "Terminals";
    case "chat":
      return "Past chats";
    case "person":
      return "People";
    case "web":
      return "Web search";
    case "mcp":
      return "MCP";
    case "docsource":
      return "Indexed sources";
    default:
      return kind;
  }
}
