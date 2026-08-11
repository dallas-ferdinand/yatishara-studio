"use client";

import {
  AlertCircle,
  BookOpen,
  Brain,
  Eye,
  FileText,
  FolderInput,
  FolderPlus,
  HelpCircle,
  ListTodo,
  Loader2,
  Search,
  Sparkles,
  Trash2,
  Wrench,
} from "lucide-react";
import type { Id } from "../../../../convex/_generated/dataModel";
import type { DisplayStep } from "./agentStepUtils";
import type { AgentStepKind } from "./agentToolTitles";

type AgentStepRowProps = {
  step: DisplayStep;
  expanded: boolean;
  onToggle: () => void;
  onOpenFolder?: (folderId: Id<"folders">) => void;
  onOpenDocument?: (documentId: Id<"documents">) => void;
  approvalSlot?: React.ReactNode;
};

function StepIcon({
  toolName,
  kind,
  status,
}: {
  toolName?: string;
  kind: AgentStepKind;
  status: DisplayStep["status"];
}) {
  if (status === "started" || status === "queued") {
    return <Loader2 size={13} className="animate-spin" aria-hidden="true" />;
  }
  if (kind === "error") {
    return <AlertCircle size={13} aria-hidden="true" />;
  }
  const name = String(toolName || "");
  if (name === "skills") {
    return <BookOpen size={13} aria-hidden="true" />;
  }
  if (name === "remember") {
    return <Brain size={13} aria-hidden="true" />;
  }
  if (name === "plan") {
    return <ListTodo size={13} aria-hidden="true" />;
  }
  if (name === "ask") {
    return <HelpCircle size={13} aria-hidden="true" />;
  }
  if (name.includes("document") || name.includes("script")) {
    return <FileText size={13} aria-hidden="true" />;
  }
  if (
    name.includes("search") ||
    name.includes("catalog") ||
    name.includes("describe")
  ) {
    return <Search size={13} aria-hidden="true" />;
  }
  if (name.includes("bulk_move") || name.includes("move") || name.includes("ensure_path")) {
    return <FolderInput size={13} aria-hidden="true" />;
  }
  if (name.includes("trash") || name.includes("delete")) {
    return <Trash2 size={13} aria-hidden="true" />;
  }
  if (name.includes("folder") || name.includes("workspace") || name.includes("resolve")) {
    return <FolderPlus size={13} aria-hidden="true" />;
  }
  if (name.includes("inspect") || name.includes("view_media")) {
    return <Eye size={13} aria-hidden="true" />;
  }
  if (kind === "generate" || name.includes("generate")) {
    return <Sparkles size={13} aria-hidden="true" />;
  }
  if (kind === "read" || kind === "meta") {
    return <Search size={13} aria-hidden="true" />;
  }
  if (kind === "write") {
    return <FolderInput size={13} aria-hidden="true" />;
  }
  return <Wrench size={13} aria-hidden="true" />;
}

export function AgentStepRow({
  step,
  expanded,
  onToggle,
  onOpenFolder,
  onOpenDocument,
  approvalSlot,
}: AgentStepRowProps) {
  const isError = step.kind === "error" || step.status === "failed";
  const canExpand = isError && Boolean(step.error || step.resultJson);
  const folderId = step.outcome?.folderId;
  const documentId = step.outcome?.documentId;
  // Prefer friendly action title; append compact outcome when useful (search counts, model list).
  const label = isError
    ? step.subtitle || step.title
    : step.subtitle &&
        (/\d+\s+result/i.test(step.subtitle) ||
          step.toolName === "studio_list_video_models" ||
          step.toolName === "skills" ||
          step.toolName === "remember" ||
          step.toolName === "plan" ||
          step.toolName === "describe" ||
          step.toolName === "catalog" ||
          /Seedance/i.test(step.subtitle))
      ? `${step.title} · ${step.subtitle}`
      : step.title;

  function handleClick() {
    if (documentId && onOpenDocument) {
      onOpenDocument(documentId);
      return;
    }
    if (folderId && onOpenFolder) {
      onOpenFolder(folderId);
      return;
    }
    if (canExpand) onToggle();
  }

  const interactive = Boolean(
    (documentId && onOpenDocument) || (folderId && onOpenFolder) || canExpand,
  );

  return (
    <div
      className={`studio-agent-step is-${step.kind}${step.isLive ? " is-live" : ""}${step.isGroupSummary ? " is-group-summary" : ""}${isError ? " is-error" : ""}`}
      data-step-status={step.status}
      role="listitem"
    >
      <button
        type="button"
        className="studio-agent-step-btn"
        onClick={handleClick}
        aria-expanded={canExpand ? expanded : undefined}
        disabled={!interactive}
        title={isError ? step.subtitle || step.error : label}
      >
        <span className="studio-agent-step-icon">
          <StepIcon
            toolName={step.toolName}
            kind={isError ? "error" : step.kind}
            status={step.status}
          />
        </span>
        <span className="studio-agent-step-label">{label}</span>
      </button>

      {approvalSlot ? (
        <div className="studio-agent-step-approval-actions">{approvalSlot}</div>
      ) : null}

      {expanded && canExpand ? (
        <div className="studio-agent-step-details">
          <pre>{step.error || step.resultJson}</pre>
        </div>
      ) : null}
    </div>
  );
}
