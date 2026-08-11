"use client";

import { Loader2 } from "lucide-react";

type AgentThinkingCardProps = {
  label?: string;
};

/**
 * Idle / inspect progress — same left chrome as live AgentStepRow:
 * spinner · label (no sparkle, never last-tool title, never gradient pill).
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
        <span className="studio-agent-step-icon" aria-hidden="true">
          <Loader2 size={13} className="animate-spin" />
        </span>
        <span className="studio-agent-step-label">{label}</span>
      </button>
    </div>
  );
}
