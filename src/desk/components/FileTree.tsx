// @ts-nocheck
"use client";

import { Icon } from "./Icons";
import { icon as svgIcon } from "@mos-app/icons.js";
import { FileEntryThumb } from "./FileEntryThumb";
import { explorerEntryIcon, fileExt, fileViewerKind } from "@/desk/lib/file-kind";
import { formatFileDate } from "@/desk/lib/explorer-file-actions";
import { writeExplorerDragData } from "@/desk/lib/explorer-dnd";
import { workspaceFileThumbUrl } from "@/desk/lib/workspace-file-url.js";
import { useLongPress } from "@/desk/hooks/use-long-press";
import { withSearchSections, searchResultMeta } from "@/desk/lib/explorer-search";
import { displayEntryPath } from "@/desk/lib/display-path";
import { useState } from "react";
import { animate } from "@motionone/dom";

function parentEntry(parent) {
  if (!parent) return null;
  if (typeof parent === "object" && parent.type === "parent") return parent;
  const path = typeof parent === "string" ? parent : parent.path;
  if (path == null) return null;
  return { type: "parent", path: String(path) };
}

function flatList(flatEntries, pinnedShortcuts = []) {
  const list = [];
  const pinPaths = new Set((pinnedShortcuts ?? []).map((p) => p.path));

  const parent = parentEntry(flatEntries?.parent);
  if (parent) list.push(parent);
  const entries = flatEntries?.entries ?? [];
  for (const entry of entries) {
    if (pinPaths.has(entry.path)) continue;
    list.push(entry);
  }
  return list;
}

function buildDisplayList(flatEntries, pinnedShortcuts) {
  const pins = (pinnedShortcuts ?? []).map((p) => ({ ...p, isPinnedShortcut: true }));
  const rows = flatList(flatEntries, pins);
  const parent = rows.find((e) => e.type === "parent");
  const rest = rows.filter((e) => e.type !== "parent");
  return [...(parent ? [parent] : []), ...pins, ...rest];
}

function buildSearchList(searchResults, searchScope, pinnedShortcuts) {
  const pins = (pinnedShortcuts ?? []).map((p) => ({ ...p, isPinnedShortcut: true }));
  const rows = withSearchSections(searchResults ?? [], searchScope);
  return [...pins, ...rows];
}

function isPinnedEntry(entry, pinnedPaths) {
  if (!entry || entry.type === "parent" || entry.type === "search-divider") return false;
  if (entry.isPinnedShortcut) return true;
  return entry.type === "dir" && pinnedPaths?.has?.(entry.path);
}

