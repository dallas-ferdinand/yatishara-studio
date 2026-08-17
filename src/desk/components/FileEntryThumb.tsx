// @ts-nocheck
"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "./Icons";
import * as api from "@mos-app/api.js";
import { explorerEntryIcon, fileExt, fileViewerKind } from "@/desk/lib/file-kind";
import { workspaceFileRawUrl, workspaceFileThumbUrl } from "@/desk/lib/workspace-file-url.js";
import { displayEntryPath } from "@/desk/lib/display-path";
import { externalPreviewUrl } from "@mos-app/preview.js";
import { MediaLoadWave } from "@/studio/components/media-load-frame";
import { mediaUrlPath } from "@/studio/lib/mediaUrls";
import { StudioEmoji } from "@/studio/components/StudioEmoji";

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

function ThumbWithPeek({
  children,
  name,
  badge,
  renaming = false,
  renameInitialName,
  onRenameCommit,
  onRenameDismiss,
  onDoubleClickRename,
  wrapMod = "",
}) {
  return (
    <div className={`desk-file-thumb-peek-wrap${wrapMod ? ` ${wrapMod}` : ""}`}>
      {children}
      {badge ? (
        <span className="desk-file-thumb-badge" aria-hidden>
          <Icon name={badge} size={14} />
        </span>
      ) : null}
      <ThumbPeekLabelOrRename
        name={name}
        renaming={renaming}
        renameInitialName={renameInitialName}
        onRenameCommit={onRenameCommit}
        onRenameDismiss={onRenameDismiss}
        onDoubleClickRename={onDoubleClickRename}
      />
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
  if (item.icon === "scissors") return "clapperboard";
  if (item.icon) return item.icon;
  if (item.kind === "document") return "fileText";
  if (item.kind === "video") return "play";
  if (item.kind === "videoEdit") return "studioProject";
  if (item.kind === "image") return "image";
  if (item.kind === "audio") return "music";
  return "file";
}

function seedFromId(id) {
  let seed = 2166136261;
  const text = String(id || "audio");
  for (let i = 0; i < text.length; i += 1) {
    seed ^= text.charCodeAt(i);
    seed = Math.imul(seed, 16777619);
  }
  return seed >>> 0;
}

function nextRand(seed) {
  let x = seed || 1;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return x >>> 0;
}

/** Dense pseudo-waveform tile — no decode required. */
function AudioWaveThumb({ seedKey = "audio", barCount = 28, className = "" }) {
  const bars = [];
  let seed = seedFromId(seedKey);
  for (let i = 0; i < barCount; i += 1) {
    seed = nextRand(seed);
    const a = (seed % 1000) / 1000;
    seed = nextRand(seed);
    const b = (seed % 1000) / 1000;
    const envelope = 0.32 + 0.68 * Math.abs(Math.sin(i * 0.37 + a * 4));
    bars.push(Math.max(0.16, Math.min(1, envelope * (0.42 + b * 0.58))));
  }
  return (
    <div className={`desk-file-thumb-audio ${className}`.trim()} aria-hidden="true">
      <div className="desk-file-thumb-audio-wave">
        {bars.map((h, i) => (
          <span key={i} style={{ height: `${Math.round(h * 100)}%` }} />
        ))}
      </div>
    </div>
  );
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
  const [retryTick, setRetryTick] = useState(0);
  const hiRef = useRef(null);
  const loadedSrcRef = useRef("");
  const underlayTimerRef = useRef(0);
  const retryTimerRef = useRef(0);
  const attemptRef = useRef(0);

  const markLoaded = useCallback((url) => {
    if (!url) return;
    loadedSrcRef.current = url;
    attemptRef.current = 0;
    // Defer: cached <img onLoad> / complete-during-layout can fire in commit and
    // schedule a render-phase update (React #301) when many thumbs mount at boot.
    queueMicrotask(() => {
      setHiLoaded((prev) => (prev ? prev : true));
      setFailed((prev) => (prev ? false : prev));
    });
    window.clearTimeout(underlayTimerRef.current);
    underlayTimerRef.current = window.setTimeout(() => {
      setShowUnderlay(false);
    }, 280);
  }, []);

  useLayoutEffect(() => {
    attemptRef.current = 0;
    window.clearTimeout(underlayTimerRef.current);
    window.clearTimeout(retryTimerRef.current);

    if (!src) {
      setFailed((prev) => (prev ? false : prev));
      setHiLoaded((prev) => (prev ? false : prev));
      setShowUnderlay((prev) => (prev ? prev : true));
      return;
    }

    // Same media path already shown — ignore signed-token churn on Convex refetch.
    if (
      loadedSrcRef.current === src ||
      (loadedSrcRef.current && mediaUrlPath(loadedSrcRef.current) === mediaUrlPath(src))
    ) {
      setFailed((prev) => (prev ? false : prev));
      setHiLoaded((prev) => (prev ? prev : true));
      setShowUnderlay((prev) => (prev ? false : prev));
      return;
    }

    warmThumbUrl(lqipSrc);
    warmThumbUrl(src);

    const img = hiRef.current;
    if (img?.complete && img.naturalWidth > 0 && img.currentSrc) {
      markLoaded(src);
      return;
    }

    setFailed((prev) => (prev ? false : prev));
    setHiLoaded((prev) => (prev ? false : prev));
    setShowUnderlay((prev) => (prev ? prev : true));
  }, [src, lqipSrc, markLoaded]);

  useEffect(() => {
    return () => {
      window.clearTimeout(underlayTimerRef.current);
      window.clearTimeout(retryTimerRef.current);
    };
  }, []);

  if (!src || failed) return null;

  return (
    <span className={`desk-file-thumb-progressive${hiLoaded ? " is-ready" : ""}`}>
      {showUnderlay ? (
        <>
          <span className="desk-file-thumb-skeleton desk-file-thumb-skeleton--logo" aria-hidden>
            <MediaLoadWave size="sm" ring />
          </span>
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
        key={`${mediaUrlPath(src)}::${retryTick}`}
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
          // Fresh uploads / generations often 404 once before CDN catches up.
          // Retry a few times instead of latching blank until folder remount.
          const attempt = attemptRef.current + 1;
          attemptRef.current = attempt;
          if (attempt > 5) {
            loadedSrcRef.current = "";
            queueMicrotask(() => {
              setFailed(true);
              setHiLoaded(false);
              setShowUnderlay(true);
            });
            return;
          }
          window.clearTimeout(retryTimerRef.current);
          retryTimerRef.current = window.setTimeout(
            () => setRetryTick((tick) => tick + 1),
            Math.min(4000, 350 * 2 ** (attempt - 1)),
          );
        }}
      />
    </span>
  );
}

function VideoThumb({ src, className = "", fallbackIcon = "play" }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retryTick, setRetryTick] = useState(0);
  const [heldSrc, setHeldSrc] = useState(src);
  const pathRef = useRef(mediaUrlPath(src));
  const attemptRef = useRef(0);
  const retryTimerRef = useRef(0);

  useEffect(() => {
    if (!src) return;
    const path = mediaUrlPath(src);
    if (path !== pathRef.current) {
      pathRef.current = path;
      setHeldSrc(src);
      setLoaded(false);
      setFailed(false);
      attemptRef.current = 0;
    }
    window.clearTimeout(retryTimerRef.current);
    return () => window.clearTimeout(retryTimerRef.current);
  }, [src]);

  const displaySrc = heldSrc || src;

  if (!displaySrc || failed) {
    return (
      <div className="desk-file-thumb-fallback">
        <Icon name={fallbackIcon} size={26} className="text-cursor-muted" />
      </div>
    );
  }

  return (
    <span className={`desk-file-thumb-video-wrap${loaded ? " is-ready" : ""}`}>
      {!loaded ? (
        <span className="desk-file-thumb-skeleton desk-file-thumb-skeleton--logo" aria-hidden>
          <MediaLoadWave size="sm" ring />
        </span>
      ) : null}
      <video
        key={`${mediaUrlPath(displaySrc)}::${retryTick}`}
        src={displaySrc}
        className={className}
        crossOrigin="anonymous"
        muted
        playsInline
        preload="metadata"
        onLoadedData={() => {
          attemptRef.current = 0;
          queueMicrotask(() => setLoaded((prev) => (prev ? prev : true)));
        }}
        onError={() => {
          const attempt = attemptRef.current + 1;
          attemptRef.current = attempt;
          if (attempt > 5) {
            queueMicrotask(() => setFailed(true));
            return;
          }
          window.clearTimeout(retryTimerRef.current);
          retryTimerRef.current = window.setTimeout(
            () => setRetryTick((tick) => tick + 1),
            Math.min(4000, 350 * 2 ** (attempt - 1)),
          );
        }}
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
            {item.kind === "audio" || item.icon === "music" ? (
              <AudioWaveThumb
                seedKey={item.label ?? `peek-audio-${index}`}
                barCount={size === "preview" ? 22 : 16}
                className="desk-file-thumb-audio--peek"
              />
            ) : item.thumbnailUrl ? (
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

function ThumbPeekLabel({ name, onDoubleClickRename }) {
  const text = peekDisplayName(name);
  const canRename = typeof onDoubleClickRename === "function";
  return (
    <span
      className={`desk-file-thumb-peek-label${canRename ? " is-renameable" : ""}`}
      title={canRename ? `${name} — double-click to rename` : name}
      onClick={(event) => {
        if (!canRename) return;
        event.preventDefault();
        event.stopPropagation();
      }}
      onPointerDown={(event) => {
        if (!canRename) return;
        event.stopPropagation();
      }}
      onDoubleClick={(event) => {
        if (!canRename) return;
        event.preventDefault();
        event.stopPropagation();
        onDoubleClickRename();
      }}
    >
      {text}
    </span>
  );
}

export function InlineRenameInput({
  initialName = "",
  className = "desk-file-thumb-rename-input",
  onCommit,
  onDismiss,
}) {
  const inputRef = useRef(null);
  const [value, setValue] = useState(() => String(initialName ?? ""));
  const finishedRef = useRef(false);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, []);

  const finish = (mode) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    if (mode === "commit") onCommit?.(value);
    else onDismiss?.();
  };

  return (
    <input
      ref={inputRef}
      type="text"
      className={className}
      value={value}
      aria-label="Folder name"
      onChange={(event) => setValue(event.target.value)}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") {
          event.preventDefault();
          finish("commit");
        } else if (event.key === "Escape") {
          event.preventDefault();
          finish("dismiss");
        }
      }}
      onBlur={() => finish("commit")}
    />
  );
}

