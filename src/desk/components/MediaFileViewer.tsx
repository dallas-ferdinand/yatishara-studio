// @ts-nocheck
"use client";

import { workspaceFileRawUrl, workspaceFileThumbUrl } from "@/desk/lib/workspace-file-url";
import { fileViewerKind } from "@/desk/lib/file-kind";
import { scheduleVideoPrefetch } from "@/desk/lib/video-chunk-prefetch.js";
import { useEffect } from "react";
import { externalPreviewUrl } from "@mos-app/preview.js";
import { downloadWorkspaceFile } from "@/desk/lib/explorer-file-actions";
import { ImageZoomViewer } from "./ImageZoomViewer";
import { DeskMediaPlayer } from "./DeskMediaPlayer";
import { ArchiveViewer } from "./ArchiveViewer";
import { Icon } from "./Icons";

function CsvTable({ content }) {
  const lines = String(content ?? "")
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .slice(0, 200);
  const rows = lines.map((line) => line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/));
  if (!rows.length) return <div className="p-4 text-cursor-muted text-sm">Empty file</div>;
  return (
    <div className="desk-file-csv-wrap overflow-auto h-full">
      <table className="desk-file-csv">
        <tbody>
          {rows.map((cells, ri) => (
            <tr key={ri}>
              {cells.map((cell, ci) => (
                <td key={ci}>{cell.replace(/^"|"$/g, "")}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MediaToolbar({ name, onDownload, hint }) {
  return (
    <div className="desk-media-toolbar">
      <span className="desk-media-toolbar-name truncate" title={name}>
        {name}
      </span>
      {hint ? <span className="desk-media-toolbar-hint">{hint}</span> : null}
      {onDownload ? (
        <button type="button" className="cursor-icon-btn" title="Download" onClick={onDownload}>
          <Icon name="download" size={16} />
        </button>
      ) : null}
    </div>
  );
}

export function MediaFileViewer({ file, workspaceId }) {
  const kind = fileViewerKind(file.ext);
  const url = workspaceFileRawUrl(file.path, workspaceId, file.mtimeMs ?? null);
  const thumbUrl = workspaceFileThumbUrl(file.path, workspaceId, 960);
  const name = file.name ?? file.path?.split("/").pop() ?? "file";
  const onDownload = file.path
    ? () => downloadWorkspaceFile(file.path, workspaceId)
    : null;

  useEffect(() => {
    if ((kind === "video" || kind === "audio") && url) {
      scheduleVideoPrefetch(url, { fileSize: file.size ?? null });
    }
  }, [kind, url, file.size]);

  if (!url) {
    return <div className="p-4 text-cursor-muted text-sm">Could not build file URL</div>;
  }

  if (kind === "image") {
    return (
      <ImageZoomViewer
        thumbUrl={thumbUrl}
        fullUrl={url}
        name={name}
        onDownload={onDownload}
      />
    );
  }

  if (kind === "video") {
    return (
      <div className="desk-file-media desk-file-media-stack">
        <DeskMediaPlayer
          kind="video"
          src={url}
          name={name}
          onDownload={onDownload}
          poster={thumbUrl}
          fileSize={file.size ?? null}
        />
      </div>
    );
  }

  if (kind === "audio") {
    return (
      <div className="desk-file-media desk-file-media-stack">
        <DeskMediaPlayer kind="audio" src={url} name={name} onDownload={onDownload} fileSize={file.size ?? null} />
      </div>
    );
  }

  if (kind === "pdf") {
    return (
      <div className="desk-file-media desk-file-media-stack desk-file-media-fill">
        <MediaToolbar name={name} onDownload={onDownload} />
        <iframe title={name} src={url} className="desk-file-media-frame" />
      </div>
    );
  }

  if (kind === "csv") {
    return (
      <div className="desk-file-media desk-file-media-stack desk-file-media-fill">
        <MediaToolbar name={name} onDownload={onDownload} />
        <div className="desk-file-media-body min-h-0">
          <CsvTable content={file.content} />
        </div>
      </div>
    );
  }

  if (kind === "office") {
    return (
      <div className="desk-file-binary p-6 text-sm text-cursor-muted max-w-lg">
        <p className="text-cursor-text mb-2">{name}</p>
        <p>Office preview is not available in the tab. Open externally or add to chat context.</p>
        <div className="flex flex-wrap gap-3 mt-3">
          <a
            href={externalPreviewUrl(file.path, workspaceId)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sky-400 hover:underline"
          >
            Open externally
          </a>
          {onDownload ? (
            <button type="button" className="text-sky-400 hover:underline" onClick={onDownload}>
              Download
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  if (kind === "archive") {
    return (
      <div className="desk-file-media desk-file-media-stack desk-file-media-fill">
        <ArchiveViewer file={file} workspaceId={workspaceId} />
      </div>
    );
  }

  if (kind === "binary") {
    return (
      <div className="desk-file-binary p-6 text-sm text-cursor-muted max-w-lg">
        <p className="text-cursor-text mb-2">{name}</p>
        <p>Binary file — open externally or add to chat context.</p>
        {onDownload ? (
          <button type="button" className="text-sky-400 hover:underline mt-3" onClick={onDownload}>
            Download
          </button>
        ) : (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sky-400 hover:underline mt-3 inline-block"
          >
            Download / open
          </a>
        )}
      </div>
    );
  }

  return null;
}
