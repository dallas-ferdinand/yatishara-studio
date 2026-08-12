/**
 * Prompt script references — parse / hydrate chips from markdown docs
 * and Create `References:` blocks. Assets only for new hydrate.
 */

export const REFERENCES_MARKER = "\n\nReferences:\n";
export const OBJECT_REPLACEMENT = "\uFFFC";

export type PromptReference = {
  label: string;
  kind: string;
  path: string;
  studioId: string;
  filename?: string;
  elementType?: string;
  notes?: string;
  media?: string;
  thumb?: string;
};

export type PromptAttachmentDraft = {
  id: string;
  kind: string;
  label: string;
  path?: string;
  displayPath?: string;
  filename?: string;
  studioKind: "asset";
  studioId: string;
  mimeType?: string;
  thumbnailUrl?: string;
  mediaUrl?: string;
};

export type HydratedPrompt = {
  body: string;
  references: PromptReference[];
  /** Body with one OBJECT_REPLACEMENT per resolved attachment (leading chips). */
  draftWithMarkers: string;
  attachments: PromptAttachmentDraft[];
  assetIds: string[];
};

type AssetLike = {
  _id?: string;
  studioId?: string;
  name?: string;
  kind?: string;
  mimeType?: string;
  path?: string;
  displayPath?: string;
  signedThumbnailUrl?: string;
  signedReadUrl?: string;
  thumbnailUrl?: string;
  mediaUrl?: string;
};

