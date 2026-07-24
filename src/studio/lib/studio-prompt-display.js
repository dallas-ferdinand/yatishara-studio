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

/**
 * Tab / thread titles must never include composer object placeholders (\uFFFC),
 * which browsers render as a dashed "OBJ" box instead of an attachment chip.
 */
export function threadTitleFromPrompt(prompt, attachments = [], fallback = "New generation") {
  const raw = String(prompt ?? "");
  const splitIdx = raw.indexOf(REFERENCES_MARKER);
  const body = (splitIdx === -1 ? raw : raw.slice(0, splitIdx))
    .replace(/\uFFFC/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (body) return body.slice(0, 64);

  const first = attachments[0];
  const label = String(first?.label || first?.filename || "")
    .replace(/^@/, "")
    .trim();
  if (label) return label.slice(0, 64);

  if (splitIdx !== -1) {
    for (const line of raw.slice(splitIdx + REFERENCES_MARKER.length).split("\n")) {
      const parsed = parseReferenceLine(line);
      const refLabel = String(parsed?.label || "")
        .replace(/^@/, "")
        .trim();
      if (refLabel) return refLabel.slice(0, 64);
    }
  }

  return String(fallback || "New generation").slice(0, 64);
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

/** Collect durable asset ids referenced by a stored composer prompt. */
export function collectStudioAssetIdsFromPrompt(prompt) {
  const { refs } = parseStudioPrompt(prompt);
  const ids = [];
  const seen = new Set();
  for (const ref of refs) {
    const path = String(ref?.path ?? "");
    // Element chips use /Studio/elements/{id} + studio:<elementId> — never feed those
    // into assets.listByIds (Convex rejects foreign table ids).
    if (/\/Studio\/elements\//i.test(path) || ref?.elementType) continue;
    const fromPath = path.match(/\/Studio\/assets\/([^/.]+)/i)?.[1];
    const studioId = String(ref?.studioId || "").trim();
    // Prefer path-derived asset ids; only use studio: when path is assets or absent.
    const id = String(
      fromPath || (/\/Studio\/assets\//i.test(path) ? studioId : path ? "" : studioId) || "",
    ).trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
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

function previewFromAsset(asset, ref) {
  if (!asset) return null;
  return {
    thumbnailUrl: asset.signedThumbnailUrl ?? asset.signedReadUrl,
    mediaUrl: asset.signedReadUrl,
    kind: asset.kind ?? ref?.kind ?? "file",
    elementType: ref?.elementType,
  };
}

function previewFromElement(element, assets, ref) {
  if (!element) return null;
  const sheetId = element.sheetAssetId ?? element.sourceAssetIds?.[0];
  const sheet = sheetId ? findAssetById(assets, sheetId) : null;
  return {
    thumbnailUrl: sheet?.signedThumbnailUrl ?? sheet?.signedReadUrl,
    mediaUrl: sheet?.signedReadUrl,
    kind: "image",
    elementType: element.type ?? ref?.elementType,
  };
}

/** Resolve thumbnail preview for a stored prompt reference line. */
export function resolveStudioPromptRefPreview(ref, { assets = [], elements = [] } = {}) {
  const path = String(ref?.path ?? "");
  const assetMatch = path.match(/\/Studio\/assets\/([^/.]+)/);
  if (assetMatch) {
    const preview = previewFromAsset(findAssetById(assets, assetMatch[1]), ref);
    if (preview) return preview;
  }

  const elementMatch = path.match(/\/Studio\/elements\/([^/.]+)/);
  if (elementMatch) {
    const preview = previewFromElement(findElementById(elements, elementMatch[1]), assets, ref);
    if (preview) return preview;
  }

  if (ref?.studioId) {
    const assetPreview = previewFromAsset(findAssetById(assets, ref.studioId), ref);
    if (assetPreview) return assetPreview;
    const elementPreview = previewFromElement(findElementById(elements, ref.studioId), assets, ref);
    if (elementPreview) return elementPreview;
  }

  const label = String(ref?.label ?? "")
    .trim()
    .replace(/^@/, "")
    .toLowerCase();
  if (label) {
    const element = (elements ?? []).find(
      (item) => String(item.name ?? "").trim().replace(/^@/, "").toLowerCase() === label,
    );
    const elementPreview = previewFromElement(element, assets, ref);
    if (elementPreview) return elementPreview;
    const asset = (assets ?? []).find(
      (item) => String(item.name ?? "").trim().toLowerCase() === label,
    );
    const assetPreview = previewFromAsset(asset, ref);
    if (assetPreview) return assetPreview;
  }

  // Fall back to baked URLs only when durable https (never blob:/data:).
  const baked = ref?.thumb || ref?.media;
  if (baked && /^https?:\/\//i.test(baked)) {
    return {
      thumbnailUrl: baked,
      mediaUrl: ref.media || ref.thumb,
      kind: ref.kind || "image",
      elementType: ref.elementType || undefined,
    };
  }

  return null;
}
