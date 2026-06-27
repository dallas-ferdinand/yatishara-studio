// @ts-nocheck
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  ChevronRight,
  Download,
  File,
  FileArchive,
  FileImage,
  FileMusic,
  FileVideo,
  Folder,
  FolderOutput,
  Loader2,
} from "lucide-react";
import { workspaceFileRawUrl } from "@/desk/lib/workspace-file-url";
import { fileExt, fileViewerKind } from "@/desk/lib/file-kind";
import { downloadWorkspaceFile } from "@/desk/lib/explorer-file-actions";
import { ImageZoomViewer } from "./ImageZoomViewer";
import { DeskMediaPlayer } from "./DeskMediaPlayer";
import {
  archiveBreadcrumbs,
  decodeArchiveText,
  defaultExtractDir,
  downloadArchiveEntry,
  entryPreviewKind,
  extractAllArchiveEntries,
  extractArchiveEntry,
  formatFileSize,
  isZipFile,
  listArchiveDir,
  loadZipFromUrl,
} from "@/desk/lib/zip-archive";

function ArchiveBreadcrumbs({ crumbs, onNavigate }) {
  return (
    <div className="desk-archive-breadcrumbs">
      {crumbs.map((crumb, i) => (
        <span key={crumb.path || "root"} className="desk-archive-breadcrumbs-segment">
          {i > 0 ? <ChevronRight size={12} className="desk-archive-breadcrumbs-sep" aria-hidden /> : null}
          <button
            type="button"
            className={`desk-archive-breadcrumbs-chip${i === crumbs.length - 1 ? " is-current" : ""}`}
            onClick={() => onNavigate(crumb.path)}
          >
            {crumb.label}
          </button>
        </span>
      ))}
    </div>
  );
}

function EntryIcon({ entry }) {
  const props = { size: 15, strokeWidth: 2, className: "shrink-0 text-cursor-muted", "aria-hidden": true };
  if (entry.type === "dir") return <Folder {...props} />;
  const kind = fileViewerKind(fileExt(entry.name));
  if (kind === "image") return <FileImage {...props} />;
  if (kind === "video") return <FileVideo {...props} />;
  if (kind === "audio") return <FileMusic {...props} />;
  if (kind === "archive") return <FileArchive {...props} />;
  return <File {...props} />;
}

