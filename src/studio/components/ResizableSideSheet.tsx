// @ts-nocheck
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_PREFIX = "studio-side-sheet-width:";

function readStoredWidth(storageKey, fallback) {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${storageKey}`);
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return parsed;
  } catch {
    return fallback;
  }
}

function writeStoredWidth(storageKey, widthPx) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${storageKey}`, String(Math.round(widthPx)));
  } catch {
    /* ignore */
  }
}

export function ResizableSideSheet({
  ariaLabel,
  backdropLabel,
  onClose,
  autoSaveId,
  defaultSize = 27,
  minSize = 18,
  maxSize = 42,
  panelClassName = "",
  children,
}) {
  const defaultWidthRef = useRef(null);
  if (defaultWidthRef.current == null) {
    const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1440;
    defaultWidthRef.current = Math.round(viewportWidth * (defaultSize / 100));
  }
  const defaultWidth = defaultWidthRef.current;
  const [width, setWidth] = useState(() =>
    typeof window !== "undefined" ? readStoredWidth(autoSaveId, defaultWidth) : defaultWidth,
  );
  const widthRef = useRef(width);
  const dragRef = useRef(null);
  const rafRef = useRef(0);
  const pendingWidthRef = useRef(null);

  useEffect(() => {
    widthRef.current = width;
  }, [width]);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const getBounds = useCallback(() => {
    const viewport = typeof window !== "undefined" ? window.innerWidth : 1440;
    return {
      minPx: Math.round(viewport * (minSize / 100)),
      maxPx: Math.round(viewport * (maxSize / 100)),
    };
  }, [maxSize, minSize]);

  const scheduleWidth = useCallback((next) => {
    pendingWidthRef.current = next;
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const value = pendingWidthRef.current;
      if (value != null) setWidth(value);
    });
  }, []);

  const startResize = useCallback(
    (event) => {
      event.preventDefault();
      event.stopPropagation();

      const handle = event.currentTarget;
      handle.setAttribute("data-resize-handle-active", "");
      try {
        handle.setPointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }

      const startX = event.clientX;
      const startWidth = widthRef.current;
      const { minPx, maxPx } = getBounds();
      dragRef.current = { pointerId: event.pointerId, startX, startWidth, minPx, maxPx };

      const onMove = (moveEvent) => {
        const drag = dragRef.current;
        if (!drag || moveEvent.pointerId !== drag.pointerId) return;
        const next = Math.min(drag.maxPx, Math.max(drag.minPx, drag.startWidth + (drag.startX - moveEvent.clientX)));
        scheduleWidth(next);
      };

      const onUp = (upEvent) => {
        const drag = dragRef.current;
        if (!drag || upEvent.pointerId !== drag.pointerId) return;
        dragRef.current = null;
        handle.removeAttribute("data-resize-handle-active");
        document.body.classList.remove("is-grabbing-cursor");
        try {
          handle.releasePointerCapture(upEvent.pointerId);
        } catch {
          /* ignore */
        }
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onUp);
        handle.removeEventListener("pointercancel", onUp);
        // Persist once on commit — not every pointer move.
        writeStoredWidth(autoSaveId, widthRef.current);
      };

      document.body.classList.add("is-grabbing-cursor");
      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
      handle.addEventListener("pointercancel", onUp);
    },
    [autoSaveId, getBounds, scheduleWidth],
  );

  const viewport = typeof window !== "undefined" ? window.innerWidth : 1440;
  const minPx = Math.round(viewport * (minSize / 100));
  const maxPx = Math.round(viewport * (maxSize / 100));
  const panelWidth = Math.min(maxPx, Math.max(minPx, width));

  return (
    <div className="studio-settings-floating-overlay studio-side-sheet-overlay" role="dialog" aria-label={ariaLabel} aria-modal="true">
      <button type="button" className="studio-settings-floating-backdrop" onClick={onClose} aria-label={backdropLabel} />
      <div className="studio-side-sheet-shell" style={{ width: `${panelWidth}px` }}>
        <div
          className="studio-side-sheet-resize"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize panel"
          onPointerDown={startResize}
        >
          <span className="studio-side-sheet-resize-grip" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </div>
        <aside className={`studio-settings-floating-panel ${panelClassName}`.trim()}>{children}</aside>
      </div>
    </div>
  );
}
