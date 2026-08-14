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
  sheetAsset?: {
    studioId?: string;
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

function elementMediaAsset(attachment: AttachmentLike) {
  const refs = attachment.referenceAssets ?? [];
  const live = refs.find(
    (item) => item?.kind === "image" || item?.kind === "video" || item?.kind === "audio",
  );
  if (live) return live;
  if (attachment.sheetAsset) {
    return {
      studioId: attachment.sheetAsset.studioId,
      kind: "image" as const,
      mediaUrl: attachment.sheetAsset.mediaUrl,
      thumbnailUrl: attachment.sheetAsset.thumbnailUrl,
      mimeType: attachment.sheetAsset.mimeType,
    };
  }
  return null;
}

export function elementMediaAssetId(attachment: AttachmentLike): string | undefined {
  return elementMediaAsset(attachment)?.studioId;
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
      if (!media) continue;
      const kind: SeedanceMediaKind | null =
        media.kind === "image" || media.kind === "video" || media.kind === "audio"
          ? media.kind
          : "image";
      const url = pickGenerationUrl({
        signedUrl:
          signedUrls[`element-media:${attachment.id}`] ??
          signedUrls[`element-sheet:${attachment.id}`],
        mediaUrl: media.mediaUrl,
      });
      if (!url) continue;
      referenceInputs.push({
        kind,
        url,
        mimeType: media.mimeType ?? attachment.mimeType,
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
