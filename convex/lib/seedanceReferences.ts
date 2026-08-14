/**
 * Seedance 2.0 / 2.5 reference tags. Keep in sync with
 * `src/studio/lib/seedanceReferences.ts`.
 */

export type SeedanceMediaKind = "image" | "video" | "audio";

export type SeedanceSlot = {
  kind: SeedanceMediaKind;
  aliases: string[];
};

const KIND_NOUN: Record<SeedanceMediaKind, string> = {
  image: "Image",
  video: "Video",
  audio: "Audio",
};

export const SEEDANCE_MIN_IMAGE_PX = 300;

export function seedanceSlotTag(kind: SeedanceMediaKind, index1: number): string {
  return `@${KIND_NOUN[kind]} ${index1}`;
}

export function slugComposerTag(raw: string): string {
  const trimmed = String(raw ?? "")
    .trim()
    .replace(/^@+/, "");
  const slug = trimmed
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]+/g, "")
    .replace(/-+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "");
  return slug || "ref";
}

export function composerElementTag(name: string): string {
  return slugComposerTag(name).toLowerCase();
}

/** Stored element id / @tag from a Files name (`untitled.element`, `@Foo Bar`). */
export function elementStemFromDisplayName(name: string): string {
  return composerElementTag(String(name ?? "").replace(/\.element$/i, ""));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeOfficialSeedanceTags(prompt: string): string {
  return String(prompt ?? "").replace(
    /@(image|video|audio)\s*(\d+)/gi,
    (_, kind: string, n: string) => {
      const noun = KIND_NOUN[kind.toLowerCase() as SeedanceMediaKind];
      return `@${noun} ${Number(n)}`;
    },
  );
}

export function remapPromptToSeedanceSlots(
  prompt: string,
  slots: SeedanceSlot[],
): string {
  let text = normalizeOfficialSeedanceTags(prompt);
  if (!slots.length) return text;

  const counts: Record<SeedanceMediaKind, number> = {
    image: 0,
    video: 0,
    audio: 0,
  };
  const pairs: Array<{ alias: string; official: string }> = [];

  for (const slot of slots) {
    counts[slot.kind] += 1;
    const official = seedanceSlotTag(slot.kind, counts[slot.kind]);
    const aliases = [
      ...new Set(
        (slot.aliases ?? [])
          .map((alias) => slugComposerTag(alias))
          .filter((alias) => alias && alias.toLowerCase() !== "ref"),
      ),
    ];
    for (const alias of aliases) {
      if (normalizeOfficialSeedanceTags(`@${alias}`) === official) continue;
      pairs.push({ alias, official });
    }
  }

  pairs.sort((a, b) => b.alias.length - a.alias.length);
  for (const { alias, official } of pairs) {
    const re = new RegExp(`@${escapeRegExp(alias)}\\b`, "gi");
    text = text.replace(re, official);
  }

  return normalizeOfficialSeedanceTags(text);
}

export function orderKindsForSeedance<T extends { kind?: string }>(
  items: T[],
): T[] {
  const rank = (kind?: string) =>
    kind === "image" ? 0 : kind === "video" ? 1 : kind === "audio" ? 2 : 3;
  return [...items].sort((a, b) => rank(a.kind) - rank(b.kind));
}

export function slotsFromReferenceInputs(
  inputs: Array<{ kind: string; tag?: string }>,
): SeedanceSlot[] {
  return orderKindsForSeedance(
    inputs.filter(
      (input): input is { kind: SeedanceMediaKind; tag?: string } =>
        input.kind === "image" || input.kind === "video" || input.kind === "audio",
    ),
  ).map((input) => ({
    kind: input.kind,
    aliases: input.tag ? [input.tag] : [],
  }));
}

/** Bunny Optimizer thumbs (width=225 peek, etc.) — Ark cannot use these. */
export function isThumbGenerationUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== "string") return true;
  if (!/^https?:\/\//i.test(url)) return true;
  try {
    const parsed = new URL(url);
    const width = Number(parsed.searchParams.get("width") || 0);
    if (width > 0 && width < SEEDANCE_MIN_IMAGE_PX) return true;
    const quality = Number(parsed.searchParams.get("quality") || 0);
    if (width > 0 && width <= 1280 && quality > 0 && quality < 95) return true;
    return false;
  } catch {
    return true;
  }
}

export function assertSeedanceFetchableUrl(url: string, kind: string): void {
  if (!url || !/^https?:\/\//i.test(url)) {
    throw new Error(
      `Reference ${kind} must be the original file (HTTPS), not a local preview.`,
    );
  }
  if (kind === "image" && isThumbGenerationUrl(url)) {
    throw new Error(
      `Seedance needs images at least ${SEEDANCE_MIN_IMAGE_PX}×${SEEDANCE_MIN_IMAGE_PX}. Attach the original file, not a thumbnail.`,
    );
  }
}

export function prepareSeedanceMedia(
  prompt: string,
  references: Array<{ kind: string; url: string; tag?: string }>,
): {
  prompt: string;
  referenceImageUrls: string[];
  referenceVideoUrls: string[];
  referenceAudioUrls: string[];
} {
  const ordered = orderKindsForSeedance(
    references.filter(
      (input): input is { kind: SeedanceMediaKind; url: string; tag?: string } =>
        input.kind === "image" || input.kind === "video" || input.kind === "audio",
    ),
  );
  for (const input of ordered) {
    assertSeedanceFetchableUrl(input.url, input.kind);
  }
  return {
    prompt: remapPromptToSeedanceSlots(prompt, slotsFromReferenceInputs(ordered)),
    referenceImageUrls: ordered
      .filter((input) => input.kind === "image")
      .map((input) => input.url),
    referenceVideoUrls: ordered
      .filter((input) => input.kind === "video")
      .map((input) => input.url),
    referenceAudioUrls: ordered
      .filter((input) => input.kind === "audio")
      .map((input) => input.url),
  };
}
