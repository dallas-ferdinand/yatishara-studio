/** Twemoji (jdecked fork) filenames — CC-BY 4.0. Same mapping as twemoji.convert. */

import { REACTION_EMOJIS } from "./itemReactions";

const TWEMOJI_DIR = "/emoji/twemoji";

export function toTwemojiCode(emoji: string): string {
  const raw = String(emoji ?? "");
  const stripped = raw.includes("\u200D") ? raw : raw.replace(/\uFE0F/g, "");
  const codes: string[] = [];
  let lead = 0;
  for (let i = 0; i < stripped.length; i += 1) {
    const c = stripped.charCodeAt(i);
    if (lead) {
      codes.push(
        (0x10000 + ((lead - 0xd800) << 10) + (c - 0xdc00)).toString(16),
      );
      lead = 0;
    } else if (c >= 0xd800 && c <= 0xdbff) {
      lead = c;
    } else {
      codes.push(c.toString(16));
    }
  }
  return codes.join("-");
}

const LOCAL_CODES = new Set(REACTION_EMOJIS.map(toTwemojiCode));

export function twemojiSrc(emoji: string): string {
  const code = toTwemojiCode(emoji);
  if (!code || !LOCAL_CODES.has(code)) return "";
  return `${TWEMOJI_DIR}/${code}.svg`;
}
