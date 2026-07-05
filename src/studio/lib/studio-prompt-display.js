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
    else if (key === "thumb") out.thumb = value;
    else if (key === "studio") out.studioId = value;
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

function findAssetById(assets, id) {
  if (!id) return null;
  return (assets ?? []).find((asset) => asset._id === id || asset.studioId === id) ?? null;
}

function findElementById(elements, id) {
  if (!id) return null;
  return (elements ?? []).find((element) => element._id === id || element.studioId === id) ?? null;
}

/** Resolve thumbnail preview for a stored prompt reference line. */
export function resolveStudioPromptRefPreview(ref, { assets = [], elements = [] } = {}) {
  const path = String(ref?.path ?? "");
  const assetMatch = path.match(/\/Studio\/assets\/([^/.]+)/);
  if (assetMatch) {
    const asset = findAssetById(assets, assetMatch[1]);
    if (asset) {
      const kind = asset.kind ?? ref?.kind ?? "file";
      return {
        thumbnailUrl: asset.signedThumbnailUrl ?? asset.signedReadUrl,
        mediaUrl: asset.signedReadUrl,
        kind,
        elementType: ref?.elementType,
      };
    }
  }

  const elementMatch = path.match(/\/Studio\/elements\/([^/.]+)/);
  if (elementMatch) {
    const element = findElementById(elements, elementMatch[1]);
    if (element) {
      const sheetId = element.sheetAssetId ?? element.sourceAssetIds?.[0];
      const sheet = sheetId ? findAssetById(assets, sheetId) : null;
      return {
        thumbnailUrl: sheet?.signedThumbnailUrl ?? sheet?.signedReadUrl,
        mediaUrl: sheet?.signedReadUrl,
        kind: "image",
        elementType: element.type ?? ref?.elementType,
      };
    }
  }

  const label = String(ref?.label ?? "").trim().toLowerCase();
  if (label) {
    const element = (elements ?? []).find((item) => String(item.name ?? "").trim().toLowerCase() === label);
    if (element) {
      const sheetId = element.sheetAssetId ?? element.sourceAssetIds?.[0];
      const sheet = sheetId ? findAssetById(assets, sheetId) : null;
      return {
        thumbnailUrl: sheet?.signedThumbnailUrl ?? sheet?.signedReadUrl,
        mediaUrl: sheet?.signedReadUrl,
        kind: "image",
        elementType: element.type ?? ref?.elementType,
      };
    }
    const asset = (assets ?? []).find((item) => String(item.name ?? "").trim().toLowerCase() === label);
    if (asset) {
      return {
        thumbnailUrl: asset.signedThumbnailUrl ?? asset.signedReadUrl,
        mediaUrl: asset.signedReadUrl,
        kind: asset.kind ?? ref?.kind ?? "file",
        elementType: ref?.elementType,
      };
    }
  }

  return null;
}
