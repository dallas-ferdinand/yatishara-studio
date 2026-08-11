"use client";

import { Loader2 } from "lucide-react";

type AgentThinkingCardProps = {
  label?: string;
};

/**
 * Live idle/inspect progress — same row chrome as AgentStepRow (spinner + label),
 * not a separate gradient pill.
 */
export function AgentThinkingCard({ label = "Thinking" }: AgentThinkingCardProps) {
  return (
    <div
      className="studio-agent-step is-live is-thinking"
      role="status"
      aria-live="polite"
      data-step-status="started"
    >
      <button type="button" className="studio-agent-step-btn" disabled title={label}>
        <span className="studio-agent-step-icon">
          <Loader2 size={13} className="animate-spin" aria-hidden="true" />
        </span>
        <span className="studio-agent-step-label">{label}</span>
      </button>
    </div>
  );
}