function isVideoFileUrl(url) {
  return typeof url === "string" && /\.(mp4|webm|mov)(\?|#|$)/i.test(url);
}

function setTransparentDragImage(dataTransfer) {
  if (!dataTransfer || typeof document === "undefined") return;
  const ghost = document.createElement("div");
  ghost.className = "desk-file-drag-native-ghost";
  document.body.appendChild(ghost);
  dataTransfer.setDragImage(ghost, 1, 1);
  window.requestAnimationFrame(() => ghost.remove());
}

function readComputedNumberPx(el, prop) {
  if (!el || typeof window === "undefined") return 0;
  const v = window.getComputedStyle(el)[prop];
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function cleanupDragPreviews() {
  if (typeof document === "undefined") return;
  document.querySelectorAll(".desk-file-drag-preview").forEach((el) => el.remove());
  document.querySelectorAll("[data-drag-source]").forEach((el) => {
    el.removeAttribute("data-drag-source");
    delete el.dataset.dragToken;
  });
}

let dragSequence = 0;

if (typeof document !== "undefined" && !document.body.dataset.dragPreviewSafetyNet) {
  document.body.dataset.dragPreviewSafetyNet = "1";
  let cleanupTimer = null;
  const scheduleCleanup = () => {
    if (cleanupTimer !== null) clearTimeout(cleanupTimer);
    cleanupTimer = window.setTimeout(() => {
      cleanupTimer = null;
      cleanupDragPreviews();
    }, 800);
  };
  document.addEventListener("dragend", scheduleCleanup, true);
  document.addEventListener("drop", scheduleCleanup, true);
  document.addEventListener("dragstart", () => {
    // A new drag started before the previous drag's safety-net timer fired.
    // Without cancelling here, the orphan timer would nuke the new drag's
    // data-drag-source/data-drag-token roughly half a second in, making the
    // item look like it dropped out of the drag mid-flight.
    if (cleanupTimer !== null) {
      clearTimeout(cleanupTimer);
      cleanupTimer = null;
    }
    cleanupDragPreviews();
  }, true);
}

const PICKUP_SPRING = { type: "spring", stiffness: 200, damping: 19, mass: 1 };
const RETURN_SPRING = { type: "spring", stiffness: 300, damping: 24, mass: 1 };
const PICKUP_MORPH_MS = 520;
const RETURN_MORPH_MS = 360;
const MORPH_EASING = "cubic-bezier(0.32, 0.72, 0, 1)";
const DROP_EASING = [0.4, 0, 0.2, 1];
const DROP_DURATION = 0.36;

function getCaretPixelInEditor(editorEl, x, y) {
  if (!editorEl || typeof document === "undefined") return null;
  try {
    const range = document.caretRangeFromPoint(x, y);
    if (!range) return null;
    // Check if the caret is inside the editor
    if (!editorEl.contains(range.startContainer)) return null;
    const rects = range.getClientRects();
    if (rects.length > 0) {
      return { x: rects[0].left, y: rects[0].top, height: rects[0].height };
    }
    // Fallback: insert a zero-width space to get a rect
    const marker = document.createTextNode("\u200B");
    range.insertNode(marker);
    const markerRect = marker.getBoundingClientRect();
    const result = { x: markerRect.left, y: markerRect.top, height: markerRect.height };
    marker.remove();
    return result;
  } catch {
    return null;
  }
}

function findDropTargetUnder(x, y, excludeEl) {
  if (typeof document === "undefined") return null;
  if (excludeEl) excludeEl.style.display = "none";
  const el = document.elementFromPoint(x, y);
  if (excludeEl) excludeEl.style.display = "";
  console.log("[findDropTarget]", { x, y, el: el?.tagName, elClass: el?.className?.slice?.(0, 60), closest: el?.closest?.("[data-drop-target]")?.tagName, closestDT: el?.closest?.("[data-drop-target]")?.dataset?.dropTarget });
  if (!el) return null;
  return el.closest('[data-drop-target]');
}

function startFileDragPreview(event, entry, workspaceId) {
  if (typeof document === "undefined") return;
  const source = event.currentTarget;
  if (!source) return;

  const rect = source.getBoundingClientRect();
  const label = entry.name ?? entry.path?.split("/").pop() ?? "Item";
  const isElement = entry.studioKind === "element";
  const elementThumb = isElement && entry.thumbnailUrl && !isVideoFileUrl(entry.thumbnailUrl)
    ? entry.thumbnailUrl
    : null;
  const mediaKind = entry.type === "dir" || entry.type === "parent"
    ? null
    : fileViewerKind(entry?.ext ?? fileExt(entry?.path ?? entry?.name ?? ""));
  const isMedia = mediaKind === "image" || mediaKind === "video" || Boolean(elementThumb);
  const reduceMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  source.setAttribute("data-drag-source", "");
  // Stamp this drag with a unique token. The async finish() can race with a
  // new drag that starts on the same button while our drop/return animation
  // is still running; the token lets the late-arriving cleanup know whether
  // the attribute it's about to strip still belongs to *this* drag.
  const dragToken = String(++dragSequence);
  source.dataset.dragToken = dragToken;

  const sourceRadius = readComputedNumberPx(source, "borderTopLeftRadius");
  const isGridLike =
    source.classList.contains("desk-file-grid-item") ||
    source.classList.contains("desk-file-preview-item");
  const thumbVisualEl = source.querySelector(".desk-file-thumb-visual");
  const visualEl = isMedia || isGridLike ? thumbVisualEl : null;
  const visualRect = visualEl ? visualEl.getBoundingClientRect() : null;
  const visualRadius = visualEl ? readComputedNumberPx(visualEl, "borderTopLeftRadius") : 0;

  let chip;
  let targetWidth;
  let targetHeight;
  let targetRadius;
  let followOffsetX;
  let followOffsetY;

  if (isMedia) {
    const isVideo = mediaKind === "video";
    const startRect = visualRect ?? rect;
    const baseSize = Math.min(Math.max(64, Math.min(startRect.width, startRect.height) * 0.72), 80);
    targetWidth = baseSize;
    targetHeight = baseSize;
    targetRadius = Math.round(baseSize * 0.22);
    followOffsetX = targetWidth * 0.5;
    followOffsetY = targetHeight * 0.5;

    chip = document.createElement("div");
    chip.className = "desk-file-drag-preview desk-file-drag-preview--media";
    chip.dataset.dragName = label;
    chip.style.position = "fixed";
    chip.style.left = "0";
    chip.style.top = "0";
    chip.style.width = `${startRect.width}px`;
    chip.style.height = `${startRect.height}px`;
    chip.style.borderRadius = `${visualRadius || sourceRadius}px`;
    chip.style.overflow = "hidden";
    chip.style.transformOrigin = "center center";
    chip.style.boxShadow = "0 10px 28px rgba(0, 0, 0, 0.42)";
    chip.style.transform = `translate3d(${startRect.left}px, ${startRect.top}px, 0)`;

    const existingThumb = source.querySelector(".desk-file-thumb-image, .desk-file-thumb-video, video");
    const img = document.createElement("img");
    let imgSrc = "";
    // For <img> elements, use src directly if it's not a video file URL
    if (existingThumb?.tagName === "IMG" && existingThumb.src && !isVideoFileUrl(existingThumb.src)) {
      imgSrc = existingThumb.src;
    }
    // For <video> elements, try poster first, then capture a frame via canvas
    if (!imgSrc && existingThumb?.tagName === "VIDEO") {
      if (existingThumb.poster && !isVideoFileUrl(existingThumb.poster)) {
        imgSrc = existingThumb.poster;
      } else if (existingThumb.readyState >= 2 && existingThumb.videoWidth > 0) {
        // Video has loaded enough data to capture a frame
        try {
          const canvas = document.createElement("canvas");
          canvas.width = existingThumb.videoWidth;
          canvas.height = existingThumb.videoHeight;
          canvas.getContext("2d").drawImage(existingThumb, 0, 0);
          imgSrc = canvas.toDataURL("image/jpeg", 0.8);
        } catch {
          // Canvas capture may fail due to CORS
        }
      }
    }
    // Fallback chain: skip video file URLs (they can't be displayed in <img>)
    if (!imgSrc && entry.thumbnailUrl && !isVideoFileUrl(entry.thumbnailUrl)) imgSrc = entry.thumbnailUrl;
    if (!imgSrc) imgSrc = workspaceFileThumbUrl(entry.path, workspaceId, 420) || "";
    if (!imgSrc && entry.mediaUrl && !isVideoFileUrl(entry.mediaUrl)) imgSrc = entry.mediaUrl;
    img.src = imgSrc;
    img.alt = "";
    img.draggable = false;
    img.style.width = "100%";
    img.style.height = "100%";
    img.style.objectFit = "cover";
    img.style.display = "block";
    chip.appendChild(img);

    const badgeIcon = isElement
      ? entry.elementType === "character"
        ? "user"
        : entry.elementType === "prop"
          ? "package"
          : entry.elementType === "location"
            ? "mapPin"
            : "fileText"
      : isVideo
        ? "film"
        : "image";
    const iconHtml = svgIcon(badgeIcon, 14);
    if (iconHtml) {
      const badge = document.createElement("span");
      badge.className = "desk-file-thumb-badge";
      badge.style.pointerEvents = "none";
      badge.innerHTML = iconHtml;
      chip.appendChild(badge);
    }
  } else {
    const isDir = entry.type === "dir";
    const baseSize = Math.min(Math.max(64, Math.min(rect.width, rect.height) * 0.34), 80);
    targetWidth = baseSize;
    targetHeight = baseSize;
    targetRadius = Math.round(baseSize * 0.22);
    followOffsetX = targetWidth * 0.5;
    followOffsetY = targetHeight * 0.5;

    chip = document.createElement("div");
    chip.className = "desk-file-drag-preview desk-file-drag-preview--file";
    chip.dataset.dragName = label;
    chip.style.position = "fixed";
    chip.style.left = "0";
    chip.style.top = "0";
    chip.style.width = `${rect.width}px`;
    chip.style.height = `${rect.height}px`;
    chip.style.borderRadius = `${sourceRadius}px`;
    chip.style.overflow = "hidden";
    chip.style.transformOrigin = "center center";
    chip.style.boxShadow = "0 10px 28px rgba(0, 0, 0, 0.42)";
    chip.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0)`;

    const iconName = explorerEntryIcon(entry);
    const iconHtml = svgIcon(iconName, 28);
    const inner = document.createElement("div");
    inner.style.display = "flex";
    inner.style.flexDirection = "column";
    inner.style.alignItems = "center";
    inner.style.justifyContent = "center";
    inner.style.gap = "4px";
    inner.style.width = "100%";
    inner.style.height = "100%";
    inner.style.background = "color-mix(in srgb, var(--mos-text-bright, #fff) 3.5%, var(--mos-bg, var(--color-cursor-sidebar)))";
    inner.style.color = "var(--color-cursor-text)";
    inner.style.pointerEvents = "none";
    if (iconHtml) {
      const iconEl = document.createElement("span");
      iconEl.innerHTML = iconHtml;
      iconEl.style.lineHeight = "0";
      iconEl.style.opacity = isDir ? "1" : "0.85";
      inner.appendChild(iconEl);
    }
    const labelEl = document.createElement("span");
    labelEl.textContent = label;
    labelEl.style.fontSize = "10px";
    labelEl.style.lineHeight = "1.2";
    labelEl.style.maxWidth = "90%";
    labelEl.style.overflow = "hidden";
    labelEl.style.textOverflow = "ellipsis";
    labelEl.style.whiteSpace = "nowrap";
    labelEl.style.textAlign = "center";
    labelEl.style.opacity = "0.75";
    inner.appendChild(labelEl);
    chip.appendChild(inner);
  }

  document.body.appendChild(chip);

  const pickupStartRect = isMedia && visualRect ? visualRect : rect;
  const pickupEndX = event.clientX - followOffsetX;
  const pickupEndY = event.clientY - followOffsetY;

  let pickupControls = null;
  if (reduceMotion) {
    chip.style.transition = "none";
    chip.style.width = `${targetWidth}px`;
    chip.style.height = `${targetHeight}px`;
    chip.style.borderRadius = `${targetRadius}px`;
    chip.style.transform = `translate3d(${pickupEndX}px, ${pickupEndY}px, 0)`;
    if (!isMedia) chip.classList.add("is-shrunk");
  } else {
    chip.style.transition = `width ${PICKUP_MORPH_MS}ms ${MORPH_EASING}, height ${PICKUP_MORPH_MS}ms ${MORPH_EASING}, border-radius ${PICKUP_MORPH_MS}ms ${MORPH_EASING}`;
    chip.style.width = `${targetWidth}px`;
    chip.style.height = `${targetHeight}px`;
    chip.style.borderRadius = `${targetRadius}px`;
    if (!isMedia) chip.classList.add("is-shrunk");
    pickupControls = animate(
      chip,
      {
        x: [pickupStartRect.left, pickupEndX],
        y: [pickupStartRect.top, pickupEndY],
      },
      PICKUP_SPRING,
    );
  }

  let lastX = event.clientX;
  let lastY = event.clientY;
  let rafId = 0;
  let pickupSettled = reduceMotion;

  const applyFollow = () => {
    rafId = 0;
    chip.style.transform = `translate3d(${lastX - followOffsetX}px, ${lastY - followOffsetY}px, 0)`;
  };

  const queueFollow = (clientX, clientY) => {
    if (clientX > 0 || clientY > 0) {
      lastX = clientX;
      lastY = clientY;
    }
    if (!rafId) rafId = window.requestAnimationFrame(applyFollow);
  };

  const handleMove = (moveEvent) => {
    if (!pickupSettled) {
      pickupSettled = true;
      if (pickupControls) pickupControls.stop();
      chip.style.transition = "none";
      queueFollow(moveEvent.clientX, moveEvent.clientY);
      return;
    }
    queueFollow(moveEvent.clientX, moveEvent.clientY);
  };

  let didDrop = false;
  const handleDropCapture = () => {
    didDrop = true;
  };

  let finished = false;
  const finish = async () => {
    if (finished) return;
    finished = true;
    if (rafId) window.cancelAnimationFrame(rafId);
    if (pickupControls) pickupControls.stop();
    document.removeEventListener("dragover", handleMove);
    document.removeEventListener("drag", handleMove);
    document.removeEventListener("drop", handleDropCapture, true);
    document.removeEventListener("dragend", finish);

    try {
      const targetEl = didDrop ? findDropTargetUnder(lastX, lastY, chip) : null;
      const isValidDrop = didDrop && targetEl && targetEl !== source && !source.contains(targetEl);

      console.log("[drag-finish]", { didDrop, lastX, lastY, targetEl: targetEl?.tagName, targetDT: targetEl?.dataset?.dropTarget, isValidDrop, sourceTag: source.tagName });

      if (isValidDrop) {
        // For composer targets, animate to the text caret position instead of mouse position
        let dropEndX = lastX;
        let dropEndY = lastY;
        if (targetEl.dataset.dropTarget === "composer") {
          const editorEl = targetEl.querySelector("[contenteditable], .cursor-composer-textarea, .cursor-composer-mention-editor");
          const caretPos = getCaretPixelInEditor(editorEl, lastX, lastY);
          if (caretPos) {
            dropEndX = caretPos.x;
            dropEndY = caretPos.y + caretPos.height / 2;
          }
        }
        if (reduceMotion) {
          chip.style.transition = "none";
          chip.style.width = `${targetWidth}px`;
          chip.style.height = `${targetHeight}px`;
          chip.style.borderRadius = `${targetRadius}px`;
          chip.style.transform = `translate3d(${dropEndX - followOffsetX}px, ${dropEndY - followOffsetY}px, 0) scale(0.2)`;
          chip.style.opacity = "0";
        } else {
          const startX = lastX - followOffsetX;
          const startY = lastY - followOffsetY;
          const endX = dropEndX - followOffsetX;
          const endY = dropEndY - followOffsetY;
          const distance = Math.hypot(endX - startX, endY - startY);
          const arcHeight = Math.min(56, distance * 0.18);
          const midX = (startX + endX) / 2;
          const midY = Math.min(startY, endY) - arcHeight;
          const reactionTimer = setTimeout(() => {
            if (targetEl.isConnected) {
              targetEl.classList.add("is-drop-target-hit");
              setTimeout(() => {
                if (targetEl.isConnected) targetEl.classList.remove("is-drop-target-hit");
              }, 600);
            }
          }, DROP_DURATION * 1000 * 0.68);
          await animate(
            chip,
            {
              x: [startX, midX, endX],
              y: [startY, midY, endY],
              scale: [1, 0.55, 0.12],
              opacity: [1, 1, 0],
            },
            { duration: DROP_DURATION, easing: DROP_EASING },
          ).finished;
          clearTimeout(reactionTimer);
        }
      } else if (reduceMotion) {
        if (isMedia && visualRect) {
          chip.style.transition = "none";
          chip.style.width = `${visualRect.width}px`;
          chip.style.height = `${visualRect.height}px`;
          chip.style.borderRadius = `${visualRadius || sourceRadius}px`;
          chip.style.transform = `translate3d(${visualRect.left}px, ${visualRect.top}px, 0)`;
        } else if (isGridLike && visualRect) {
          chip.style.transition = "none";
          chip.style.opacity = "0";
          chip.style.transform = `translate3d(${
            visualRect.left + (visualRect.width - targetWidth) / 2
          }px, ${
            visualRect.top + (visualRect.height - targetHeight) / 2
          }px, 0)`;
        } else {
          chip.style.transition = "none";
          chip.style.width = `${rect.width}px`;
          chip.style.height = `${rect.height}px`;
          chip.style.borderRadius = `${sourceRadius}px`;
          chip.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0)`;
          if (!isMedia) chip.classList.remove("is-shrunk");
        }
      } else if (isMedia && visualRect) {
        const currentVisualEl = visualEl && visualEl.isConnected ? visualEl : null;
        const currentVisualRect = currentVisualEl ? currentVisualEl.getBoundingClientRect() : visualRect;
        const currentSnapRadius = currentVisualEl
          ? readComputedNumberPx(currentVisualEl, "borderTopLeftRadius")
          : visualRadius || sourceRadius;
        chip.style.transition = `width ${RETURN_MORPH_MS}ms ${MORPH_EASING}, height ${RETURN_MORPH_MS}ms ${MORPH_EASING}, border-radius ${RETURN_MORPH_MS}ms ${MORPH_EASING}`;
        chip.style.width = `${currentVisualRect.width}px`;
        chip.style.height = `${currentVisualRect.height}px`;
        chip.style.borderRadius = `${currentSnapRadius}px`;
        await animate(
          chip,
          {
            x: [lastX - followOffsetX, currentVisualRect.left],
            y: [lastY - followOffsetY, currentVisualRect.top],
          },
          RETURN_SPRING,
        ).finished;
      } else if (isGridLike && visualRect) {
        const currentVisualEl = visualEl && visualEl.isConnected ? visualEl : null;
        const currentVisualRect = currentVisualEl ? currentVisualEl.getBoundingClientRect() : visualRect;
        const endX = currentVisualRect.left + (currentVisualRect.width - targetWidth) / 2;
        const endY = currentVisualRect.top + (currentVisualRect.height - targetHeight) / 2;
        chip.style.transition = "opacity 180ms ease";
        await Promise.all([
          animate(
            chip,
            {
              x: [lastX - followOffsetX, endX],
              y: [lastY - followOffsetY, endY],
            },
            RETURN_SPRING,
          ).finished,
          animate(chip, { opacity: [0.96, 0] }, { delay: 0.08, duration: 0.22, easing: "ease-out" }).finished,
        ]);
      } else {
        const currentRect = source.isConnected ? source.getBoundingClientRect() : rect;
        const currentSourceRadius = source.isConnected ? readComputedNumberPx(source, "borderTopLeftRadius") : sourceRadius;
        chip.style.transition = `width ${RETURN_MORPH_MS}ms ${MORPH_EASING}, height ${RETURN_MORPH_MS}ms ${MORPH_EASING}, border-radius ${RETURN_MORPH_MS}ms ${MORPH_EASING}`;
        chip.style.width = `${currentRect.width}px`;
        chip.style.height = `${currentRect.height}px`;
        chip.style.borderRadius = `${currentSourceRadius}px`;
        if (!isMedia) chip.classList.remove("is-shrunk");
        await animate(
          chip,
          {
            x: [lastX - followOffsetX, currentRect.left],
            y: [lastY - followOffsetY, currentRect.top],
          },
          RETURN_SPRING,
        ).finished;
      }
    } finally {
      chip.remove();
      if (source.isConnected && source.dataset.dragToken === dragToken) {
        source.removeAttribute("data-drag-source");
        delete source.dataset.dragToken;
      }
    }
  };

  document.addEventListener("dragover", handleMove);
  document.addEventListener("drag", handleMove);
  document.addEventListener("drop", handleDropCapture, true);
  document.addEventListener("dragend", finish, { once: true });
}

