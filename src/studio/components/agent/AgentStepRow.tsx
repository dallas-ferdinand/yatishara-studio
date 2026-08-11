"use client";

import {
  AlertCircle,
  FolderPlus,
  Loader2,
  Search,
  Sparkles,
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
  approvalSlot?: React.ReactNode;
};

function StepIcon({ kind, status }: { kind: AgentStepKind; status: DisplayStep["status"] }) {
  if (status === "started") {
    return <Loader2 size={12} className="animate-spin" aria-hidden="true" />;
  }
  if (kind === "error") {
    return <AlertCircle size={12} aria-hidden="true" />;
  }
  if (kind === "generate") {
    return <Sparkles size={12} aria-hidden="true" />;
  }
  if (kind === "read" || kind === "meta") {
    return <Search size={12} aria-hidden="true" />;
  }
  if (kind === "write") {
    return <FolderPlus size={12} aria-hidden="true" />;
  }
  return <Wrench size={12} aria-hidden="true" />;
}

export function AgentStepRow({
  step,
  expanded,
  onToggle,
  onOpenFolder,
  approvalSlot,
}: AgentStepRowProps) {
  const isError = step.kind === "error" || step.status === "failed";
  const canExpand = isError && Boolean(step.error || step.resultJson);
  const folderId = step.outcome?.folderId;
  const label =
    step.outcome?.folderName?.trim() ||
    step.subtitle?.replace(/^Created\s+/i, "").trim() ||
    step.title;

  function handleClick() {
    if (folderId && onOpenFolder) {
      onOpenFolder(folderId);
      return;
    }
    if (canExpand) onToggle();
  }

  const interactive = Boolean((folderId && onOpenFolder) || canExpand);

  return (
    <div
      className={`studio-agent-step-pill is-${step.kind}${step.isLive ? " is-live" : ""}${step.isGroupSummary ? " is-group-summary" : ""}${isError ? " is-error" : ""}`}
      data-step-status={step.status}
      role="listitem"
    >
      <button
        type="button"
        className="studio-agent-step-pill-btn"
        onClick={handleClick}
        aria-expanded={canExpand ? expanded : undefined}
        disabled={!interactive}
        title={isError ? step.subtitle || step.error : label}
      >
        <span className="studio-agent-step-pill-icon">
          <StepIcon kind={isError ? "error" : step.kind} status={step.status} />
        </span>
        <span className="studio-agent-step-pill-label">{label}</span>
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
