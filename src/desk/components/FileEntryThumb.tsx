// @ts-nocheck
"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "./Icons";
import * as api from "@mos-app/api.js";
import { explorerEntryIcon, fileExt, fileViewerKind } from "@/desk/lib/file-kind";
import { workspaceFileRawUrl, workspaceFileThumbUrl } from "@/desk/lib/workspace-file-url.js";
import { displayEntryPath } from "@/desk/lib/display-path";
import { externalPreviewUrl } from "@mos-app/preview.js";

const TEXT_KINDS = new Set(["code", "markdown", "html", "csv", "text"]);

/** Browser decode cache — warm URLs as soon as Convex returns them. */
const warmedThumbUrls = new Set();

export function warmThumbUrl(url) {
  if (!url || typeof url !== "string" || warmedThumbUrls.has(url)) return;
  if (typeof Image === "undefined") return;
  warmedThumbUrls.add(url);
  const img = new Image();
  img.decoding = "async";
  img.src = url;
}

function isVideoFileUrl(url) {
  return typeof url === "string" && /\.(mp4|webm|mov)(\?|#|$)/i.test(url);
}

function entryKind(entry) {
  if (entry?.type === "dir" || entry?.type === "parent") {
    return entry.type === "parent" ? "parent" : "dir";
  }
  if (entry?.studioKind === "document") return "markdown";
  if (entry?.studioKind === "videoEdit") return "videoEdit";
  if (entry?.kind === "image" || entry?.kind === "video" || entry?.kind === "audio") {
    return entry.kind;
  }
  return fileViewerKind(entry?.ext ?? fileExt(entry?.path ?? entry?.name ?? ""));
}

function ThumbWithPeek({ children, name, badge }) {
  return (
    <div className="desk-file-thumb-peek-wrap">
      {children}
      {badge ? (
        <span className="desk-file-thumb-badge" aria-hidden>
          <Icon name={badge} size={14} />
        </span>
      ) : null}
      <ThumbPeekLabel name={name} />
    </div>
  );
}

export function elementBadgeIcon(elementType) {
  if (elementType === "character") return "user";
  if (elementType === "prop") return "package";
  if (elementType === "location") return "mapPin";
  return "fileText";
}

function peekItemIcon(item) {
  if (item.kind === "element" && item.elementType) {
    return elementBadgeIcon(item.elementType);
  }
  if (item.icon) return item.icon;
  if (item.kind === "document") return "fileText";
  if (item.kind === "video") return "film";
  if (item.kind === "image") return "image";
  return "file";
}

function peekDisplayName(label) {
  const raw = String(label ?? "").replace(/^@/, "").trim();
  if (!raw) return "Item";
  return raw.length > 18 ? `${raw.slice(0, 17)}…` : raw;
}

/**
 * Instant-feel thumb: calm placeholder → optional LQIP → sharp thumb crossfade.
 * Avoids blinky remounts when the browser already has the image decoded.
 */
function ProgressiveThumb({
  src,
  lqipSrc,
  className = "",
  eager = false,
}) {
  const [hiLoaded, setHiLoaded] = useState(false);
  const [showUnderlay, setShowUnderlay] = useState(true);
  const [failed, setFailed] = useState(false);
  const hiRef = useRef(null);
  const loadedSrcRef = useRef("");
  const underlayTimerRef = useRef(0);

  const markLoaded = useCallback((url) => {
    if (!url) return;
    loadedSrcRef.current = url;
    setHiLoaded(true);
    window.clearTimeout(underlayTimerRef.current);
    underlayTimerRef.current = window.setTimeout(() => {
      setShowUnderlay(false);
    }, 280);
  }, []);

  useLayoutEffect(() => {
    setFailed(false);
    window.clearTimeout(underlayTimerRef.current);

    if (!src) {
      setHiLoaded(false);
      setShowUnderlay(true);
      return;
    }

    // Same URL already shown — keep it painted (avoids Convex re-render blink).
    if (loadedSrcRef.current === src) {
      setHiLoaded(true);
      setShowUnderlay(false);
      return;
    }

    warmThumbUrl(lqipSrc);
    warmThumbUrl(src);

    const img = hiRef.current;
    if (img?.complete && img.naturalWidth > 0 && img.currentSrc) {
      markLoaded(src);
      return;
    }

    setHiLoaded(false);
    setShowUnderlay(true);
  }, [src, lqipSrc, markLoaded]);

  useEffect(() => {
    return () => window.clearTimeout(underlayTimerRef.current);
  }, []);

  if (!src || failed) return null;

  return (
    <span className={`desk-file-thumb-progressive${hiLoaded ? " is-ready" : ""}`}>
      {showUnderlay ? (
        <>
          <span className="desk-file-thumb-skeleton" aria-hidden />
          {lqipSrc ? (
            <img
              src={lqipSrc}
              alt=""
              className={`desk-file-thumb-lqip ${className}`.trim()}
              decoding="async"
              loading={eager ? "eager" : "lazy"}
              draggable={false}
            />
          ) : null}
        </>
      ) : null}
      <img
        ref={hiRef}
        src={src}
        alt=""
        className={`desk-file-thumb-hi ${className}${hiLoaded ? " is-loaded" : ""}`.trim()}
        decoding="async"
        loading={eager ? "eager" : "lazy"}
        fetchPriority={eager ? "high" : "auto"}
        draggable={false}
        onLoad={() => markLoaded(src)}
        onError={() => {
          setFailed(true);
          setHiLoaded(false);
          setShowUnderlay(true);
          loadedSrcRef.current = "";
        }}
      />
    </span>
  );
}

function VideoThumb({ src, className = "" }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <div className="desk-file-thumb-fallback">
        <Icon name="film" size={26} className="text-cursor-muted" />
      </div>
    );
  }

  return (
    <span className={`desk-file-thumb-video-wrap${loaded ? " is-ready" : ""}`}>
      {!loaded ? <span className="desk-file-thumb-skeleton desk-file-thumb-skeleton--spinner" aria-hidden /> : null}
      <video
        src={src}
        className={className}
        crossOrigin="anonymous"
        muted
        playsInline
        preload="metadata"
        onLoadedData={() => setLoaded(true)}
        onError={() => setFailed(true)}
      />
    </span>
  );
}

