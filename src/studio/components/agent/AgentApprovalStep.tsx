"use client";

import { Check, X } from "lucide-react";
import type { Id } from "../../../../convex/_generated/dataModel";
import { AgentStepRow } from "./AgentStepRow";
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
  const approvalSlot = isPending ? (
    <>
      {approval.estimatedCredits != null ? (
        <p className="studio-agent-meta">Est. {approval.estimatedCredits} credits</p>
      ) : null}
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
        <X size={14} aria-hidden="true" /> Deny
      </button>
    </>
  ) : (
    <p className="studio-agent-meta">{approval.status}</p>
  );

  const enrichedStep: DisplayStep = {
    ...step,
    kind: "approval",
    title: approval.title || step.title,
    // Prefer short title on the pill; keep summary for hover via error path unused
    subtitle: undefined,
    outcome: undefined,
  };

  return (
    <AgentStepRow
      step={enrichedStep}
      expanded={expanded}
      onToggle={onToggle}
      onOpenFolder={onOpenFolder}
      approvalSlot={approvalSlot}
    />
  );
}
