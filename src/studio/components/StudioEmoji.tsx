"use client";

import { useState } from "react";
import { twemojiSrc } from "@/studio/lib/twemoji";
import "./studio-emoji.css";

export function StudioEmoji({
  emoji,
  className,
}: {
  emoji: string;
  className?: string;
}) {
  const src = twemojiSrc(emoji);
  const [failed, setFailed] = useState(false);
  if (!emoji) return null;
  if (!src || failed) {
    return (
      <span className={className} aria-hidden="true">
        {emoji}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={`studio-emoji${className ? ` ${className}` : ""}`}
      src={src}
      alt=""
      draggable={false}
      aria-hidden="true"
      onError={() => setFailed(true)}
    />
  );
}
