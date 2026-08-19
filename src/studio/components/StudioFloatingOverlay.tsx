"use client";

import { createPortal } from "react-dom";
import type { CSSProperties, ReactNode } from "react";
import "./studio-floating-overlay.css";

export type StudioFloatingOverlayCorner =
  | "bottom-right"
  | "bottom-left"
  | "top-right"
  | "top-left";

/**
 * Viewport overlay that never joins Studio chrome layout.
 * Portals to document.body so `.studio-polish > * { position: relative }`
 * cannot turn it into a flex column. Reuse for downloads, recordings,
 * toasts, or any other live status chip.
 */
export function StudioFloatingOverlay({
  children,
  corner = "bottom-right",
  label,
  zIndex = 120,
}: {
  children: ReactNode;
  corner?: StudioFloatingOverlayCorner;
  label?: string;
  zIndex?: number;
}) {
  if (typeof document === "undefined") return null;
  const style = { "--studio-floating-overlay-z": zIndex } as CSSProperties;
  return createPortal(
    <div
      className={`studio-floating-overlay is-${corner}`}
      style={style}
      aria-label={label}
    >
      <div className="studio-floating-overlay-slot">{children}</div>
    </div>,
    document.body,
  );
}
