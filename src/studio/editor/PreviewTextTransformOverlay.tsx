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
import { FlipHorizontal2, FlipVertical2, RotateCw } from "lucide-react";
import { type ClipTransform } from "./clipTransform";
import {
  normalizeTextTransform,
  textContentRectNormalized,
} from "./textLayout";
import { overlayRectStyle, TRANSFORM_HIT_PAD_PX } from "./transformHit";
import type { SnapGuides } from "./canvasTransformGesture";
import type { EditorClip } from "./types";
import type {
  LivePreviewChrome,
  TransformChromeHandle,
} from "./PreviewPointerRouter";

type PreviewTextTransformOverlayProps = {
  clip: EditorClip;
  canvasWidth: number;
  canvasHeight: number;
  selected: boolean;
  playing: boolean;
  liveChromeRef: RefObject<LivePreviewChrome | null>;
  onUpdateClip: (
    clipId: string,
    patch: Partial<EditorClip>,
    live?: boolean,
  ) => void;
};

function rectForTransform(
  transform: ClipTransform,
  clip: EditorClip,
  canvasWidth: number,
  canvasHeight: number,
) {
  return textContentRectNormalized(
    clip.text,
    {
      scale: transform.scale,
      x: transform.x,
      y: transform.y,
      rotation: transform.rotation,
    },
    canvasWidth,
    canvasHeight,
  );
}

export const PreviewTextTransformOverlay = forwardRef<
  TransformChromeHandle,
  PreviewTextTransformOverlayProps
>(function PreviewTextTransformOverlay(
  {
    clip,
    canvasWidth,
    canvasHeight,
    selected,
    playing,
    liveChromeRef,
    onUpdateClip,
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

  const transform = normalizeTextTransform(clip.effects);
  const display = livePose ?? transform;
  const rect = rectForTransform(display, clip, canvasWidth, canvasHeight);

  const latestRef = useRef({
    canvasWidth,
    canvasHeight,
    clip,
  });
  latestRef.current = { canvasWidth, canvasHeight, clip };

  const applyBoxImmediately = (next: ClipTransform) => {
    const latest = latestRef.current;
    const nextRect = rectForTransform(
      next,
      latest.clip,
      latest.canvasWidth,
      latest.canvasHeight,
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

  const patchTextFlip = (key: "flipX" | "flipY") => {
    const text = clip.text ?? { text: "" };
    onUpdateClip(clip.id, {
      text: { ...text, [key]: !Boolean(text[key]) },
    });
  };

  const boxStyle = overlayRectStyle(rect, display.rotation);
  const hitStyle = overlayRectStyle(rect, display.rotation, TRANSFORM_HIT_PAD_PX);

  return (
    <div
      className={`studio-editor-transform-layer studio-editor-text-transform${selected ? " is-selected" : ""}${playing ? " is-playing" : ""}`}
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
          <div className="studio-editor-text-flip-row" data-preview-chrome="flip">
            <button
              type="button"
              className={`studio-editor-text-flip-btn${clip.text?.flipX ? " is-active" : ""}`}
              title="Flip horizontal"
              aria-label="Flip horizontal"
              onPointerDown={(event) => {
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                patchTextFlip("flipX");
              }}
            >
              <FlipHorizontal2 size={12} strokeWidth={2.25} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={`studio-editor-text-flip-btn${clip.text?.flipY ? " is-active" : ""}`}
              title="Flip vertical"
              aria-label="Flip vertical"
              onPointerDown={(event) => {
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                patchTextFlip("flipY");
              }}
            >
              <FlipVertical2 size={12} strokeWidth={2.25} aria-hidden="true" />
            </button>
          </div>
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

PreviewTextTransformOverlay.displayName = "PreviewTextTransformOverlay";
