"use client";

import { Check, Send, Share2, Sparkles, Trash2, X } from "lucide-react";
import type { Id } from "../../../../convex/_generated/dataModel";
import { formatTtdFromCredits } from "@/studio/lib/money";
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
  previewUrl?: string;
  previewKind?: string;
};

export function AgentApprovalStep({
  step,
  approval,
  onDecide,
  previewUrl,
  previewKind,
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

  return (
    <div
      className="studio-agent-approval-card-wrap"
      role="listitem"
      data-step-status={step.status}
    >
      <div className="studio-agent-approval-card">
        <div className="studio-agent-approval-card-head">
          <div className="studio-agent-approval-card-head-main">
            <span className="studio-agent-approval-card-icon" aria-hidden="true">
              <ApprovalToolIcon toolName={approval.toolName} />
            </span>
            <div className="studio-agent-approval-card-head-copy">
              <p className="studio-agent-approval-card-kicker">
                {isPending ? "Confirmation needed" : "Approval"}
              </p>
              <p className="studio-agent-approval-card-title">{approvalTitle}</p>
            </div>
          </div>
          <p className="studio-agent-approval-card-status">{statusLabel}</p>
        </div>
        <p className="studio-agent-approval-card-summary">
          {approvalSummary(approval)}
        </p>
        {approval.toolName === "studio_share_asset_post" &&
        previewUrl &&
        (previewKind === "image" || previewKind === "video") ? (
          <div className="studio-agent-approval-post-preview">
            <div className="studio-agent-approval-post-preview-head">
              <span className="studio-agent-approval-post-avatar" aria-hidden="true" />
              <div>
                <p className="studio-agent-approval-post-name">Your profile post</p>
                <p className="studio-agent-approval-post-meta">Preview before publishing</p>
              </div>
            </div>
            <div className="studio-agent-approval-post-media-wrap">
              {previewKind === "video" ? (
                <video
                  className="studio-agent-approval-post-media"
                  src={previewUrl}
                  muted
                  playsInline
                  preload="metadata"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  className="studio-agent-approval-post-media"
                  src={previewUrl}
                  alt=""
                />
              )}
            </div>
          </div>
        ) : null}
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

function ApprovalToolIcon({ toolName }: { toolName?: string }) {
  const name = String(toolName || "");
  if (name.includes("share") || name.includes("post")) return <Share2 size={14} />;
  if (name.includes("send")) return <Send size={14} />;
  if (name.includes("trash") || name.includes("delete")) return <Trash2 size={14} />;
  if (name.includes("generate")) return <Sparkles size={14} />;
  return <Share2 size={14} />;
}

function approvalSummary(approval: AgentApprovalRow) {
  const name = String(approval.toolName || "");
  if (name === "studio_share_asset_post") {
    return "This will publish the selected asset to your public profile feed.";
  }
  if (name === "studio_unlock_help_answer") {
    return "This will spend credits to unlock the full help answer.";
  }
  if (name === "studio_send_message") {
    return "This will send the drafted message as you.";
  }
  if (name === "studio_trash") {
    return "This will move the selected item to trash.";
  }
  if (name.includes("generate")) {
    return "This will start a paid generation request.";
  }
  return approval.summary || "Review this action and confirm if you want me to continue.";
}