function ExplorerEmpty({ flatEntries, rootEntries }) {
  if (rootEntries?.error || flatEntries?.error) {
    return (
      <div className="cursor-tree-empty text-red-400/90">
        {rootEntries?.error ?? flatEntries?.error}
      </div>
    );
  }
  return null;
}

function FileEntryButton({
  entry,
  className,
  label,
  children,
  onOpen,
  enableLongPress,
  onLongPress,
  onContextMenu,
  onDragStart,
  onDropEntry,
}) {
  const { longPressHandlers, longPressFired, clearLongPressFired } = useLongPress(
    enableLongPress && onLongPress ? () => onLongPress(entry) : undefined,
  );

  const isDir = entry.type === "dir";
  const [dragOver, setDragOver] = useState(false);

  return (
    <button
      type="button"
      className={`${className}${dragOver ? " is-drag-over" : ""}`}
      data-entry-path={entry.path}
      data-drop-target={isDir && onDropEntry ? "folder" : undefined}
      title={entry.path ? displayEntryPath(entry) : label}
      onClick={() => {
        if (longPressFired()) {
          clearLongPressFired();
          return;
        }
        onOpen();
      }}
      onContextMenu={onContextMenu}
      draggable={entry.type !== "parent"}
      onDragStart={onDragStart}
      onDragOver={isDir && onDropEntry ? (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setDragOver(true);
      } : undefined}
      onDragLeave={isDir && onDropEntry ? () => setDragOver(false) : undefined}
      onDrop={isDir && onDropEntry ? (e) => {
        e.preventDefault();
        setDragOver(false);
        onDropEntry(e, entry);
      } : undefined}
      {...longPressHandlers}
    >
      {children ?? (
        <>
          <Icon
            name={entry.type === "parent" ? "chevL" : explorerEntryIcon(entry)}
            size={15}
            className="text-cursor-muted shrink-0"
          />
          <span className="truncate">{label}</span>
        </>
      )}
    </button>
  );
}

