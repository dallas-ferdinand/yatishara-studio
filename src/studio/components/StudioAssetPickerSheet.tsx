"use client";

import { useQuery } from "convex/react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  FileText,
  Folder,
  Sparkles,
  X,
} from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useMobileLayout } from "@/hooks/use-mobile-layout";
import { useMobileBackLayer } from "@/studio/components/MobileBackStackHost";
import "./studio-asset-picker.css";

export type StudioShareItemKind =
  | "asset"
  | "document"
  | "element"
  | "videoEdit"
  | "folder";

export type StudioAssetPick = {
  _id: string;
  name: string;
  kind: string;
  mimeType: string;
  signedThumbnailUrl?: string;
  itemKind?: StudioShareItemKind;
  itemId?: string;
  studioKind?: string;
};

type FolderCrumb = { id: Id<"folders"> | null; name: string };

type StudioAssetPickerSheetProps = {
  title: string;
  /** Filter by asset kind. Default: images only. Ignored when pickAnyStudio. */
  kinds?: ReadonlyArray<"image" | "video" | "audio" | "document">;
  /** Pick any Studio entry (assets, docs, elements, edits, folders). */
  pickAnyStudio?: boolean;
  /** Allow selecting folders (share mode). Defaults to pickAnyStudio. */
  allowFolderPick?: boolean;
  /** Currently selected ids (highlight). */
  selectedIds?: ReadonlyArray<string>;
  /** Multi-select (toggle). Single-select closes after pick unless `stayOpen`. */
  multi?: boolean;
  /** Keep sheet open after a single pick (e.g. gallery). */
  stayOpen?: boolean;
  maxSelected?: number;
  /** Count chip next to the crumb (e.g. "2/6"). */
  countLabel?: string;
  doneLabel?: string;
  expiresUnix: number;
  onPick: (asset: StudioAssetPick) => void;
  onClose: () => void;
  /** Footer Confirm/Done — defaults to onClose when omitted. */
  onDone?: () => void;
};

type SheetDragState = {
  startY: number;
  startH: number;
  lastY: number;
  lastT: number;
  vy: number;
  full: number;
  peek: number;
};

/**
 * Landing / History-style bottom sheet for mobile picks.
 * Grab handle, peek↔full, flick dismiss — same language as peer/settings sheets.
 */
