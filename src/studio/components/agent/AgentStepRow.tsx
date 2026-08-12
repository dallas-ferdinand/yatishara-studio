"use client";

import {
  AlertCircle,
  ArchiveRestore,
  BookOpen,
  Brain,
  CircleDollarSign,
  Eye,
  FileText,
  FolderInput,
  FolderPlus,
  FolderTree,
  HelpCircle,
  Image as ImageIcon,
  ListTodo,
  Loader2,
  Search,
  Send,
  Share2,
  Sparkles,
  Trash2,
  Upload,
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

  // Exact Pi tools
  if (name === "skills") return <BookOpen size={13} aria-hidden="true" />;
  if (name === "remember" || name === "recall") {
    return <Brain size={13} aria-hidden="true" />;
  }
  if (name === "plan") return <ListTodo size={13} aria-hidden="true" />;
  if (name === "ask") return <HelpCircle size={13} aria-hidden="true" />;
  if (name === "catalog" || name === "describe") {
    return <Search size={13} aria-hidden="true" />;
  }
  if (name === "inspect") return <Eye size={13} aria-hidden="true" />;

  // Studio tools by family
  if (name.includes("trash") || name.includes("delete")) {
    return <Trash2 size={13} aria-hidden="true" />;
  }
  if (name.includes("restore")) {
    return <ArchiveRestore size={13} aria-hidden="true" />;
  }
  if (name.includes("document") || name.includes("script")) {
    return <FileText size={13} aria-hidden="true" />;
  }
  if (name.includes("estimate") || name.includes("credit") || name.includes("pricing")) {
    return <CircleDollarSign size={13} aria-hidden="true" />;
  }
  if (name.includes("generate")) {
    return <Sparkles size={13} aria-hidden="true" />;
  }
  if (name.includes("send_")) {
    return <Send size={13} aria-hidden="true" />;
  }
  if (name.includes("share") || name.includes("unshare") || name.includes("post")) {
    return <Share2 size={13} aria-hidden="true" />;
  }
  if (name.includes("upload")) {
    return <Upload size={13} aria-hidden="true" />;
  }
  if (name.includes("view_media") || name.includes("get_asset") || name.includes("asset")) {
    return <ImageIcon size={13} aria-hidden="true" />;
  }
  if (name.includes("search") || name.includes("list_video")) {
    return <Search size={13} aria-hidden="true" />;
  }
  if (name.includes("bulk_move") || name.includes("move") || name.includes("ensure_path")) {
    return <FolderInput size={13} aria-hidden="true" />;
  }
  if (name.includes("workspace") || name.includes("project_context")) {
    return <FolderTree size={13} aria-hidden="true" />;
  }
  if (name.includes("folder") || name.includes("resolve_path")) {
    return <FolderPlus size={13} aria-hidden="true" />;
  }
  if (kind === "generate") return <Sparkles size={13} aria-hidden="true" />;
  if (kind === "read" || kind === "meta") return <Search size={13} aria-hidden="true" />;
  if (kind === "write") return <FolderInput size={13} aria-hidden="true" />;
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
  // Prefer friendly action title; append compact outcome when useful.
  const label = isError
    ? step.subtitle || step.title
    : step.subtitle
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
        disabled={!interactive}
        title={label}
      >
        <span className="studio-agent-step-icon" aria-hidden="true">
          <StepIcon toolName={step.toolName} kind={step.kind} status={step.status} />
        </span>
        <span className="studio-agent-step-label">{label}</span>
      </button>
      {approvalSlot}
      {expanded && canExpand ? (
        <div className="studio-agent-step-details">
          {step.error ? <pre>{step.error}</pre> : null}
          {step.resultJson ? <pre>{step.resultJson.slice(0, 4000)}</pre> : null}
        </div>
      ) : null}
    </div>
  );
}