function treeScrollProps(onBlankContextMenu) {
  if (!onBlankContextMenu) return {};
  return {
    onContextMenu: (ev) => {
      if (ev.target.closest("button")) return;
      ev.preventDefault();
      onBlankContextMenu(ev.clientX, ev.clientY);
    },
  };
}

function SearchDivider({ label }) {
  return (
    <div className="desk-file-search-divider" role="separator" aria-label={label}>
      {label}
    </div>
  );
}

function entryRowKey(entry, index) {
  return `${entry.type ?? "entry"}:${entry.path ?? entry.name ?? ".."}:${index}`;
}

function renderEntryRows({
  list,
  viewMode,
  workspaceId,
  pinnedPaths,
  searchScope,
  searchActive,
  onEntry,
  onEntryLongPress,
  onEntryContextMenu,
  onEntryDragStart,
  onEntryDrop,
  enableLongPress,
  rowClass,
  pinnedFolderIconClass,
  entryLabel,
  entryMeta,
}) {
  if (viewMode === "preview") {
    return (
      <div className="desk-file-preview-grid">
        {list.map((e, index) => {
          if (e.type === "search-divider") {
            return <SearchDivider key={entryRowKey(e, index)} label={e.name} />;
          }
          const label = entryLabel(e);
          return (
            <FileEntryButton
              key={entryRowKey(e, index)}
              entry={e}
              className={rowClass(e, "desk-file-preview-item")}
              label={label}
              onOpen={() => onEntry(e)}
              enableLongPress={enableLongPress}
              onLongPress={onEntryLongPress}
              onContextMenu={(ev) => onEntryContextMenu(ev, e)}
              onDragStart={(ev) => onEntryDragStart(ev, e)}
              onDropEntry={onEntryDrop}
            >
              <FileEntryThumb entry={e} workspaceId={workspaceId} size="preview" pinned={isPinnedEntry(e, pinnedPaths)} />
            </FileEntryButton>
          );
        })}
      </div>
    );
  }

  if (viewMode === "grid") {
    return (
      <div className="cursor-file-grid">
        {list.map((e, index) => {
          if (e.type === "search-divider") {
            return <SearchDivider key={entryRowKey(e, index)} label={e.name} />;
          }
          const label = entryLabel(e);
          if (e.type === "parent") {
            return (
              <FileEntryButton
                key={entryRowKey(e, index)}
                entry={e}
                className={rowClass(e, "desk-file-grid-item")}
                label=".."
                onOpen={() => onEntry(e)}
                enableLongPress={enableLongPress}
                onLongPress={onEntryLongPress}
                onContextMenu={(ev) => onEntryContextMenu(ev, e)}
                onDragStart={(ev) => onEntryDragStart(ev, e)}
              >
                <FileEntryThumb entry={e} workspaceId={workspaceId} size="grid" />
              </FileEntryButton>
            );
          }
          return (
            <FileEntryButton
              key={entryRowKey(e, index)}
              entry={e}
              className={rowClass(e, "desk-file-grid-item")}
              label={label}
              onOpen={() => onEntry(e)}
              enableLongPress={enableLongPress}
              onLongPress={onEntryLongPress}
              onContextMenu={(ev) => onEntryContextMenu(ev, e)}
              onDragStart={(ev) => onEntryDragStart(ev, e)}
              onDropEntry={onEntryDrop}
            >
              <FileEntryThumb entry={e} workspaceId={workspaceId} size="grid" pinned={isPinnedEntry(e, pinnedPaths)} />
            </FileEntryButton>
          );
        })}
      </div>
    );
  }

  return (
    <>
      <div className="desk-file-list-head" aria-hidden>
        <span className="desk-file-list-head-name">Content</span>
        <span className="desk-file-list-head-meta">{searchActive ? "Found in" : "Updated"}</span>
      </div>
      {list.map((e, index) => {
        if (e.type === "search-divider") {
          return <SearchDivider key={entryRowKey(e, index)} label={e.name} />;
        }
        const label = entryLabel(e);
        const metaDate = entryMeta(e, searchActive, searchScope);
        return (
          <FileEntryButton
            key={entryRowKey(e, index)}
            entry={e}
            className={rowClass(e, "desk-file-list-row")}
            label={label}
            onOpen={() => onEntry(e)}
            enableLongPress={enableLongPress}
            onLongPress={onEntryLongPress}
            onContextMenu={(ev) => onEntryContextMenu(ev, e)}
            onDragStart={(ev) => onEntryDragStart(ev, e)}
          >
            <span className="desk-file-list-name">
              <Icon
                name={e.type === "parent" ? "chevL" : explorerEntryIcon(e)}
                size={16}
                className={pinnedFolderIconClass(e)}
              />
              <span className="truncate">{label}</span>
            </span>
            <span className="desk-file-list-meta">{metaDate}</span>
          </FileEntryButton>
        );
      })}
    </>
  );
}