function AssetPickerMobileSheetShell({
  onClose,
  ariaLabel,
  children,
}: {
  onClose: () => void;
  ariaLabel: string;
  children: ReactNode;
}) {
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [settling, setSettling] = useState(false);
  const [isFull, setIsFull] = useState(false);
  const [entered, setEntered] = useState(false);
  const heightRef = useRef<number | null>(null);
  const dragRef = useRef<SheetDragState | null>(null);
  const metricsRef = useRef({ peek: 320, full: 560, min: 120 });

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
    const root =
      sheet?.closest?.(".studio-polish") ?? document.documentElement;
    const peek = readTokenPx(
      root,
      "--studio-mobile-app-menu-sheet-height",
      window.innerHeight * 0.58,
    );
    const full = readTokenPx(
      root,
      "--studio-mobile-app-menu-sheet-full",
      window.innerHeight * 0.82,
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
    el.style.setProperty("--studio-menu-sheet-h", `${px}px`);
    el.style.height = `${px}px`;
    el.style.maxHeight = `${px}px`;
  };

  useLayoutEffect(() => {
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

  const finishDrag = () => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
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
        onClose();
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
      onClose();
      return;
    }
    settleTo(h, h >= mid ? full : peek);
  };

  const onHandlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button != null && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
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

  const onHandlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const { full: maxH, min } = metricsRef.current;
    const t = performance.now();
    const dt = t - drag.lastT;
    if (dt > 0) {
      const instant = (event.clientY - drag.lastY) / dt;
      drag.vy = drag.vy * 0.35 + instant * 0.65;
      drag.lastY = event.clientY;
      drag.lastT = t;
    }
    const dy = event.clientY - drag.startY;
    applyHeight(Math.min(maxH, Math.max(min, drag.startH - dy)));
  };

  const onHandlePointerUp = () => {
    if (!dragRef.current) return;
    finishDrag();
  };

  return (
    <div
      ref={sheetRef}
      className={`studio-mobile-app-menu-sheet studio-asset-picker-sheet${entered ? " is-entered" : " is-entering"}${isFull ? " is-full" : ""}${dragging ? " is-dragging" : ""}${settling ? " is-settling" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
    >
      <div
        className="studio-mobile-app-menu-sheet-handle"
        onPointerDown={onHandlePointerDown}
        onPointerMove={onHandlePointerMove}
        onPointerUp={onHandlePointerUp}
        onPointerCancel={onHandlePointerUp}
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize picker"
      >
        <span className="studio-mobile-app-menu-sheet-grab" aria-hidden="true" />
      </div>
      {children}
    </div>
  );
}

/**
 * Folder-browsing sheet for picking Studio Files assets.
 * Mobile = grab-handle bottom sheet; desktop = centered dialog.
 */
export function StudioAssetPickerSheet({
  title,
  kinds = ["image"],
  pickAnyStudio = false,
  allowFolderPick = pickAnyStudio,
  selectedIds = [],
  multi = false,
  stayOpen = false,
  maxSelected,
  countLabel,
  doneLabel = "Done",
  expiresUnix,
  onPick,
  onClose,
  onDone,
}: StudioAssetPickerSheetProps) {
  const { isMobile } = useMobileLayout();
  const [portalRoot, setPortalRoot] = useState<Element | null>(null);
  const [stack, setStack] = useState<FolderCrumb[]>([
    { id: null, name: "Files" },
  ]);
  const current = stack[stack.length - 1];
  const kindSet = useMemo(() => new Set(kinds), [kinds]);
  const showFoot = multi || stayOpen;
  const selectedCount = selectedIds.length;

  useMobileBackLayer("asset-picker-sheet", true, onClose);

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

  const folders = useQuery(api.folders.listWithPeeks, {
    parentId: current.id,
  });
  const shareableFolders = useMemo(
    () => (folders ?? []).filter((folder) => !folder.systemKind),
    [folders],
  );
  const folderAssets = useQuery(
    api.assets.listByFolder,
    current.id ? { folderId: current.id, expiresUnix } : "skip",
  );
  const documents = useQuery(
    api.documents.listByFolder,
    pickAnyStudio && current.id ? { folderId: current.id } : "skip",
  );
  const videoEdits = useQuery(
    api.videoEdits.listByFolder,
    pickAnyStudio && current.id
      ? { folderId: current.id, expiresUnix }
      : "skip",
  );
  const elements = useQuery(
    api.elements.list,
    pickAnyStudio && current.id ? { folderId: current.id } : "skip",
  );

  const assets = useMemo(() => {
    const rows = folderAssets ?? [];
    if (pickAnyStudio) return rows;
    return rows.filter((asset) => kindSet.has(asset.kind));
  }, [folderAssets, kindSet, pickAnyStudio]);

  const loading =
    folders === undefined ||
    (current.id !== null && folderAssets === undefined) ||
    (pickAnyStudio &&
      current.id !== null &&
      (documents === undefined ||
        videoEdits === undefined ||
        elements === undefined));
  const empty =
    !loading &&
    shareableFolders.length === 0 &&
    assets.length === 0 &&
    (documents?.length ?? 0) === 0 &&
    (videoEdits?.length ?? 0) === 0 &&
    (elements?.length ?? 0) === 0;

  function atCap(id: string) {
    return (
      multi &&
      maxSelected != null &&
      !selectedIds.includes(id) &&
      selectedIds.length >= maxSelected
    );
  }

  function pickItem(pick: StudioAssetPick) {
    onPick(pick);
    if (!multi && !stayOpen) onClose();
  }

  const crumbs = (
    <div className="studio-asset-picker-crumbs">
      {stack.length > 1 ? (
        <button
          type="button"
          className="studio-asset-picker-back"
          onClick={() => setStack((s) => s.slice(0, -1))}
        >
          <ChevronLeft aria-hidden="true" />
          {stack[stack.length - 2].name}
        </button>
      ) : null}
      <span className="studio-asset-picker-here">{current.name}</span>
      {countLabel ? (
        <span className="studio-asset-picker-count">{countLabel}</span>
      ) : null}
    </div>
  );

  const browse = (
    <>
      {loading ? (
        <p className="studio-settings-empty">Loading…</p>
      ) : empty ? (
        <p className="studio-settings-empty">
          {current.id === null
            ? "No folders yet — upload media in Files first."
            : "Nothing usable in this folder."}
        </p>
      ) : (
        <>
          {shareableFolders.length > 0 ? (
            <div className="studio-asset-picker-folders">
              {shareableFolders.map((folder) => {
                const selected = selectedIds.includes(folder._id);
                const capped = atCap(folder._id);
                return (
                  <div
                    key={folder._id}
                    className={`studio-asset-picker-folder-row${
                      selected ? " is-selected" : ""
                    }`}
                  >
                    <button
                      type="button"
                      className="studio-asset-picker-folder"
                      onClick={() =>
                        setStack((s) => [
                          ...s,
                          { id: folder._id, name: folder.name },
                        ])
                      }
                    >
                      <Folder aria-hidden="true" />
                      <span>{folder.name}</span>
                      <ChevronRight
                        className="studio-asset-picker-folder-chevron"
                        aria-hidden="true"
                      />
                    </button>
                    {allowFolderPick ? (
                      <button
                        type="button"
                        className="studio-asset-picker-folder-select"
                        aria-label={
                          selected
                            ? `Deselect ${folder.name}`
                            : `Share ${folder.name}`
                        }
                        aria-pressed={selected}
                        disabled={capped}
                        onClick={() =>
                          pickItem({
                            _id: folder._id,
                            name: folder.name,
                            kind: "folder",
                            mimeType: "",
                            itemKind: "folder",
                            itemId: folder._id,
                            studioKind: "folder",
                          })
                        }
                      >
                        <Check aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}
          {pickAnyStudio && (documents?.length ?? 0) > 0 ? (
            <div
              className="studio-asset-picker-list"
              role="group"
              aria-label="Scripts in this folder"
            >
              {(documents ?? []).map((doc) => {
                const selected = selectedIds.includes(doc._id);
                return (
                  <button
                    key={doc._id}
                    type="button"
                    className={`studio-asset-picker-list-item${
                      selected ? " is-selected" : ""
                    }`}
                    aria-pressed={selected}
                    disabled={atCap(doc._id)}
                    onClick={() =>
                      pickItem({
                        _id: doc._id,
                        name: doc.title || "Script",
                        kind: "document",
                        mimeType: "text/markdown",
                        itemKind: "document",
                        itemId: doc._id,
                        studioKind: "document",
                      })
                    }
                  >
                    <FileText aria-hidden="true" />
                    <span>{doc.title || "Script"}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
          {pickAnyStudio && (elements?.length ?? 0) > 0 ? (
            <div
              className="studio-asset-picker-list"
              role="group"
              aria-label="Elements in this folder"
            >
              {(elements ?? []).map((element) => {
                const selected = selectedIds.includes(element._id);
                const name = element.name?.startsWith("@")
                  ? element.name
                  : `@${element.name || "element"}`;
                return (
                  <button
                    key={element._id}
                    type="button"
                    className={`studio-asset-picker-list-item${
                      selected ? " is-selected" : ""
                    }`}
                    aria-pressed={selected}
                    disabled={atCap(element._id)}
                    onClick={() =>
                      pickItem({
                        _id: element._id,
                        name,
                        kind: "element",
                        mimeType: "",
                        itemKind: "element",
                        itemId: element._id,
                        studioKind: "element",
                      })
                    }
                  >
                    <Sparkles aria-hidden="true" />
                    <span>{name}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
          {pickAnyStudio && (videoEdits?.length ?? 0) > 0 ? (
            <div
              className="studio-asset-picker-list"
              role="group"
              aria-label="Edits in this folder"
            >
              {(videoEdits ?? []).map((edit) => {
                const selected = selectedIds.includes(edit._id);
                const name = edit.name || "Edit";
                return (
                  <button
                    key={edit._id}
                    type="button"
                    className={`studio-asset-picker-list-item${
                      selected ? " is-selected" : ""
                    }`}
                    aria-pressed={selected}
                    disabled={atCap(edit._id)}
                    onClick={() =>
                      pickItem({
                        _id: edit._id,
                        name,
                        kind: "videoEdit",
                        mimeType: "",
                        signedThumbnailUrl:
                          "signedThumbnailUrl" in edit &&
                          typeof edit.signedThumbnailUrl === "string"
                            ? edit.signedThumbnailUrl
                            : undefined,
                        itemKind: "videoEdit",
                        itemId: edit._id,
                        studioKind: "videoEdit",
                      })
                    }
                  >
                    <Clapperboard aria-hidden="true" />
                    <span>{name}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
          {assets.length > 0 ? (
            <div
              className="studio-asset-picker-grid"
              role="group"
              aria-label="Media in this folder"
            >
              {assets.map((asset) => {
                const selected = selectedIds.includes(asset._id);
                return (
                  <button
                    key={asset._id}
                    type="button"
                    className={selected ? "is-selected" : undefined}
                    aria-pressed={selected}
                    disabled={atCap(asset._id)}
                    onClick={() => {
                      pickItem({
                        _id: asset._id,
                        name: asset.name,
                        kind: asset.kind,
                        mimeType: asset.mimeType,
                        signedThumbnailUrl: asset.signedThumbnailUrl,
                        itemKind: "asset",
                        itemId: asset._id,
                        studioKind: "asset",
                      });
                    }}
                    title={asset.name}
                  >
                    {asset.signedThumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={asset.signedThumbnailUrl} alt="" />
                    ) : (
                      <span
                        className="studio-asset-picker-thumb"
                        aria-hidden="true"
                      />
                    )}
                    <span>{asset.name}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </>
      )}
    </>
  );

  const foot =
    showFoot ? (
      <div className="studio-asset-pick-footer studio-asset-picker-action-bar">
        <span
          className="studio-asset-pick-count"
          aria-label={`${selectedCount} selected`}
        >
          {selectedCount}
        </span>
        <span className="studio-asset-pick-footer-copy">
          {selectedCount === 0
            ? title
            : selectedCount === 1
              ? "1 selected"
              : `${selectedCount} selected`}
        </span>
        {allowFolderPick && current.id ? (
          <button
            type="button"
            className="studio-asset-pick-folder-btn"
            disabled={atCap(current.id) && !selectedIds.includes(current.id)}
            onClick={() =>
              pickItem({
                _id: current.id!,
                name: current.name,
                kind: "folder",
                mimeType: "",
                itemKind: "folder",
                itemId: current.id!,
                studioKind: "folder",
              })
            }
          >
            {selectedIds.includes(current.id) ? "Folder added" : "This folder"}
          </button>
        ) : null}
        <button
          type="button"
          className="studio-asset-pick-icon-btn is-close"
          onClick={onClose}
          title="Close"
          aria-label="Close"
        >
          <X aria-hidden="true" />
        </button>
        <button
          type="button"
          className="studio-asset-pick-icon-btn is-primary"
          disabled={selectedCount === 0}
          onClick={() => (onDone ?? onClose)()}
          title={doneLabel}
          aria-label={doneLabel}
        >
          {doneLabel}
        </button>
      </div>
    ) : null;

  const inner = (
    <>
      {!isMobile ? (
        <div className="studio-asset-picker-desk-head">
          <h2 className="studio-asset-picker-desk-title">{title}</h2>
          <button
            type="button"
            className="studio-asset-pick-icon-btn is-close"
            aria-label="Close"
            onClick={onClose}
          >
            <X aria-hidden="true" />
          </button>
        </div>
      ) : null}
      <div className="studio-mobile-app-menu-body studio-asset-picker-body">
        {crumbs}
        {browse}
      </div>
      {foot}
    </>
  );

  if (!portalRoot) return null;

  if (isMobile) {
    return createPortal(
      <AssetPickerMobileSheetShell onClose={onClose} ariaLabel={title}>
        {inner}
      </AssetPickerMobileSheetShell>,
      portalRoot,
    );
  }

  return createPortal(
    <div
      className="studio-mobile-app-menu-sheet studio-asset-picker-sheet is-desktop-dialog"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {inner}
    </div>,
    portalRoot,
  );
}