function FolderPeekStack({ items, size = "grid" }) {
  const cards = (items ?? []).slice(0, 3);
  if (!cards.length) return null;
  const iconSize = size === "preview" ? 16 : 13;
  const eager = size === "grid";
  return (
    <div className="desk-folder-peek-stack" data-count={cards.length} aria-hidden="true">
      {cards.map((item, index) => (
        <div
          key={`${item.label}-${index}`}
          className={`desk-folder-peek-card desk-folder-peek-card--${index}${item.kind === "element" ? " desk-folder-peek-card--element" : ""}`}
        >
          <div className="desk-folder-peek-card-media">
            {item.thumbnailUrl ? (
              <ProgressiveThumb
                src={item.thumbnailUrl}
                lqipSrc={item.thumbnailLqipUrl}
                eager={eager && index === 0}
              />
            ) : (
              <span className="desk-folder-peek-icon">
                <Icon name={peekItemIcon(item)} size={iconSize} className="text-cursor-muted" />
              </span>
            )}
          </div>
          <span className="desk-folder-peek-label" title={item.label}>
            {peekDisplayName(item.label)}
          </span>
        </div>
      ))}
    </div>
  );
}

function FolderThumbVisual({ entry, icon, folderIconClass, size }) {
  const peekItems = entry?.peekItems ?? [];
  const hasPeek = peekItems.length > 0 && entry?.type === "dir";
  if (hasPeek) {
    return (
      <div className="desk-file-thumb-folder desk-file-thumb-folder--peek">
        <FolderPeekStack items={peekItems} size={size} />
      </div>
    );
  }
  return (
    <div className="desk-file-thumb-folder">
      <Icon name={icon} size={size === "preview" ? 40 : 30} className={folderIconClass} />
    </div>
  );
}

function ThumbPeekLabel({ name }) {
  const text = peekDisplayName(name);
  return (
    <span className="desk-file-thumb-peek-label" title={name}>
      {text}
    </span>
  );
}

