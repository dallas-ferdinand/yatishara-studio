import { isBunnyOptimizedUrl } from "./mediaUrls";
import {
  composerAssetTag,
  elementStemFromDisplayName,
  orderKindsForSeedance,
  type SeedanceMediaKind,
} from "./seedanceReferences";

export { isBunnyOptimizedUrl };

export type GenerationRefInput = {
  kind: SeedanceMediaKind;
  url: string;
  mimeType?: string;
  tag?: string;
};

function isHttpUrl(url: string | null | undefined): url is string {
  return typeof url === "string" && /^https?:\/\//i.test(url);
}

/** URLs Seedance/Ark can fetch. Never Bunny thumbs/previews. Never blob:. */
export function pickGenerationUrl(args: {
  signedUrl?: string | null;
  mediaUrl?: string | null;
  thumbnailUrl?: string | null;
}): string | undefined {
  for (const candidate of [args.signedUrl, args.mediaUrl]) {
    if (!isHttpUrl(candidate)) continue;
    if (isBunnyOptimizedUrl(candidate)) continue;
    return candidate;
  }
  return undefined;
}

export function attachmentComposerTag(attachment: {
  studioKind?: string;
  label?: string;
  filename?: string;
}): string {
  if (attachment.studioKind === "element") {
    return elementStemFromDisplayName(attachment.label || attachment.filename || "element");
  }
  return composerAssetTag(attachment.filename || attachment.label || "file");
}

type AttachmentLike = {
  id?: string;
  kind?: string;
  mediaKind?: string;
  studioKind?: string;
  studioId?: string;
  label?: string;
  filename?: string;
  mimeType?: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  elementType?: string;
  sheetAssetId?: string;
  referenceAssetIds?: string[];
  sourceAssetIds?: string[];
  sheetAsset?: {
    studioId?: string;
    kind?: string;
    mediaUrl?: string;
    thumbnailUrl?: string;
    mimeType?: string;
  };
  referenceAssets?: Array<{
    studioId?: string;
    kind?: string;
    mediaUrl?: string;
    thumbnailUrl?: string;
    mimeType?: string;
  }>;
};

function asMediaKind(kind?: string | null): SeedanceMediaKind | null {
  return kind === "image" || kind === "video" || kind === "audio" ? kind : null;
}

/** Image / video / audio the composer and Seedance should treat this attachment as. */
export function attachmentLiveMediaKind(attachment: AttachmentLike): SeedanceMediaKind | null {
  if (attachment.studioKind === "element") {
    return asMediaKind(elementMediaAsset(attachment)?.kind) ?? asMediaKind(attachment.mediaKind);
  }
  return asMediaKind(attachment.kind) ?? asMediaKind(attachment.mediaKind);
}

function elementMediaAsset(attachment: AttachmentLike) {
  const refs = attachment.referenceAssets ?? [];
  const live = refs.find(
    (item) => item?.kind === "image" || item?.kind === "video" || item?.kind === "audio",
  );
  if (live) return live;
  if (attachment.sheetAsset) {
    return {
      studioId: attachment.sheetAsset.studioId,
      kind: (asMediaKind(attachment.sheetAsset.kind) ?? "image") as SeedanceMediaKind,
      mediaUrl: attachment.sheetAsset.mediaUrl,
      thumbnailUrl: attachment.sheetAsset.thumbnailUrl,
      mimeType: attachment.sheetAsset.mimeType,
    };
  }
  return null;
}

export function elementMediaAssetId(attachment: AttachmentLike): string | undefined {
  const fromLive = elementMediaAsset(attachment)?.studioId;
  if (fromLive) return fromLive;
  const ids = attachment.referenceAssetIds ?? attachment.sourceAssetIds ?? [];
  if (ids.length) return ids[0];
  return attachment.sheetAssetId ?? attachment.sheetAsset?.studioId;
}

/** Composer rail / chip thumb — elements use nested media when top-level URLs are empty. */
export function attachmentChipPreviewUrl(
  attachment: AttachmentLike | null | undefined,
): string | undefined {
  if (!attachment) return undefined;
  const liveKind = attachmentLiveMediaKind(attachment) ?? asMediaKind(attachment.kind);
  const media = elementMediaAsset(attachment);
  const candidates = [
    attachment.thumbnailUrl,
    media?.thumbnailUrl,
    attachment.sheetAsset?.thumbnailUrl,
    liveKind === "image" || liveKind === "video" || attachment.studioKind === "element"
      ? attachment.mediaUrl
      : undefined,
    liveKind === "image" || liveKind === "video" || attachment.studioKind === "element"
      ? media?.mediaUrl
      : undefined,
    attachment.sheetAsset?.mediaUrl,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }
  return undefined;
}

/** True when the Create chip should render as an image-only media square. */
export function attachmentShowsImageOnlyChip(
  attachment: AttachmentLike | null | undefined,
): boolean {
  if (!attachment) return false;
  if (!attachmentChipPreviewUrl(attachment)) return false;
  const liveKind = attachmentLiveMediaKind(attachment) ?? asMediaKind(attachment.kind);
  if (liveKind === "image" || liveKind === "video") return true;
  // Elements often store kind:"context" — still show the media square when we have a thumb.
  return attachment.studioKind === "element";
}

