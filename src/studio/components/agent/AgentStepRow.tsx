"use client";

import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
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
    return <Loader2 size={14} className="animate-spin" aria-hidden="true" />;
  }
  if (kind === "error") {
    return <AlertCircle size={14} aria-hidden="true" />;
  }
  if (kind === "generate") {
    return <Sparkles size={14} aria-hidden="true" />;
  }
  if (kind === "read" || kind === "meta") {
    return <Search size={14} aria-hidden="true" />;
  }
  if (kind === "write") {
    return <FolderPlus size={14} aria-hidden="true" />;
  }
  return <Wrench size={14} aria-hidden="true" />;
}

function formatDuration(ms?: number): string | null {
  if (!ms || ms < 1) return null;
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function detailBlock(label: string, raw?: string) {
  if (!raw?.trim()) return null;
  let text = raw;
  try {
    text = JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    // keep raw
  }
  return (
    <div>
      <p className="studio-agent-meta">{label}</p>
      <pre>{text}</pre>
    </div>
  );
}

export function AgentStepRow({
  step,
  expanded,
  onToggle,
  onOpenFolder,
  approvalSlot,
}: AgentStepRowProps) {
  const canExpand =
    !step.isGroupSummary &&
    Boolean(step.argsJson || step.resultJson || step.error);
  const isQuiet = step.kind === "read" || step.kind === "meta";
  const duration = formatDuration(step.durationMs);

  return (
    <div
      className={`studio-agent-step is-${step.kind}${step.isLive ? " is-live" : ""}${step.isGroupSummary ? " is-group-summary" : ""}`}
      data-step-status={step.status}
    >
      <button
        type="button"
        className="studio-agent-step-head"
        onClick={() => {
          if (canExpand && !isQuiet) onToggle();
        }}
        aria-expanded={canExpand ? expanded : undefined}
        disabled={!canExpand || isQuiet}
      >
        <span className="studio-agent-step-icon">
          <StepIcon kind={step.kind} status={step.status} />
        </span>
        <span className="studio-agent-step-body">
          <span className="studio-agent-step-title-row">
            <span className="studio-agent-step-title">{step.title}</span>
            {duration ? <span className="studio-agent-step-meta">{duration}</span> : null}
          </span>
          {step.subtitle ? (
            <p className="studio-agent-step-subtitle">{step.subtitle}</p>
          ) : null}
          {step.outcome?.folderId && onOpenFolder ? (
            <span className="studio-agent-step-outcome">
              <button
                type="button"
                className="studio-agent-step-outcome-btn"
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenFolder(step.outcome!.folderId!);
                }}
              >
                Open {step.outcome.folderName ?? "folder"}
              </button>
            </span>
          ) : null}
        </span>
        {canExpand && !isQuiet ? (
          <span className="studio-agent-step-chevron" aria-hidden="true">
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
        ) : null}
      </button>

      {approvalSlot ? (
        <div className="studio-agent-step-approval-actions">{approvalSlot}</div>
      ) : null}

      {expanded && canExpand ? (
        <div className="studio-agent-step-details">
          {detailBlock("Arguments", step.argsJson)}
          {step.error
            ? detailBlock("Error", JSON.stringify({ error: step.error }, null, 2))
            : null}
          {detailBlock("Result", step.resultJson)}
        </div>
      ) : null}
    </div>
  );
}
