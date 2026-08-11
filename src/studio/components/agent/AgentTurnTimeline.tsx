"use client";

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import type { Id } from "../../../../convex/_generated/dataModel";
import { StudioChatMarkdown } from "../StudioChatMarkdown";
import { AgentApprovalStep } from "./AgentApprovalStep";
import { AgentStepRow } from "./AgentStepRow";
import {
  buildAgentTurns,
  liveProgressLabel,
  type AgentAttachmentChip,
  type AgentApprovalRow,
  type AgentMessageRow,
  type AgentRunRow,
  type AgentToolCallRow,
  type AgentTurn,
} from "./agentStepUtils";
import "./agent-steps.css";

type AgentTurnTimelineProps = {
  messages: AgentMessageRow[];
  toolCalls: AgentToolCallRow[];
  runs: AgentRunRow[];
  approvals: AgentApprovalRow[];
  busy?: boolean;
  activeRunId?: Id<"agentRuns"> | null;
  pendingUserText?: string | null;
  pendingAttachments?: AgentAttachmentChip[] | null;
  onDecideApproval: (
    approvalId: Id<"agentApprovals">,
    decision: "approve" | "deny",
  ) => void;
  onOpenFolder?: (folderId: Id<"folders">) => void;
};

function TurnBlock({
  turn,
  expandedStepId,
  onToggleStep,
  approvalById,
  onDecideApproval,
  onOpenFolder,
}: {
  turn: AgentTurn;
  expandedStepId: string | null;
  onToggleStep: (id: string) => void;
  approvalById: Map<string, AgentApprovalRow>;
  onDecideApproval: AgentTurnTimelineProps["onDecideApproval"];
  onOpenFolder?: (folderId: Id<"folders">) => void;
}) {
  const inline = useMemo(
    () => splitUserTextWithAttachments(turn.userText, turn.attachments ?? []),
    [turn.userText, turn.attachments],
  );

  return (
    <section className="studio-agent-turn" aria-label="Agent turn">
      {inline.parts.length || turn.userText ? (
        <article className="studio-chat-bubble is-user studio-agent-user-bubble">
          {inline.parts.length
            ? inline.parts.map((part) =>
                part.type === "text" ? (
                  <span key={part.key}>{part.value}</span>
                ) : (
                  <span
                    key={part.key}
                    className="studio-inline-tag studio-agent-attachment-chip is-static is-inline"
                    title={
                      part.attachment.path ||
                      part.attachment.label ||
                      part.attachment.studioId ||
                      "Attachment"
                    }
                  >
                    <span className="studio-inline-tag-kind">
                      {chipKindLabel(part.attachment)}
                    </span>
                    <span className="studio-inline-tag-label">
                      {part.attachment.label ||
                        part.attachment.path ||
                        part.attachment.studioId ||
                        "Attachment"}
                    </span>
                  </span>
                ),
              )
            : turn.userText}
        </article>
      ) : null}
      {inline.leftover.length ? (
        <div className="studio-agent-turn-attachments" aria-label="Attached items">
          {inline.leftover.map((attachment, index) => (
            <span
              key={`${attachment.studioId ?? attachment.label ?? "attachment"}-${index}`}
              className="studio-inline-tag studio-agent-attachment-chip is-static"
              title={attachment.path || attachment.label || attachment.studioId || "Attachment"}
            >
              <span className="studio-inline-tag-kind">{chipKindLabel(attachment)}</span>
              <span className="studio-inline-tag-label">
                {attachment.label || attachment.path || attachment.studioId || "Attachment"}
              </span>
            </span>
          ))}
        </div>
      ) : null}

      {turn.steps.length > 0 ? (
        <div className="studio-agent-turn-steps" role="list">
          {turn.steps.map((step) => {
            const approval =
              step.approvalId != null
                ? approvalById.get(String(step.approvalId))
                : undefined;
            if (step.kind === "approval" && approval) {
              return (
                <AgentApprovalStep
                  key={step.id}
                  step={step}
                  approval={approval}
                  expanded={expandedStepId === step.id}
                  onToggle={() => onToggleStep(step.id)}
                  onDecide={onDecideApproval}
                  onOpenFolder={onOpenFolder}
                />
              );
            }
            return (
              <AgentStepRow
                key={step.id}
                step={step}
                expanded={expandedStepId === step.id}
                onToggle={() => onToggleStep(step.id)}
                onOpenFolder={onOpenFolder}
              />
            );
          })}
        </div>
      ) : null}

      {turn.isLive && !turn.assistantText ? (
        <div className="studio-agent-live-progress" role="status">
          <Loader2 size={14} className="animate-spin" aria-hidden="true" />
          <span className="studio-agent-meta">{liveProgressLabel(turn.steps)}</span>
        </div>
      ) : null}

      {turn.assistantText ? (
        <article className="studio-chat-bubble is-assistant">
          <StudioChatMarkdown text={turn.assistantText} />
        </article>
      ) : null}
    </section>
  );
}

function chipKindLabel(attachment: AgentAttachmentChip) {
  if (attachment.kind === "image") return "IMG";
  if (attachment.kind === "video") return "VID";
  if (attachment.kind === "audio") return "AUD";
  if (attachment.studioKind === "folder") return "DIR";
  if (attachment.studioKind === "document") return "DOC";
  if (attachment.studioKind === "element") return "EL";
  return "REF";
}

function splitUserTextWithAttachments(
  text: string,
  attachments: AgentAttachmentChip[],
) {
  const parts: Array<
    | { type: "text"; key: string; value: string }
    | { type: "chip"; key: string; attachment: AgentAttachmentChip }
  > = [];
  let buffer = "";
  let tokenIndex = 0;
  let partIndex = 0;
  const used = new Set<number>();
  const flush = () => {
    if (!buffer) return;
    parts.push({ type: "text", key: `t-${partIndex++}`, value: buffer });
    buffer = "";
  };
  for (const ch of String(text ?? "")) {
    if (ch === "\uFFFC") {
      flush();
      const attachment = attachments[tokenIndex];
      if (attachment) {
        used.add(tokenIndex);
        parts.push({
          type: "chip",
          key: `c-${partIndex++}-${attachment.studioId ?? tokenIndex}`,
          attachment,
        });
      }
      tokenIndex += 1;
      continue;
    }
    buffer += ch;
  }
  flush();
  const leftover = attachments.filter((_, index) => !used.has(index));
  return { parts, leftover };
}

export function AgentTurnTimeline({
  messages,
  toolCalls,
  runs,
  approvals,
  busy,
  activeRunId,
  pendingUserText,
  pendingAttachments,
  onDecideApproval,
  onOpenFolder,
}: AgentTurnTimelineProps) {
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);

  const approvalById = useMemo(
    () => new Map(approvals.map((row) => [String(row._id), row])),
    [approvals],
  );

  const turns = useMemo(
    () =>
      buildAgentTurns({
        messages,
        toolCalls,
        runs,
        approvals,
        busy,
        activeRunId,
        pendingUserText,
        pendingAttachments,
      }),
    [messages, toolCalls, runs, approvals, busy, activeRunId, pendingUserText, pendingAttachments],
  );

  function toggleStep(id: string) {
    setExpandedStepId((prev) => (prev === id ? null : id));
  }

  return (
    <>
      {turns.map((turn) => (
        <TurnBlock
          key={turn.id}
          turn={turn}
          expandedStepId={expandedStepId}
          onToggleStep={toggleStep}
          approvalById={approvalById}
          onDecideApproval={onDecideApproval}
          onOpenFolder={onOpenFolder}
        />
      ))}
    </>
  );
}
