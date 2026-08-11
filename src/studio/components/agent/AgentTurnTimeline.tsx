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
  return (
    <section className="studio-agent-turn" aria-label="Agent turn">
      <article className="studio-chat-bubble is-user">{turn.userText}</article>

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

export function AgentTurnTimeline({
  messages,
  toolCalls,
  runs,
  approvals,
  busy,
  activeRunId,
  pendingUserText,
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
      }),
    [messages, toolCalls, runs, approvals, busy, activeRunId, pendingUserText],
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
