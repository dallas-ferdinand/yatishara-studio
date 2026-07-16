// @ts-nocheck
"use client";

import { useEffect, useState } from "react";
import { Icon } from "./Icons";
import {
  attachmentExternalUrl,
  attachmentLabel,
  attachmentMediaUrl,
  attachmentPreviewKind,
  attachmentIsVideo,
  attachmentVideoPosterUrl,
  loadAttachmentTextContent,
  loadAttachmentFolderListing,
} from "@/desk/lib/attachment-model.js";
import { explorerEntryIcon, fileExt } from "@/desk/lib/file-kind.js";
import { workspaceFileRawUrl, workspaceFileThumbUrl } from "@/desk/lib/workspace-file-url.js";
import { DeskMediaPlayer } from "./DeskMediaPlayer";

function CsvPreview({ content }) {
  const lines = String(content ?? "")
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .slice(0, 300);
  const rows = lines.map((line) => line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/));
  if (!rows.length) return <p className="text-cursor-muted text-sm p-4">Empty file</p>;
  return (
    <div className="desk-file-csv-wrap overflow-auto flex-1 min-h-0">
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

export function AttachmentPreviewSheet({
  open,
  attachment,
  workspaceId = "mercuryos",
  editable = false,
  layout = "overlay",
  onClose,
  onSaveText,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [textContent, setTextContent] = useState("");
  const [draftText, setDraftText] = useState("");
  const [folderEntries, setFolderEntries] = useState(null);

  const label = attachment ? attachmentLabel(attachment) : "";
  const kind = attachment ? attachmentPreviewKind(attachment, workspaceId) : "binary";
  const mediaUrl = attachment ? attachmentMediaUrl(attachment, workspaceId) : null;
  const externalUrl = attachment ? attachmentExternalUrl(attachment, workspaceId) : null;
  const ext = fileExt(attachment?.filename ?? attachment?.path ?? "");
  const videoPoster = attachment ? attachmentVideoPosterUrl(attachment, workspaceId) : null;

  useEffect(() => {
    if (!open || !attachment) {
      setLoading(false);
      setError("");
      setTextContent("");
      setDraftText("");
      setFolderEntries(null);
      return;
    }

    if (kind === "folder") {
      let cancelled = false;
      setLoading(true);
      setError("");
      void loadAttachmentFolderListing(attachment, workspaceId)
        .then((data) => {
          if (cancelled) return;
          setFolderEntries(data?.entries ?? []);
        })
        .catch((err) => {
          if (cancelled) return;
          setError(err.message ?? "Could not list folder");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }

    const needsText =
      kind === "text" ||
      kind === "code" ||
      kind === "markdown" ||
      kind === "html" ||
      kind === "csv";

    if (!needsText) return;

    let cancelled = false;
    setLoading(true);
    setError("");
    void loadAttachmentTextContent(attachment, workspaceId)
      .then((text) => {
        if (cancelled) return;
        setTextContent(text);
        setDraftText(text);
      })
      .catch(async (err) => {
        if (cancelled) return;
        const msg = err.message ?? "";
        if (/not a file|is a directory/i.test(msg)) {
          try {
            const data = await loadAttachmentFolderListing(attachment, workspaceId);
            if (cancelled) return;
            setFolderEntries(data?.entries ?? []);
            setError("");
            return;
          } catch (listErr) {
            setError(listErr.message ?? msg);
            return;
          }
        }
        setError(msg || "Could not load preview");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, attachment, kind, workspaceId]);

  if (!open || !attachment) return null;

  const saveText = () => {
    onSaveText?.(draftText);
    onClose?.();
  };

  const fileStub = {
    path: attachment.workspacePath ?? attachment.path ?? attachment.filename ?? label,
    name: attachment.filename ?? label,
    ext,
    content: textContent,
  };

  let body = null;
  const renderFallback = () => (
    <div className="cursor-attach-preview-fallback">
      <div className="cursor-attach-preview-file-icon">
        <Icon name="paperclip" size={28} />
      </div>
      <p className="cursor-attach-preview-file-name">{label}</p>
      <p className="text-cursor-muted text-sm">
        {kind === "office"
          ? "Office preview opens best in an external app."
          : "No inline preview for this file type."}
      </p>
      <div className="cursor-attach-preview-actions">
        {mediaUrl ? (
          <a href={mediaUrl} target="_blank" rel="noopener noreferrer" className="cursor-attach-preview-link">
            Download
          </a>
        ) : null}
        {externalUrl ? (
          <a href={externalUrl} target="_blank" rel="noopener noreferrer" className="cursor-attach-preview-link">
            Open externally
          </a>
        ) : null}
      </div>
    </div>
  );

  if (loading) {
    body = (
      <div className="cursor-attach-preview-loading">
        <Icon name="loader" size={20} className="chat-spin" />
        <span>Loading preview…</span>
      </div>
    );
  } else if (error) {
    body = (
      <div className="cursor-attach-preview-fallback">
        <p>{error}</p>
        {externalUrl ? (
          <a href={externalUrl} target="_blank" rel="noopener noreferrer" className="cursor-attach-preview-link">
            Open externally
          </a>
        ) : null}
      </div>
    );
  } else if (kind === "folder" || folderEntries != null) {
    body = (
      <div className="cursor-attach-preview-folder">
        {folderEntries?.length ? (
          <ul className="cursor-attach-preview-folder-list">
            {folderEntries.map((entry) => (
              <li key={entry.path ?? entry.name} className="cursor-attach-preview-folder-row">
                <Icon name={explorerEntryIcon(entry)} size={15} className="text-cursor-muted shrink-0" />
                <span className="truncate">{entry.name}</span>
                {entry.type === "dir" ? <span className="text-cursor-muted text-xs">folder</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-cursor-muted text-sm p-4">Empty folder</p>
        )}
      </div>
    );
  } else if (kind === "text" || (kind === "code" && editable && attachment.kind === "context")) {
    body = editable ? (
      <textarea
        className="cursor-attach-preview-textarea"
        value={draftText}
        onChange={(e) => setDraftText(e.target.value)}
        spellCheck={false}
      />
    ) : (
      <pre className="cursor-attach-preview-pre">{textContent || attachment.text || ""}</pre>
    );
  } else if (kind === "code" || kind === "markdown" || kind === "html") {
    body = <pre className="cursor-attach-preview-pre">{textContent}</pre>;
  } else if (kind === "csv") {
    body = <CsvPreview content={textContent} />;
  } else if (kind === "image" && mediaUrl) {
    body = (
      <div className="cursor-attach-preview-media">
        <img src={mediaUrl} alt={label} className="cursor-attach-preview-image" />
      </div>
    );
  } else if (kind === "video" && mediaUrl) {
    body = (
      <div className="cursor-attach-preview-media desk-media-player-embed">
        <DeskMediaPlayer kind="video" src={mediaUrl} name={label} poster={videoPoster} />
      </div>
    );
  } else if (kind === "audio" && mediaUrl) {
    body = (
      <div className="cursor-attach-preview-media desk-media-player-embed">
        <DeskMediaPlayer kind="audio" src={mediaUrl} name={label} />
      </div>
    );
  } else if (kind === "pdf" && mediaUrl) {
    body = <iframe title={label} src={mediaUrl} className="cursor-attach-preview-iframe" />;
  } else if ((kind === "image" || kind === "video" || kind === "audio" || kind === "pdf") && fileStub.path) {
    const url = workspaceFileRawUrl(fileStub.path, workspaceId);
    if (kind === "image" && url) {
      body = (
        <div className="cursor-attach-preview-media">
          <img src={url} alt={label} className="cursor-attach-preview-image" />
        </div>
      );
    } else if (kind === "video" && url) {
      body = (
        <div className="cursor-attach-preview-media desk-media-player-embed">
          <DeskMediaPlayer kind="video" src={url} name={label} poster={videoPoster} />
        </div>
      );
    } else if (kind === "audio" && url) {
      body = (
        <div className="cursor-attach-preview-media desk-media-player-embed">
          <DeskMediaPlayer kind="audio" src={url} name={label} />
        </div>
      );
    } else if (kind === "pdf" && url) {
      body = <iframe title={label} src={url} className="cursor-attach-preview-iframe" />;
    }
  }
  if (!body) {
    body = renderFallback();
  }

  const header = (
    <header className="cursor-panel-head cursor-attach-preview-head shrink-0">
      <span className="cursor-attach-preview-title truncate">{label}</span>
      <div className="cursor-panel-head-tools">
        {editable && kind === "text" ? (
          <button type="button" className="cursor-settings-action !py-1 !px-2 text-xs" onClick={saveText}>
            Save
          </button>
        ) : null}
        <button type="button" className="cursor-icon-btn cursor-icon-btn-sm studio-panel-close" onClick={onClose} aria-label="Close">
          <Icon name="x" size={18} />
        </button>
      </div>
    </header>
  );

  if (layout === "dock") {
    return (
      <div className="cursor-attach-preview-dock" role="region" aria-label={`Preview ${label}`}>
        {header}
        <div className="cursor-attach-preview-body">{body}</div>
      </div>
    );
  }

  return (
    <div className="cursor-attach-preview-overlay" role="dialog" aria-label={`Preview ${label}`}>
      <button type="button" className="cursor-attach-preview-backdrop" onClick={onClose} aria-label="Close preview" />
      <div className="cursor-attach-preview-panel">
        {header}
        <div className="cursor-attach-preview-body">{body}</div>
      </div>
    </div>
  );
}
