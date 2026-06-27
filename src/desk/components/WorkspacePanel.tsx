// @ts-nocheck
"use client";

import { Icon } from "./Icons";
import { UnifiedTabStrip } from "./UnifiedTabStrip";
import { externalPreviewUrl } from "@mos-app/preview.js";

export function WorkspacePanel({
  tabs,
  activeKey,
  activeKind,
  activeFile,
  workspaceId,
  onSelectTab,
  onCloseTab,
  onReorderTabs,
  onSetTabOrder,
  onNewChat,
  onTabContextAction,
  onOpenSettings,
  onToggleHistory,
  historyOpen,
  streaming,
  onRequestHeal,
  healBusy,
  onSaveFile,
  canSaveFile,
  onToggleViewMode,
  onCloseAllFiles,
  onOpenPulse,
  pulseTabOpen,
  pulseChrome,
  onPulseRefresh,
  onPulseToggleSearch,
  onOpenBuckets,
  bucketsTabOpen,
  children,
}) {
  const previewable =
    activeFile &&
    activeFile.ext !== ".md" &&
    (activeFile.ext === ".html" || activeFile.ext === ".htm");
  const fileTabs = (tabs ?? []).filter((t) => t.kind === "file");

  const openExternally = () => {
    if (!activeFile) return;
    window.open(externalPreviewUrl(activeFile.path, workspaceId), "_blank", "noopener,noreferrer");
  };

  return (
    <div className="desk-workspace h-full flex flex-col min-w-0 min-h-0 bg-cursor-bg">
      <header className="cursor-panel-head cursor-workspace-head shrink-0">
        <UnifiedTabStrip
          tabs={tabs}
          activeKey={activeKey}
          onSelect={onSelectTab}
          onClose={onCloseTab}
          onReorder={onReorderTabs}
          onSetTabOrder={onSetTabOrder}
          onNewChat={onNewChat}
          onTabContextAction={onTabContextAction}
        />
        <div className="cursor-panel-head-tools cursor-workspace-tools">
          {activeKind === "chat" ? (
            <>
              {streaming ? (
                <button
                  type="button"
                  className="cursor-icon-btn cursor-icon-btn-sm"
                  title="Stuck? Send heal alert"
                  disabled={healBusy}
                  onClick={() => void onRequestHeal?.()}
                >
                  <Icon name="bell" size={16} />
                </button>
              ) : null}
              <button
                type="button"
                className={`cursor-icon-btn cursor-icon-btn-sm${historyOpen ? " active" : ""}`}
                title={historyOpen ? "Close history" : "Past chats"}
                onClick={onToggleHistory}
              >
                <Icon name="clock" size={16} />
              </button>
            </>
          ) : null}
          {activeKind === "file" && activeFile ? (
            <>
              {canSaveFile ? (
                <button
                  type="button"
                  className="cursor-icon-btn cursor-icon-btn-sm text-emerald-400/90"
                  title="Save (Ctrl+S)"
                  onClick={onSaveFile}
                >
                  <Icon name="save" size={14} />
                </button>
              ) : null}
              {previewable ? (
                <button
                  type="button"
                  className={`cursor-icon-btn cursor-icon-btn-sm ${activeFile.viewMode === "preview" ? "active" : ""}`}
                  title={activeFile.viewMode === "preview" ? "Edit source" : "Preview"}
                  onClick={() => onToggleViewMode?.(activeFile.id)}
                >
                  <Icon name="eye" size={14} />
                </button>
              ) : null}
              {fileTabs.length > 1 ? (
                <button
                  type="button"
                  className="cursor-icon-btn cursor-icon-btn-sm"
                  title="Close all file tabs"
                  onClick={onCloseAllFiles}
                >
                  <Icon name="x" size={14} />
                </button>
              ) : null}
              {!activeFile.loading && !activeFile.error ? (
                <button
                  type="button"
                  className="cursor-icon-btn cursor-icon-btn-sm"
                  title="Open externally"
                  onClick={openExternally}
                >
                  <Icon name="externalLink" size={14} />
                </button>
              ) : null}
            </>
          ) : null}
          {activeKind === "pulse" ? (
            <>
              <span className="truncate max-w-[8rem] px-1.5 text-[11px] text-cursor-muted" title="Pulse progress">
                {pulseChrome?.positionLabel ?? ""}
              </span>
              <button
                type="button"
                className={`cursor-icon-btn cursor-icon-btn-sm${pulseChrome?.showSearch ? " active" : ""}`}
                title="Search reports"
                onClick={() => onPulseToggleSearch?.()}
              >
                <Icon name="search" size={16} />
              </button>
              <button
                type="button"
                className="cursor-icon-btn cursor-icon-btn-sm"
                title="Refresh pulse"
                disabled={pulseChrome?.busy}
                onClick={() => onPulseRefresh?.()}
              >
                <Icon name="refresh" size={16} />
              </button>
            </>
          ) : null}
          <button
            type="button"
            className={`cursor-icon-btn cursor-icon-btn-sm${pulseTabOpen && activeKind === "pulse" ? " active" : ""}`}
            title="Pulse"
            onClick={() => onOpenPulse?.()}
          >
            <Icon name="infinity" size={16} />
          </button>
          <button
            type="button"
            className={`cursor-icon-btn cursor-icon-btn-sm${bucketsTabOpen && activeKind === "buckets" ? " active" : ""}`}
            title="Buckets"
            onClick={() => onOpenBuckets?.()}
          >
            <Icon name="bucket" size={16} />
          </button>
          <button
            type="button"
            className="cursor-icon-btn cursor-icon-btn-sm"
            title="Settings"
            onClick={onOpenSettings}
          >
            <Icon name="settings" size={16} />
          </button>
        </div>
      </header>
      <div className="desk-workspace-body flex-1 min-h-0 flex flex-col">{children}</div>
    </div>
  );
}
