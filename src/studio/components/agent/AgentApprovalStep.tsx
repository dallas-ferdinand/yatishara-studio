"use client";

import { Check, X } from "lucide-react";
import type { Id } from "../../../../convex/_generated/dataModel";
import { formatTtdFromCredits } from "@/studio/lib/money";
import { AgentStepRow } from "./AgentStepRow";
import { humanToolTitle } from "./agentToolTitles";
import type { AgentApprovalRow } from "./agentStepUtils";
import type { DisplayStep } from "./agentStepUtils";

type AgentApprovalStepProps = {
  step: DisplayStep;
  approval: AgentApprovalRow;
  expanded: boolean;
  onToggle: () => void;
  onDecide: (approvalId: Id<"agentApprovals">, decision: "approve" | "deny") => void;
  onOpenFolder?: (folderId: Id<"folders">) => void;
};

export function AgentApprovalStep({
  step,
  approval,
  expanded,
  onToggle,
  onDecide,
  onOpenFolder,
}: AgentApprovalStepProps) {
  const isPending = approval.status === "pending";
  const approvalTitle = approval.toolName
    ? humanToolTitle(approval.toolName)
    : approval.title || step.title;
  const statusLabel = isPending
    ? "Waiting for your confirmation"
    : approval.status === "completed"
      ? "Completed"
      : approval.status === "executing"
        ? "Executing"
        : approval.status === "denied"
          ? "Cancelled"
          : approval.status === "failed"
            ? "Failed"
            : approval.status;

  const enrichedStep: DisplayStep = {
    ...step,
    kind: "approval",
    title: approvalTitle,
    subtitle: undefined,
    outcome: undefined,
  };

  return (
    <div className="studio-agent-approval-card-wrap">
      <AgentStepRow
        step={enrichedStep}
        expanded={expanded}
        onToggle={onToggle}
        onOpenFolder={onOpenFolder}
      />
      <div className="studio-agent-approval-card">
        <div className="studio-agent-approval-card-head">
          <p className="studio-agent-approval-card-title">{approvalTitle}</p>
          <p className="studio-agent-approval-card-status">{statusLabel}</p>
        </div>
        <p className="studio-agent-approval-card-summary">{approval.summary}</p>
        {approval.estimatedCredits != null ? (
          <p className="studio-agent-approval-card-cost">
            Cost: {formatTtdFromCredits(approval.estimatedCredits)}
          </p>
        ) : null}
        <div className="studio-agent-step-approval-actions">
          {isPending ? (
            <>
              <button
                type="button"
                className="studio-agent-primary-btn"
                onClick={() => onDecide(approval._id, "approve")}
              >
                <Check size={14} aria-hidden="true" /> Approve
              </button>
              <button
                type="button"
                className="studio-agent-secondary-btn"
                onClick={() => onDecide(approval._id, "deny")}
              >
                <X size={14} aria-hidden="true" /> Cancel
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
