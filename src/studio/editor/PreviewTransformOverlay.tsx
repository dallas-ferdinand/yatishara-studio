"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { RotateCw } from "lucide-react";
import {
  contentRectForTransform,
  normalizeClipTransform,
  overlaySourceSize,
  resolveFitMode,
  type ClipTransform,
} from "./clipTransform";
import {
  TRANSFORM_HIT_PAD_PX,
  overlayRectStyle,
} from "./transformHit";
import type { SnapGuides } from "./canvasTransformGesture";
import type { EditorClip, EditorMediaItem } from "./types";
import type {
  LivePreviewChrome,
  TransformChromeHandle,
} from "./PreviewPointerRouter";
import type { PaintedSceneHit } from "./previewScene";

type PreviewTransformOverlayProps = {
  clip: EditorClip;
  media?: EditorMediaItem;
  decodedWidth?: number;
  decodedHeight?: number;
  canvasWidth: number;
  canvasHeight: number;
  paintedRect?: PaintedSceneHit | null;
  selected: boolean;
  playing: boolean;
  liveChromeRef: RefObject<LivePreviewChrome | null>;
};

export const PreviewTransformOverlay = forwardRef<
  TransformChromeHandle,
  PreviewTransformOverlayProps
>(function PreviewTransformOverlay(
  {
    clip,
    media,
    decodedWidth,
    decodedHeight,
    canvasWidth,
    canvasHeight,
    paintedRect,
    selected,
    playing,
    liveChromeRef,
  },
  ref,
) {
  const hitRef = useRef<HTMLDivElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const badgeRef = useRef<HTMLSpanElement | null>(null);
  const guidesRef = useRef<SnapGuides>({ x: null, y: null });
  const [guides, setGuides] = useState<SnapGuides>({ x: null, y: null });
  const [livePose, setLivePose] = useState<ClipTransform | null>(null);
  const draggingRef = useRef(false);

  const transform = normalizeClipTransform(clip.effects);
  const display = livePose ?? transform;
  const isStill = clip.kind === "image" || media?.kind === "image";
  const source = overlaySourceSize(
    { width: decodedWidth, height: decodedHeight },
    isStill ? null : media,
  ) ??
    (canvasWidth > 1 && canvasHeight > 1
      ? { width: canvasWidth, height: canvasHeight }
      : null);
  const sourceW = source?.width ?? 0;
  const sourceH = source?.height ?? 0;
  const fitMode = resolveFitMode(clip.effects, clip.kind);
  const computed = source
    ? contentRectForTransform(
        display,
        canvasWidth,
        canvasHeight,
        source.width,
        source.height,
        fitMode,
      )
    : null;
  const rect =
    livePose && computed
      ? computed
      : paintedRect
        ? {
            left: paintedRect.left,
            top: paintedRect.top,
            width: paintedRect.width,
            height: paintedRect.height,
          }
        : computed;

  const latestRef = useRef({
    canvasWidth,
    canvasHeight,
    sourceW,
    sourceH,
    fitMode,
    clipId: clip.id,
  });
  latestRef.current = {
    canvasWidth,
    canvasHeight,
    sourceW,
    sourceH,
    fitMode,
    clipId: clip.id,
  };

  const applyBoxImmediately = (next: ClipTransform) => {
    const latest = latestRef.current;
    if (latest.sourceW < 2 || latest.sourceH < 2) return;
    const nextRect = contentRectForTransform(
      next,
      latest.canvasWidth,
      latest.canvasHeight,
      latest.sourceW,
      latest.sourceH,
      latest.fitMode,
    );
    const box = boxRef.current;
    if (box) {
      Object.assign(box.style, overlayRectStyle(nextRect, next.rotation));
    }
    const hit = hitRef.current;
    if (hit) {
      Object.assign(
        hit.style,
        overlayRectStyle(nextRect, next.rotation, TRANSFORM_HIT_PAD_PX),
      );
    }
    if (badgeRef.current) {
      badgeRef.current.textContent =
        Math.abs(next.rotation) > 0.5
          ? `${Math.round(next.rotation)}°`
          : `${Math.round(next.scale * 100)}%`;
    }
  };

  const applyGuidesImmediately = (next: SnapGuides) => {
    const prev = guidesRef.current;
    if (prev.x === next.x && prev.y === next.y) return;
    guidesRef.current = next;
    setGuides(next);
  };

  useImperativeHandle(ref, () => ({
    setPose: (next, nextGuides) => {
      setLivePose(next);
      applyBoxImmediately(next);
      if (nextGuides) applyGuidesImmediately(nextGuides);
    },
    setDragging: (dragging) => {
      draggingRef.current = dragging;
      boxRef.current?.classList.toggle("is-dragging", dragging);
    },
  }));

  useLayoutEffect(() => {
    const live = liveChromeRef.current;
    if (!live || live.clipId !== clip.id) return;
    setLivePose(live.transform);
    applyBoxImmediately(live.transform);
    applyGuidesImmediately(live.guides);
    draggingRef.current = live.dragging;
    boxRef.current?.classList.toggle("is-dragging", live.dragging);
  }, [clip.id, liveChromeRef]);

  useEffect(() => {
    if (draggingRef.current) return;
    setLivePose(null);
    applyGuidesImmediately({ x: null, y: null });
  }, [clip.id, clip.effects]);

  if (!rect) return null;

  const boxStyle = overlayRectStyle(rect, display.rotation);
  const hitStyle = overlayRectStyle(rect, display.rotation, TRANSFORM_HIT_PAD_PX);

  return (
    <div
      className={`studio-editor-transform-layer${selected ? " is-selected" : ""}${playing ? " is-playing" : ""}`}
      aria-hidden="true"
    >
      <div ref={hitRef} className="studio-editor-transform-hit" style={hitStyle} />
      {selected && !playing ? (
        <div
          ref={boxRef}
          className="studio-editor-transform-box"
          style={boxStyle}
        >
          <span className="studio-editor-transform-handle is-nw" />
          <span className="studio-editor-transform-handle is-ne" />
          <span className="studio-editor-transform-handle is-sw" />
          <span className="studio-editor-transform-handle is-se" />
          <span className="studio-editor-transform-rotate">
            <span className="studio-editor-transform-rotate-stem" />
            <span className="studio-editor-transform-rotate-knob">
              <RotateCw size={12} strokeWidth={2.25} aria-hidden="true" />
            </span>
          </span>
          <span ref={badgeRef} className="studio-editor-transform-badge">
            {Math.abs(display.rotation) > 0.5
              ? `${Math.round(display.rotation)}°`
              : `${Math.round(display.scale * 100)}%`}
          </span>
        </div>
      ) : null}
      <span
        className={`studio-editor-transform-guide is-vertical${guides.x === 0.5 ? " is-center" : ""}`}
        style={{
          display: guides.x == null ? "none" : "block",
          left: guides.x == null ? undefined : `${guides.x * 100}%`,
        }}
      />
      <span
        className={`studio-editor-transform-guide is-horizontal${guides.y === 0.5 ? " is-center" : ""}`}
        style={{
          display: guides.y == null ? "none" : "block",
          top: guides.y == null ? undefined : `${guides.y * 100}%`,
        }}
      />
    </div>
  );
});

PreviewTransformOverlay.displayName = "PreviewTransformOverlay";
