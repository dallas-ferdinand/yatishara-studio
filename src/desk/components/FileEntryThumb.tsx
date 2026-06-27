// @ts-nocheck
"use client";

import { useEffect, useState } from "react";
import { Icon } from "./Icons";
import * as api from "@mos-app/api.js";
import { explorerEntryIcon, fileExt, fileViewerKind } from "@/desk/lib/file-kind";
import { workspaceFileRawUrl, workspaceFileThumbUrl } from "@/desk/lib/workspace-file-url.js";
import { externalPreviewUrl } from "@mos-app/preview.js";

const TEXT_KINDS = new Set(["code", "markdown", "html", "csv", "text"]);

function entryKind(entry) {
  if (entry?.type === "dir" || entry?.type === "parent") {
    return entry.type === "parent" ? "parent" : "dir";
  }
  return fileViewerKind(entry?.ext ?? fileExt(entry?.path ?? entry?.name ?? ""));
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

  if (kind === "dir" || kind === "parent") {
    visual = (
      <div className="desk-file-thumb-folder">
        <Icon name={icon} size={size === "preview" ? 40 : 30} className={folderIconClass} />
      </div>
    );
  } else if (kind === "image" && thumbUrl) {
    visual = (
      <img src={thumbUrl} alt="" className="desk-file-thumb-image" loading="lazy" decoding="async" />
    );
  } else if (kind === "image" && mediaUrl) {
    visual = (
      <img src={mediaUrl} alt="" className="desk-file-thumb-image" loading="lazy" decoding="async" />
    );
  } else if (kind === "video" && thumbUrl) {
    visual = (
      <img src={thumbUrl} alt="" className="desk-file-thumb-video" loading="lazy" decoding="async" />
    );
  } else if (kind === "video" && mediaUrl) {
    visual = (
      <div className="desk-file-thumb-fallback">
        <Icon name="video" size={28} className="text-cursor-muted" />
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

  return (
    <div className={`desk-file-thumb desk-file-thumb--${size}`}>
      <div className="desk-file-thumb-visual">{visual}</div>
      {showLabel ? (
        <span className="desk-file-thumb-label" title={entry?.path || label}>
          {label}
        </span>
      ) : null}
    </div>
  );
}
