// @ts-nocheck
"use client";

import { useEffect, useMemo, useState } from "react";
import { MERCURY_LOGO_SIDEBAR } from "@/lib/brand-assets";
import { isImageThumbUrl, resolveClipFilmstrip } from "./videoPoster";

const TILE_W = 28;
const MAX_FILMSTRIP_FRAMES = 16;
const LOGO_PLACEHOLDER = MERCURY_LOGO_SIDEBAR;

function LogoFilmstrip({ label, width, tileCount }) {
  const tiles = Math.max(1, tileCount);
  return (
    <div
      className="studio-editor-filmstrip studio-editor-filmstrip--logo"
      aria-hidden="true"
      title={label}
      style={{ width }}
    >
      {Array.from({ length: tiles }, (_, index) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={`logo-${index}`}
          src={LOGO_PLACEHOLDER}
          alt=""
          draggable={false}
          className="studio-editor-filmstrip-logo-tile"
        />
      ))}
    </div>
  );
}

export function ClipFilmstrip({ media, label, widthPx, trimIn = 0, trimOut = 4 }) {
  const width = Math.max(widthPx, 28);
  const tileCount = useMemo(
    () => Math.max(1, Math.min(MAX_FILMSTRIP_FRAMES, Math.ceil(width / TILE_W))),
    [width],
  );
  const [frames, setFrames] = useState([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFrames([]);
    setReady(false);

    if (!media) {
      setReady(true);
      return () => {
        cancelled = true;
      };
    }

    // Images: downscale once for the strip — never CSS-paint the full PNG.
    if (media.kind === "image") {
      void resolveClipFilmstrip(media, {
        trimIn,
        trimOut,
        count: 1,
      }).then((result) => {
        if (cancelled) return;
        setFrames(result.frames ?? []);
        setReady(true);
      });
      return () => {
        cancelled = true;
      };
    }

    // Paint CDN thumb immediately so the lane isn't blank while seeks wait
    // for idle play (and so live preview keeps the decoder).
    const instantThumb =
      (media.thumbnailUrl && isImageThumbUrl(media.thumbnailUrl) && media.thumbnailUrl) || null;
    if (instantThumb) {
      setFrames([instantThumb]);
      setReady(true);
    }

    void resolveClipFilmstrip(media, {
      trimIn,
      trimOut,
      count: tileCount,
    }).then((result) => {
      if (cancelled) return;
      const next = result.frames ?? [];
      if (next.length) {
        setFrames(next);
        setReady(true);
      } else if (!instantThumb) {
        setFrames([]);
        setReady(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    media?.assetId,
    media?.url,
    media?.proxyUrl,
    media?.proxyStatus,
    media?.thumbnailUrl,
    media?.kind,
    trimIn,
    trimOut,
    tileCount,
  ]);

  if (!ready || frames.length === 0) {
    return <LogoFilmstrip label={label} width={width} tileCount={tileCount} />;
  }

  // Stills resolve as one frame. Tile them like video (object-fit cover), never
  // CSS-repeat at 28×100% — that squashes the photo into thin strips.
  const tiles = frames.length > 1
    ? frames
    : Array.from({ length: tileCount }, () => frames[0]);

  return (
    <div className="studio-editor-filmstrip" aria-hidden="true" title={label} style={{ width }}>
      {tiles.map((src, index) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={`${index}-${String(src).slice(0, 24)}`}
          src={src}
          alt=""
          draggable={false}
          style={{ width: TILE_W, height: "100%", objectFit: "cover", flexShrink: 0 }}
        />
      ))}
    </div>
  );
}
