// @ts-nocheck
"use client";

import { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useFloatingMenuPosition } from "@/desk/lib/use-floating-menu-position";

export function clipIsMuted(clip) {
  return (clip?.effects?.volume ?? 1) <= 0.0005;
}

export function buildClipMenuItems({ clip, media, canSplit }) {
  if (!clip) return [];
  const muted = clipIsMuted(clip);
  const hasAsset = Boolean(clip.assetId);
  const mediaKind = media?.kind;
  const isVideoClip = clip.kind === "video";
  const isAudioClip = clip.kind === "audio";
  const isText = clip.kind === "text";

  const items = [{ id: "rename", label: "Rename" }];

  if (!isText) {
    items.push({ id: "mute", label: muted ? "Unmute" : "Mute" });
  }

  items.push({ id: "sep-edit", sep: true });
  items.push({ id: "duplicate", label: "Duplicate" });
  if (!isText) {
    items.push({
      id: "split",
      label: "Split at playhead",
      disabled: !canSplit,
    });
  }
  if (isVideoClip && hasAsset) {
    items.push({ id: "detach-audio", label: "Separate audio" });
  }

  if (hasAsset && !isText) {
    items.push({ id: "sep-download", sep: true });
    if (isVideoClip || mediaKind === "video") {
      items.push({ id: "download-video", label: "Save as video" });
      items.push({ id: "download-audio", label: "Save as audio" });
    } else if (isAudioClip || mediaKind === "audio") {
      items.push({ id: "download-audio", label: "Download audio" });
    } else {
      items.push({ id: "download", label: "Download" });
    }
  }

  items.push({ id: "sep-danger", sep: true });
  items.push({ id: "delete", label: "Delete", danger: true });
  return items;
}

export function TimelineClipContextMenu({
  clip,
  media,
  x,
  y,
  canSplit,
  onClose,
  onAction,
}) {
  const menuRef = useRef(null);
  const items = useMemo(
    () => buildClipMenuItems({ clip, media, canSplit }),
    [clip, media, canSplit],
  );
  const open = Boolean(clip) && typeof document !== "undefined";
  const pos = useFloatingMenuPosition(x, y, menuRef, open, [
    items.length,
    clip?.id,
    clip?.kind,
  ]);

  useEffect(() => {
    if (!clip) return;
    const onDoc = (e) => {
      if (e.type === "contextmenu") return;
      if (menuRef.current?.contains(e.target)) return;
      onClose();
    };
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    const t = window.setTimeout(() => {
      document.addEventListener("mousedown", onDoc);
      document.addEventListener("scroll", onDoc, true);
      document.addEventListener("keydown", onKey);
    }, 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("scroll", onDoc, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [clip, onClose]);

  if (!open) return null;

  const menu = (
    <div
      ref={menuRef}
      className="cursor-tab-context-menu"
      style={{ left: pos.left, top: pos.top }}
      role="menu"
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {items.map((item) =>
        item.sep ? (
          <div key={item.id} className="cursor-tab-context-sep" role="separator" />
        ) : (
          <button
            key={item.id}
            type="button"
            className={`cursor-tab-context-item${item.danger ? " is-danger" : ""}`}
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              if (item.disabled) return;
              onAction(item.id);
              onClose();
            }}
          >
            {item.label}
          </button>
        ),
      )}
    </div>
  );

  return createPortal(menu, document.body);
}
