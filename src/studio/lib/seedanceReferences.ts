/**
 * Seedance 2.0 / 2.5 reference tags.
 *
 * BytePlus Ark matches prompt mentions to the content array in type order:
 * images, then videos, then audio. Official PE skill uses `@Image 1`, `@Video 1`.
 * Studio shows friendly chips (`@product-shot`, `@headphones.jpeg`); we remap
 * at submit so the model sees the official slots.
 */

export type SeedanceMediaKind = "image" | "video" | "audio";

export type SeedanceSlot = {
  kind: SeedanceMediaKind;
  /** Display names without @ (filename, element id, prior @Image1, …). */
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

export function composerAssetTag(filename: string): string {
  return slugComposerTag(filename);
}

export function composerElementTag(name: string): string {
  return slugComposerTag(name).toLowerCase();
}

/** Stored element id / @tag from a Files name (`untitled.element`, `@Foo Bar`). */
export function elementStemFromDisplayName(name: string): string {
  return composerElementTag(String(name ?? "").replace(/\.element$/i, ""));
}

export function elementFileName(stem: string): string {
  const id = elementStemFromDisplayName(stem);
  return `${!id || id === "ref" ? "untitled" : id}.element`;
}

/** Hyphen unique ids — never `untitled 2.element`. */
export function uniqueElementStem(
  taken: Iterable<string>,
  base = "untitled",
): string {
  const used = new Set<string>();
  for (const item of taken) {
    const stem = elementStemFromDisplayName(item);
    if (stem && stem !== "ref") used.add(stem);
  }
  const raw = elementStemFromDisplayName(base);
  const seed = !raw || raw === "ref" ? "untitled" : raw;
  if (!used.has(seed)) return seed;
  for (let n = 2; n < 500; n += 1) {
    const next = `${seed}-${n}`;
    if (!used.has(next)) return next;
  }
  return `${seed}-${Date.now()}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Compact `@image1` / spaced `@Image 1` → canonical `@Image 1`. */
export function normalizeOfficialSeedanceTags(prompt: string): string {
  return String(prompt ?? "").replace(
    /@(image|video|audio)\s*(\d+)/gi,
    (_, kind: string, n: string) => {
      const noun = KIND_NOUN[kind.toLowerCase() as SeedanceMediaKind];
      return `@${noun} ${Number(n)}`;
    },
  );
}

/**
 * Replace friendly `@tags` with `@Image 1` / `@Video 1` / `@Audio 1`
 * in the same order the Ark content array will receive media
 * (images, then videos, then audio).
 */
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
