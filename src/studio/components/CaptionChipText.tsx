"use client";

import { useState } from "react";

export type CaptionPart = {
  type: "text" | "hash" | "mention";
  value: string;
};

export type CaptionMentionMeta = {
  username: string;
  displayName?: string;
  avatarUrl?: string;
};

export function parseCaptionParts(caption: string | undefined): CaptionPart[] {
  const trimmed = caption?.trim() ?? "";
  const parts: CaptionPart[] = [];
  if (!trimmed) return parts;
  const re = /([#@][a-zA-Z0-9._]+)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(trimmed)) !== null) {
    if (match.index > last) {
      // Collapse runs of whitespace to a single normal space so chips
      // don't pick up exaggerated gaps from the source caption.
      const raw = trimmed.slice(last, match.index);
      const collapsed = raw.replace(/\s+/g, " ");
      if (collapsed.length > 0) {
        parts.push({ type: "text", value: collapsed });
      }
    }
    const token = match[1] ?? "";
    if (token.startsWith("#") && /^#[a-zA-Z0-9_]{2,32}$/.test(token)) {
      parts.push({ type: "hash", value: token.slice(1) });
    } else if (token.startsWith("@") && /^@[a-zA-Z][a-zA-Z0-9._]{2,29}$/.test(token)) {
      parts.push({ type: "mention", value: token.slice(1).toLowerCase() });
    } else {
      parts.push({ type: "text", value: token });
    }
    last = match.index + token.length;
  }
  if (last < trimmed.length) {
    const collapsed = trimmed.slice(last).replace(/\s+/g, " ");
    if (collapsed.length > 0) {
      parts.push({ type: "text", value: collapsed });
    }
  }
  return parts;
}

function OverlayHashChip({ tag }: { tag: string }) {
  return (
    <span className="post-compose-inline-chip is-hash is-on-media">
      <span className="post-compose-inline-chip-label">#{tag}</span>
    </span>
  );
}

function OverlayMentionChip({
  username,
  avatarUrl,
  displayName,
}: {
  username: string;
  avatarUrl?: string;
  displayName?: string;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const initial = (displayName || username).slice(0, 1).toUpperCase();
  const showImg = Boolean(avatarUrl) && !imgFailed;

  return (
    <span className="post-compose-inline-chip is-mention is-on-media">
      <span className="post-compose-inline-chip-avatar">
        {showImg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt=""
            decoding="async"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <span className="post-compose-inline-chip-initial">{initial}</span>
        )}
      </span>
      <span className="post-compose-inline-chip-label">{username}</span>
    </span>
  );
}

/** Renders caption text with # / @ chips for media overlays (feed + profile grid). */
export function CaptionChipText({
  caption,
  mentions,
  author,
  className,
}: {
  caption?: string;
  mentions?: CaptionMentionMeta[];
  /** Fallback avatar when the caption mentions the post author. */
  author?: CaptionMentionMeta;
  className?: string;
}) {
  const parts = parseCaptionParts(caption);
  if (parts.length === 0) return null;

  const mentionByUser = new Map(
    (mentions ?? []).map((m) => [m.username.toLowerCase(), m] as const),
  );
  if (author?.username) {
    const key = author.username.replace(/^@/, "").toLowerCase();
    const existing = mentionByUser.get(key);
    if (!existing?.avatarUrl && author.avatarUrl) {
      mentionByUser.set(key, {
        username: existing?.username || key,
        displayName: existing?.displayName || author.displayName,
        avatarUrl: author.avatarUrl,
      });
    } else if (!existing) {
      mentionByUser.set(key, {
        username: key,
        displayName: author.displayName,
        avatarUrl: author.avatarUrl,
      });
    }
  }

  return (
    <span className={`caption-chip-text${className ? ` ${className}` : ""}`}>
      {parts.map((part, index) => {
        if (part.type === "hash") {
          return <OverlayHashChip key={`h-${index}`} tag={part.value} />;
        }
        if (part.type === "mention") {
          const meta = mentionByUser.get(part.value);
          return (
            <OverlayMentionChip
              key={`m-${index}`}
              username={part.value}
              avatarUrl={meta?.avatarUrl}
              displayName={meta?.displayName}
            />
          );
        }
        // Between two chips, use a thin space so gaps match normal caption text
        // (chip padding + a full word-space reads as exaggerated).
        const prev = parts[index - 1];
        const next = parts[index + 1];
        const betweenChips =
          /^\s+$/.test(part.value) &&
          prev != null &&
          next != null &&
          prev.type !== "text" &&
          next.type !== "text";
        if (betweenChips) {
          return (
            <span key={`g-${index}`} className="caption-chip-gap">
              {"\u2009"}
            </span>
          );
        }
        return <span key={`t-${index}`}>{part.value}</span>;
      })}
    </span>
  );
}
