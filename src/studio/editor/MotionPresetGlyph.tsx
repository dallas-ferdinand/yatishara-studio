"use client";

import type { TextAnimation } from "./types";

type Props = {
  id: TextAnimation;
  className?: string;
};

/**
 * CapCut-style mini diagrams for text motion presets.
 * Uses currentColor; CSS classes drive a looping preview of each motion.
 */
export function MotionPresetGlyph({ id, className }: Props) {
  const cls = ["studio-editor-motion-glyph", `is-${id}`, className]
    .filter(Boolean)
    .join(" ");

  return (
    <svg
      className={cls}
      viewBox="0 0 48 48"
      width="40"
      height="40"
      aria-hidden="true"
      focusable="false"
    >
      {glyphFor(id)}
    </svg>
  );
}

function Letter({
  x = 24,
  y = 26,
  opacity = 1,
  scale = 1,
  className,
}: {
  x?: number;
  y?: number;
  opacity?: number;
  scale?: number;
  className?: string;
}) {
  return (
    <text
      className={className}
      x={x}
      y={y}
      textAnchor="middle"
      dominantBaseline="middle"
      fontSize="17"
      fontWeight="700"
      fontFamily="ui-sans-serif, system-ui, sans-serif"
      opacity={opacity}
      style={{ transformOrigin: `${x}px ${y}px` }}
      transform={scale === 1 ? undefined : `translate(${x} ${y}) scale(${scale}) translate(${-x} ${-y})`}
    >
      Aa
    </text>
  );
}

function Stage() {
  return (
    <rect
      x="9"
      y="10"
      width="30"
      height="28"
      rx="5"
      fill="none"
      stroke="currentColor"
      strokeOpacity="0.18"
      strokeWidth="1.2"
    />
  );
}

function glyphFor(id: TextAnimation) {
  switch (id) {
    case "none":
      return (
        <>
          <Stage />
          <Letter />
        </>
      );

    case "fadeIn":
      return (
        <>
          <Stage />
          <Letter className="studio-motion-anim-fade-in" />
        </>
      );

    case "fadeOut":
      return (
        <>
          <Stage />
          <Letter className="studio-motion-anim-fade-out" />
        </>
      );

    case "slideUp":
      return (
        <>
          <Stage />
          <Letter className="studio-motion-anim-slide-up" />
          <path
            d="M39 32 V16 M35.5 19.5 L39 14.5 L42.5 19.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeOpacity="0.4"
          />
        </>
      );

    case "slideDown":
      return (
        <>
          <Stage />
          <Letter className="studio-motion-anim-slide-down" />
          <path
            d="M39 16 V32 M35.5 28.5 L39 33.5 L42.5 28.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeOpacity="0.4"
          />
        </>
      );

    case "popIn":
      return (
        <>
          <Stage />
          <circle
            className="studio-motion-anim-pop-ring"
            cx="24"
            cy="26"
            r="11"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
          />
          <Letter className="studio-motion-anim-pop" />
          <g
            className="studio-motion-anim-pop-burst"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          >
            <path d="M24 8 V11.5" />
            <path d="M24 40.5 V44" />
            <path d="M8 26 H11.5" />
            <path d="M36.5 26 H40" />
            <path d="M12.2 14.2 L14.6 16.6" />
            <path d="M33.4 35.4 L35.8 37.8" />
            <path d="M35.8 14.2 L33.4 16.6" />
            <path d="M14.6 35.4 L12.2 37.8" />
          </g>
        </>
      );

    default:
      return (
        <>
          <Stage />
          <Letter />
        </>
      );
  }
}
