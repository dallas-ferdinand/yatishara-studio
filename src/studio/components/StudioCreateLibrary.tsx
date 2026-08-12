"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useConvex, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Loader2, Sparkles } from "lucide-react";
import {
  StudioGenerationTile,
  type GenerationLibraryTile,
} from "./StudioGenerationTile";
import { StudioChatAudioPlayer } from "./StudioChatAudioPlayer";
import { orbSeedForVoice } from "./StudioOrbPlayButton";
import { DeskMediaPlayer } from "@/desk/components/DeskMediaPlayer";
import "./studio-create-library.css";

const ImageZoomViewer = dynamic(
  () => import("@/desk/components/ImageZoomViewer").then((m) => m.ImageZoomViewer),
  { ssr: false },
);

const PAGE_SIZE = 24;

/** Desktop Create library is always 3 columns; mobile stays 2 (or 1 when very narrow). */
function columnCountForWidth(width: number, isMobile?: boolean): number {
  if (isMobile) {
    if (width >= 420) return 2;
    return 1;
  }
  return 3;
}

function useMasonryColumnCount(isMobile?: boolean) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [cols, setCols] = useState(isMobile ? 2 : 3);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const apply = () => setCols(columnCountForWidth(el.clientWidth, isMobile));
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isMobile]);

  return { ref, cols };
}

type LightboxState = {
  jobId: string;
  url?: string;
  thumbUrl?: string;
  kind: "image" | "video" | "audio";
  name: string;
  durationSeconds?: number;
  loading?: boolean;
};

type StudioCreateLibraryProps = {
  expiresUnix: number;
  isMobile?: boolean;
  selectedJobId?: string | null;
  /** Fullscreen lightbox — separate from sidebar selection. */
  previewJobId?: string | null;
  onSelectTile: (tile: GenerationLibraryTile) => void;
  onOpenDetails: (tile: GenerationLibraryTile) => void;
  onOpenPreview: (tile: GenerationLibraryTile) => void;
  onCloseDetails?: () => void;
  onClosePreview?: () => void;
  onUpscale?: (tile: GenerationLibraryTile) => void;
  onGenerateVideo?: (tile: GenerationLibraryTile) => void;
};

function previewUrl(tile: GenerationLibraryTile): string | undefined {
  // Prefer full playable URL so lightbox isn't stuck on a tiny thumb.
  if (tile.kind === "audio") return tile.playableUrl;
  return tile.playableUrl || tile.thumbnailUrl;
}

export function StudioCreateLibrary({
  expiresUnix,
  isMobile,
  selectedJobId,
  previewJobId = null,
  onSelectTile,
  onOpenDetails,
  onOpenPreview,
  onCloseDetails,
  onClosePreview,
  onUpscale,
  onGenerateVideo,
}: StudioCreateLibraryProps) {
  const convex = useConvex();
  const [moreTiles, setMoreTiles] = useState<GenerationLibraryTile[]>([]);
  const [nextCursor, setNextCursor] = useState<number | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // One masonry of all kinds — no type filter yet.
  const firstPage = useQuery(api.generationLibrary.listMyGenerations, {
    kind: "all",
    limit: PAGE_SIZE,
    expiresUnix,
  });

  // Derive media from selected/preview job so preview survives PanelGroup remount
  // when the detail sidebar first opens (local lightbox state was wiped).
  const lightboxJobId = previewJobId || null;
  const lightboxDetail = useQuery(
    api.generationLibrary.getGenerationDetail,
    lightboxJobId
      ? {
          jobId: lightboxJobId as Id<"generationJobs">,
          expiresUnix,
        }
      : "skip",
  );

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
    onClosePreview?.();
  }, [onClosePreview]);

  const selectTile = useCallback(
    (tile: GenerationLibraryTile) => {
      onSelectTile(tile);
      onOpenDetails(tile);
    },
    [onOpenDetails, onSelectTile],
  );

  const openPreview = useCallback(
    (tile: GenerationLibraryTile) => {
      onOpenPreview(tile);
    },
    [onOpenPreview],
  );

  const lightbox = useMemo((): LightboxState | null => {
    if (!lightboxJobId) return null;
    const tile = tiles.find((t) => t.jobId === lightboxJobId);
    const detailReady =
      lightboxDetail &&
      lightboxDetail !== null &&
      lightboxDetail.jobId === lightboxJobId
        ? lightboxDetail
        : undefined;
    const kind = (detailReady?.kind || tile?.kind) as
      | "image"
      | "video"
      | "audio"
      | undefined;
    const name = detailReady?.name || tile?.name || "Generation";
    const stage = detailReady?.stage || tile?.stage;
    if (stage && stage !== "done") return null;

    const thumbUrl = detailReady?.thumbnailUrl || tile?.thumbnailUrl;
    const url =
      detailReady?.playableUrl ||
      (tile ? previewUrl(tile) : undefined) ||
      thumbUrl;

    if (!kind) {
      return { jobId: lightboxJobId, name, kind: "image", loading: true };
    }
    if (!url && !thumbUrl) {
      return { jobId: lightboxJobId, kind, name, loading: true };
    }
    const durationSeconds =
      detailReady?.durationSeconds ?? tile?.durationSeconds;
    return {
      jobId: lightboxJobId,
      url,
      thumbUrl,
      kind,
      name,
      ...(durationSeconds != null ? { durationSeconds } : {}),
    };
  }, [lightboxJobId, tiles, lightboxDetail]);

  useEffect(() => {
    if (!lightbox) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") closePreview();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, closePreview]);

  const downloadLightbox = useCallback(() => {
    if (!lightbox?.url) return;
    const a = document.createElement("a");
    a.href = lightbox.url;
    a.download = lightbox.name || "download";
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.click();
  }, [lightbox]);

  const loading = firstPage === undefined;
  const { ref: masonryRef, cols } = useMasonryColumnCount(isMobile);

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
                        onSelect={selectTile}
                        onPlay={openPreview}
                        onOpenDetails={selectTile}
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
          className="studio-gen-lightbox studio-asset-preview"
          role="dialog"
          aria-modal="true"
          aria-label={lightbox.name}
        >
          {lightbox.loading || (!lightbox.url && !lightbox.thumbUrl) ? (
            <div className="studio-gen-lightbox-loading">
              <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
            </div>
          ) : lightbox.kind === "video" && lightbox.url ? (
            <DeskMediaPlayer
              kind="video"
              layout="studio-preview"
              src={lightbox.url}
              poster={lightbox.thumbUrl}
              onDownload={downloadLightbox}
            />
          ) : lightbox.kind === "audio" && lightbox.url ? (
            <div className="studio-gen-lightbox-audio">
              <StudioChatAudioPlayer
                src={lightbox.url}
                title={lightbox.name}
                variant="pane"
                compact
                durationHint={lightbox.durationSeconds}
                orbSeed={orbSeedForVoice(lightbox.jobId, lightbox.name)}
              />
            </div>
          ) : (
            <ImageZoomViewer
              thumbUrl={lightbox.thumbUrl || lightbox.url}
              fullUrl={lightbox.url || lightbox.thumbUrl}
              onDownload={downloadLightbox}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}

export type LibraryOpenTarget = {
  jobId: Id<"generationJobs">;
  assetId?: Id<"assets">;
};
