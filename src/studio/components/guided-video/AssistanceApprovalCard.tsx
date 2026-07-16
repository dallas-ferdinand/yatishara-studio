"use client";

import { useState } from "react";
import { AlertTriangle, Check, LoaderCircle, X } from "lucide-react";

type AssistanceApproval = {
  _id: string;
  action: string;
  title: string;
  summary: string;
  status:
    | "pending"
    | "approved"
    | "denied"
    | "executing"
    | "completed"
    | "failed";
  estimatedCredits?: number;
  error?: string;
};

export function AssistanceApprovalCard({
  approval,
  costLabel,
  expired = false,
  onDecision,
}: {
  approval: AssistanceApproval;
  costLabel?: string;
  expired?: boolean;
  onDecision?: (
    approvalId: string,
    decision: "approve" | "deny",
  ) => Promise<void>;
}) {
  const [decisionBusy, setDecisionBusy] = useState<
    "approve" | "deny" | null
  >(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const pending = !expired && approval.status === "pending";
  const running =
    !expired &&
    (approval.status === "approved" || approval.status === "executing");

  async function decide(decision: "approve" | "deny") {
    if (!onDecision || !pending) return;
    setDecisionBusy(decision);
    setLocalError(null);
    try {
      await onDecision(approval._id, decision);
    } catch {
      setLocalError("Could not record that decision. Please try again.");
    } finally {
      setDecisionBusy(null);
    }
  }

  return (
    <article
      className="studio-assist-card studio-assist-approval-card"
      aria-label={`${approval.title} approval`}
    >
      <div className="studio-assist-approval-heading">
        <span className="studio-assist-approval-icon" aria-hidden="true">
          <AlertTriangle size={16} />
        </span>
        <div>
          <p className="studio-assist-eyebrow">Approval required</p>
          <h3>{approval.title}</h3>
        </div>
      </div>
      <p className="studio-assist-approval-summary">{approval.summary}</p>
      {approval.estimatedCredits != null ? (
        <p className="studio-assist-approval-cost">
          Estimated cost: {costLabel ?? `${approval.estimatedCredits} credits`}
        </p>
      ) : null}
      {approval.error || localError ? (
        <p className="studio-assist-error" role="alert">
          {approval.error ?? localError}
        </p>
      ) : null}
      {pending ? (
        <div className="studio-assist-approval-actions">
          <button
            type="button"
            className="studio-assist-secondary-btn"
            disabled={decisionBusy !== null}
            onClick={() => void decide("deny")}
          >
            {decisionBusy === "deny" ? (
              <LoaderCircle className="animate-spin" size={14} />
            ) : (
              <X size={14} />
            )}
            Deny
          </button>
          <button
            type="button"
            className="studio-generate-btn studio-assist-primary-btn"
            disabled={decisionBusy !== null}
            onClick={() => void decide("approve")}
          >
            {decisionBusy === "approve" ? (
              <LoaderCircle className="animate-spin" size={14} />
            ) : (
              <Check size={14} />
            )}
            Approve
          </button>
        </div>
      ) : (
        <p
          className={`studio-assist-approval-status is-${expired ? "expired" : approval.status}`}
          aria-live={running ? "polite" : undefined}
        >
          {expired
            ? "Expired"
            : running
              ? "Running approved action…"
              : approval.status === "completed"
                ? "Completed"
                : approval.status === "denied"
                  ? "Denied"
                  : "Failed"}
        </p>
      )}
    </article>
  );
}
