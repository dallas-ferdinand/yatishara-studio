const REFERENCES_MARKER = "\n\nReferences:\n";

function parseReferenceMeta(meta = "") {
  const parts = String(meta)
    .split("|")
    .map((piece) => piece.trim())
    .filter(Boolean);
  const out = { kind: "file", path: "", elementType: "", notes: "" };
  for (const part of parts) {
    const [key, ...rest] = part.split(":");
    const value = rest.join(":").trim();
    if (!value) continue;
    if (key === "kind") out.kind = value;
    else if (key === "element") out.elementType = value;
    else if (key === "notes") out.notes = value;
    else if (key === "path") out.path = value;
    else if (key === "file") out.filename = value;
    else if (key === "media") out.media = value;
  }
  return out;
}

function parseReferenceLine(line) {
  const trimmed = String(line ?? "").trim();
  const match = trimmed.match(/^-\s*@(.+?)(?:\s*\|\s*(.+))?$/);
  if (!match) return null;
  const label = match[1].trim();
  const meta = parseReferenceMeta(match[2] ?? "");
  return { label, ...meta };
}

function tokenizeInlineMentions(text, skipLabels = new Set()) {
  const segments = [];
  const source = String(text ?? "");
  if (!source) return segments;

  const re = /@([^\s@|]+)/g;
  let last = 0;
  let match;
  while ((match = re.exec(source))) {
    const label = match[1].trim();
    if (match.index > last) {
      segments.push({ type: "text", value: source.slice(last, match.index) });
    }
    if (!skipLabels.has(label.toLowerCase())) {
      segments.push({ type: "mention", label });
    }
    last = match.index + match[0].length;
  }
  if (last < source.length) {
    segments.push({ type: "text", value: source.slice(last) });
  }
  return segments.length ? segments : [{ type: "text", value: source }];
}

/** Split stored generation prompt into markdown body + reference chips. */
export function parseStudioPrompt(prompt) {
  const raw = String(prompt ?? "");
  const splitIdx = raw.indexOf(REFERENCES_MARKER);
  let body = (splitIdx === -1 ? raw : raw.slice(0, splitIdx)).trim();
  const refs = [];

  if (splitIdx !== -1) {
    for (const line of raw.slice(splitIdx + REFERENCES_MARKER.length).split("\n")) {
      const parsed = parseReferenceLine(line);
      if (parsed) refs.push(parsed);
    }
  }

  const refLabels = new Set(refs.map((ref) => ref.label.toLowerCase()));
  body = body
    .replace(/\uFFFC/g, " ")
    .replace(/@([^\s@|]+)/g, (full, label) => (refLabels.has(label.toLowerCase()) ? "" : full))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  const segments = tokenizeInlineMentions(body, refLabels);
  return { refs, segments };
}

export function composerTokenIconKind(ref) {
  const kind = String(ref?.kind ?? "file").toLowerCase();
  if (kind === "image" || kind === "video" || kind === "audio") return kind;
  if (ref?.elementType) return "sparkles";
  if (kind === "folder") return "folder";
  return "file";
}
