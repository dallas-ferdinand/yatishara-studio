"use client";

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import "./media-load-frame.css";
import { LogoLoader, type LogoLoaderSize } from "./logo-loader";

export { LogoLoader, type LogoLoaderSize } from "./logo-loader";
export type MediaLoadKind = "image" | "video";

/** Placeholder aspect while media decodes — chat/gen uses landscape video. */
export type MediaLoadRatio = "square" | "image" | "video" | "video-portrait" | "fill";

type MediaLoadFrameProps = {
  kind: MediaLoadKind;
  src?: string | null;
  /**
   * Stable identity (e.g. post id). When set, a successful load stays ready
   * across remounts / signed-URL string changes for the same media.
   */
  cacheKey?: string;
  /** Fill a sized parent (profile tiles) vs reserve intrinsic ratio (chat cards). */
  ratio?: MediaLoadRatio;
  loaderSize?: LogoLoaderSize;
  className?: string;
  children: (handlers: {
    loaded: boolean;
    onLoad: (event?: SyntheticEvent) => void;
    onError: () => void;
  }) => ReactNode;
};

/** Survives remounts so preloaded feed media doesn't flash the loader again. */
const readyCacheKeys = new Set<string>();

/** Centered shared logo loader (fill parent when used as overlay). */
export function MediaLoadWave({
  className = "",
  size = "lg",
}: {
  className?: string;
  size?: LogoLoaderSize;
}) {
  return (
    <span
      className={["media-load-frame-wave", className].filter(Boolean).join(" ")}
      aria-hidden="true"
    >
      <LogoLoader size={size} />
    </span>
  );
}

export function MediaLoadFrame({
  kind,
  src,
  cacheKey,
  ratio,
  loaderSize = "lg",
  className = "",
  children,
}: MediaLoadFrameProps) {
  const identity = cacheKey || src || "";
  const [loaded, setLoaded] = useState(() => Boolean(identity && readyCacheKeys.has(identity)));
  const [failed, setFailed] = useState(false);
  const loadedSrcRef = useRef("");
  const identityRef = useRef(identity);

  if (identityRef.current !== identity) {
    identityRef.current = identity;
    loadedSrcRef.current = "";
  }

  useEffect(() => {
    if (!identity) {
      setLoaded(false);
      setFailed(false);
      return;
    }
    if (readyCacheKeys.has(identity) || (src && loadedSrcRef.current === src)) {
      setLoaded(true);
      setFailed(false);
      return;
    }
    // Same cache identity with a new signed URL — keep ready, don't flash loader.
    if (cacheKey && readyCacheKeys.has(cacheKey)) {
      setLoaded(true);
      setFailed(false);
      return;
    }
    setLoaded(false);
    setFailed(false);
  }, [identity, src, cacheKey]);

  const resolvedRatio = ratio ?? (kind === "video" ? "video" : "image");
  const showLoader = !loaded && !failed;

  function markLoaded() {
    if (src) loadedSrcRef.current = src;
    if (identity) readyCacheKeys.add(identity);
    if (cacheKey) readyCacheKeys.add(cacheKey);
    // Defer so cached <img onLoad> during commit never schedules a render-phase update (#301).
    queueMicrotask(() => {
      setLoaded((prev) => (prev ? prev : true));
      setFailed((prev) => (prev ? false : prev));
    });
  }

  return (
    <span
      className={[
        "media-load-frame",
        `is-${kind}`,
        `ratio-${resolvedRatio}`,
        loaded ? "is-ready" : "",
        failed ? "is-failed" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {showLoader ? (
        <span className="media-load-frame-placeholder" aria-hidden="true">
          <MediaLoadWave size={loaderSize} />
        </span>
      ) : null}
      {failed ? (
        <span className="media-load-frame-failure" role="img" aria-label="Media unavailable">
          Media unavailable
        </span>
      ) : null}
      {!src ? null : (
        children({
          loaded,
          onLoad: (event) => {
            const target = event?.currentTarget as
              | HTMLImageElement
              | HTMLVideoElement
              | undefined;
            if (target && "naturalWidth" in target && target.naturalWidth === 0) return;
            markLoaded();
          },
          onError: () => {
            queueMicrotask(() => {
              setFailed(true);
              setLoaded(false);
              loadedSrcRef.current = "";
              if (identity) readyCacheKeys.delete(identity);
              if (cacheKey) readyCacheKeys.delete(cacheKey);
            });
          },
        })
      )}
    </span>
  );
}
