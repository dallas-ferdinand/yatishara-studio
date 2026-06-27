// @ts-nocheck
"use client";

import { useMemo } from "react";
import { prepareHtml, externalPreviewUrl } from "@mos-app/preview.js";
import { Icon } from "./Icons";
import { CodeEditor } from "./CodeEditor";

function ToolbarButton({ title, icon, active = false, onClick }) {
  return (
    <button
      type="button"
      className={`cursor-doc-tool${active ? " active" : ""}`}
      title={title}
      onMouseDown={(e) => {
        e.preventDefault();
        onClick?.();
      }}
    >
      <Icon name={icon} size={15} />
    </button>
  );
}

/** Rendered HTML preview + source editor — mirrors MarkdownDocEditor layout. */
export function HtmlDocEditor({
  file,
  workspaceId,
  viewMode = "preview",
  onContentChange,
  onSave,
  onToggleViewMode,
}) {
  const html = useMemo(
    () => prepareHtml(file.content ?? "", file.path, workspaceId),
    [file.content, file.path, workspaceId],
  );
  const isPreview = viewMode !== "code";

  const openExternal = () => {
    window.open(externalPreviewUrl(file.path, workspaceId), "_blank", "noopener,noreferrer");
  };

  return (
    <div className="cursor-doc-editor cursor-html-doc-editor">
      <div className="cursor-doc-toolbar" role="toolbar" aria-label="HTML">
        <ToolbarButton
          title="Preview"
          icon="eye"
          active={isPreview}
          onClick={() => {
            if (!isPreview) onToggleViewMode?.();
          }}
        />
        <ToolbarButton
          title="Edit source"
          icon="editor"
          active={!isPreview}
          onClick={() => {
            if (isPreview) onToggleViewMode?.();
          }}
        />
        <span className="cursor-doc-tool-divider" />
        <ToolbarButton title="Open externally" icon="externalLink" onClick={openExternal} />
      </div>
      {isPreview ? (
        <div className="cursor-html-preview-scroll">
          <iframe
            title={file.name}
            className="cursor-html-doc-preview"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
            srcDoc={html}
          />
        </div>
      ) : (
        <div className="cursor-html-source-pane">
          <CodeEditor
            value={file.content ?? ""}
            path={file.path}
            onChange={(v) => onContentChange?.(file.id, v)}
            onSave={onSave}
          />
        </div>
      )}
    </div>
  );
}
