// @ts-nocheck
"use client";

import { useEffect, useState } from "react";
import { Icon } from "./Icons";
import * as api from "@mos-app/api.js";
import { explorerEntryIcon, fileExt, fileViewerKind } from "@/desk/lib/file-kind";
import { workspaceFileRawUrl, workspaceFileThumbUrl } from "@/desk/lib/workspace-file-url.js";
import { displayEntryPath } from "@/desk/lib/display-path";
import { externalPreviewUrl } from "@mos-app/preview.js";

const TEXT_KINDS = new Set(["code", "markdown", "html", "csv", "text"]);

function isVideoFileUrl(url) {
  return typeof url === "string" && /\.(mp4|webm|mov)(\?|#|$)/i.test(url);
}

function entryKind(entry) {
  if (entry?.type === "dir" || entry?.type === "parent") {
    return entry.type === "parent" ? "parent" : "dir";
  }
  return fileViewerKind(entry?.ext ?? fileExt(entry?.path ?? entry?.name ?? ""));
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

function thumbImageProps(size) {
  return {
    loading: size === "preview" ? "lazy" : "eager",
    decoding: "async",
    fetchPriority: size === "preview" ? "auto" : "high",
  };
}

function FolderPeekStack({ items, size = "grid" }) {
  const cards = (items ?? []).slice(0, 3);
  if (!cards.length) return null;
  const iconSize = size === "preview" ? 16 : 13;
  return (
    <div className="desk-folder-peek-stack" data-count={cards.length} aria-hidden="true">
      {cards.map((item, index) => (
        <div
          key={`${item.label}-${index}`}
          className={`desk-folder-peek-card desk-folder-peek-card--${index}${item.kind === "element" ? " desk-folder-peek-card--element" : ""}`}
        >
          <div className="desk-folder-peek-card-media">
            {item.thumbnailUrl ? (
              <img src={item.thumbnailUrl} alt="" {...thumbImageProps(size)} />
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
  const previewUrl =
    entry?.path && (kind === "pdf" || kind === "html")
      ? externalPreviewUrl(entry.path, workspaceId)
      : mediaUrl;

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
  } else if (entry?.studioKind === "element") {
    const badge = elementBadgeIcon(entry.elementType);
    const sheetUrl = thumbUrl && !isVideoFileUrl(thumbUrl) ? thumbUrl : null;
    visual = sheetUrl ? (
      <div className="desk-file-thumb-peek-wrap desk-file-thumb-peek-wrap--element">
        <img src={sheetUrl} alt="" className="desk-file-thumb-image" {...thumbImageProps(size)} />
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
    const videoPosterUrl =
      isVideo && thumbUrl && thumbUrl !== mediaUrl && !isVideoFileUrl(thumbUrl)
        ? thumbUrl
        : undefined;

    if (isImage && thumbUrl) {
      visual = (
        <div className="desk-file-thumb-peek-wrap">
          <img src={thumbUrl} alt="" className="desk-file-thumb-image" {...thumbImageProps(size)} />
          <span className="desk-file-thumb-badge" aria-hidden>
            <Icon name="image" size={14} />
          </span>
          <ThumbPeekLabel name={label} />
        </div>
      );
    } else if (isImage && mediaUrl) {
      visual = (
        <div className="desk-file-thumb-peek-wrap">
          <img src={mediaUrl} alt="" className="desk-file-thumb-image" {...thumbImageProps(size)} />
          <span className="desk-file-thumb-badge" aria-hidden>
            <Icon name="image" size={14} />
          </span>
          <ThumbPeekLabel name={label} />
        </div>
      );
    } else if (isVideo && videoPosterUrl) {
      visual = (
        <div className="desk-file-thumb-peek-wrap">
          <img src={videoPosterUrl} alt="" className="desk-file-thumb-video" {...thumbImageProps(size)} />
          <span className="desk-file-thumb-badge" aria-hidden>
            <Icon name="film" size={14} />
          </span>
          <ThumbPeekLabel name={label} />
        </div>
      );
    } else if (isVideo && (mediaUrl || thumbUrl)) {
      visual = (
        <div className="desk-file-thumb-peek-wrap">
          <video
            src={mediaUrl ?? thumbUrl}
            className="desk-file-thumb-video"
            crossOrigin="anonymous"
            muted
            playsInline
            preload="metadata"
          />
          <span className="desk-file-thumb-badge" aria-hidden>
            <Icon name="film" size={14} />
          </span>
          <ThumbPeekLabel name={label} />
        </div>
      );
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

  inlinePeekLabel =
    kind === "dir" ||
    kind === "parent" ||
    (entry?.studioKind === "element"
      ? Boolean(thumbUrl && !isVideoFileUrl(thumbUrl))
      : kind === "image" || kind === "video"
        ? Boolean(thumbUrl || mediaUrl)
        : false);

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
