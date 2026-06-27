/** Lightweight syntax tinting (no Monaco dependency). */
const MAX_HIGHLIGHT_CHARS = 240_000;
const MAX_HIGHLIGHT_LINES = 5_000;

const DART_KEYWORDS = new Set([
  "abstract", "as", "async", "await", "break", "case", "catch", "class", "const", "continue",
  "default", "do", "else", "enum", "export", "extends", "false", "final", "finally", "for",
  "function", "if", "implements", "import", "in", "interface", "is", "late", "library", "new",
  "null", "on", "operator", "part", "return", "super", "switch", "sync", "this", "throw", "true",
  "try", "typedef", "var", "void", "while", "with", "yield",
]);

const JS_KEYWORDS = new Set([
  "async", "await", "break", "case", "catch", "class", "const", "continue", "debugger", "default",
  "delete", "do", "else", "export", "extends", "false", "finally", "for", "function", "if",
  "import", "in", "instanceof", "let", "new", "null", "return", "static", "super", "switch",
  "this", "throw", "true", "try", "typeof", "undefined", "var", "void", "while", "with", "yield",
]);

function escHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function fileExt(path) {
  const p = String(path ?? "");
  const i = p.lastIndexOf(".");
  return i >= 0 ? p.slice(i).toLowerCase() : "";
}

function keywordsForExt(ext) {
  if (ext === ".dart") return DART_KEYWORDS;
  if ([".js", ".mjs", ".ts", ".tsx", ".jsx", ".cjs"].includes(ext)) return JS_KEYWORDS;
  return null;
}

function highlightLine(line, ext) {
  const trimmed = line.trimStart();
  const indent = line.length - trimmed.length;
  let out = indent > 0 ? `<span class="tok-indent">${" ".repeat(indent)}</span>` : "";

  if (trimmed.startsWith("//") || trimmed.startsWith("#")) {
    return `${out}<span class="tok-comment">${escHtml(trimmed)}</span>`;
  }

  if (ext === ".json" && (trimmed.startsWith("{") || trimmed.startsWith("}"))) {
    return `${out}<span class="tok-json">${escHtml(trimmed)}</span>`;
  }

  const keywords = keywordsForExt(ext);
  if (!keywords) {
    return `${out}${escHtml(trimmed)}`;
  }

  const parts = trimmed.match(/(\s+|\b[\w.]+\b|[^\w\s])/g) ?? [trimmed];
  for (const tok of parts) {
    if (keywords.has(tok)) out += `<span class="tok-keyword">${escHtml(tok)}</span>`;
    else if (tok.startsWith("'") || tok.startsWith('"') || tok.startsWith("`")) {
      out += `<span class="tok-string">${escHtml(tok)}</span>`;
    } else if (/^\d/.test(tok)) out += `<span class="tok-number">${escHtml(tok)}</span>`;
    else out += escHtml(tok);
  }
  return out;
}

export function highlightCodeHtml(text, path) {
  const source = String(text ?? "");
  if (source.length > MAX_HIGHLIGHT_CHARS || source.split("\n", MAX_HIGHLIGHT_LINES + 1).length > MAX_HIGHLIGHT_LINES) {
    return escHtml(source);
  }
  const ext = fileExt(path);
  const lines = source.split("\n");
  return lines.map((line) => highlightLine(line, ext)).join("\n");
}
