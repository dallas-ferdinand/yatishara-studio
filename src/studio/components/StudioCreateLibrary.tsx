"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useConvex, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Loader2, Sparkles, X } from "lucide-react";
import {
  StudioGenerationTile,
  type GenerationLibraryTile,
} from "./StudioGenerationTile";
import "./studio-create-library.css";

const PAGE_SIZE = 24;

type KindFilter = "all" | "image" | "video" | "audio";

type LightboxState = {
  url: string;
  kind: "image" | "video" | "audio";
  name: string;
};

type StudioCreateLibraryProps = {
  expiresUnix: number;
  isMobile?: boolean;
  selectedJobId?: string | null;
  onSelectTile: (tile: GenerationLibraryTile) => void;
  onOpenDetails: (tile: GenerationLibraryTile) => void;
  onUpscale?: (tile: GenerationLibraryTile) => void;
  onGenerateVideo?: (tile: GenerationLibraryTile) => void;
};

const FILTERS: Array<{ id: KindFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "image", label: "Images" },
  { id: "video", label: "Videos" },
  { id: "audio", label: "Audio" },
];

export function StudioCreateLibrary({
  expiresUnix,
  isMobile,
  selectedJobId,
  onSelectTile,
  onOpenDetails,
  onUpscale,
  onGenerateVideo,
}: StudioCreateLibraryProps) {
  const convex = useConvex();
  const [kind, setKind] = useState<KindFilter>("all");
  const [moreTiles, setMoreTiles] = useState<GenerationLibraryTile[]>([]);
  const [nextCursor, setNextCursor] = useState<number | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);

  const firstPage = useQuery(api.generationLibrary.listMyGenerations, {
    kind,
    limit: PAGE_SIZE,
    expiresUnix,
  });

  useEffect(() => {
    setMoreTiles([]);
    setNextCursor(undefined);
    setHasMore(false);
  }, [kind]);

  useEffect(() => {
    if (!firstPage) return;
    // Only sync cursor/hasMore from the first page when we haven't loaded extras yet.
    if (moreTiles.length === 0) {
      setNextCursor(firstPage.nextCursor);
      setHasMore(firstPage.hasMore);
    }
  }, [firstPage, moreTiles.length]);

  const tiles = useMemo(() => {
    const seen = new Set<string>();
    const out: GenerationLibraryTile[] = [];
    for (const tile of [...(firstPage?.tiles ?? []), ...moreTiles]) {
      if (seen.has(tile.jobId)) continue;
      seen.add(tile.jobId);
      out.push(tile as GenerationLibraryTile);
    }
    return out;
  }, [firstPage, moreTiles]);

  const loadMore = useCallback(async () => {
    if (nextCursor == null || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await convex.query(api.generationLibrary.listMyGenerations, {
        kind,
        cursor: nextCursor,
        limit: PAGE_SIZE,
        expiresUnix,
      });
      setMoreTiles((prev) => [...prev, ...(page.tiles as GenerationLibraryTile[])]);
      setNextCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } finally {
      setLoadingMore(false);
    }
  }, [convex, expiresUnix, kind, loadingMore, nextCursor]);

  const openLightbox = useCallback((tile: GenerationLibraryTile) => {
    const url = tile.playableUrl ?? tile.thumbnailUrl;
    if (!url) return;
    setLightbox({ url, kind: tile.kind, name: tile.name });
  }, []);

  useEffect(() => {
    if (!lightbox) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setLightbox(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  const loading = firstPage === undefined;

  return (
    <div className="studio-create-library">
      <div className="studio-create-library-toolbar" role="tablist" aria-label="Generation type">
        {FILTERS.map((filter) => (
          <button
            key={filter.id}
            type="button"
            role="tab"
            aria-selected={kind === filter.id}
            className={`studio-create-library-filter${kind === filter.id ? " is-active" : ""}`}
            onClick={() => setKind(filter.id)}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <div className="studio-create-library-scroll">
        {loading ? (
          <div className="studio-create-library-empty">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          </div>
        ) : tiles.length === 0 ? (
          <div className="studio-create-library-empty">
            <Sparkles className="h-6 w-6 opacity-60" aria-hidden="true" />
            <h3>Generate something</h3>
            <p>Use the composer below — new results show up here.</p>
          </div>
        ) : (
          <>
            <div className="studio-create-masonry">
              {tiles.map((tile) => (
                <div key={tile.jobId} className="studio-create-masonry-item">
                  <StudioGenerationTile
                    tile={tile}
                    selected={selectedJobId === tile.jobId}
                    isMobile={isMobile}
                    onSelect={onSelectTile}
                    onPlay={openLightbox}
                    onOpenDetails={onOpenDetails}
                    onUpscale={onUpscale}
                    onGenerateVideo={onGenerateVideo}
                  />
                </div>
              ))}
            </div>
            {hasMore ? (
              <div className="studio-create-library-more">
                <button type="button" disabled={loadingMore} onClick={() => void loadMore()}>
                  {loadingMore ? "Loading…" : "Load more"}
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>

      {lightbox && typeof document !== "undefined"
        ? createPortal(
            <div
              className="studio-gen-lightbox"
              role="dialog"
              aria-modal="true"
              aria-label={lightbox.name}
              onClick={() => setLightbox(null)}
            >
              <div
                className="studio-gen-lightbox-inner"
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  className="studio-gen-lightbox-close"
                  aria-label="Close"
                  onClick={() => setLightbox(null)}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
                {lightbox.kind === "video" ? (
                  <video src={lightbox.url} controls autoPlay playsInline />
                ) : lightbox.kind === "audio" ? (
                  <audio src={lightbox.url} controls autoPlay />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={lightbox.url} alt={lightbox.name} />
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

export type { KindFilter };
export type LibraryOpenTarget = {
  jobId: Id<"generationJobs">;
  assetId?: Id<"assets">;
};
