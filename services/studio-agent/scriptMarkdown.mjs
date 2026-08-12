/**
 * Agent-side mirror of convex/lib/scriptMarkdown.ts — keep in sync.
 * Crash-safe Script markdown before studio_create_document / patch / update.
 */

const MAX_SCRIPT_CHARS = 180_000;
const PIPE_META_REF = /^\s*[-*+]\s*(?:@)?([^\n|]+?)\s*\|\s*(.+)$/;
const ASSET_LINK_REF =
  /^\s*[-*+]\s*\[([^\]]+)\]\(\s*(?:asset:\/\/)?([a-z0-9]+)(?:\s+"[^"]*")?\s*\)(?:\s*[—\-–:]\s*(.*))?$/i;

function stripUnsafeControls(text) {
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

function closeOpenFence(text) {
  const fences = text.match(/^```/gm) ?? [];
  if (fences.length % 2 === 1) return `${text.trimEnd()}\n\`\`\`\n`;
  return text;
}

function normalizePipeMetaLine(line) {
  const m = line.match(PIPE_META_REF);
  if (!m) return null;
  const label = m[1].trim().replace(/^@/, "");
  const meta = m[2];
  let studioId = "";
  let note = "";
  for (const part of meta.split("|").map((p) => p.trim()).filter(Boolean)) {
    const [key, ...rest] = part.split(":");
    const value = rest.join(":").trim();
    if (!value) continue;
    const k = key.trim().toLowerCase();
    if (k === "studio" || k === "studioid" || k === "id") studioId = value;
    else if (k === "notes" || k === "note") note = value;
  }
  if (!studioId) {
    const fromPath = meta.match(/\/Studio\/assets\/([a-z0-9]+)/i)?.[1];
    if (fromPath) studioId = fromPath;
  }
  if (!studioId || !/^[a-z0-9]+$/i.test(studioId)) {
    return label ? `- ${label}` : null;
  }
  const suffix = note ? ` — ${note}` : " — product reference";
  return `- [${label || studioId}](asset://${studioId})${suffix}`;
}

function normalizeReferencesBlock(block) {
  const lines = String(block ?? "").split("\n");
  const out = [];
  for (const line of lines) {
    if (!line.trim()) {
      out.push("");
      continue;
    }
    if (ASSET_LINK_REF.test(line)) {
      out.push(line.trimEnd());
      continue;
    }
    const normalized = normalizePipeMetaLine(line);
    if (normalized != null) {
      out.push(normalized);
      continue;
    }
    if (/^\s*[-*+]\s+/.test(line) && line.includes("|") && /kind\s*:/i.test(line)) {
      continue;
    }
    out.push(line.trimEnd());
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** @param {unknown} input @returns {string} */
export function sanitizeScriptMarkdown(input) {
  let text = stripUnsafeControls(String(input ?? ""));
  if (!text.trim()) return "";
  if (text.length > MAX_SCRIPT_CHARS) text = text.slice(0, MAX_SCRIPT_CHARS);
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  text = closeOpenFence(text);

  const heading = text.match(/\n##?\s*References\s*\n/i);
  const bare = text.match(/\nReferences:\s*\n/i);
  let markerIdx = -1;
  let markerLen = 0;
  if (heading?.index != null) {
    markerIdx = heading.index;
    markerLen = heading[0].length;
  } else if (bare?.index != null) {
    markerIdx = bare.index;
    markerLen = bare[0].length;
  } else if (/^##?\s*References\s*\n/i.test(text)) {
    markerIdx = 0;
    markerLen = text.indexOf("\n") + 1;
  } else if (/^References:\s*\n/i.test(text)) {
    markerIdx = 0;
    markerLen = text.indexOf("\n") + 1;
  }

  if (markerIdx >= 0) {
    const body = text.slice(0, markerIdx).trimEnd();
    const refs = normalizeReferencesBlock(text.slice(markerIdx + markerLen));
    text = refs ? `${body}\n\n## References\n\n${refs}\n` : `${body}\n`;
  }

  text = text
    .split("\n")
    .map((line) => {
      if (ASSET_LINK_REF.test(line)) return line;
      const normalized = normalizePipeMetaLine(line);
      return normalized != null ? normalized : line;
    })
    .join("\n");

  return text.replace(/\n{3,}/g, "\n\n").trim() + (text.trim() ? "\n" : "");
}
