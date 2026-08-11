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

export function parseReferenceLine(line: string): PromptReference | null {
  const trimmed = String(line ?? "").trim();
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

export function parsePromptDocument(markdown: string): {
  body: string;
  references: PromptReference[];
} {
  const unfenced = stripOuterCodeFence(markdown);
  let working = unfenced;

  // Agent skill shape: optional title + ```text prompt ``` + References block
  const fencedPrompt = working.match(
    /```(?:text|markdown|md|prompt)?\s*\n([\s\S]*?)\n```\s*([\s\S]*)$/i,
  );
  if (fencedPrompt) {
    const after = String(fencedPrompt[2] ?? "").trim();
    if (/References:/i.test(after) || /^##?\s*References/im.test(after)) {
      const normalized = after.startsWith("#")
        ? `\n${after}`
        : after.startsWith("References:")
          ? `\n\n${after}`
          : `\n\n${after}`;
      const { block } = extractReferencesBlock(normalized);
      const references: PromptReference[] = [];
      for (const line of block.split("\n")) {
        const ref = parseReferenceLine(line);
        if (ref) references.push(ref);
      }
      if (references.length) {
        return {
          body: String(fencedPrompt[1] ?? "").trim(),
          references,
        };
      }
    }
  }

  const { body, block } = extractReferencesBlock(working);
  const references: PromptReference[] = [];
  for (const line of block.split("\n")) {
    const ref = parseReferenceLine(line);
    if (ref) references.push(ref);
  }
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

export function hydrateComposerFromText(
  markdown: string,
  assets: AssetLike[] = [],
): HydratedPrompt {
  const { body, references } = parsePromptDocument(markdown);
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
      const path =
        item.path ||
        (item.studioId ? `/Studio/assets/${item.studioId}` : "");
      return [
        `- @${String(item.label || item.filename || item.studioId).replace(/^@/, "")}`,
        item.kind ? `kind: ${item.kind}` : "",
        path ? `path: ${path}` : "",
        item.filename ? `file: ${item.filename}` : "",
        item.studioId ? `studio: ${item.studioId}` : "",
      ]
        .filter(Boolean)
        .join(" | ");
    });
  if (!lines.length) return "";
  return `References:\n${lines.join("\n")}`;
}

export function buildPromptDocumentMarkdown(
  promptBody: string,
  attachments: Parameters<typeof buildReferencesBlock>[0],
  opts?: { title?: string; fence?: boolean },
): string {
  const body = String(promptBody ?? "").trim();
  const refs = buildReferencesBlock(attachments);
  const fenced = opts?.fence !== false ? `\`\`\`text\n${body}\n\`\`\`` : body;
  const title = opts?.title ? `# ${opts.title}\n\n` : "";
  return `${title}${fenced}${refs ? `\n\n${refs}` : ""}\n`;
}