/**
 * Build Seedance referenceInputs: images, then videos, then audio.
 * Skips thumbs. Character/prop/location all send their real media file.
 */
export function splitVideoGenerationInputs(
  attachments: AttachmentLike[],
  signedUrls: Record<string, string | null | undefined> = {},
): { referenceInputs: GenerationRefInput[] } {
  const referenceInputs: GenerationRefInput[] = [];
  for (const attachment of attachments ?? []) {
    if (attachment.studioKind === "element") {
      const media = elementMediaAsset(attachment);
      const kind: SeedanceMediaKind =
        attachmentLiveMediaKind(attachment) ??
        (asMediaKind(media?.kind) ?? "image");
      const url = pickGenerationUrl({
        signedUrl:
          signedUrls[`element-media:${attachment.id}`] ??
          signedUrls[`element-sheet:${attachment.id}`],
        mediaUrl: media?.mediaUrl,
      });
      if (!url) continue;
      referenceInputs.push({
        kind,
        url,
        mimeType: media?.mimeType ?? attachment.mimeType,
        tag: attachmentComposerTag(attachment),
      });
      continue;
    }
    const kind = attachment.kind;
    if (kind !== "image" && kind !== "video" && kind !== "audio") continue;
    const url = pickGenerationUrl({
      signedUrl: signedUrls[`attachment:${attachment.id}`],
      mediaUrl: attachment.mediaUrl,
    });
    if (!url) continue;
    referenceInputs.push({
      kind,
      url,
      mimeType: attachment.mimeType,
      tag: attachmentComposerTag(attachment),
    });
  }
  return { referenceInputs: orderKindsForSeedance(referenceInputs) };
}

export function generationReferenceInputs(
  attachments: AttachmentLike[],
  signedUrls: Record<string, string | null | undefined> = {},
): GenerationRefInput[] {
  return splitVideoGenerationInputs(attachments, signedUrls).referenceInputs;
}

const SIGN_RETRY_MS = 400;
const SIGN_RETRY_ATTEMPTS = 4;

async function fetchSignedOriginal(
  fetchSigned: (
    assetId: string,
    kind: SeedanceMediaKind,
  ) => Promise<string | null | undefined>,
  assetId: string,
  kind: SeedanceMediaKind,
): Promise<string | null> {
  for (let attempt = 0; attempt < SIGN_RETRY_ATTEMPTS; attempt++) {
    const url = await fetchSigned(assetId, kind);
    if (typeof url === "string" && /^https?:\/\//i.test(url)) return url;
    if (attempt < SIGN_RETRY_ATTEMPTS - 1) {
      await new Promise((resolve) => setTimeout(resolve, SIGN_RETRY_MS));
    }
  }
  return null;
}

/** Fill missing signed originals at send time so a just-attached element/asset can generate. */
export async function resolveGenerationReferenceInputs(
  attachments: AttachmentLike[],
  signedUrls: Record<string, string | null | undefined> = {},
  fetchSigned: (
    assetId: string,
    kind: SeedanceMediaKind,
  ) => Promise<string | null | undefined>,
): Promise<GenerationRefInput[]> {
  const ready = splitVideoGenerationInputs(attachments, signedUrls).referenceInputs;
  const wantsMedia = (attachments ?? []).some(
    (item) =>
      item.kind === "image" ||
      item.kind === "video" ||
      item.kind === "audio" ||
      item.studioKind === "element",
  );
  if (!wantsMedia || ready.length) return ready;

  const next: Record<string, string | null | undefined> = { ...signedUrls };
  for (const attachment of attachments ?? []) {
    const already = splitVideoGenerationInputs([attachment], next).referenceInputs;
    if (already.length) continue;
    const kind = attachmentLiveMediaKind(attachment) ?? "image";
    const assetId =
      attachment.studioKind === "element"
        ? elementMediaAssetId(attachment)
        : attachment.studioId;
    if (!assetId) continue;
    const url = await fetchSignedOriginal(fetchSigned, assetId, kind);
    if (!url) continue;
    const key =
      attachment.studioKind === "element"
        ? `element-media:${attachment.id}`
        : `attachment:${attachment.id}`;
    next[key] = url;
  }
  return splitVideoGenerationInputs(attachments, next).referenceInputs;
}

export function tooSmallSeedanceImageMessage(attachment: {
  kind?: string;
  width?: number;
  height?: number;
}): string | null {
  if (attachment.kind !== "image") return null;
  const width = Number(attachment.width) || 0;
  const height = Number(attachment.height) || 0;
  if (width > 0 && width < 300) {
    return `Seedance needs images at least 300×300. That file was ${width}×${height || width}. Attach the original, not a thumbnail.`;
  }
  if (height > 0 && height < 300) {
    return `Seedance needs images at least 300×300. That file was ${width || height}×${height}. Attach the original, not a thumbnail.`;
  }
  return null;
}
