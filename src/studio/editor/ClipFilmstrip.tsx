// @ts-nocheck
"use client";

import { useEffect, useState } from "react";
import { resolveClipPoster } from "./videoPoster";

export function ClipFilmstrip({ media, label, widthPx }) {
  const [poster, setPoster] = useState(null);
  // One CSS-repeated tile instead of N <img> nodes per clip width.
  const tileW = 44;

  useEffect(() => {
    let cancelled = false;
    setPoster(null);
    void resolveClipPoster(media).then((url) => {
      if (!cancelled) setPoster(url);
    });
    return () => {
      cancelled = true;
    };
  }, [media?.assetId, media?.url, media?.thumbnailUrl, media?.kind]);

  if (poster) {
    return (
      <div
        className="studio-editor-filmstrip studio-editor-filmstrip--css"
        aria-hidden="true"
        title={label}
        style={{
          backgroundImage: `url("${poster}")`,
          backgroundSize: `${tileW}px 100%`,
          backgroundRepeat: "repeat-x",
          width: Math.max(widthPx, 28),
        }}
      />
    );
  }

  if (media?.kind === "video" && media.thumbnailUrl) {
    return (
      <div
        className="studio-editor-filmstrip studio-editor-filmstrip--css"
        aria-hidden="true"
        style={{
          backgroundImage: `url("${media.thumbnailUrl}")`,
          backgroundSize: `${tileW}px 100%`,
          backgroundRepeat: "repeat-x",
          width: Math.max(widthPx, 28),
        }}
      />
    );
  }

  return <div className="studio-editor-filmstrip-empty" aria-hidden="true" />;
}
