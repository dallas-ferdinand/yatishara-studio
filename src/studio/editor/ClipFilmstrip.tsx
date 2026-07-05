// @ts-nocheck
"use client";

import { useEffect, useState } from "react";
import { resolveClipPoster } from "./videoPoster";

export function ClipFilmstrip({ media, label, widthPx }) {
  const [poster, setPoster] = useState(null);
  const tileW = 44;
  const count = Math.max(1, Math.ceil(Math.max(widthPx, 28) / tileW));

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
      <div className="studio-editor-filmstrip" aria-hidden="true">
        {Array.from({ length: count }, (_, index) => (
          <img key={index} src={poster} alt="" draggable={false} loading="lazy" />
        ))}
      </div>
    );
  }

  if (media?.kind === "video" && media.url) {
    return (
      <video
        className="studio-editor-filmstrip-video"
        src={media.url}
        muted
        playsInline
        preload="metadata"
        aria-hidden="true"
      />
    );
  }

  return <span className="studio-editor-clip-label">{label}</span>;
}
