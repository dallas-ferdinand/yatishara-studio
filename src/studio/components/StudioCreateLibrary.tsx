"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConvex, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Loader2, Sparkles, X } from "lucide-react";
import {
  StudioGenerationTile,
  type GenerationLibraryTile,
} from "./StudioGenerationTile";
import { StudioChatAudioPlayer } from "./StudioChatAudioPlayer";
import "./studio-create-library.css";

const PAGE_SIZE = 24;

/** Match studio-create-library.css breakpoints for LTR column count. */
function columnCountForWidth(width: number): number {
  if (width >= 1500) return 5;
  if (width >= 1100) return 4;
  if (width >= 720) return 3;
  return 2;
}

function useMasonryColumnCount() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [cols, setCols] = useState(2);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const apply = () => setCols(columnCountForWidth(el.clientWidth));
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { ref, cols };
}

type LightboxState = {
  jobId: string;
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
  onCloseDetails?: () => void;
  onUpscale?: (tile: GenerationLibraryTile) => void;
  onGenerateVideo?: (tile: GenerationLibraryTile) => void;
};

function previewUrl(tile: GenerationLibraryTile): string | undefined {
  if (tile.kind === "video") {
    return tile.playableUrl || tile.thumbnailUrl;
  }
  if (tile.kind === "audio") return tile.playableUrl;
  return tile.playableUrl || tile.thumbnailUrl;
}

export function StudioCreateLibrary({
  expiresUnix,
  isMobile,
  selectedJobId,
  onSelectTile,
  onOpenDetails,
  onCloseDetails,
  onUpscale,
  onGenerateVideo,
}: StudioCreateLibraryProps) {
  const convex = useConvex();
  const [moreTiles, setMoreTiles] = useState<GenerationLibraryTile[]>([]);
  const [nextCursor, setNextCursor] = useState<number | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);

  // One masonry of all kinds — no type filter yet.
  const firstPage = useQuery(api.generationLibrary.listMyGenerations, {
    kind: "all",
    limit: PAGE_SIZE,
    expiresUnix,
  });

  useEffect(() => {
    if (!firstPage) return;
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
    out.sort((a, b) => b.createdAt - a.createdAt || b.updatedAt - a.updatedAt);
    return out;
  }, [firstPage, moreTiles]);

  const loadMore = useCallback(async () => {
    if (nextCursor == null || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await convex.query(api.generationLibrary.listMyGenerations, {
        kind: "all",
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
  }, [convex, expiresUnix, loadingMore, nextCursor]);

  const closePreview = useCallback(() => {
    setLightbox(null);
    onCloseDetails?.();
  }, [onCloseDetails]);

  const openPreview = useCallback(
    (tile: GenerationLibraryTile) => {
      onOpenDetails(tile);
      onSelectTile(tile);
      const url = previewUrl(tile);
      if (tile.stage === "done" && url) {
        setLightbox({
          jobId: tile.jobId,
          url,
          kind: tile.kind,
          name: tile.name,
        });
      } else {
        setLightbox(null);
      }
    },
    [onOpenDetails, onSelectTile],
  );

  // Sidebar closed from outside → clear lightbox too.
  useEffect(() => {
    if (!selectedJobId) setLightbox(null);
  }, [selectedJobId]);

  useEffect(() => {
    if (!lightbox) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") closePreview();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, closePreview]);

  const loading = firstPage === undefined;
  const { ref: masonryRef, cols } = useMasonryColumnCount();

  // Round-robin into columns so newest runs left→right across the top
  // (CSS columns fill top→bottom in col 1 first — wrong reading order).
  const masonryColumns = useMemo(() => {
    const columns: GenerationLibraryTile[][] = Array.from({ length: cols }, () => []);
    tiles.forEach((tile, index) => {
      columns[index % cols]!.push(tile);
    });
    return columns;
  }, [tiles, cols]);

  return (
    <div className={`studio-create-library${lightbox ? " is-previewing" : ""}`}>
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
            <div ref={masonryRef} className="studio-create-masonry">
              {masonryColumns.map((column, columnIndex) => (
                <div key={columnIndex} className="studio-create-masonry-col">
                  {column.map((tile) => (
                    <div key={tile.jobId} className="studio-create-masonry-item">
                      <StudioGenerationTile
                        tile={tile}
                        selected={selectedJobId === tile.jobId}
                        isMobile={isMobile}
                        onSelect={openPreview}
                        onPlay={openPreview}
                        onOpenDetails={openPreview}
                        onUpscale={onUpscale}
                        onGenerateVideo={onGenerateVideo}
                      />
                    </div>
                  ))}
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

      {lightbox ? (
        <div
          className="studio-gen-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={lightbox.name}
          onClick={closePreview}
        >
          <div
            className="studio-gen-lightbox-inner"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="studio-gen-lightbox-close"
              aria-label="Close preview"
              onClick={closePreview}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
            {lightbox.kind === "video" ? (
              <video src={lightbox.url} controls autoPlay playsInline />
            ) : lightbox.kind === "audio" ? (
              <div className="studio-gen-lightbox-audio">
                <StudioChatAudioPlayer
                  variant="pane"
                  src={lightbox.url}
                  title={lightbox.name}
                />
              </div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={lightbox.url} alt={lightbox.name} />
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export type LibraryOpenTarget = {
  jobId: Id<"generationJobs">;
  assetId?: Id<"assets">;
};
