// @ts-nocheck
"use client";

import { useEffect, useRef } from "react";
import { externalPreviewUrl } from "@mos-app/preview.js";
import { Icon } from "./Icons";
import { CodeEditor } from "./CodeEditor";
import { MarkdownDocEditor } from "./MarkdownDocEditor";
import { MediaFileViewer } from "./MediaFileViewer";
import { fileViewerKind, isEditableInTab, isHtmlExt, fileIconName } from "@/desk/lib/file-kind";
import { tabsForWorkspace } from "@/desk/lib/editor-tabs";
import { displayWorkspacePath } from "@/desk/lib/display-path";
import { HtmlDocEditor } from "./HtmlDocEditor";

const MARKDOWN_RICH_PREVIEW_MAX_CHARS = 120_000;
const MARKDOWN_RICH_PREVIEW_MAX_LINES = 2_000;

function FileEditor({ file, workspaceId, onContentChange, onSave, onToggleViewMode }) {
  if (!file) return null;

  const ext = file.ext ?? "";
  const viewMode = file.viewMode ?? (isHtmlExt(ext) ? "preview" : "code");
  const viewerKind = fileViewerKind(ext);

  if (file.loading) {
    return (
      <div className="p-4 text-cursor-muted text-sm flex items-center gap-2">
        <span className="chat-spin">
          <Icon name="loader" size={14} />
        </span>
        Loading…
      </div>
    );
  }
  if (file.error) {
    return <div className="p-4 text-red-400/90 text-sm">{file.error}</div>;
  }

  if (ext === ".md" && viewMode === "preview") {
    const content = file.content ?? "";
    const lineCount = content ? content.split("\n", MARKDOWN_RICH_PREVIEW_MAX_LINES + 1).length : 0;
    const tooLargeForRichPreview =
      content.length > MARKDOWN_RICH_PREVIEW_MAX_CHARS ||
      lineCount > MARKDOWN_RICH_PREVIEW_MAX_LINES;

    if (tooLargeForRichPreview) {
      return (
        <div className="h-full min-h-0 flex flex-col">
          <div className="shrink-0 border-b border-cursor-border-soft px-3 py-2 text-xs text-cursor-muted">
            Markdown preview skipped for this large file. Source editor stays responsive.
          </div>
          <div className="flex-1 min-h-0">
            <CodeEditor
              value={content}
              path={file.path}
              surface="sidebar"
              onChange={(v) => onContentChange?.(file.id, v)}
              onSave={onSave}
            />
          </div>
        </div>
      );
    }

    return (
      <MarkdownDocEditor
        value={content}
        onChange={(v) => onContentChange?.(file.id, v)}
        onSave={onSave}
      />
    );
  }

  if (isHtmlExt(ext)) {
    return (
      <HtmlDocEditor
        file={file}
        workspaceId={workspaceId}
        viewMode={viewMode}
        onContentChange={onContentChange}
        onSave={onSave}
        onToggleViewMode={onToggleViewMode}
      />
    );
  }

  if (!isEditableInTab(viewerKind) || viewMode === "preview") {
    return <MediaFileViewer file={file} workspaceId={workspaceId} />;
  }

  return (
    <CodeEditor
      value={file.content ?? ""}
      path={file.path}
      surface={ext === ".md" ? "sidebar" : "editor"}
      onChange={(v) => onContentChange?.(file.id, v)}
      onSave={onSave}
    />
  );
}

export function EditorPanel({
  tabs,
  activeTabId,
  workspaceId,
  onSelectTab,
  onCloseTab,
  onCloseAll,
  onToggleViewMode,
  onContentChange,
  onSave,
  hidePanelHead = false,
  hideTabStrip = false,
}) {
  const visibleTabs = tabsForWorkspace(tabs, workspaceId);
  const active = tabs.find((t) => t.id === activeTabId) ?? null;
  const canSave =
    active && !active.loading && !active.saving && active.dirty && typeof onSave === "function";

  useEffect(() => {
    const onKey = (e) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key.toLowerCase() === "w" && activeTabId) {
        e.preventDefault();
        onCloseTab(activeTabId);
        return;
      }
      if (e.key.toLowerCase() === "s" && canSave) {
        e.preventDefault();
        onSave?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeTabId, onCloseTab, canSave, onSave]);

  if (!visibleTabs.length) return null;

  const body = (
    <div className="flex-1 min-h-0 overflow-hidden relative">
      {visibleTabs.map((tab) => (
        <div
          key={tab.id}
          className={`absolute inset-0 ${tab.id === activeTabId ? "" : "hidden"}`}
          aria-hidden={tab.id !== activeTabId}
        >
          <FileEditor
            file={tab}
            workspaceId={workspaceId}
            onContentChange={onContentChange}
            onSave={onSave}
            onToggleViewMode={() => onToggleViewMode?.(tab.id)}
          />
        </div>
      ))}
    </div>
  );

  if (hideTabStrip) {
    return <div className="h-full flex flex-col bg-cursor-editor min-w-0">{body}</div>;
  }

  const openExt = () => {
    if (!active) return;
    window.open(externalPreviewUrl(active.path, workspaceId), "_blank", "noopener,noreferrer");
  };

  return (
    <main className="h-full flex flex-col bg-cursor-editor min-w-0">
      <header className={`cursor-panel-head cursor-editor-tabs shrink-0${hidePanelHead ? " desk-mobile-editor-tabs" : ""}`}>
        <div className="cursor-tab-scroll">
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`cursor-tab ${tab.id === activeTabId ? "active" : ""}${tab.dirty ? " is-dirty" : ""}`}
              onClick={() => onSelectTab(tab.id)}
              onAuxClick={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  onCloseTab(tab.id);
                }
              }}
              title={displayWorkspacePath(tab.path)}
            >
              <Icon name={fileIconName(tab.path ?? tab.name ?? "", { isDir: false })} size={14} className="text-cursor-muted shrink-0" />
              <span className="truncate">
                {tab.dirty ? "• " : ""}
                {tab.name}
              </span>
              {tab.loading ? (
                <span className="chat-spin shrink-0">
                  <Icon name="loader" size={12} />
                </span>
              ) : tab.saving ? (
                <span className="chat-spin shrink-0">
                  <Icon name="loader" size={12} />
                </span>
              ) : (
                <span
                  className="cursor-tab-close shrink-0"
                  role="button"
                  tabIndex={-1}
                  title="Close"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTab(tab.id);
                  }}
                >
                  <Icon name="x" size={12} />
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="cursor-editor-tab-tools shrink-0">
          {canSave ? (
            <button type="button" className="cursor-icon-btn text-emerald-400/90" title="Save (Ctrl+S)" onClick={onSave}>
              <Icon name="save" size={14} />
            </button>
          ) : null}
          {visibleTabs.length > 1 ? (
            <button type="button" className="cursor-icon-btn" title="Close all tabs" onClick={onCloseAll}>
              <Icon name="x" size={14} />
            </button>
          ) : null}
          {active && active.ext === ".md" && !active.loading && !active.error ? (
            <button
              type="button"
              className="cursor-icon-btn"
              title={active.viewMode === "preview" ? "Edit markdown source" : "Preview markdown"}
              onClick={() => onToggleViewMode?.(active.id)}
            >
              <Icon name={active.viewMode === "preview" ? "fileCode" : "fileText"} size={14} />
            </button>
          ) : null}
          {active && !active.loading && !active.error ? (
            <button type="button" className="cursor-icon-btn" title="Open externally" onClick={openExt}>
              <Icon name="externalLink" size={14} />
            </button>
          ) : null}
        </div>
      </header>
      {body}
    </main>
  );
}