const ASSET_LINK_LINE =
  /^\s*[-*+]\s*\[([^\]]+)\]\(\s*(?:asset:\/\/)?([a-z0-9]+)(?:\s+"[^"]*")?\s*\)(?:\s*[—\-–:]\s*(.*))?$/i;

function parseReferenceMeta(meta = ""): Omit<PromptReference, "label"> {
  const parts = String(meta)
    .split("|")
    .map((piece) => piece.trim())
    .filter(Boolean);
  const out: Omit<PromptReference, "label"> = {
    kind: "file",
    path: "",
    studioId: "",
    elementType: "",
    notes: "",
  };
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

/** Agent/script form: `- [Label](asset://id) — note` (and bare asset:// id). */
export function parseAssetLinkLine(line: string): PromptReference | null {
  const trimmed = String(line ?? "").trim();
  const match = trimmed.match(ASSET_LINK_LINE);
  if (!match) return null;
  const label = String(match[1] ?? "").trim().replace(/^@/, "");
  const studioId = String(match[2] ?? "").trim();
  if (!studioId || !/^[a-z0-9]+$/i.test(studioId)) return null;
  const notes = String(match[3] ?? "").trim();
  return {
    label: label || studioId,
    kind: "image",
    path: `/Studio/assets/${studioId}`,
    studioId,
    ...(notes ? { notes } : {}),
  };
}

export function parseReferenceLine(line: string): PromptReference | null {
  const trimmed = String(line ?? "").trim();
  const fromLink = parseAssetLinkLine(trimmed);
  if (fromLink) return fromLink;

  const match = trimmed.match(/^-\s*@(.+?)(?:\s*\|\s*(.+))?$/);
  if (!match) return null;
  const label = match[1].trim().replace(/^@/, "");
  const meta = parseReferenceMeta(match[2] ?? "");
  return { label, ...meta };
}

/** Strip a single outer ```lang … ``` fence (agent skill saves). */
export function stripOuterCodeFence(markdown: string): string {
  const raw = String(markdown ?? "").trim();
  const match = raw.match(/^```(?:text|markdown|md|prompt)?\s*\n([\s\S]*?)\n```$/i);
  if (match) return match[1].trim();
  return raw;
}

function extractReferencesBlock(text: string): { body: string; block: string } {
  const raw = String(text ?? "");
  const markerIdx = raw.lastIndexOf(REFERENCES_MARKER);
  if (markerIdx >= 0) {
    return {
      body: raw.slice(0, markerIdx).trim(),
      block: raw.slice(markerIdx + REFERENCES_MARKER.length),
    };
  }
  // ## References (or # References) heading in docs
  const heading = raw.match(/\n##?\s*References\s*\n/i);
  if (heading && heading.index != null) {
    return {
      body: raw.slice(0, heading.index).trim(),
      block: raw.slice(heading.index + heading[0].length),
    };
  }
  if (/^##?\s*References\s*\n/i.test(raw)) {
    const firstNl = raw.indexOf("\n");
    return { body: "", block: raw.slice(firstNl + 1) };
  }
  return { body: raw.trim(), block: "" };
}

function collectReferencesFromBlock(block: string): PromptReference[] {
  const references: PromptReference[] = [];
  const seen = new Set<string>();
  for (const line of String(block ?? "").split("\n")) {
    const ref = parseReferenceLine(line);
    if (!ref) continue;
    const key = assetIdFromReference(ref) || `@${ref.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    references.push(ref);
  }
  return references;
}

/** Also pick up loose `asset://id` / markdown links anywhere in the doc. */
function collectInlineAssetLinks(text: string): PromptReference[] {
  const refs: PromptReference[] = [];
  const seen = new Set<string>();
  const re =
    /\[([^\]]+)\]\(\s*asset:\/\/([a-z0-9]+)\s*\)|asset:\/\/([a-z0-9]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(String(text ?? ""))) != null) {
    const studioId = String(match[2] || match[3] || "").trim();
    if (!studioId || seen.has(studioId)) continue;
    seen.add(studioId);
    const label = String(match[1] || studioId).trim().replace(/^@/, "");
    refs.push({
      label: label || studioId,
      kind: "image",
      path: `/Studio/assets/${studioId}`,
      studioId,
    });
  }
  return refs;
}

function dedupeReferences(refs: PromptReference[]): PromptReference[] {
  const seen = new Set<string>();
  const out: PromptReference[] = [];
  for (const ref of refs) {
    const id = assetIdFromReference(ref) || ref.label;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(ref);
  }
  return out;
}

export function parsePromptDocument(markdown: string): {
  body: string;
  references: PromptReference[];
} {
  const unfenced = stripOuterCodeFence(markdown);
  const working = unfenced;

  // Agent skill shape: optional title + ```text prompt ``` + References block
  const fencedPrompt = working.match(
    /```(?:text|markdown|md|prompt)?\s*\n([\s\S]*?)\n```\s*([\s\S]*)$/i,
  );
  if (fencedPrompt) {
    const after = String(fencedPrompt[2] ?? "").trim();
    if (
      /References:/i.test(after) ||
      /^##?\s*References/im.test(after) ||
      /asset:\/\//i.test(after)
    ) {
      const normalized = after.startsWith("#")
        ? `\n${after}`
        : after.startsWith("References:")
          ? `\n\n${after}`
          : `\n\n${after}`;
      const { block } = extractReferencesBlock(normalized);
      const references = dedupeReferences([
        ...collectReferencesFromBlock(block),
        ...collectInlineAssetLinks(after),
      ]);
      if (references.length) {
        return {
          body: String(fencedPrompt[1] ?? "").trim(),
          references,
        };
      }
    }
  }

  const { body, block } = extractReferencesBlock(working);
  const references = dedupeReferences([
    ...collectReferencesFromBlock(block),
    ...collectInlineAssetLinks(working),
  ]);
  return { body: body.trim(), references };
}

/** True when pasted/open text is a prompt script with durable refs. */
export function looksLikePromptScript(text: string): boolean {
  const t = String(text ?? "");
  if (!t.trim()) return false;
  if (/\n\nReferences:\n\s*-\s*@/i.test(t)) return true;
  if (/^##?\s*References\s*$/im.test(t) && /-\s*@/.test(t)) return true;
  if (/\/Studio\/assets\/[a-z0-9]+/i.test(t) && /-\s*@/.test(t)) return true;
  if (/References:\n[\s\S]*?-\s*@/i.test(t)) return true;
  // Agent scripts: ## References + markdown asset:// links (or loose asset://).
  if (/asset:\/\/[a-z0-9]+/i.test(t) && /References/i.test(t)) return true;
  if (/\[([^\]]+)\]\(\s*asset:\/\/[a-z0-9]+\s*\)/i.test(t)) return true;
  return false;
}

export function assetIdFromReference(ref: PromptReference): string | null {
  const path = String(ref?.path ?? "");
  if (/\/Studio\/elements\//i.test(path) || ref?.elementType) return null;
  const fromPath = path.match(/\/Studio\/assets\/([^/.]+)/i)?.[1];
  const studioId = String(ref?.studioId || "").trim();
  const id = String(
    fromPath || (/\/Studio\/assets\//i.test(path) ? studioId : path ? "" : studioId) || "",
  ).trim();
  return id || null;
}

export function collectAssetIdsFromReferences(refs: PromptReference[]): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const ref of refs) {
    const id = assetIdFromReference(ref);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function findAsset(assets: AssetLike[], id: string): AssetLike | null {
  if (!id) return null;
  return (
    (assets ?? []).find((asset) => asset._id === id || asset.studioId === id) ?? null
  );
}

export function referenceToAttachmentDraft(
  ref: PromptReference,
  assets: AssetLike[] = [],
): PromptAttachmentDraft | null {
  const id = assetIdFromReference(ref);
  if (!id) return null;
  const asset = findAsset(assets, id);
  const kind = String(
    asset?.kind || ref.kind || "image",
  ).toLowerCase();
  const mediaKind =
    kind === "image" || kind === "video" || kind === "audio" ? kind : "image";
  const label = String(ref.label || asset?.name || id).replace(/^@/, "");
  const ext =
    mediaKind === "image" ? ".png" : mediaKind === "video" ? ".mp4" : mediaKind === "audio" ? ".mp3" : "";
  const path =
    asset?.path ||
    ref.path ||
    `/Studio/assets/${id}${ext}`;
  return {
    id: `asset:${id}`,
    kind: mediaKind,
    label,
    path,
    displayPath: asset?.displayPath || path,
    filename: ref.filename || asset?.name || label,
    studioKind: "asset",
    studioId: id,
    mimeType: asset?.mimeType,
    thumbnailUrl: asset?.signedThumbnailUrl || asset?.thumbnailUrl,
    mediaUrl: asset?.signedReadUrl || asset?.mediaUrl,
  };
}

/**
 * Ensure sealed prompt body mentions each ref as @Label (Higgs-style),
 * without duplicating labels already present.
 */
export function ensureAtMentionsInBody(
  body: string,
  references: PromptReference[],
): string {
  let out = String(body ?? "").trim();
  const missing: string[] = [];
  for (const ref of references) {
    const label = String(ref.label || "").trim().replace(/^@/, "");
    if (!label || /[^a-zA-Z0-9_-]/.test(label)) continue;
    const re = new RegExp(`@${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
    if (!re.test(out)) missing.push(`@${label}`);
  }
  if (!missing.length) return out;
  const prefix = missing.join(" ");
  return out ? `${prefix}\n\n${out}` : prefix;
}

export function hydrateComposerFromText(
  markdown: string,
  assets: AssetLike[] = [],
): HydratedPrompt {
  const { body: rawBody, references } = parsePromptDocument(markdown);
  const body = ensureAtMentionsInBody(rawBody, references);
  const attachments: PromptAttachmentDraft[] = [];
  const seen = new Set<string>();
  for (const ref of references) {
    const draft = referenceToAttachmentDraft(ref, assets);
    if (!draft || seen.has(draft.id)) continue;
    seen.add(draft.id);
    attachments.push(draft);
  }
  const markers = attachments.map(() => OBJECT_REPLACEMENT).join("");
  const draftWithMarkers =
    markers && body ? `${markers} ${body}` : markers || body;
  return {
    body,
    references,
    draftWithMarkers,
    attachments,
    assetIds: collectAssetIdsFromReferences(references),
  };
}

/** Serialize attachments back to a References block (assets preferred). */
export function buildReferencesBlock(
  attachments: Array<{
    label?: string;
    kind?: string;
    path?: string;
    filename?: string;
    studioId?: string;
    studioKind?: string;
  }>,
): string {
  const lines = (attachments ?? [])
    .filter((item) => item.studioKind !== "element" && item.studioId)
    .map((item) => {
      const label = String(item.label || item.filename || item.studioId).replace(
        /^@/,
        "",
      );
      // Prefer agent-safe markdown links (paste + Script open).
      return `- [${label}](asset://${item.studioId})`;
    });
  if (!lines.length) return "";
  return `## References\n\n${lines.join("\n")}`;
}

export function buildPromptDocumentMarkdown(
  promptBody: string,
  attachments: Parameters<typeof buildReferencesBlock>[0],
  opts?: { title?: string; fence?: boolean },
): string {
  const asRefs: PromptReference[] = (attachments ?? [])
    .filter((item) => item.studioKind !== "element" && item.studioId)
    .map((item) => ({
      label: String(item.label || item.filename || item.studioId).replace(/^@/, ""),
      kind: String(item.kind || "image"),
      path: item.path || `/Studio/assets/${item.studioId}`,
      studioId: String(item.studioId),
    }));
  const body = ensureAtMentionsInBody(String(promptBody ?? "").trim(), asRefs);
  const refs = buildReferencesBlock(attachments);
  const fenced = opts?.fence !== false ? `\`\`\`text\n${body}\n\`\`\`` : body;
  const title = opts?.title ? `# ${opts.title}\n\n` : "";
  return `${title}${fenced}${refs ? `\n\n${refs}` : ""}\n`;
}