function TextSnippet({ path, workspaceId, className }) {
  const [snippet, setSnippet] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSnippet("");
    setFailed(false);
    void api
      .readFile(path, workspaceId)
      .then((file) => {
        if (cancelled) return;
        const raw = String(file?.content ?? "").replace(/\s+/g, " ").trim();
        setSnippet(raw.slice(0, 220));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [path, workspaceId]);

  if (failed) {
    return (
      <div className={`desk-file-thumb-fallback ${className ?? ""}`.trim()}>
        <Icon name="fileText" size={28} className="text-cursor-muted" />
      </div>
    );
  }
  if (!snippet) {
    return <div className={`desk-file-thumb-loading ${className ?? ""}`.trim()} aria-hidden />;
  }
  return (
    <pre className={`desk-file-thumb-text ${className ?? ""}`.trim()}>{snippet}</pre>
  );
}

export function FileEntryThumb({
  entry,
  workspaceId = "mercuryos",
  size = "grid",
  showLabel = true,
  pinned = false,
}) {
  const name = entry?.name ?? entry?.path?.split("/").pop() ?? "?";
  const label = entry?.type === "parent" ? ".." : name;
  const kind = entryKind(entry);
  const icon = entry?.type === "parent" ? "chevL" : explorerEntryIcon(entry);
  const mediaUrl =
    entry?.mediaUrl ??
    (entry?.path && kind !== "dir" && kind !== "parent"
      ? workspaceFileRawUrl(entry.path, workspaceId, entry.mtimeMs ?? null)
      : null);
  const thumbUrl =
    entry?.thumbnailUrl ??
    (entry?.path && (kind === "image" || kind === "video")
      ? workspaceFileThumbUrl(entry.path, workspaceId, size === "preview" ? 640 : 420)
      : null);
  const lqipUrl = entry?.thumbnailLqipUrl ?? null;
  const previewUrl =
    entry?.path && (kind === "pdf" || kind === "html")
      ? externalPreviewUrl(entry.path, workspaceId)
      : mediaUrl;
  const eagerFirst = size === "grid";

  const folderIconClass =
    pinned && (kind === "dir" || kind === "parent")
      ? "desk-file-entry-icon--pinned"
      : "text-cursor-muted";

  let visual = (
    <div className="desk-file-thumb-fallback">
      <Icon name={icon} size={size === "preview" ? 36 : 26} className={folderIconClass} />
    </div>
  );
  let inlinePeekLabel = false;

  if (kind === "dir" || kind === "parent") {
    const isTrash = entry?.studioKind === "trash";
    if (isTrash) {
      visual = (
        <div className="desk-file-thumb-fallback desk-file-thumb-fallback--trash">
          <Icon name="trash" size={size === "preview" ? 36 : 26} className="text-cursor-muted" />
        </div>
      );
    } else {
      const hasFolderPeek = entry?.type === "dir" && (entry?.peekItems ?? []).length > 0;
      visual = (
        <div
          className={`desk-file-thumb-peek-wrap desk-file-thumb-peek-wrap--folder${hasFolderPeek ? " desk-file-thumb-peek-wrap--folder-peek" : ""}`}
        >
          <FolderThumbVisual
            entry={entry}
            icon={icon}
            folderIconClass={folderIconClass}
            size={size}
          />
          <span className="desk-file-thumb-badge" aria-hidden="true">
            <Icon
              name={icon}
              size={14}
              className={folderIconClass === "desk-file-entry-icon--pinned" ? folderIconClass : undefined}
            />
          </span>
          <ThumbPeekLabel name={label} />
        </div>
      );
    }
  } else if (entry?.studioKind === "element") {
    const badge = elementBadgeIcon(entry.elementType);
    const sheetUrl = thumbUrl && !isVideoFileUrl(thumbUrl) ? thumbUrl : null;
    visual = sheetUrl ? (
      <div className="desk-file-thumb-peek-wrap desk-file-thumb-peek-wrap--element">
        <ProgressiveThumb
          src={sheetUrl}
          lqipSrc={lqipUrl}
          className="desk-file-thumb-image"
          eager={eagerFirst}
        />
        <span className="desk-file-thumb-badge" aria-hidden>
          <Icon name={badge} size={14} />
        </span>
        <ThumbPeekLabel name={label} />
      </div>
    ) : (
      <div className="desk-file-thumb-fallback">
        <Icon name={badge} size={size === "preview" ? 36 : 26} className="text-cursor-muted" />
      </div>
    );
  } else {
    const isImage = kind === "image";
    const isVideo = kind === "video";
    const isScript = kind === "markdown" || entry?.studioKind === "document";
    const isVideoEdit = kind === "videoEdit" || entry?.studioKind === "videoEdit";
    const videoPosterUrl =
      isVideo && thumbUrl && thumbUrl !== mediaUrl && !isVideoFileUrl(thumbUrl)
        ? thumbUrl
        : undefined;

    if (isImage && (thumbUrl || mediaUrl)) {
      visual = (
        <ThumbWithPeek name={label} badge="image">
          <ProgressiveThumb
            src={thumbUrl || mediaUrl}
            lqipSrc={lqipUrl}
            className="desk-file-thumb-image"
            eager={eagerFirst}
          />
        </ThumbWithPeek>
      );
      inlinePeekLabel = true;
    } else if (isVideo) {
      visual = (
        <ThumbWithPeek name={label} badge="film">
          {videoPosterUrl ? (
            <ProgressiveThumb
              src={videoPosterUrl}
              lqipSrc={lqipUrl}
              className="desk-file-thumb-video"
              eager={eagerFirst}
            />
          ) : mediaUrl || thumbUrl ? (
            <VideoThumb src={mediaUrl ?? thumbUrl} className="desk-file-thumb-video" />
          ) : (
            <div className="desk-file-thumb-fallback">
              <Icon name="film" size={size === "preview" ? 36 : 26} className="text-cursor-muted" />
            </div>
          )}
        </ThumbWithPeek>
      );
      inlinePeekLabel = true;
    } else if (isScript) {
      visual = (
        <ThumbWithPeek name={label} badge="fileText">
          {entry?.path && size === "preview" && entry?.studioKind !== "document" ? (
            <TextSnippet path={entry.path} workspaceId={workspaceId} className="desk-file-thumb-text-wrap" />
          ) : (
            <div className="desk-file-thumb-fallback">
              <Icon name="fileText" size={size === "preview" ? 36 : 26} className="text-cursor-muted" />
            </div>
          )}
        </ThumbWithPeek>
      );
      inlinePeekLabel = true;
    } else if (isVideoEdit) {
      visual = (
        <ThumbWithPeek name={label} badge="film">
          <div className="desk-file-thumb-fallback">
            <Icon name="film" size={size === "preview" ? 36 : 26} className="text-cursor-muted" />
          </div>
        </ThumbWithPeek>
      );
      inlinePeekLabel = true;
    } else if (kind === "audio" && mediaUrl) {
      visual = (
        <div className="desk-file-thumb-audio">
          <Icon name="music" size={32} className="text-cursor-muted" />
        </div>
      );
    } else if (kind === "pdf" && previewUrl) {
      visual = <iframe title={label} src={previewUrl} className="desk-file-thumb-iframe" />;
    } else if (TEXT_KINDS.has(kind) && entry?.path && size === "preview") {
      visual = <TextSnippet path={entry.path} workspaceId={workspaceId} className="desk-file-thumb-text-wrap" />;
    }
  }

  if (!inlinePeekLabel) {
    inlinePeekLabel =
      kind === "dir" ||
      kind === "parent" ||
      (entry?.studioKind === "element" && Boolean(thumbUrl && !isVideoFileUrl(thumbUrl)));
  }

  return (
    <div className={`desk-file-thumb desk-file-thumb--${size}`}>
      <div className="desk-file-thumb-visual">{visual}</div>
      {showLabel && !inlinePeekLabel ? (
        <span className="desk-file-thumb-label" title={entry?.path ? displayEntryPath(entry) : label}>
          {label}
        </span>
      ) : null}
    </div>
  );
}