function InlinePreview({ entry }) {
  const kind = entryPreviewKind(entry);
  const [blobUrl, setBlobUrl] = useState(null);

  useEffect(() => {
    if (!entry?.data || kind !== "image" && kind !== "video" && kind !== "audio") {
      setBlobUrl(null);
      return undefined;
    }
    const url = URL.createObjectURL(new Blob([entry.data]));
    setBlobUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [entry, kind]);

  if (!entry?.data) return null;

  if (kind === "image" && blobUrl) {
    return (
      <div className="desk-archive-preview-media">
        <ImageZoomViewer thumbUrl={blobUrl} fullUrl={blobUrl} name={entry.name} />
      </div>
    );
  }

  if (kind === "video" && blobUrl) {
    return (
      <div className="desk-archive-preview-media">
        <DeskMediaPlayer kind="video" src={blobUrl} name={entry.name} />
      </div>
    );
  }

  if (kind === "audio" && blobUrl) {
    return (
      <div className="desk-archive-preview-media">
        <DeskMediaPlayer kind="audio" src={blobUrl} name={entry.name} />
      </div>
    );
  }

  const text = decodeArchiveText(entry);
  if (text != null) {
    return (
      <pre className="desk-archive-preview-text">{text}</pre>
    );
  }

  return (
    <p className="desk-archive-preview-muted">
      No inline preview for this file type ({formatFileSize(entry.size)}).
    </p>
  );
}

export function ArchiveViewer({ file, workspaceId }) {
  const name = file.name ?? file.path?.split("/").pop() ?? "archive";
  const ext = file.ext ?? fileExt(name);
  const zip = isZipFile(ext);
  const url = workspaceFileRawUrl(file.path, workspaceId);

  const [loading, setLoading] = useState(zip);
  const [error, setError] = useState(null);
  const [index, setIndex] = useState(null);
  const [currentDir, setCurrentDir] = useState("");
  const [selected, setSelected] = useState(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!zip || !url) return undefined;
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    setIndex(null);
    setCurrentDir("");
    setSelected(null);
    setStatus("");
    loadZipFromUrl(url, { signal: ac.signal })
      .then((parsed) => {
        setIndex(parsed);
        setLoading(false);
      })
      .catch((err) => {
        if (ac.signal.aborted) return;
        setError(err?.message ?? String(err));
        setLoading(false);
      });
    return () => ac.abort();
  }, [zip, url]);

  const entries = useMemo(
    () => (index ? listArchiveDir(index, currentDir) : []),
    [index, currentDir],
  );

  const crumbs = useMemo(() => archiveBreadcrumbs(currentDir, name), [currentDir, name]);

  const onDownloadZip = useCallback(() => {
    if (file.path) downloadWorkspaceFile(file.path, workspaceId);
  }, [file.path, workspaceId]);

  const destDir = useMemo(() => defaultExtractDir(file.path), [file.path]);

  const runExtractAll = useCallback(async () => {
    if (!index || busy) return;
    const label = destDir;
    const ok = window.confirm(`Extract all ${index.fileCount} files to:\n${label}\n\nExisting files may be overwritten.`);
    if (!ok) return;
    setBusy(true);
    setStatus("Extracting…");
    try {
      await extractAllArchiveEntries(index, destDir, workspaceId, {
        onProgress: ({ done, total }) => setStatus(`Extracting ${done}/${total}…`),
      });
      setStatus(`Extracted to ${label}`);
    } catch (err) {
      setStatus(err?.message ?? String(err));
    } finally {
      setBusy(false);
    }
  }, [index, busy, destDir, workspaceId]);

  const runExtractEntry = useCallback(
    async (entry) => {
      if (!entry || entry.type !== "file" || busy) return;
      setBusy(true);
      setStatus(`Extracting ${entry.name}…`);
      try {
        const outPath = await extractArchiveEntry(entry, destDir, workspaceId);
        setStatus(`Extracted to ${outPath}`);
      } catch (err) {
        setStatus(err?.message ?? String(err));
      } finally {
        setBusy(false);
      }
    },
    [busy, destDir, workspaceId],
  );

  const openEntry = useCallback(
    (entry) => {
      if (entry.type === "dir") {
        setCurrentDir(entry.path);
        setSelected(null);
        return;
      }
      setSelected(entry);
    },
    [],
  );

  if (!zip) {
    return (
      <div className="desk-archive-viewer desk-archive-viewer--unsupported">
        <Archive size={20} strokeWidth={1.75} className="desk-archive-unsupported-icon" aria-hidden />
        <p className="text-cursor-text mb-1">{name}</p>
        <p className="text-cursor-muted text-sm mb-3">
          In-browser browsing is available for <strong>.zip</strong> files. Other archive formats can be downloaded and
          extracted locally.
        </p>
        <button type="button" className="desk-archive-action" onClick={onDownloadZip}>
          <Download size={14} aria-hidden />
          Download
        </button>
      </div>
    );
  }

  return (
    <div className="desk-archive-viewer">
      <div className="desk-archive-toolbar">
        <div className="desk-archive-toolbar-left">
          <Archive size={14} strokeWidth={2} aria-hidden className="shrink-0 text-cursor-muted" />
          <span className="desk-archive-toolbar-name truncate" title={name}>
            {name}
          </span>
          {index ? (
            <span className="desk-archive-toolbar-meta">{index.fileCount} files</span>
          ) : null}
        </div>
        <div className="desk-archive-toolbar-actions">
          <button
            type="button"
            className="desk-archive-action"
            title={`Extract all to ${destDir}`}
            disabled={!index || busy}
            onClick={runExtractAll}
          >
            {busy ? <Loader2 size={14} className="desk-archive-spin" aria-hidden /> : <FolderOutput size={14} aria-hidden />}
            Extract all
          </button>
          <button type="button" className="desk-archive-action" title="Download archive" onClick={onDownloadZip}>
            <Download size={14} aria-hidden />
            Download
          </button>
        </div>
      </div>

      {loading ? (
        <div className="desk-archive-state">
          <Loader2 size={18} className="desk-archive-spin" aria-hidden />
          <span>Reading archive…</span>
        </div>
      ) : null}

      {error ? (
        <div className="desk-archive-state desk-archive-state--error">
          <p>{error}</p>
          <button type="button" className="desk-archive-action" onClick={onDownloadZip}>
            Download archive
          </button>
        </div>
      ) : null}

      {!loading && !error && index ? (
        <>
          <ArchiveBreadcrumbs crumbs={crumbs} onNavigate={setCurrentDir} />
          <div className="desk-archive-body">
            <div className="desk-archive-list-wrap">
              <ul className="desk-archive-list">
                {currentDir ? (
                  <li>
                    <button
                      type="button"
                      className="desk-archive-entry is-parent"
                      onClick={() => {
                        const parent = currentDir.includes("/")
                          ? currentDir.slice(0, currentDir.lastIndexOf("/"))
                          : "";
                        setCurrentDir(parent);
                        setSelected(null);
                      }}
                    >
                      <ChevronRight size={14} className="rotate-180 shrink-0 text-cursor-muted" aria-hidden />
                      <span className="truncate">..</span>
                    </button>
                  </li>
                ) : null}
                {entries.map((entry) => (
                  <li key={entry.path}>
                    <button
                      type="button"
                      className={`desk-archive-entry${selected?.path === entry.path ? " is-selected" : ""}`}
                      onClick={() => openEntry(entry)}
                      onDoubleClick={() => openEntry(entry)}
                    >
                      <EntryIcon entry={entry} />
                      <span className="desk-archive-entry-name truncate">{entry.name}</span>
                      {entry.type === "file" ? (
                        <span className="desk-archive-entry-size">{formatFileSize(entry.size)}</span>
                      ) : null}
                    </button>
                  </li>
                ))}
                {!entries.length ? (
                  <li className="desk-archive-empty">This folder is empty.</li>
                ) : null}
              </ul>
            </div>

            <div className="desk-archive-detail">
              {selected?.type === "file" ? (
                <>
                  <div className="desk-archive-detail-head">
                    <div className="min-w-0">
                      <p className="desk-archive-detail-title truncate">{selected.name}</p>
                      <p className="desk-archive-detail-meta">{formatFileSize(selected.size)}</p>
                    </div>
                    <div className="desk-archive-detail-actions">
                      <button
                        type="button"
                        className="desk-archive-action"
                        disabled={busy}
                        onClick={() => downloadArchiveEntry(selected)}
                      >
                        <Download size={14} aria-hidden />
                        Save as…
                      </button>
                      <button
                        type="button"
                        className="desk-archive-action"
                        disabled={busy}
                        title={`Extract to ${destDir}`}
                        onClick={() => runExtractEntry(selected)}
                      >
                        <FolderOutput size={14} aria-hidden />
                        Extract
                      </button>
                    </div>
                  </div>
                  <div className="desk-archive-detail-preview">
                    <InlinePreview entry={selected} />
                  </div>
                </>
              ) : (
                <div className="desk-archive-detail-empty">
                  <p>Select a file to preview or extract.</p>
                  <p className="text-cursor-muted text-xs mt-2">
                    Extract all writes to <code className="desk-archive-path">{destDir}</code>
                  </p>
                </div>
              )}
            </div>
          </div>
        </>
      ) : null}

      {status ? <div className="desk-archive-status">{status}</div> : null}
    </div>
  );
}