function ThumbPeekLabelOrRename({
  name,
  renaming,
  renameInitialName,
  onRenameCommit,
  onRenameDismiss,
  onDoubleClickRename,
}) {
  if (renaming) {
    return (
      <InlineRenameInput
        initialName={renameInitialName ?? name}
        onCommit={onRenameCommit}
        onDismiss={onRenameDismiss}
      />
    );
  }
  return <ThumbPeekLabel name={name} onDoubleClickRename={onDoubleClickRename} />;
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
  renaming = false,
  renameInitialName,
  onRenameCommit,
  onRenameDismiss,
  onLabelDoubleClick,
  onReactionPick,
  onReactionHover,
  onReactionHoverLeave,
}) {
  const name = entry?.name ?? entry?.path?.split("/").pop() ?? "?";
  const label = name;
  const kind = entryKind(entry);
  const icon = entry?.type === "parent" ? "chevL" : explorerEntryIcon(entry);
  const mediaUrl =
    entry?.mediaUrl ??
    (entry?.path &&
    kind !== "dir" &&
    kind !== "parent" &&
    entry?.studioKind !== "videoEdit" &&
    entry?.studioKind !== "document" &&
    entry?.studioKind !== "element"
      ? workspaceFileRawUrl(entry.path, workspaceId, entry.mtimeMs ?? null)
      : null);
  const thumbUrl =
    entry?.thumbnailUrl ??
    (entry?.path &&
    (kind === "image" || kind === "video") &&
    entry?.studioKind !== "videoEdit"
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
    const isRecents = entry?.studioKind === "recents";
    const isTrash = entry?.studioKind === "trash";
    const isMessages =
      entry?.studioKind === "messages" || entry?.systemKind === "messages";
    const isPurchased =
      entry?.studioKind === "purchased" || entry?.systemKind === "purchased_assets";
    const isPublic =
      entry?.studioKind === "public" || entry?.systemKind === "public_assets";
    const isShared =
      entry?.studioKind === "shared" || entry?.systemKind === "shared_with_me";
    if (isRecents || isTrash || isMessages || isPurchased || isPublic || isShared) {
      // System folders: big center glyph only — no bottom-left type chip.
      // Keep in sync with explorerEntryIcon (list view uses that).
      const systemIcon = isRecents
        ? "clock"
        : isTrash
          ? "trash"
          : isMessages
            ? "message"
            : isPurchased
              ? "shoppingBag"
              : isShared
                ? "share"
                : "globe";
      const systemMod = isRecents
        ? "recents"
        : isTrash
          ? "trash"
          : isMessages
            ? "messages"
            : isPurchased
              ? "purchased"
              : isShared
                ? "shared"
                : "public";
      visual = (
        <div
          className={`desk-file-thumb-peek-wrap desk-file-thumb-peek-wrap--folder desk-file-thumb-peek-wrap--system desk-file-thumb-peek-wrap--${systemMod}`}
        >
          <div
            className={`desk-file-thumb-fallback desk-file-thumb-fallback--${systemMod}`}
          >
            <Icon
              name={systemIcon}
              size={size === "preview" ? 36 : 26}
              className="text-cursor-muted"
            />
          </div>
          <ThumbPeekLabelOrRename
            name={label}
            renaming={renaming}
            renameInitialName={renameInitialName}
            onRenameCommit={onRenameCommit}
            onRenameDismiss={onRenameDismiss}
            onDoubleClickRename={onLabelDoubleClick}
          />
        </div>
      );
    } else {
      const hasFolderPeek = entry?.type === "dir" && (entry?.peekItems ?? []).length > 0;
      const isParent = entry?.type === "parent";
      const showSharedBadge = Boolean(entry?.hasOutgoingShare);
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
          {showSharedBadge ? (
            <span className="desk-file-thumb-shared" aria-label="Shared">
              <Icon name="share" size={11} />
            </span>
          ) : null}
          {!isParent ? (
            <span className="desk-file-thumb-badge" aria-hidden="true">
              <Icon
                name={icon}
                size={14}
                className={folderIconClass === "desk-file-entry-icon--pinned" ? folderIconClass : undefined}
              />
            </span>
          ) : null}
          <ThumbPeekLabelOrRename
            name={label}
            renaming={renaming}
            renameInitialName={renameInitialName}
            onRenameCommit={onRenameCommit}
            onRenameDismiss={onRenameDismiss}
            onDoubleClickRename={onLabelDoubleClick}
          />
        </div>
      );
    }
  } else if (entry?.studioKind === "element") {
    const badge = elementBadgeIcon(entry.elementType);
    const sheetUrl = thumbUrl && !isVideoFileUrl(thumbUrl) ? thumbUrl : null;
    visual = (
      <div className="desk-file-thumb-peek-wrap desk-file-thumb-peek-wrap--element">
        {sheetUrl ? (
          <ProgressiveThumb
            src={sheetUrl}
            lqipSrc={lqipUrl}
            className="desk-file-thumb-image"
            eager={eagerFirst}
          />
        ) : (
          <div className="desk-file-thumb-fallback">
            <Icon name={badge} size={size === "preview" ? 36 : 26} className="text-cursor-muted" />
          </div>
        )}
        <span className="desk-file-thumb-badge" aria-hidden>
          <Icon name={badge} size={14} />
        </span>
        <ThumbPeekLabelOrRename
          name={label}
          renaming={renaming}
          renameInitialName={renameInitialName}
          onRenameCommit={onRenameCommit}
          onRenameDismiss={onRenameDismiss}
            onDoubleClickRename={onLabelDoubleClick}
        />
      </div>
    );
    inlinePeekLabel = true;
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
        <ThumbWithPeek name={label} badge="image"
          renaming={renaming}
          renameInitialName={renameInitialName}
          onRenameCommit={onRenameCommit}
          onRenameDismiss={onRenameDismiss}
          onDoubleClickRename={onLabelDoubleClick}>
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
        <ThumbWithPeek name={label} badge="play"
          renaming={renaming}
          renameInitialName={renameInitialName}
          onRenameCommit={onRenameCommit}
          onRenameDismiss={onRenameDismiss}
          onDoubleClickRename={onLabelDoubleClick}>
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
              <Icon name="play" size={size === "preview" ? 36 : 26} className="text-cursor-muted" />
            </div>
          )}
        </ThumbWithPeek>
      );
      inlinePeekLabel = true;
    } else if (isScript) {
      visual = (
        <ThumbWithPeek name={label} badge="fileText"
          renaming={renaming}
          renameInitialName={renameInitialName}
          onRenameCommit={onRenameCommit}
          onRenameDismiss={onRenameDismiss}
          onDoubleClickRename={onLabelDoubleClick}>
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
      const editPosterUrl =
        thumbUrl && thumbUrl !== mediaUrl && !isVideoFileUrl(thumbUrl) ? thumbUrl : undefined;
      visual = (
        <ThumbWithPeek name={label} badge="studioProject"
          wrapMod="desk-file-thumb-peek-wrap--studio"
          renaming={renaming}
          renameInitialName={renameInitialName}
          onRenameCommit={onRenameCommit}
          onRenameDismiss={onRenameDismiss}
          onDoubleClickRename={onLabelDoubleClick}>
          {editPosterUrl ? (
            <ProgressiveThumb
              src={editPosterUrl}
              lqipSrc={lqipUrl}
              className="desk-file-thumb-video"
              eager={eagerFirst}
            />
          ) : mediaUrl || (thumbUrl && isVideoFileUrl(thumbUrl)) ? (
            <VideoThumb
              src={mediaUrl ?? thumbUrl}
              className="desk-file-thumb-video"
              fallbackIcon="studioProject"
            />
          ) : (
            <div className="desk-file-thumb-studio" aria-hidden="true">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/branding/studio-project-icon-96.png"
                srcSet="/branding/studio-project-icon-96.png 96w, /branding/studio-project-icon-192.png 192w, /branding/studio-project-icon.png 1024w"
                sizes={size === "preview" ? "72px" : "40px"}
                alt=""
                decoding="async"
              />
            </div>
          )}
        </ThumbWithPeek>
      );
      inlinePeekLabel = true;
    } else if (kind === "audio") {
      visual = (
        <ThumbWithPeek name={label} badge="music"
          renaming={renaming}
          renameInitialName={renameInitialName}
          onRenameCommit={onRenameCommit}
          onRenameDismiss={onRenameDismiss}
          onDoubleClickRename={onLabelDoubleClick}>
          <AudioWaveThumb
            seedKey={entry?.path ?? entry?._id ?? label}
            barCount={size === "preview" ? 36 : 28}
          />
        </ThumbWithPeek>
      );
      inlinePeekLabel = true;
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
      <div className="desk-file-thumb-visual">
        {visual}
        {entry?.hasOutgoingShare &&
        !(kind === "dir" || kind === "parent") ? (
          <span className="desk-file-thumb-shared" aria-label="Shared">
            <Icon name="share" size={11} />
          </span>
        ) : null}
        {entry?.reactionEmoji ? (
          // span (not button) — FileEntryThumb sits inside FileEntryButton <button>.
          <span
            className="desk-file-thumb-reaction"
            role="button"
            tabIndex={0}
            aria-label={`Change reaction ${entry.reactionEmoji}`}
            title="Change reaction"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              const rect = event.currentTarget.getBoundingClientRect();
              onReactionPick?.(entry, {
                x: rect.left,
                y: rect.bottom + 4,
              });
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              event.stopPropagation();
              const rect = event.currentTarget.getBoundingClientRect();
              onReactionPick?.(entry, {
                x: rect.left,
                y: rect.bottom + 4,
              });
            }}
            onMouseEnter={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              onReactionHover?.(entry, {
                x: rect.left,
                y: rect.bottom + 4,
              });
            }}
            onMouseLeave={() => {
              onReactionHoverLeave?.();
            }}
            onMouseDown={(event) => {
              // Keep parent FileEntryButton from treating this as open/drag.
              event.stopPropagation();
            }}
          >
            <StudioEmoji emoji={entry.reactionEmoji} />
          </span>
        ) : null}
      </div>
      {showLabel && !inlinePeekLabel ? (
        renaming ? (
          <InlineRenameInput
            initialName={renameInitialName ?? label}
            className="desk-file-thumb-rename-input desk-file-thumb-rename-input--below"
            onCommit={onRenameCommit}
            onDismiss={onRenameDismiss}
          />
        ) : (
          <span className="desk-file-thumb-label" title={entry?.path ? displayEntryPath(entry) : label}>
            {label}
          </span>
        )
      ) : null}
    </div>
  );
}
