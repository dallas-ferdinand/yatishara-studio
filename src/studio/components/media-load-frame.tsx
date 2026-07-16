"use client";

import { Loader2 } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import "./media-load-frame.css";

export type MediaLoadKind = "image" | "video";

/** Placeholder aspect while media decodes — chat/gen uses landscape video. */
export type MediaLoadRatio = "square" | "image" | "video" | "video-portrait" | "fill";

type MediaLoadFrameProps = {
  kind: MediaLoadKind;
  src?: string | null;
  /** Fill a sized parent (profile tiles) vs reserve intrinsic ratio (chat cards). */
  ratio?: MediaLoadRatio;
  className?: string;
  children: (handlers: {
    loaded: boolean;
    onLoad: (event?: SyntheticEvent) => void;
    onError: () => void;
  }) => ReactNode;
};

export function MediaLoadFrame({
  kind,
  src,
  ratio,
  className = "",
  children,
}: MediaLoadFrameProps) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const loadedSrcRef = useRef("");

  useEffect(() => {
    if (src && loadedSrcRef.current === src) {
      setLoaded(true);
      setFailed(false);
      return;
    }
    setLoaded(false);
    setFailed(false);
  }, [src]);

  const resolvedRatio = ratio ?? (kind === "video" ? "video" : "image");
  const showSpinner = !loaded && !failed;

  function markLoaded() {
    if (src) loadedSrcRef.current = src;
    setLoaded(true);
    setFailed(false);
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
      {showSpinner ? (
        <span className="media-load-frame-placeholder" aria-hidden="true">
          <Loader2 className="media-load-frame-spinner" />
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
            setFailed(true);
            setLoaded(false);
            loadedSrcRef.current = "";
          },
        })
      )}
    </span>
  );
}
