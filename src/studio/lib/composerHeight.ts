"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

export const STUDIO_COMPOSER_HEIGHT_KEY = "ys-create-composer-max-height";
export const STUDIO_COMPOSER_HEIGHT_MIN = 118;
export const STUDIO_COMPOSER_HEIGHT_DEFAULT = 280;

export function clampStudioComposerHeight(px: number): number {
  const max = Math.round((typeof window !== "undefined" ? window.innerHeight : 800) * 0.72);
  return Math.min(max, Math.max(STUDIO_COMPOSER_HEIGHT_MIN, Math.round(Number(px) || 0)));
}

export function readStudioComposerHeight(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = Number(window.localStorage.getItem(STUDIO_COMPOSER_HEIGHT_KEY));
    if (!Number.isFinite(raw) || raw < STUDIO_COMPOSER_HEIGHT_MIN) return null;
    return clampStudioComposerHeight(raw);
  } catch {
    return null;
  }
}

export function writeStudioComposerHeight(px: number | null | undefined): void {
  if (typeof window === "undefined" || px == null) return;
  try {
    window.localStorage.setItem(
      STUDIO_COMPOSER_HEIGHT_KEY,
      String(clampStudioComposerHeight(px)),
    );
  } catch {
    /* ignore quota */
  }
}

type UseStudioComposerResizeOptions = {
  enabled: boolean;
  boxSelector?: string;
};

export function useStudioComposerResize({
  enabled,
  boxSelector = ".studio-composer-resize-box",
}: UseStudioComposerResizeOptions) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);
  const [height, setHeight] = useState(
    () => readStudioComposerHeight() ?? STUDIO_COMPOSER_HEIGHT_DEFAULT,
  );

  useEffect(() => {
    const root = boxRef.current;
    if (!root) return;
    if (enabled) {
      root.style.setProperty("--studio-composer-box-max-height", `${height}px`);
    } else {
      root.style.removeProperty("--studio-composer-box-max-height");
    }
  }, [enabled, height]);

  const begin = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!enabled) return;
      event.preventDefault();
      const box = event.currentTarget.closest(boxSelector) as HTMLElement | null;
      const boxH = box?.getBoundingClientRect().height;
      dragRef.current = {
        startY: event.clientY,
        startH: boxH ?? height,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      document.body.classList.add("is-composer-resize-nesw");
    },
    [boxSelector, enabled, height],
  );

  const move = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      setHeight(clampStudioComposerHeight(drag.startH + (drag.startY - event.clientY)));
    },
    [],
  );

  const end = useCallback(() => {
    document.body.classList.remove("is-composer-resize-nesw");
    if (!dragRef.current) return;
    dragRef.current = null;
    setHeight((current) => {
      writeStudioComposerHeight(current);
      return current;
    });
  }, []);

  return { boxRef, height, begin, move, end };
}