export function FileTree({
  viewMode = "list",
  rootEntries,
  listDir,
  onOpenFile,
  flatEntries,
  onNavigate,
  searchQuery = "",
  searchScope = "",
  searchResults = [],
  searchBusy = false,
  searchTruncated = false,
  workspaceId = "mercuryos",
  pinnedPaths,
  pinnedShortcuts = [],
  enableLongPress = false,
  onEntryLongPress,
  onEntryContextMenu,
  onBlankContextMenu,
  onEntryDrop,
}) {
  void listDir;
  const searchActive = Boolean(searchQuery.trim());
  const empty = ExplorerEmpty({ flatEntries, rootEntries });
  if (empty) return empty;

  const list = searchActive
    ? buildSearchList(searchResults, searchScope, pinnedShortcuts)
    : buildDisplayList(flatEntries, pinnedShortcuts);

  if (!list.length && (rootEntries?.loading || flatEntries?.loading)) {
    return <div className="desk-file-tree-scroll" {...treeScrollProps(onBlankContextMenu)} />;
  }

  if (!list.length) {
    const q = searchQuery.trim();
    return (
      <div
        className="desk-file-tree-scroll cursor-tree-empty-area"
        {...treeScrollProps(onBlankContextMenu)}
      >
        <div className="cursor-tree-empty">
          {q ? (searchBusy ? "Searching…" : "No matching files") : "Empty folder"}
        </div>
      </div>
    );
  }

  const onEntry = (e) => {
    const isDir = e.type === "dir";
    const name = e.name ?? e.path?.split("/").pop() ?? "?";
    if (e.type === "parent") onNavigate(e.path, e);
    else if (isDir) onNavigate(e.path, e);
    else onOpenFile(e.path, name, { size: e.size, mtimeMs: e.mtimeMs });
  };

  const onEntryDragStart = (e, entry) => {
    if (entry.type === "parent") return;
    document.body.classList.add("is-drag-cursor");
    writeExplorerDragData(e.dataTransfer, entry);
    setTransparentDragImage(e.dataTransfer);
    startFileDragPreview(e, entry, workspaceId);
    const cleanupDragCursor = () => {
      document.body.classList.remove("is-drag-cursor");
      document.removeEventListener("drop", cleanupDragCursor);
      document.removeEventListener("dragend", cleanupDragCursor);
    };
    document.addEventListener("drop", cleanupDragCursor, { once: true });
    document.addEventListener("dragend", cleanupDragCursor, { once: true });
  };

  const onContext = (ev, entry) => {
    if (!onEntryContextMenu) return;
    ev.preventDefault();
    onEntryContextMenu(entry, ev.clientX, ev.clientY);
  };

  const entryLabel = (e) => (e.type === "parent" ? (e.name ?? "Parent folder") : (e.name ?? e.path?.split("/").pop() ?? "?"));

  const entryMeta = (e, searching, scope) => {
    if (e.type === "parent") return "";
    if (searching) {
      const loc = searchResultMeta(e, scope);
      if (loc) return loc;
    }
    if (e.type === "dir") return "Folder";
    return formatFileDate(e.mtimeMs);
  };

  const pinnedFolderIconClass = (e) =>
    isPinnedEntry(e, pinnedPaths) && (e.type === "dir" || e.isPinnedShortcut)
      ? "desk-file-entry-icon--pinned shrink-0"
      : "text-cursor-muted shrink-0";

  const rowClass = (e, base) => {
    const pinned = isPinnedEntry(e, pinnedPaths);
    return `${base}${pinned ? " is-folder-pinned" : ""}${e.type === "parent" ? " is-parent-row" : ""}`;
  };

  const rows = renderEntryRows({
    list,
    viewMode,
    workspaceId,
    pinnedPaths,
    searchScope,
    searchActive,
    onEntry,
    onEntryLongPress,
    onEntryContextMenu: onContext,
    onEntryDragStart,
    onEntryDrop,
    enableLongPress,
    rowClass,
    pinnedFolderIconClass,
    entryLabel,
    entryMeta,
  });

  return (
    <div className="desk-file-tree-scroll" {...treeScrollProps(onBlankContextMenu)}>
      {viewMode === "list" ? <div className="desk-file-list">{rows}</div> : rows}
      {searchActive && searchTruncated ? (
        <div className="desk-file-search-truncated" role="status">
          Showing first matches — refine your search
        </div>
      ) : null}
      {searchActive && searchBusy ? (
        <div className="desk-file-search-busy" role="status" aria-live="polite">
          Searching…
        </div>
      ) : null}
    </div>
  );
}
