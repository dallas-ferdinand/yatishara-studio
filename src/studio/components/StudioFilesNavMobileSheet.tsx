"use client";

import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  StudioFilesNavPane,
  type StudioFilesNavAccessItem,
  type StudioFilesNavEntry,
  type StudioFilesNavPin,
} from "./StudioFilesNavPane";
import "./studio-files-nav.css";

type StudioFilesNavMobileSheetProps = {
  activeFolderId?: string | null;
  workspaceRootId?: string | null;
  isHomeActive?: boolean;
  rootEntries?: StudioFilesNavEntry[];
  quickPins?: StudioFilesNavPin[];
  recentFolders?: StudioFilesNavAccessItem[];
  frequentFolders?: StudioFilesNavAccessItem[];
  onOpenHome: () => void;
  onOpenEntry: (entry: StudioFilesNavEntry) => void;
  onOpenPin: (pin: StudioFilesNavPin) => void;
  onOpenAccessItem: (item: StudioFilesNavAccessItem) => void;
  onPinFolder: (entry: StudioFilesNavEntry) => void;
  onUnpinPath: (path: string) => void;
  onClose: () => void;
};

/** Landing-menu-style bottom overlay: grab handle, peek ↔ full, flick dismiss. */
function FilesNavMobileSheetShell({
  onClose,
  children,
}: {
  onClose: () => void;
  children: ReactNode;
}) {
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [settling, setSettling] = useState(false);
  const [isFull, setIsFull] = useState(false);
  const [entered, setEntered] = useState(false);
  const heightRef = useRef<number | null>(null);
  const dragRef = useRef<{
    startY: number;
    startH: number;
    lastY: number;
    lastT: number;
    vy: number;
    full: number;
    peek: number;
  } | null>(null);
  const dragRafRef = useRef<number | null>(null);
  const metricsRef = useRef({ peek: 280, full: 520, min: 120 });

  const readTokenPx = (el: Element | null, name: string, fallback: number) => {
    if (!el) return fallback;
    const raw = getComputedStyle(el).getPropertyValue(name).trim();
    if (!raw) return fallback;
    const probe = document.createElement("div");
    probe.style.cssText = `position:absolute;visibility:hidden;pointer-events:none;height:${raw}`;
    el.appendChild(probe);
    const h = probe.getBoundingClientRect().height;
    probe.remove();
    return h > 0 ? h : fallback;
  };

  const refreshMetrics = () => {
    const sheet = sheetRef.current;
    const root = sheet?.closest?.(".studio-polish") ?? document.documentElement;
    const peek = readTokenPx(
      root,
      "--studio-mobile-files-nav-sheet-height",
      window.innerHeight * 0.55,
    );
    const full = readTokenPx(
      root,
      "--studio-mobile-files-nav-sheet-full",
      window.innerHeight * 0.72,
    );
    metricsRef.current = {
      peek,
      full: Math.max(full, peek + 40),
      min: Math.max(110, peek * 0.42),
    };
    return metricsRef.current;
  };

  const applyHeight = (px: number) => {
    heightRef.current = px;
    const el = sheetRef.current;
    if (!el) return;
    el.style.height = `${px}px`;
    el.style.maxHeight = `${px}px`;
  };

  useEffect(() => {
    const { peek } = refreshMetrics();
    applyHeight(peek);
    const id = window.requestAnimationFrame(() => setEntered(true));
    return () => window.cancelAnimationFrame(id);
  }, []);

  const settleTo = (fromH: number, target: number) => {
    const { peek, full } = metricsRef.current;
    setDragging(false);
    setSettling(true);
    applyHeight(fromH);
    window.requestAnimationFrame(() => {
      applyHeight(target);
      setIsFull(target >= full - 8 || target > peek + (full - peek) * 0.5);
      window.setTimeout(() => setSettling(false), 230);
    });
  };

  const onHandlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button != null && event.button !== 0) return;
    const { peek, full } = refreshMetrics();
    const startH =
      sheetRef.current?.getBoundingClientRect().height ||
      heightRef.current ||
      peek;
    const now = performance.now();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragRef.current = {
      startY: event.clientY,
      startH,
      lastY: event.clientY,
      lastT: now,
      vy: 0,
      full,
      peek,
    };
    setSettling(false);
    setDragging(true);
    applyHeight(startH);
  };

  const onHandlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const { full, min } = metricsRef.current;
    const now = performance.now();
    const dt = now - drag.lastT;
    if (dt > 0) {
      const instant = (event.clientY - drag.lastY) / dt;
      drag.vy = drag.vy * 0.35 + instant * 0.65;
      drag.lastY = event.clientY;
      drag.lastT = now;
    }
    const dy = event.clientY - drag.startY;
    applyHeight(Math.min(full, Math.max(min, drag.startH - dy)));
    if (dragRafRef.current == null) {
      dragRafRef.current = window.requestAnimationFrame(() => {
        dragRafRef.current = null;
      });
    }
  };

  const onHandlePointerUp = () => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    if (dragRafRef.current != null) {
      window.cancelAnimationFrame(dragRafRef.current);
      dragRafRef.current = null;
    }
    const { peek, full, min } = metricsRef.current;
    const h =
      heightRef.current ??
      sheetRef.current?.getBoundingClientRect().height ??
      peek;
    const mid = (peek + full) / 2;
    const range = Math.max(1, full - peek);
    const dragDown = drag.startH - h;
    const dragUp = h - drag.startH;
    const fromFull = drag.startH >= full - 12;
    const fresh = performance.now() - drag.lastT < 80;
    const vy = fresh ? drag.vy : 0;
    const flickUp = vy < -0.42;
    const flickDown = vy > 0.42;

    if (flickUp || (!fromFull && dragUp > range * 0.22 && h > peek + 8)) {
      settleTo(h, full);
      return;
    }

    if (fromFull) {
      const bigSwipeDown =
        h <= peek * 0.78 ||
        h <= min + 8 ||
        dragDown >= range * 0.55 ||
        (flickDown && dragDown >= range * 0.32);
      if (bigSwipeDown) {
        setDragging(false);
        setSettling(false);
        onClose?.();
        return;
      }
      if (flickDown || dragDown > 18 || h < full - 10) {
        settleTo(h, peek);
        return;
      }
      settleTo(h, full);
      return;
    }

    if (flickDown || h <= peek * 0.72 || h <= min + 8) {
      setDragging(false);
      setSettling(false);
      onClose?.();
      return;
    }
    settleTo(h, h >= mid ? full : peek);
  };

  return (
    <div
      ref={sheetRef}
      className={`studio-files-nav-mobile-sheet${entered ? " is-entered" : " is-entering"}${isFull ? " is-full" : ""}${dragging ? " is-dragging" : ""}${settling ? " is-settling" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="Places"
    >
      <div
        className="studio-files-nav-mobile-sheet-handle"
        onPointerDown={onHandlePointerDown}
        onPointerMove={onHandlePointerMove}
        onPointerUp={onHandlePointerUp}
        onPointerCancel={onHandlePointerUp}
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize Places"
      >
        <span className="studio-files-nav-mobile-sheet-grab" aria-hidden="true" />
      </div>
      <div className="studio-files-nav-mobile-sheet-body">{children}</div>
    </div>
  );
}

/** Mobile Places / Quick access sheet — same drag language as History. */
export function StudioFilesNavMobileSheet(props: StudioFilesNavMobileSheetProps) {
  const { onClose, ...paneProps } = props;
  const [portalRoot, setPortalRoot] = useState<Element | null>(null);

  useEffect(() => {
    setPortalRoot(document.querySelector(".studio-polish") ?? document.body);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!portalRoot) return null;

  return createPortal(
    <FilesNavMobileSheetShell onClose={onClose}>
      <StudioFilesNavPane {...paneProps} />
    </FilesNavMobileSheetShell>,
    portalRoot,
  );
}
